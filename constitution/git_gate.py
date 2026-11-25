#!/usr/bin/env python3
"""Federal Git evidence enforcement. Standard library; no product dependencies."""
from __future__ import annotations
import argparse
import contextlib
from collections import Counter
import datetime
import fcntl
import hashlib
import json
import uuid
import os
from pathlib import Path
import re
import subprocess
import sys

TAG = 'federal-git-gate-v1'
RECORD_TAG = 'federal-build-record-v1'
NOTES = 'refs/notes/commits'
EVENT_PREFIX = 'FEDERAL_BUILD_EVENT_V1 '
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

def old_tips(tree, tag=TAG):
    if git(tree, 'cat-file', '-t', tag) != 'tag':
        raise GateError('联邦生效 tag 必须是 annotated tag')
    text = git(tree, 'for-each-ref', '--format=%(contents)', 'refs/tags/' + tag)
    tips = re.findall(r'^Baseline: ([0-9a-f]{40})$', text, re.M)
    if not tips:
        raise GateError('缺少联邦立法生效边界')
    for sha in tips:
        if git(tree, 'cat-file', '-t', sha) != 'commit':
            raise GateError('立法边界不是 commit')
    return sorted(set(tips))

def new_commits(tree, sha, tips):
    return git(tree, 'rev-list', sha, '--not', *tips).splitlines()

def record_enabled(tree):
    return bool(git(tree,'tag','--list',RECORD_TAG))

def utc():
    return datetime.datetime.now(datetime.timezone.utc).isoformat()

@contextlib.contextmanager
def record_lock(tree):
    common=Path(git(tree,'rev-parse','--path-format=absolute','--git-common-dir'))
    with (common/'federal-build-record.lock').open('a') as fp:
        fcntl.flock(fp,fcntl.LOCK_EX)
        yield

def events(tree, ref=None):
    # Read only the event lines in existing default Git Notes. The note's
    # target is checked, not merely trusted from the embedded JSON.
    if ref:
        entries=[]
        for line in git(tree,'ls-tree','-r',ref).splitlines():
            meta,path=line.split('\t',1);_,kind,obj=meta.split();target=path.replace('/','')
            if kind=='blob' and SHA.fullmatch(target):entries.append((obj,target))
    else:entries=[line.split() for line in git(tree,'notes','list').splitlines()]
    if not entries:return []
    env=os.environ.copy()
    for key in ('GIT_DIR','GIT_WORK_TREE','GIT_COMMON_DIR','GIT_INDEX_FILE','GIT_PREFIX','GIT_OBJECT_DIRECTORY','GIT_ALTERNATE_OBJECT_DIRECTORIES','GIT_NAMESPACE'):env.pop(key,None)
    data=subprocess.check_output(['git','-C',str(tree),'cat-file','--batch'],input=('\n'.join(x[0] for x in entries)+'\n').encode(),env=env)
    result=[];pos=0
    for obj,target in entries:
        stop=data.index(b'\n',pos);header=data[pos:stop].decode().split()
        if header[:2]!=[obj,'blob']:raise GateError('Git Notes object unreadable')
        size=int(header[2]);pos=stop+1;blob=data[pos:pos+size];pos+=size+1
        for line in blob.decode('utf-8',errors='replace').splitlines():
            if not line.startswith(EVENT_PREFIX):continue
            event=json.loads(line[len(EVENT_PREFIX):])
            if event.get('baseline')!=target or not event.get('id') or not event.get('branch'):
                raise GateError('构建记录与Git Notes挂载基线不一致')
            result.append(event)
    return result

def registry(tree):
    starts={};ends={}
    for event in events(tree):
        ident=event['id']
        if event['event']=='START':
            if ident in starts:raise GateError('重复构建ID '+ident)
            starts[ident]=event
        elif event['event']=='END':
            if ident in ends:raise GateError('重复终止记录 '+ident)
            ends[ident]=event
    for ident,end in ends.items():
        start=starts.get(ident)
        if not start or (start['branch'],start['baseline'])!=(end['branch'],end['baseline']):
            raise GateError('孤立或不匹配的终止记录 '+ident)
    return starts,ends

