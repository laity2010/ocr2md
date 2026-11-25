#!/usr/bin/env python3
"""Publish Lab-OCR V3 into the shared unified release/ slot only.

Enforces federal git-gate check-release, COMM.md cross-version browser gate,
and Frame runtime verification before any write to release/. Never modifies
other Labs or restarts the shared Gateway (dynamic Gateway reloads V3 by commit).
"""
from __future__ import annotations

import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys

import v6_frame_publish as base

ROOT = Path(__file__).resolve().parents[1]
NAME = 'lab-ocr-v3'
CARD = '''      <article id="lab-ocr-v3"><div class="kind">16 · OCR V3 · Clean Architecture</div><h2>lab-ocr-v3 · 单源 CM6 + 轻量 SQL</h2>
        <p>独立框架型 Lab（ocr2md.v3.sqlite），复用 Frame 四窗与 V1 公共组件，单轨 owned-LF、增量摘要 CAS 与动态网关隔离，与 V2 并行推进互不干扰。</p>
        <a class="open" href="/labs/lab-ocr-v3/">进入 V3 工作台</a></article>
'''


def require_federal_release_gate(repository: Path = ROOT) -> None:
    if repository.parent.name == 'labs' and (repository.parent.parent / 'main').is_dir():
        gate = repository.parent.parent / '.ops/git-gate.py'
        subprocess.run(
            [sys.executable, str(gate), 'check-release', '--tree', str(repository), '--commit', 'HEAD'],
            check=True,
        )


def require_cross_version_component_gate(target: str = NAME, repository: Path = ROOT) -> None:
    home = Path(repository).resolve().parents[1]
    validator = home / 'main/scripts/verify_cross_version_components.py'
    if not validator.is_file():
        raise RuntimeError('missing shared cross-version component gate: ' + str(validator))
    subprocess.run(
        [sys.executable, str(validator), '--target', target, '--browser'],
        cwd=repository,
        check=True,
        timeout=240,
    )
    print('V3_CROSS_VERSION_COMPONENTS_RELEASE_GATE_PASS', target, flush=True)


def update_home_card(html: str, name: str = NAME, card: str = CARD) -> str:
    marker = f'      <article id="{name}">'
    if marker not in html:
        if '</section>' not in html:
            raise RuntimeError('Home cards closing tag missing')
        return html.replace('    </section>', card + '    </section>', 1)
    if html.count(marker) != 1:
        raise RuntimeError('Duplicate target Lab home card: ' + name)
    start = html.index(marker)
    end = html.index('</article>', start) + len('</article>')
    return html[:start] + card.rstrip('\n') + html[end:]


def publish_v3(release: Path, *, repository: Path = ROOT, run_gates: bool = True) -> dict:
    if run_gates:
        require_federal_release_gate(repository)
        require_cross_version_component_gate(NAME, repository)
        base.require_workspace_io_runtime()

    source = repository / 'labs' / NAME / 'dist'
    if not source.is_dir():
        raise RuntimeError(f'Build {NAME} first: missing {source}')
    commit = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repository, text=True).strip()
    if subprocess.check_output(['git', 'status', '--porcelain'], cwd=repository, text=True).strip():
        raise RuntimeError('Uncommitted source: commit before build and release')
    version = json.loads((source / 'release-version.json').read_text(encoding='utf-8'))
    if version.get('commit') != commit or version.get('name') != NAME:
        raise RuntimeError('Build source SHA or name does not match committed V3 worktree')
    if not release.is_dir() or release.is_symlink():
        raise RuntimeError('Missing trusted release root')

    lock = release / '.lab-unified-publish.lock'
    with lock.open('a+b') as fp:
        fcntl.flock(fp.fileno(), fcntl.LOCK_EX)
        manifest_path = release / 'release-manifest.json'
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        if manifest.get('schema') != 'ocr2md-lab-unified-release/v1':
            raise RuntimeError('Unexpected Lab gateway release schema')
        current_home = (release / 'index.html').read_bytes()
        if base.sha(current_home) != manifest['homeSha256']:
            raise RuntimeError('Lab home checksum mismatch; refuse overwrite')

        other_hashes: dict[str, dict[str, str]] = {}
        for mod_name, entry in manifest['modules'].items():
            if mod_name == NAME:
                continue
            folder = release / mod_name
            if folder.is_symlink():
                raise RuntimeError('Symlink module forbidden: ' + mod_name)
            files, _ = base.fingerprints(folder)
            if files != entry['files']:
                raise RuntimeError('Existing Lab module changed: ' + mod_name)
            other_hashes[mod_name] = files

        home_bytes = update_home_card(current_home.decode('utf-8')).encode('utf-8')
        source_files, _ = base.fingerprints(source)
        dest = release / NAME
        pid = os.getpid()
        stage = release / f'.{NAME}-stage-{pid}'
        retired = release / f'.{NAME}-retired-{pid}'
        tmp_home = release / f'.v3-home-{pid}'
        tmp_manifest = release / f'.v3-manifest-{pid}'
        if any(p.exists() for p in (stage, retired, tmp_home, tmp_manifest)):
            raise RuntimeError('Existing staging file; refuse overwrite')
        if dest.is_symlink():
            raise RuntimeError('Refuse linked destination')

        swapped = False
        try:
            shutil.copytree(source, stage)
            if base.fingerprints(stage)[0] != source_files:
                raise RuntimeError('Staging verification failed')
            release_info = stage / 'release-version.json'
            info = json.loads(release_info.read_text(encoding='utf-8'))
            info['publishDirectory'] = str(dest.absolute())
            release_info.write_text(json.dumps(info, ensure_ascii=False) + '\n', encoding='utf-8')
            files, total = base.fingerprints(stage)

            manifest['modules'][NAME] = {
                'name': NAME,
                'sourceCommit': commit,
                'version': version['version'],
                'assetCount': len(files),
                'bytes': total,
                'files': files,
            }
            manifest['homeSha256'] = base.sha(home_bytes)
            manifest['publishedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
            manifest['releaseId'] = base.sha(
                json.dumps(
                    {k: manifest[k] for k in ('schema', 'modules', 'homeSha256')},
                    sort_keys=True,
                    separators=(',', ':'),
                    ensure_ascii=False,
                ).encode('utf-8')
            )
            tmp_home.write_bytes(home_bytes)
            tmp_manifest.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

            if dest.exists():
                os.rename(dest, retired)
                swapped = True
            os.rename(stage, dest)
            os.replace(tmp_home, release / 'index.html')
            os.replace(tmp_manifest, manifest_path)
        except BaseException:
            if not dest.exists() and swapped and retired.exists():
                os.rename(retired, dest)
            raise
        finally:
            if stage.exists():
                shutil.rmtree(stage)
            for temp in (tmp_home, tmp_manifest):
                if temp.exists():
                    temp.unlink()
        if retired.exists():
            shutil.rmtree(retired)

        for mod_name, expected in other_hashes.items():
            if base.fingerprints(release / mod_name)[0] != expected:
                raise RuntimeError('Post-publication other Lab mismatch: ' + mod_name)

        print(
            'LAB_V3_PUBLISHED',
            version['version'],
            commit,
            'files',
            len(files),
            'releaseId',
            manifest['releaseId'],
            'otherLabsPreserved',
            len(other_hashes),
            flush=True,
        )
        print('V3_GATEWAY_NO_RESTART_REQUIRED', commit, flush=True)
        return manifest


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root', type=Path, required=True)
    args = parser.parse_args()
    publish_v3(args.release_root.resolve())
