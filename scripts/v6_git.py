#!/usr/bin/env python3
"""Small V6-only Git build history / artifact recovery / daily squash helper."""
import argparse
import datetime as dt
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys

ROOT = Path(__file__).resolve().parent.parent
STATE = ROOT / '.v6'


def git(*parts, cwd=ROOT, capture=True, check=True):
    p = subprocess.run(['git', *map(str, parts)], cwd=cwd,
                       capture_output=capture, text=True, check=False)
    if check and p.returncode:
        raise RuntimeError(f'Git failed: {p.stderr.strip() if capture else parts}')
    return p.stdout.strip() if capture else p.returncode


def memo_reminder():
    notes = (ROOT / 'ENGINEERING_MEMO.md').read_text()
    number = len(re.findall(r'^##\s+\d+\.', notes, flags=re.M))
    if number > 20:
        print(f'⚠️ V6 工程备忘已达 {number} 条（超过 20 条），须提醒用户审查精简。', flush=True)


def branch():
    return git('branch', '--show-current')


def build(args):
    if not branch().startswith('build/'):
        raise RuntimeError('Please build on a local build/YYYY-MM-DD branch')
    # Snapshot before executing the build, even if that build is about to fail.
    git('add', '-A')
    git('commit', '--allow-empty', '-m', f'build(v6): {args.change}',
        '-m', f'构建目的：{args.purpose}')
    commit = git('rev-parse', 'HEAD')
    ident = 'v6-' + dt.datetime.now().strftime('%Y%m%d-%H%M%S-%f') + '-' + commit[:8]
    print('V6_BUILD_CHECKPOINT', ident, commit, flush=True)
    cmd = list(args.command)
    if cmd and cmd[0] == '--':
        cmd.pop(0)
    if not cmd:
        raise RuntimeError('Actual build command required after --')
    result = subprocess.run(cmd, cwd=ROOT, check=False).returncode
    record = {'buildId': ident, 'commit': commit, 'changed': args.change,
              'purpose': args.purpose, 'command': cmd, 'exitCode': result,
              'artifactSaved': False, 'time': dt.datetime.now().isoformat()}
    if result == 0 and args.artifact:
        source = Path(args.artifact)
        if not source.is_absolute():
            source = ROOT / source
        dest = STATE / 'releases' / ident
        if not source.is_dir() or source.is_symlink() or any(p.is_symlink() for p in source.rglob('*')):
            record['artifactError'] = 'Artifact directory missing or contains symlinks'
            result = 1
        else:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(source, dest)
            record['artifactSaved'] = True
            pointer(ident)
    record['resultCode'] = result
    logs = STATE / 'builds'
    logs.mkdir(parents=True, exist_ok=True)
    (logs / f'{ident}.json').write_text(json.dumps(record, ensure_ascii=False, indent=2) + '\n')
    print('V6_BUILD_RESULT', json.dumps(record, ensure_ascii=False), flush=True)
    return result


def pointer(build_id):
    dest = STATE / 'releases' / build_id
    if not dest.is_dir():
        raise RuntimeError(f'Unknown or missing V6 artifact: {build_id}')
    target = STATE / 'current'
    if target.exists() and not target.is_symlink():
        raise RuntimeError('V6 current is unexpectedly not a symlink')
    temp = STATE / ('.new-current-' + str(os.getpid()))
    if temp.exists() or temp.is_symlink():
        raise RuntimeError('Temporary pointer already exists')
    temp.symlink_to(Path('releases') / build_id)
    os.replace(temp, target)
    print('V6_CURRENT_ARTIFACT', build_id, '(pointer only; no V5 service affected)')


def recovered_source(build_id):
    record = STATE / 'builds' / (build_id + '.json')
    if not record.is_file():
        raise RuntimeError('Unknown build ID')
    commit = json.loads(record.read_text())['commit']
    path = STATE / 'recovery' / build_id
    if path.exists():
        raise RuntimeError('Recovery path already exists; original recovery is preserved')
    path.parent.mkdir(parents=True, exist_ok=True)
    git('worktree', 'add', '--detach', path, commit)
    print('V6_SOURCE_RECOVERY', path, commit)


