#!/usr/bin/env python3
"""Publish a mirror Lab build without mutating Main or the Lab's user data.

Run from a CLEAN Lab Git worktree after both builds and module-graph parity:
  npm run build
  V6_LAB_ID=cm-html npm run build
  node scripts/v6_lab_parity_check.mjs cm-html
  python3 scripts/v6_lab_publish.py cm-html --host-root /path/to/main
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
LAB_NAME = re.compile(r'[a-z][a-z0-9-]{0,31}\Z')


def git(*args):
    return subprocess.run(['git', *args], cwd=ROOT, check=True, text=True,
                          capture_output=True).stdout.strip()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('name')
    parser.add_argument('--host-root', type=Path, required=True,
                        help='Main worktree hosting the existing Lab URL and isolated .runtime')
    args = parser.parse_args()
    if not LAB_NAME.fullmatch(args.name):
        raise RuntimeError('Invalid Lab identifier')
    if git('status', '--porcelain'):
        raise RuntimeError('Commit Lab source and acceptance evidence before publication')
    host = args.host_root.resolve(strict=True)
    if ROOT.resolve() == host:
        raise RuntimeError('Do not publish Lab from the active Main worktree: use a mirror worktree')
    if not (host / '.git').exists():
        raise RuntimeError('Lab publishing host must be a Git worktree')
    source = ROOT / 'labs' / args.name / 'dist'
    labdir = host / 'labs' / args.name
    if not labdir.is_dir() or labdir.is_symlink():
        raise RuntimeError('Missing existing Lab host directory')
    runtime = labdir / '.runtime'
    if not runtime.is_dir() or runtime.is_symlink():
        raise RuntimeError('Refuse to publish without isolated existing Lab runtime')
    commit = git('rev-parse', 'HEAD')
    expected = json.loads((source / 'release-version.json').read_text())
    if expected.get('mode') != 'lab' or expected.get('name') != args.name or expected.get('baseCommit') != commit:
        raise RuntimeError('Lab build identity differs from exact source SHA')
    subprocess.run(['node', 'scripts/v6_lab_parity_check.mjs', args.name],
                   cwd=ROOT, check=True)
    target = labdir / 'dist'
    staging = labdir / '.publish-staging'
    previous = labdir / '.publish-replacing'
    with (labdir / '.publish.lock').open('w') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        if staging.exists() or previous.exists():
            raise RuntimeError('Old staging directory remains; manual recovery required')
        # Never touch runtime or other Lab files; only replace the static build.
        shutil.copytree(source, staging)
        (staging / 'release.json').write_text(json.dumps({
            'commit': commit, 'version': expected['version'],
            'moduleGraphSha256': json.loads((staging / 'module-graph.json').read_text())['moduleGraphSha256']
        }) + '\n')
        swapped = False
        try:
            if target.exists():
                if target.is_symlink():
                    raise RuntimeError('Refuse to replace linked Lab release')
                os.rename(target, previous)
                swapped = True
            os.rename(staging, target)
        except BaseException:
            if swapped and not target.exists() and previous.exists():
                os.rename(previous, target)
            raise
        if swapped:
            shutil.rmtree(previous)
    print('LAB_MIRROR_PUBLISHED', args.name, expected['version'], commit,
          'static=', target, 'runtime_untouched=', runtime)


if __name__ == '__main__':
    try:
        main()
    except (OSError, ValueError, RuntimeError, subprocess.CalledProcessError, json.JSONDecodeError) as error:
        print('LAB_MIRROR_PUBLISH_ERROR', error, file=sys.stderr)
        sys.exit(2)