def active_record(tree,branch=None,*,required=True):
    branch=branch or git(tree,'symbolic-ref','HEAD')
    starts,ends=registry(tree)
    active=[s for ident,s in starts.items() if ident not in ends and s['branch']==branch]
    if len(active)>1:raise GateError('同一分支存在多个未闭环构建 '+branch)
    if not active and required:raise GateError('没有构建前登记；先 begin，或 audit 追记已发现的改动')
    return active[0] if active else None

def append_event(tree,start,kind,**fields):
    event={k:start[k] for k in ('id','branch','baseline')}
    event.update(event=kind,utc=utc(),**fields)
    git(tree,'notes','append','-m',EVENT_PREFIX+json.dumps(event,ensure_ascii=False,separators=(',',':')),start['baseline'])
    return event

def notes_remote(tree):
    local=git(tree,'rev-parse',NOTES)
    remote=git(tree,'ls-remote','origin',NOTES).split()
    if not remote or remote[0]!=local:raise GateError('Git Notes 尚未同步远端；执行 sync-records 后继续，不得另开航点')
    return local

def sync_records(tree):
    git(tree,'push','origin',NOTES+':'+NOTES)
    print('FEDERAL_BUILD_NOTES_REMOTE_PASS',notes_remote(tree),flush=True)

def new_start(tree,wp,goal,*,retrospective=False):
    branch=git(tree,'symbolic-ref','HEAD');base=git(tree,'rev-parse','HEAD')
    start={'id':uuid.uuid4().hex,'branch':branch,'baseline':base}
    dirty=git(tree,'status','--porcelain')
    event=append_event(tree,start,'START',wp=wp,goal=goal,retrospective=retrospective,
        **({'observed_status_sha256':hashlib.sha256(dirty.encode()).hexdigest(),'observed_entries':len(dirty.splitlines())} if retrospective else {}))
    print('FEDERAL_BUILD_START',event['id'],branch,base,'RETROSPECTIVE' if retrospective else 'REGISTERED',flush=True)
    return event

def begin(tree,wp,goal):
    if not wp.strip() or not goal.strip():raise GateError('航点与目标不能为空')
    with record_lock(tree):
        if active_record(tree,required=False):raise GateError('已有未闭环构建，禁止另开航点')
        if git(tree,'status','--porcelain'):
            new_start(tree,'UNREGISTERED','发现未登记工作树改动；真实开始时刻、目标与责任待核实',retrospective=True)
            sync_records(tree)
            raise GateError('未登记改动已追记，须核实并保全，不得新开航点')
        new_start(tree,wp,goal)
        sync_records(tree)

def commit_record(tree,data,message,*,commit=None,require_open=False):
    ids=re.findall(r'^构建ID\s*[:：]\s*(\S+)\s*$',message,re.M)
    if len(ids)!=1:raise GateError('缺少唯一构建ID；先完成 START 登记')
    starts,ends=registry(tree);start=starts.get(ids[0])
    if not start or start['baseline']!=data['基线']:raise GateError('构建ID与START/基线不符')
    if commit:
        parents=git(tree,'show','-s','--format=%P',commit).split()
        if not parents or parents[0]!=start['baseline']:raise GateError('构建提交第一父节点不等于登记基线')
    else:
        if git(tree,'symbolic-ref','HEAD')!=start['branch'] or git(tree,'rev-parse','HEAD')!=start['baseline']:
            raise GateError('当前分支/HEAD与登记不符')
    if require_open and ids[0] in ends:raise GateError('构建已终止，不能重复提交/发布')
    if start.get('retrospective') and data['违宪'].strip().casefold() in ('无','none','-'):
        raise GateError('追记必须如实填写违宪/未登记事实，不得填无')
    return start

def current_record(tree):
    start=active_record(tree);head=git(tree,'rev-parse','HEAD')
    if head!=start['baseline']:
        msg=git(tree,'show','-s','--format=%B',head)
        actual=commit_record(tree,validate(msg,tree),msg,commit=head,require_open=True)
        if actual['id']!=start['id']:raise GateError('当前HEAD不属于该未闭环构建')
    return start

