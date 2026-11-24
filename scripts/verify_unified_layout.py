#!/usr/bin/env python3
"""Read-only OCR2MD layout verifier; discovers current Lab worktrees dynamically.

This tracked script is the authority. The legacy .ops entrypoint delegates to it.
No hard-coded Lab names/counts, Git revisions, machine-specific home path,
or release module count. --core-only is for isolated fixture regression tests.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import subprocess


def require(condition, message):
    if not condition:
        raise AssertionError(message)


def git_head(folder: Path):
    proc = subprocess.run(['git', '-C', str(folder), 'rev-parse', '--short', 'HEAD'],
                          capture_output=True, text=True, timeout=10)
    require(proc.returncode == 0, f'not a Git worktree: {folder}: {proc.stderr.strip()}')
    return proc.stdout.strip()


def discover_labs(root: Path):
    labs_dir = root / 'labs'
    require(labs_dir.is_dir() and not labs_dir.is_symlink(), f'missing labs dir: {labs_dir}')
    labs = sorted((p for p in labs_dir.iterdir()
                   if p.is_dir() and not p.name.startswith('.')),
                  key=lambda p: p.name)
    require(labs, 'no active Lab worktrees found')
    for p in labs:
        require(not p.is_symlink(), f'Lab path cannot be a symlink: {p}')
    return labs


def same_inode(a: Path, b: Path):
    sa, sb = a.stat(), b.stat()
    return (sa.st_dev, sa.st_ino) == (sb.st_dev, sb.st_ino)


def check_core(root: Path):
    require(root.is_dir() and not root.is_symlink(), f'missing unified home: {root}')
    main = root / 'main'
    for folder in ('main', 'labs', 'release', 'archive'):
        require((root / folder).is_dir(), f'missing root directory: {folder}')
    require(not (root / 'dev').exists(), 'old redundant dev shortcut must not reappear')
    labs = discover_labs(root)
    # Federal constitution is tracked by Main Git *separately* from Main's
    # own state constitution. Only the federal AGENTS, BUILD and COMM are
    # hard-linked between the unified workspace root and Main's tracking path.
    agents = root / 'AGENTS.md'
    federal_git = main / 'constitution/AGENTS.md'
    build = root / 'BUILD.md'
    comm = root / 'COMM.md'
    for file in (agents, federal_git):
        require(file.is_file() and not file.is_symlink(),
                f'missing or linked-to-symlink federal constitution: {file}')
    require(same_inode(agents, federal_git),
            'federal AGENTS.md must share inode with Main constitution/AGENTS.md')
    for name in ('BUILD.md', 'COMM.md'):
        for file in (root / name, main / name):
            require(file.is_file() and not file.is_symlink(),
                    f'missing or linked-to-symlink contract: {file}')
        require(same_inode(root / name, main / name),
                f'Main {name} is not the shared federal contract inode')
    # Compatibility alias is a link to COMM, never a third editable contract.
    for file in (root / 'CROSS_VERSION_COMPONENTS.md',
                 main / 'CROSS_VERSION_COMPONENTS.md'):
        require(file.is_symlink() and file.readlink() == Path('COMM.md') and
                same_inode(file, comm),
                f'legacy components alias must resolve to COMM.md: {file}')
    ag_text = agents.read_text(encoding='utf-8')
    require('## 10. 联邦 / 州宪法继承与同级联邦契约' in ag_text and
            '`BUILD.md`' in ag_text and '`COMM.md`' in ag_text and
            '州宪法' in ag_text,
            'federal AGENTS.md does not register the federal/state hierarchy')
    require('一构建一 Git' in build.read_text(encoding='utf-8') and
            '回退' in build.read_text(encoding='utf-8') and
            '偏离' in build.read_text(encoding='utf-8'),
            'BUILD.md is missing mandatory one-build-one-Git / rollback-on-drift policy')
    require('EnumCheckboxFilter' in comm.read_text(encoding='utf-8'),
            'COMM.md does not preserve the real V1 AG filter component contract')
    state_ids = set()
    for tree in [main, *labs]:
        readme = tree / 'README.md'
        state = tree / 'AGENTS.md'
        require(readme.is_file() and not readme.is_symlink(), f'missing project README: {readme}')
        require(bool(readme.read_text(encoding='utf-8').strip()) and
                '#' in readme.read_text(encoding='utf-8'),
                f'invalid project README: {readme}')
        require(state.is_file() and not state.is_symlink(),
                f'missing or linked state AGENTS.md: {state}')
        require(not same_inode(state, agents),
                f'state AGENTS.md must be independent from federal: {state}')
        identity = (state.stat().st_dev, state.stat().st_ino)
        require(identity not in state_ids,
                f'state AGENTS.md must not share inode with another state: {state}')
        state_ids.add(identity)
        prefix = '../' if tree == main else '../../'
        declaration = ('<!-- ocr2md:state-constitution:v1 '
                       f'federal={prefix}AGENTS.md build={prefix}BUILD.md '
                       f'comm={prefix}COMM.md -->')
        text = state.read_text(encoding='utf-8')
        require(declaration in text and '不得覆盖联邦宪法' in text,
                f'state AGENTS.md missing federal inheritance declaration: {state}')
        for filename in ('AGENTS.md', 'BUILD.md', 'COMM.md'):
            ref = (tree / (prefix + filename)).resolve()
            require(ref == (root / filename).resolve() and ref.is_file(),
                    f'state AGENTS.md federal reference does not reach root: {state}: {filename}')
        print('GIT_ACTIVE', tree.name, git_head(tree))
    require(agents.stat().st_nlink >= 2,
            'federal AGENTS link count lower than unified root + Main tracking path')
    print('LAB_AUTO_DISCOVERY_PASS', len(labs), 'labs', ','.join(p.name for p in labs))
    print('FEDERAL_AGENTS_PASS', agents.stat().st_ino,
          hashlib.sha256(agents.read_bytes()).hexdigest()[:12])
    print('STATE_CONSTITUTIONS_PASS', len(state_ids), 'distinct state AGENTS files')
    print('SHARED_BUILD_PASS', build.stat().st_ino,
          hashlib.sha256(build.read_bytes()).hexdigest()[:12])
    print('SHARED_COMM_PASS', comm.stat().st_ino,
          hashlib.sha256(comm.read_bytes()).hexdigest()[:12])
    # Preserve older automation's summary token during the rename.
    print('SHARED_COMPONENTS_SPEC_PASS', comm.stat().st_ino,
          hashlib.sha256(comm.read_bytes()).hexdigest()[:12])
    return labs


def check_full(root: Path, labs: list[Path]):
    # An archived migration record is optional on newly initialized workspaces.
    # If it exists, it must be valid; its historical number of moves is NOT a
    # current Lab-count contract.
    archive = root / 'archive/2026-11-11/manifest.json'
    if archive.is_file():
        old = json.loads(archive.read_text())
        require(isinstance(old.get('moves'), list) and not old.get('failures'),
                'migration archive is invalid or has unresolved failures')
        for entry in old['moves']:
            path = Path(entry['to'])
            require(path.exists(), f'migration record target not found: {path}')
        print('ARCHIVE_RECORD_PASS', len(old['moves']))
    manifest = root / 'release/release-manifest.json'
    require(manifest.is_file(), 'release manifest missing')
    published = json.loads(manifest.read_text())
    modules = published.get('modules')
    require(isinstance(modules, dict), 'malformed Lab release manifest')
    names = {p.name for p in labs}
    require(set(modules).issubset(names), f'published module without active Lab: {set(modules)-names}')
    for name, record in modules.items():
        directory = root / 'release' / name
        require(directory.is_dir() and not directory.is_symlink(), f'missing release module: {name}')
        actual = {p.relative_to(directory).as_posix():hashlib.sha256(p.read_bytes()).hexdigest()
                  for p in directory.rglob('*') if p.is_file() and p.name != '.DS_Store'}
        require(actual == record['files'], f'release module manifest checksum mismatch: {name}')
        require(len(actual) == record['assetCount'], f'release asset count mismatch: {name}')
    print('RELEASE_DYNAMIC_MODULE_HASH_PASS', len(modules), 'published of', len(labs), 'active Lab(s)')
    base = root.parent
    for old in ['ocr2md-v6', 'ocr2md-v6-experiments', 'ocr2md-lab-release',
                'ocr2md-dev', 'archive/ocr2md', '.ocr2md-migration-backups',
                'ocr2md-r9-local-review.patch']:
        p = base / old
        require(not p.exists() and not p.is_symlink(), f'redundant historic home: {p}')
    other = [p.name for p in base.iterdir() if 'ocr2md' in p.name.lower() and p.name != root.name]
    require(not other, f'duplicate OCR2MD top-level workspace(s): {other}')
    print('SINGLE_WORKSPACE_HOME_PASS', root)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', type=Path,
                        default=Path(__file__).resolve().parents[2],
                        help='unified OCR2MD workspace root (default: current root)')
    parser.add_argument('--core-only', action='store_true',
                        help='check dynamic Lab and constitution contract without historical releases')
    args = parser.parse_args(argv)
    root = args.root.resolve()
    labs = check_core(root)
    if not args.core_only:
        check_full(root, labs)
    print('VERIFIED')


if __name__ == '__main__':
    main()
