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
    agents = root / 'AGENTS.md'
    components = root / 'CROSS_VERSION_COMPONENTS.md'
    for file in (agents, components, main / 'AGENTS.md',
                 main / 'CROSS_VERSION_COMPONENTS.md'):
        require(file.is_file() and not file.is_symlink(), f'missing or linked-to-symlink contract: {file}')
    require(same_inode(agents, main / 'AGENTS.md'), 'Main AGENTS.md is not the shared constitution inode')
    require(same_inode(components, main / 'CROSS_VERSION_COMPONENTS.md'),
            'Main cross-version components spec is not the shared contract inode')
    require('## 10. 同级工程规范文件目录与职责' in agents.read_text(),
            'AGENTS.md does not register the shared constitution index')
    require('EnumCheckboxFilter' in components.read_text(),
            'cross-version components spec is empty or unrelated to V1 AG Grid')
    for tree in [main, *labs]:
        readme = tree / 'README.md'
        ag = tree / 'AGENTS.md'
        require(readme.is_file() and not readme.is_symlink(), f'missing project README: {readme}')
        require(bool(readme.read_text(encoding='utf-8').strip()) and
                '#' in readme.read_text(encoding='utf-8'),
                f'invalid project README: {readme}')
        require(ag.is_file() and not ag.is_symlink() and same_inode(ag, agents),
                f'separate or missing AGENTS.md (must be hard-linked): {ag}')
        print('GIT_ACTIVE', tree.name, git_head(tree))
    require(agents.stat().st_nlink >= len(labs) + 2,
            'shared AGENTS link count lower than discovered root/Main/Labs paths')
    print('LAB_AUTO_DISCOVERY_PASS', len(labs), 'labs', ','.join(p.name for p in labs))
    print('SHARED_AGENTS_PASS', agents.stat().st_ino,
          hashlib.sha256(agents.read_bytes()).hexdigest()[:12])
    print('SHARED_COMPONENTS_SPEC_PASS', components.stat().st_ino,
          hashlib.sha256(components.read_bytes()).hexdigest()[:12])
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
