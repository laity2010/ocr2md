#!/usr/bin/env python3
"""Branch-per-experiment: create, merge current trunk forward, review promotion.
No rebase, force-push, mainline checkout, or automatic promotion.
"""
import argparse
import json
import re
import subprocess
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
NAME=re.compile(r'[a-z][a-z0-9-]{0,31}\Z')

def git(*args, cwd=ROOT, check=True):
    return subprocess.run(['git',*args],cwd=cwd,text=True,capture_output=True,check=check)

def assert_clean(path):
    result=git('status','--porcelain',cwd=path).stdout.strip()
    if result: raise RuntimeError(f'Worktree contains uncommitted changes: {path}\n{result}')

def worktree_path(name):
    return ROOT.parent / (ROOT.name+'-experiments') / name

def branch(name):
    if not NAME.fullmatch(name): raise ValueError('Lab name must match [a-z][a-z0-9-]{0,31}')
    return 'experiment/'+name

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('action',choices=['create','sync','status','merge-check'])
    parser.add_argument('name',help='Lab slug, e.g. latex-v2')
    parser.add_argument('--trunk',default='build/2026-10-20',help='The current integration branch')
    args=parser.parse_args()
    target=branch(args.name); path=worktree_path(args.name)
    git('show-ref','--verify','--quiet','refs/heads/'+args.trunk)
    if args.action=='create':
        if path.exists():raise RuntimeError('Experiment directory already exists: '+str(path))
        if git('show-ref','--verify','--quiet','refs/heads/'+target,check=False).returncode==0:
            raise RuntimeError('Experiment branch exists; attach it manually: '+target)
        assert_clean(ROOT)
        path.parent.mkdir(exist_ok=True)
        git('worktree','add','-b',target,str(path),args.trunk)
        directory=path/'labs'/args.name
        directory.mkdir(parents=True,exist_ok=True)
        (directory/'lab.json').write_text(json.dumps({'modules':{}},indent=2)+'\n')
        git('add',str(Path('labs')/args.name/'lab.json'),cwd=path)
        git('commit','-m',f'lab({args.name}): initialize isolated module overrides',cwd=path)
    elif not path.is_dir():
        raise RuntimeError('Missing worktree: '+str(path))
    if args.action=='sync':
        assert_clean(path)
        git('merge','--no-edit','--no-ff',args.trunk,cwd=path)
    if args.action=='merge-check':
        assert_clean(path)
        # Merge-tree resolves integration in-memory and reports conflicts,
        # but NEVER modifies the trunk or the laboratory checkout.
        result=git('merge-tree','--write-tree',args.trunk,target,cwd=ROOT,check=False)
        if result.returncode:
            print(result.stdout)
            raise RuntimeError('Promotion conflict detected; no branch was changed')
        print('Promotion merge-tree OK:',result.stdout.strip().splitlines()[0])
    behind=git('rev-list','--count',f'{target}..{args.trunk}').stdout.strip()
    ahead=git('rev-list','--count',f'{args.trunk}..{target}').stdout.strip()
    print(json.dumps({'lab':args.name,'worktree':str(path),'branch':target,
        'trunk':args.trunk,'behind':int(behind),'ahead':int(ahead),
        'head':git('rev-parse','--short',target).stdout.strip()},ensure_ascii=False))

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,RuntimeError,subprocess.CalledProcessError) as exc:
        raise SystemExit(f'LAB_WORKTREE_ERROR: {exc}')
