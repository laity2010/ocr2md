#!/usr/bin/env python3
"""Publish one V6 release directory; rebuild a Git commit to roll back.

The only durable publication is .v6/release/. Staging and swap protection
are temporary and are not independently addressable releases or A/B slots.
"""
import argparse
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.v6'
RELEASE = STATE / 'release'
STAGING = STATE / '.release-staging'
OLD = STATE / '.release-replacing'


def git(*args, cwd=ROOT):
    return subprocess.run(['git', *args], cwd=cwd, check=True,
                          text=True, capture_output=True).stdout.strip()


def install(source, commit):
    if not (source / 'index.html').is_file() or not (source / 'release-version.json').is_file():
        raise RuntimeError('Incomplete V6 output, refusing publication')
    if STAGING.exists() or OLD.exists():
        raise RuntimeError('Stale temporary publication found; manual review required')
    shutil.copytree(source, STAGING)
    build = json.loads((STAGING / 'release-version.json').read_text())['version']
    (STAGING / 'release.json').write_text(json.dumps({
        'commit': commit, 'version': build, 'publishedAt': int(time.time())
    }) + '\n')
    replaced = False
    try:
        if RELEASE.exists():
            os.rename(RELEASE, OLD)
            replaced = True
        os.rename(STAGING, RELEASE)
    except BaseException:
        if replaced and not RELEASE.exists() and OLD.exists():
            os.rename(OLD, RELEASE)
        raise
    if replaced:
        shutil.rmtree(OLD)
    print('V6_PUBLISHED_ONE_RELEASE', build, commit)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--git', dest='commit', help='Rebuild this ancestor Git commit to restore it without rewriting HEAD')
    args = parser.parse_args()
    STATE.mkdir(exist_ok=True)
    with (STATE / '.publish.lock').open('w') as lock:
        fcntl.flock(lock.fileno(), fcntl.LOCK_EX)
        if args.commit:
            commit = git('rev-parse', '--verify', args.commit + '^{commit}')
            subprocess.run(['git', 'merge-base', '--is-ancestor', commit, 'HEAD'],
                           cwd=ROOT, check=True)
            temp = STATE / '.git-publish-worktree'
            if temp.exists():
                raise RuntimeError('Temporary Git build path already exists')
            git('worktree', 'add', '--detach', str(temp), commit)
            try:
                subprocess.run(['npm', 'ci', '--no-audit', '--no-fund'], cwd=temp, check=True)
                subprocess.run(['npm', 'run', 'build'], cwd=temp, check=True)
                install(temp / 'dist', commit)
            finally:
                # Successful checkout/compilation uses only a disposable worktree.
                git('worktree', 'remove', str(temp))
        else:
            if git('status', '--porcelain'):
                raise RuntimeError('Commit the change and build first: Git worktree not clean')
            install(ROOT / 'dist', git('rev-parse', 'HEAD'))

if __name__ == '__main__':
    try:
        main()
    except (OSError, subprocess.CalledProcessError, RuntimeError, ValueError) as error:
        print('V6_PUBLISH_ERROR', error, file=sys.stderr)
        sys.exit(2)