def check_start(tree):
    with record_lock(tree):
        if observe_unregistered(tree):
            sync_records(tree)
            raise GateError('未登记改动已追记；禁止开始构建')
        start=current_record(tree)
        notes_remote(tree)
        print('FEDERAL_BUILD_ENTRY_PASS',start['id'],start['branch'],flush=True)

def run_registered(tree,phase,command):
    if not phase.strip() or not command:raise GateError('需要阶段与实际命令')
    if command[0]=='--':command=command[1:]
    if not command:raise GateError('缺少实际命令')
    with record_lock(tree):
        start=current_record(tree);notes_remote(tree)
        step=uuid.uuid4().hex
        append_event(tree,start,'RUN_START',phase=phase,step=step)
        sync_records(tree)
    # Never hold the Git write lock across a user command or nested hook.
    try:
        result=subprocess.run(command,cwd=tree);code=result.returncode
    except OSError as exc:
        code=127;print('FEDERAL_BUILD_COMMAND_LAUNCH_FAIL',str(exc),file=sys.stderr)
    with record_lock(tree):
        append_event(tree,start,'RUN_EXIT',phase=phase,step=step,exit_code=code)
        sync_records(tree)
    return code if code>=0 else 128-code

def observe_unregistered(tree):
    if git(tree,'status','--porcelain') and not active_record(tree,required=False):
        new_start(tree,'UNREGISTERED','发现未登记工作树改动；真实开始时刻、目标与责任待核实',retrospective=True)
        return True
    return False

def audit_records(root):
    main=root/'main'
    with record_lock(main):
        found=False
        for tree in [main,*sorted((root/'labs').iterdir())]:
            if (tree/'AGENTS.md').is_file():found=observe_unregistered(tree) or found
        if found:sync_records(main)
    return report_records(root)

def report_records(root):
    main=root/'main';starts,ends=registry(main)
    open_count=0
    for ident,start in starts.items():
        if ident not in ends:
            print('FEDERAL_BUILD_OPEN',ident,start['branch'],start.get('wp'),start['baseline'],start.get('utc'));open_count+=1
    for tree in [main,*sorted((root/'labs').iterdir())]:
        if (tree/'AGENTS.md').is_file() and git(tree,'status','--porcelain') and not active_record(tree,required=False):
            print('FEDERAL_BUILD_UNREGISTERED_DIRTY',tree.name);open_count+=1
    print('FEDERAL_BUILD_RECORD_STATUS',len(starts),len(ends),'OPEN_OR_UNREGISTERED',open_count)
    return open_count