def review(args):
    daily = branch()
    if not daily.startswith('build/'):
        raise RuntimeError('Not on a daily build branch')
    if git('status', '--porcelain'):
        raise RuntimeError('Uncommitted changes exist; create a build checkpoint first')
    if git('merge-base', 'v6', daily) != git('rev-parse', 'v6'):
        raise RuntimeError('Daily branch does not start from latest reviewed v6')
    history = git('log', '--reverse', '--format=%h %s%n%b', f'v6..{daily}')
    print('V6_DAILY_COMMITS:\n' + history)
    print('V6_DAILY_DIFF:\n' + git('diff', '--stat', 'v6', daily))
    if not args.approved:
        print('V6_AWAITING_HUMAN_APPROVAL; nothing merged or pushed')
        return
    if not history:
        raise RuntimeError('No daily build commits to review')
    checkout = STATE / 'review'
    if not checkout.exists():
        checkout.parent.mkdir(parents=True, exist_ok=True)
        git('worktree', 'add', checkout, 'v6')
    if git('status', '--porcelain', cwd=checkout):
        raise RuntimeError('Review worktree is not clean')
    git('merge', '--squash', daily, cwd=checkout)
    # One day = one reviewed commit. The fine build branch is never rewritten.
    git('commit', '--allow-empty', '-m', f'feat(v6): {dt.date.today().isoformat()} {args.summary}',
        '-m', '已审批的本地构建记录：\n' + history, cwd=checkout)
    print('V6_DAILY_SQUASH', git('rev-parse', 'HEAD', cwd=checkout))
    print('V6_REMOTE_NOT_PUSHED; git push origin v6 requires separate explicit approval')


def next_day():
    if git('status', '--porcelain'):
        raise RuntimeError('Uncommitted changes exist; checkpoint first')
    current = branch()
    if not current.startswith('build/'):
        raise RuntimeError('Must start next-day on daily build branch')
    if subprocess.run(['git', 'diff', '--quiet', 'v6', current], cwd=ROOT).returncode:
        raise RuntimeError('Current day not yet reviewed; no new day branch')
    name = 'build/' + dt.date.today().isoformat()
    if name == current:
        raise RuntimeError('Today is already the active build branch')
    git('switch', '-c', name, 'v6')
    print('V6_DAY_STARTED', name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    subs = parser.add_subparsers(dest='action', required=True)
    p = subs.add_parser('build')
    p.add_argument('--change', required=True, help='What was built or changed')
    p.add_argument('--purpose', required=True, help='Why this change was made')
    p.add_argument('--artifact', help='Build output directory to archive when successful')
    p.add_argument('command', nargs=argparse.REMAINDER)
    p = subs.add_parser('rollback')
    p.add_argument('--to', required=True)
    p = subs.add_parser('recover-source')
    p.add_argument('--build-id', required=True)
    p = subs.add_parser('review')
    p.add_argument('--approved', action='store_true')
    p.add_argument('--summary', default='当日开发成果')
    subs.add_parser('next-day')
    subs.add_parser('status')
    args = parser.parse_args()
    memo_reminder()
    if args.action == 'build':
        return build(args)
    if args.action == 'rollback':
        pointer(args.to)
    if args.action == 'recover-source':
        recovered_source(args.build_id)
    if args.action == 'review':
        review(args)
    if args.action == 'next-day':
        next_day()
    if args.action == 'status':
        print('V6_BRANCH', branch())
        print('V6_REVIEWED', git('rev-parse', '--short', 'v6'))
        print('V6_CURRENT', os.readlink(STATE / 'current') if (STATE / 'current').is_symlink() else '(none)')
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, RuntimeError) as exc:
        print('V6_FLOW_ERROR', exc, file=sys.stderr)
        sys.exit(2)
