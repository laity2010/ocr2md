#!/usr/bin/env python3
"""Federal Git evidence enforcement. Standard library; no product dependencies."""
from __future__ import annotations
import argparse
import os
from pathlib import Path
import re
import subprocess
import sys

TAG = 'federal-git-gate-v1'
FIELDS = ('目标', '基线', '变更', '验收', '结果', '发布', '违宪')
SHA = re.compile(r'[0-9a-f]{40}')
PLACEHOLDER = {'-', '无', 'none', 'n/a', 'na', 'todo', 'tbd', '待补', '待填写', '未填写', 'pass', 'fail', 'blocked', '通过', '失败'}

class GateError(RuntimeError):
    pass

def git(tree, *args, input=None):
    env = os.environ.copy()
    for key in ('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_PREFIX','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_NAMESPACE'):
        env.pop(key,None)
    p = subprocess.run(['git', '-C', str(tree), *args], text=True, input=input, capture_output=True, env=env)
    if p.returncode:
        raise GateError(p.stderr.strip() or 'git command failed: ' + ' '.join(args))
    return p.stdout.strip()

def validate(message, tree):
    lines = [line for line in message.splitlines() if not line.startswith('#')]
    if not lines or not lines[0].strip() or not any(not x.strip() for x in lines[1:]):
        raise GateError('需要标题、空行与完整提交正文')
    data = {}
    for line in lines[1:]:
        m = re.match(r'^(' + '|'.join(FIELDS) + r')\s*[:：]\s*(.*?)\s*$', line)
        if not m:
            continue
        key, value = m.groups()
        if key in data or not value:
            raise GateError('重复或空字段：' + key)
        data[key] = value
    missing = set(FIELDS) - data.keys()
    if missing:
        raise GateError('缺少正文：' + '、'.join(k for k in FIELDS if k in missing))
    for key in ('目标', '变更', '验收'):
        if data[key].casefold() in PLACEHOLDER:
            raise GateError('禁止占位字段：' + key)
    baseline = data['基线']
    if not SHA.fullmatch(baseline) or git(tree, 'cat-file', '-t', baseline) != 'commit':
        raise GateError('基线必须是存在的完整 commit SHA')
    if data['结果'] not in ('PASS', 'FAIL', 'BLOCKED') or data['发布'] not in ('REQUIRED', 'NONE', 'ISOLATED', 'FORBIDDEN'):
        raise GateError('结果或发布枚举错误')
    if (data['结果'] != 'PASS') != (data['发布'] == 'FORBIDDEN'):
        raise GateError('FAIL/BLOCKED 必须 FORBIDDEN，PASS 不得 FORBIDDEN')
    return data

def root_default():
    p = Path(__file__).resolve()
    return p.parent.parent if p.parent.name == '.ops' else p.parents[2]

def old_tips(tree):
    if git(tree, 'cat-file', '-t', TAG) != 'tag':
        raise GateError('联邦生效 tag 必须是 annotated tag')
    text = git(tree, 'for-each-ref', '--format=%(contents)', 'refs/tags/' + TAG)
    tips = re.findall(r'^Baseline: ([0-9a-f]{40})$', text, re.M)
    if not tips:
        raise GateError('缺少联邦立法生效边界')
    for sha in tips:
        if git(tree, 'cat-file', '-t', sha) != 'commit':
            raise GateError('立法边界不是 commit')
    return sorted(set(tips))

def new_commits(tree, sha, tips):
    return git(tree, 'rev-list', sha, '--not', *tips).splitlines()

def audit_tip(tree, sha, tips):
    commits = new_commits(tree, sha, tips)
    data = {}
    for c in commits:
        try:
            data[c] = validate(git(tree, 'show', '-s', '--format=%B', c), tree)
        except GateError as exc:
            raise GateError(c[:12] + ': ' + str(exc)) from exc
    return data.get(sha), len(commits)

def active_refs(root):
    trees = [root/'main', *sorted((root/'labs').iterdir())]
    return {git(t, 'symbolic-ref', 'HEAD') for t in trees if (t/'AGENTS.md').is_file()}

def check_push(tree, lines, root):
    tips = old_tips(tree)
    active = active_refs(root)
    for line in lines:
        if not line.strip(): continue
        parts = line.split()
        if len(parts) != 4: raise GateError('无法解析 pre-push 输入')
        local, sha, remote, remote_sha = parts
        if remote == 'refs/notes/commits': continue
        if sha == '0'*40:
            if remote in active or remote == 'refs/tags/'+TAG: raise GateError('禁止删除活动分支/联邦生效 tag')
            continue
        if remote == 'refs/tags/'+TAG and remote_sha != '0'*40 and sha != remote_sha:
            raise GateError('禁止改写联邦生效 tag')
        if remote.startswith('refs/heads/') and remote_sha != '0'*40:
            git(tree, 'merge-base', '--is-ancestor', remote_sha, sha)
        sha = git(tree, 'rev-parse', sha+'^{commit}')
        data, count = audit_tip(tree, sha, tips)
        if remote in active and data and data['结果'] != 'PASS':
            raise GateError('FAIL/BLOCKED 仅可推送独立证据分支：'+remote)
        print('FEDERAL_GIT_PUSH_PASS', remote, count)