def finish(tree,root,result,evidence,commit=None,remote_ref=None,url=None):
    if not evidence.strip():raise GateError('终止必须提供实际证据')
    with record_lock(tree):
        start=current_record(tree);head=git(tree,'rev-parse','HEAD')
        if git(tree,'status','--porcelain'):raise GateError('工作树仍脏；先保全实际源码变更')
        sha=git(tree,'rev-parse',commit+'^{commit}') if commit else head
        if sha!=head:raise GateError('终止SHA须等于当前HEAD')
        release='NONE';remote='';release_identity={}
        if sha==start['baseline']:
            if result=='PASS' and not any(e['id']==start['id'] and e['event']=='RUN_EXIT' and e.get('exit_code')==0 for e in events(tree)):
                raise GateError('无源码变化的PASS需要实际成功命令证据')
        else:
            msg=git(tree,'show','-s','--format=%B',sha);data=validate(msg,tree)
            if commit_record(tree,data,msg,commit=sha,require_open=True)['id']!=start['id'] or data['结果']!=result:
                raise GateError('终止状态与构建提交不符')
            release=data['发布'];remote=remote_ref or start['branch']
            if result=='PASS' and remote!=start['branch']:raise GateError('正常构建须同步原州分支')
            if result!='PASS' and remote in active_refs(root):raise GateError('失败证据须保存到独立远端分支')
            actual=git(tree,'ls-remote','origin',remote).split()
            if not actual or actual[0]!=sha:raise GateError('对应远端证据SHA尚未同步')
            if release=='REQUIRED':
                if not url or not url.startswith('https://'):raise GateError('需实际HTTPS发布入口核验')
                if tree.parent.name=='labs':
                    manifest=json.loads((root/'release/release-manifest.json').read_text())
                    item=manifest['modules'][tree.name]
                    if item.get('sourceCommit')!=sha:raise GateError('统一发布manifest SHA不符')
                    release_identity={'version':item.get('version'),'assetCount':item.get('assetCount'),'manifest_sha256':hashlib.sha256((root/'release/release-manifest.json').read_bytes()).hexdigest()}
                # Read only the actual public response headers, no invented proof.
                p=subprocess.run(['curl','-fsS','--max-time','20','-D','-','-o',os.devnull,url],text=True,capture_output=True)
                headers=re.findall(r'^x-ocr2md-(?:lab-)?commit:\s*([0-9a-f]{40})\s*$',p.stdout,re.I|re.M)
                if p.returncode:raise GateError('线上入口不可读：'+p.stderr.strip())
                if tree.name=='main' and tree.parent==root:
                    # Main publishes its exact commit in release.json, not a SHA header.
                    local=json.loads((tree/'.v6/release/release.json').read_text())
                    q=subprocess.run(['curl','-fsS','--max-time','20',url.rstrip('/')+'/release.json'],text=True,capture_output=True)
                    if q.returncode:raise GateError('Main线上release.json不可读')
                    live=json.loads(q.stdout)
                    if local.get('commit')!=sha or live!=local:raise GateError('Main线上release.json身份不符')
                    release_identity.update(version=live['version'])
                elif sha not in headers:raise GateError('线上响应SHA不符')
                release_identity.update(url=url,online_commit=sha)
        append_event(tree,start,'END',result=result,commit=sha,evidence=evidence,release=release,remote_ref=remote,**release_identity)
        sync_records(tree)
        print('FEDERAL_BUILD_END',start['id'],result,sha,flush=True)

def audit_tip(tree, sha, tips):
    commits = new_commits(tree, sha, tips)
    data = {}
    required=set(new_commits(tree,sha,old_tips(tree,RECORD_TAG))) if record_enabled(tree) else set()
    for c in commits:
        try:
            msg=git(tree, 'show', '-s', '--format=%B', c)
            data[c] = validate(msg, tree)
            if c in required:commit_record(tree,data[c],msg,commit=c)
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
        if remote == NOTES:
            if sha=='0'*40:raise GateError('禁止删除构建记录Notes')
            if remote_sha!='0'*40:
                git(tree,'merge-base','--is-ancestor',remote_sha,sha)
                old=Counter(json.dumps(e,sort_keys=True,ensure_ascii=False) for e in events(tree,remote_sha))
                new=Counter(json.dumps(e,sort_keys=True,ensure_ascii=False) for e in events(tree,sha))
                if old-new:raise GateError('禁止删除或改写已推送构建事件')
            continue
        if sha == '0'*40:
            if remote in active or remote in ('refs/tags/'+TAG,'refs/tags/'+RECORD_TAG): raise GateError('禁止删除活动分支/联邦生效 tag')
            continue
        if remote in ('refs/tags/'+TAG,'refs/tags/'+RECORD_TAG) and remote_sha != '0'*40 and sha != remote_sha:
            raise GateError('禁止改写联邦生效 tag')
        if remote.startswith('refs/heads/') and remote_sha != '0'*40:
            git(tree, 'merge-base', '--is-ancestor', remote_sha, sha)
        sha = git(tree, 'rev-parse', sha+'^{commit}')
        data, count = audit_tip(tree, sha, tips)
        if record_enabled(tree) and remote in active and sha in set(new_commits(tree,sha,old_tips(tree,RECORD_TAG))):
            msg=git(tree,'show','-s','--format=%B',sha)
            start=commit_record(tree,data,msg,commit=sha)
            if start['branch']!=remote:raise GateError('活动分支与START不符')
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
    if record_enabled(tree) and sha not in set(new_commits(tree,sha,old_tips(tree,RECORD_TAG))) and not legacy_rollback:
        raise GateError('旧历史候选不属于已登记新构建；仅明确批准的历史回退可使用旧SHA')
    if data is None:
        if not legacy_rollback:
            raise GateError('旧历史 SHA 不属新构建；仅已验收历史回退可显式 --legacy-rollback')
        print('FEDERAL_GIT_RELEASE_LEGACY_ROLLBACK_REQUIRES_BUILD_EVIDENCE', sha)
        return
    if legacy_rollback and sha != git(tree, 'rev-parse', 'HEAD'):
        raise GateError('新法后回退候选须在独立干净工作树检出')
    if data['结果'] != 'PASS' or data['发布'] != 'REQUIRED':
        raise GateError('发布候选必须 PASS / REQUIRED')
    if record_enabled(tree) and sha in set(new_commits(tree,sha,old_tips(tree,RECORD_TAG))):
        msg=git(tree,'show','-s','--format=%B',sha)
        start=commit_record(tree,data,msg,commit=sha,require_open=True)
        if start['branch']!=git(tree,'symbolic-ref','HEAD'):raise GateError('发布候选分支与START不符')
        notes_remote(tree)
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
    return report_records(root) if record_enabled(main) else 0

def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=root_default())
    sub=p.add_subparsers(dest='cmd',required=True)
    a=sub.add_parser('commit-msg');a.add_argument('message',type=Path)
    sub.add_parser('pre-push');sub.add_parser('install');sub.add_parser('status')
    a=sub.add_parser('check-release');a.add_argument('--tree',type=Path,required=True);a.add_argument('--commit',required=True);a.add_argument('--legacy-rollback',action='store_true')
    a=sub.add_parser('begin');a.add_argument('--tree',type=Path,required=True);a.add_argument('--wp',required=True);a.add_argument('--goal',required=True)
    a=sub.add_parser('check-start');a.add_argument('--tree',type=Path,required=True)
    a=sub.add_parser('run');a.add_argument('--tree',type=Path,required=True);a.add_argument('--phase',required=True);a.add_argument('command',nargs=argparse.REMAINDER)
    a=sub.add_parser('finish');a.add_argument('--tree',type=Path,required=True);a.add_argument('--result',choices=('PASS','FAIL','BLOCKED'),required=True);a.add_argument('--evidence',required=True);a.add_argument('--commit');a.add_argument('--remote-ref');a.add_argument('--url')
    sub.add_parser('audit');sub.add_parser('sync-records')
    args=p.parse_args(argv); root=args.root.resolve()
    try:
        if args.cmd=='install':install(root)
        elif args.cmd=='status':return 2 if status(root) else 0
        elif args.cmd=='check-release':check_release(args.tree,args.commit,legacy_rollback=args.legacy_rollback)
        elif args.cmd=='begin':begin(args.tree.resolve(),args.wp,args.goal)
        elif args.cmd=='check-start':check_start(args.tree.resolve())
        elif args.cmd=='run':return run_registered(args.tree.resolve(),args.phase,args.command)
        elif args.cmd=='finish':finish(args.tree.resolve(),root,args.result,args.evidence,args.commit,args.remote_ref,args.url)
        elif args.cmd=='audit':return 2 if audit_records(root) else 0
        elif args.cmd=='sync-records':
            with record_lock(root/'main'):sync_records(root/'main')
        elif args.cmd=='commit-msg':
            tree=Path.cwd();msg=args.message.read_text(encoding='utf-8')
            if record_enabled(tree):
                with record_lock(tree):
                    if observe_unregistered(tree):
                        raise GateError('未登记工作树已追记到本地Notes，请sync-records并核实后重新提交')
                    commit_record(tree,validate(msg,tree),msg,require_open=True)
            else:validate(msg,tree)
            print('FEDERAL_GIT_COMMIT_MSG_PASS')
        elif args.cmd=='pre-push':check_push(Path.cwd(),sys.stdin,root)
    except (GateError,OSError,ValueError,KeyError,subprocess.CalledProcessError) as exc:
        print('FEDERAL_GIT_GATE_FAIL:',exc,file=sys.stderr);return 2
    return 0

if __name__=='__main__':sys.exit(main())