def check_release(tree, commit, *, legacy_rollback=False):
    sha = git(tree, 'rev-parse', commit+'^{commit}')
    if git(tree, 'status', '--porcelain'):
        raise GateError('发布工作树有未提交变更')
    if not legacy_rollback and sha != git(tree, 'rev-parse', 'HEAD'):
        raise GateError('发布候选必须与当前工作树 HEAD 一致')
    data, count = audit_tip(tree, sha, old_tips(tree))
    if data is None:
        if not legacy_rollback:
            raise GateError('旧历史 SHA 不属新构建；仅已验收历史回退可显式 --legacy-rollback')
        print('FEDERAL_GIT_RELEASE_LEGACY_ROLLBACK_REQUIRES_BUILD_EVIDENCE', sha)
        return
    if legacy_rollback and sha != git(tree, 'rev-parse', 'HEAD'):
        raise GateError('新法后回退候选须在独立干净工作树检出')
    if data['结果'] != 'PASS' or data['发布'] != 'REQUIRED':
        raise GateError('发布候选必须 PASS / REQUIRED')
    print('FEDERAL_GIT_RELEASE_PASS', sha, count)

def install(root):
    main = root/'main'; source = main/'constitution'
    gate = root/'.ops/git-gate.py'; hooks = root/'.ops/git-hooks'
    hooks.mkdir(parents=True, exist_ok=True)
    for a,b in [(source/'git_gate.py',gate), *((source/'git-hooks'/n,hooks/n) for n in ('commit-msg','pre-push'))]:
        if b.exists():
            if not os.path.samefile(a,b): raise GateError('拒绝覆盖非同 inode 执法程序：'+str(b))
        else: os.link(a,b)
    if not all(os.access(hooks/n,os.X_OK) for n in ('commit-msg','pre-push')): raise GateError('Hook 不可执行')
    old_tips(main)
    old = subprocess.run(['git','-C',str(main),'config','--get','core.hooksPath'],text=True,capture_output=True).stdout.strip()
    if old and Path(old).resolve()!=hooks.resolve(): raise GateError('已有其他 hooksPath，须核对后处理')
    git(main,'config','--local','core.hooksPath',str(hooks))
    print('FEDERAL_GIT_HOOKS_INSTALLED',hooks)

def status(root):
    main=root/'main'; hooks=root/'.ops/git-hooks'; source=main/'constitution'
    if Path(git(main,'config','--get','core.hooksPath')).resolve()!=hooks.resolve(): raise GateError('共享 hook 配置缺失')
    for a,b in [(source/'git_gate.py',root/'.ops/git-gate.py'), *((source/'git-hooks'/n,hooks/n) for n in ('commit-msg','pre-push'))]:
        if not os.path.samefile(a,b) or not os.access(b,os.R_OK): raise GateError('执法程序身份不一致')
    if not all(os.access(hooks/n,os.X_OK) for n in ('commit-msg','pre-push')): raise GateError('Hook 不可执行')
    tips=old_tips(main)
    for tree in [main,*sorted((root/'labs').iterdir())]:
        if not (tree/'AGENTS.md').is_file(): continue
        if git(tree,'config','--get','core.hooksPath')!=str(hooks): raise GateError('州 hook 配置不一致：'+str(tree))
        if git(tree,'rev-parse','--path-format=absolute','--git-common-dir')!=git(main,'rev-parse','--path-format=absolute','--git-common-dir'):
            raise GateError('州未共享联邦 Git common-dir：'+str(tree))
        data,count=audit_tip(tree,git(tree,'rev-parse','HEAD'),tips)
        if data and data['结果']!='PASS':raise GateError('活动工作树有未回退失败构建：'+str(tree))
        print('FEDERAL_GIT_STATE_PASS',tree.name,count)
    print('FEDERAL_GIT_STATUS_PASS')

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=root_default())
    sub=p.add_subparsers(dest='cmd',required=True)
    a=sub.add_parser('commit-msg');a.add_argument('message',type=Path)
    sub.add_parser('pre-push');sub.add_parser('install');sub.add_parser('status')
    a=sub.add_parser('check-release');a.add_argument('--tree',type=Path,required=True);a.add_argument('--commit',required=True);a.add_argument('--legacy-rollback',action='store_true')
    args=p.parse_args(argv); root=args.root.resolve()
    try:
        if args.cmd=='install':install(root)
        elif args.cmd=='status':status(root)
        elif args.cmd=='check-release':check_release(args.tree,args.commit,legacy_rollback=args.legacy_rollback)
        elif args.cmd=='commit-msg':
            validate(args.message.read_text(encoding='utf-8'),Path.cwd());print('FEDERAL_GIT_COMMIT_MSG_PASS')
        elif args.cmd=='pre-push':check_push(Path.cwd(),sys.stdin,root)
    except (GateError,OSError,ValueError) as exc:
        print('FEDERAL_GIT_GATE_FAIL:',exc,file=sys.stderr);return 2
    return 0

if __name__=='__main__':sys.exit(main())
