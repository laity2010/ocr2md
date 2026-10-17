#!/usr/bin/env python3
"""V5-only AEL: per-module ownership, repeatable tests, compatibility with MOPJO metric names.

Persistent ledger is private to V5; this CLI NEVER alters V4's ledger or source.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[1]
DB = ROOT / '.runtime' / 'ael.sqlite'
EXCLUDED_DIRS = {'vendor', 'node_modules', 'dist', '.runtime', '__pycache__', 'test-results', '.git'}
EXTENSIONS = {'.js', '.mjs', '.ts', '.tsx', '.py', '.json', '.html', '.css', '.md', '.sh', '.yml', '.yaml'}

def timestamp():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')

def snapshot():
    files = {}
    for parent, dirs, names in os.walk(ROOT):
        dirs[:] = [d for d in dirs if d not in EXCLUDED_DIRS and not d.startswith('.')]
        for name in names:
            path = Path(parent)/name
            if path.is_symlink() or path.suffix not in EXTENSIONS or path.stat().st_size > 3_000_000:
                continue
            files[path.relative_to(ROOT).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    # Shared Settings authoritative source is in its OWN repository. Track the
    # exact source bytes, not the generated V5 mirror, so business tasks may
    # not silently change it outside this ledger's ownership boundary.
    shared = ROOT.parents[2] / 'agent-link-monitor/shared-settings'
    for path in [shared/'package.json',*(shared/'src').glob('*.js')]:
        if path.is_file() and not path.is_symlink():
            files['@shared-settings/' + path.relative_to(shared).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
    return files

def settings_owner_violations(changed, baseline, module):
    if module == 'settings':return []
    issues = []
    for p in changed:
        if p.startswith('plugins/settings/'):
            issues.append(p)
        elif p.startswith('@shared-settings/'):
            # Existing ledgers predate external provenance. One tooling-only
            # adoption permits recording these initial hashes without treating
            # source discovery as an actual edit.
            if module == 'tooling' and p not in baseline:continue
            issues.append(p)
    return issues

def owner(name):
    if name.startswith('@shared-settings/'):return 'settings'
    parts = name.split('/')
    if parts[0] == 'plugins' and len(parts) >= 3:
        return parts[1]
    if parts[0] in ('scripts', 'tests', 'baseline') or name in ('.gitignore', 'README.md', 'INHERITANCE_CONTRACT.md'):
        return 'tooling'
    return 'shell'

def warnings(paths, module):
    external = sorted(p for p in paths if owner(p) not in (module, 'tooling' if module == 'tooling' else module))
    problems = [f'BOUNDARY {p} owner={owner(p)}' for p in external]
    production = len([p for p in paths if p.startswith('plugins/') or owner(p) == 'shell'])
    if production > 3:
        problems.append(f'SPREAD {production} production files (review deliberate migrations separately)')
    return problems

# Explicit reconciliation of previously shipped but unrecorded work.
# The initial checkpoint remains recoverable from each append-only event and
# the pre-reconciliation SQLite backup. Never use this for an active task.
def digest(value):
    return hashlib.sha256(json.dumps(value,ensure_ascii=False,sort_keys=True,
               separators=(',',':')).encode('utf-8')).hexdigest()

def drift(previous,current):
    return [{'path':k,'before':previous.get(k),'after':current.get(k),
             'owner':owner(k)} for k in sorted(previous.keys()|current.keys())
             if previous.get(k)!=current.get(k)]

def published_proof():
    release_dir=ROOT.parents[1]/'.runtime/ocr2md-public'
    release_file=release_dir/'release-info.json'
    if not release_file.is_file():return None,release_dir
    info=json.loads(release_file.read_text())
    return {'buildId':info.get('buildId'),'digest':info.get('digest')},release_dir

def reconciliation_plan(previous,current,reason,evidence):
    if len(reason.strip())<16 or len(evidence.strip())<16:
        raise ValueError('AEL_RECONCILE_REASON_AND_EVIDENCE_REQUIRED')
    rows=drift(previous,current)
    if not rows:raise ValueError('AEL_RECONCILE_NO_DRIFT')
    release,release_dir=published_proof()
    for row in rows:
        path=row['path']
        if path.startswith('@shared-settings/'):
            row['provenance']='external-settings-source'
        else:
            released=release_dir/path
            if released.is_file() and row['after'] is not None:
                released_sha=hashlib.sha256(released.read_bytes()).hexdigest()
                row['provenance']='published-exact' if released_sha==row['after'] else 'published-different'
            else:
                row['provenance']='development-only'
    plan={'schema':1,'createdAt':timestamp(),'reason':reason.strip(),
          'evidence':evidence.strip(),'fromDigest':digest(previous),
          'toDigest':digest(current),'release':release,'changes':rows}
    plan['planDigest']=digest(plan)
    return plan

def apply_reconciliation(c,plan_path,confirmation):
    if c.execute("SELECT 1 FROM changes WHERE status='active' LIMIT 1").fetchone():
        raise ValueError('AEL_RECONCILE_ACTIVE_TASK_FORBIDDEN')
    plan=json.loads(Path(plan_path).read_text())
    checksum=plan.pop('planDigest',None)
    if not checksum or digest(plan)!=checksum or confirmation!=checksum:
        raise ValueError('AEL_RECONCILE_PLAN_CONFIRMATION_MISMATCH')
    if plan.get('schema')!=1 or len(plan.get('reason',''))<16 or len(plan.get('evidence',''))<16:
        raise ValueError('AEL_RECONCILE_INVALID_PLAN')
    baseline=json.loads(c.execute('SELECT baseline FROM changes WHERE id=0').fetchone()[0])
    current=snapshot()
    if plan['fromDigest']!=digest(baseline) or plan['toDigest']!=digest(current):
        raise ValueError('AEL_RECONCILE_STALE_SNAPSHOT')
    release,_=published_proof()
    if release!=plan.get('release'):
        raise ValueError('AEL_RECONCILE_RELEASE_CHANGED')
    expected=reconciliation_plan(baseline,current,plan['reason'],plan['evidence'])
    expected['createdAt']=plan['createdAt']
    expected['planDigest']=digest({k:v for k,v in expected.items() if k!='planDigest'})
    if expected!=dict(plan,planDigest=checksum):
        raise ValueError('AEL_RECONCILE_PROVENANCE_CHANGED')
    backup_dir=DB.parent/'ael-backups'
    backup_dir.mkdir(parents=True,exist_ok=True)
    backup_name='before-reconcile-'+checksum[:16]+'.sqlite'
    backup_path=backup_dir/backup_name
    if backup_path.exists():raise ValueError('AEL_RECONCILE_BACKUP_EXISTS')
    with sqlite3.connect(backup_path) as b:c.backup(b)
    c.execute('''CREATE TABLE IF NOT EXISTS historical_reconciliations(
        id INTEGER PRIMARY KEY AUTOINCREMENT,created_at TEXT NOT NULL,
        reason TEXT NOT NULL,evidence TEXT NOT NULL,plan_digest TEXT NOT NULL UNIQUE,
        before_digest TEXT NOT NULL,after_digest TEXT NOT NULL,
        release_proof TEXT,changes_json TEXT NOT NULL,backup_name TEXT NOT NULL)''')
    c.execute('''INSERT INTO historical_reconciliations(
        created_at,reason,evidence,plan_digest,before_digest,after_digest,
        release_proof,changes_json,backup_name) VALUES(?,?,?,?,?,?,?,?,?)''',
        (timestamp(),plan['reason'],plan['evidence'],checksum,plan['fromDigest'],
         plan['toDigest'],json.dumps(plan['release'],sort_keys=True),
         json.dumps(plan['changes'],ensure_ascii=False,sort_keys=True),backup_name))
    c.execute('UPDATE changes SET baseline=? WHERE id=0',(json.dumps(current,sort_keys=True),))
    print('AEL_V5_HISTORICAL_RECONCILED',
          'files='+str(len(plan['changes'])),'plan='+checksum,
          'backup='+str(backup_path),'openFindingsUnchanged=true')

def print_reconciliation_summary(c):
    try:
        row=c.execute('SELECT COUNT(*),MAX(id) FROM historical_reconciliations').fetchone()
    except sqlite3.OperationalError:return
    if row[0]:
        last=c.execute('SELECT created_at,plan_digest FROM historical_reconciliations WHERE id=?',
                       (row[1],)).fetchone()
        print('AEL_V5_HISTORICAL_ARCHIVE','events='+str(row[0]),
              'last='+last[0],'digest='+last[1][:16],flush=True)

def show_findings(c):
    # Compatible with old isolated test fixtures which intentionally copy only
    # ael.py. In the full V5 tree the advisory module is always present.
    try:
        from ael_findings import print_open_summary
    except ModuleNotFoundError as error:
        if error.name != 'ael_findings':
            raise
        return
    print_open_summary(c)
    try:
        from ael_ownership import show
    except ModuleNotFoundError as error:
        if error.name!='ael_ownership':raise
    else:show(c)

def connection():
    DB.parent.mkdir(parents=True, exist_ok=True)
    c = sqlite3.connect(DB)
    c.execute('''CREATE TABLE IF NOT EXISTS changes
      (id INTEGER PRIMARY KEY, task TEXT, module TEXT, category TEXT, status TEXT,
      started TEXT, ended TEXT, start_epoch REAL, elapsed_seconds REAL,
      baseline TEXT, changed_files TEXT, warnings TEXT, tests TEXT, result TEXT)''')
    return c

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    sub=parser.add_subparsers(dest='action',required=True)
    sub.add_parser('init')
    sub.add_parser('check')
    sub.add_parser('report')
    sub.add_parser('review')
    plan=sub.add_parser('reconcile-plan')
    plan.add_argument('--out',required=True)
    plan.add_argument('--reason',required=True)
    plan.add_argument('--evidence',required=True)
    apply=sub.add_parser('reconcile-apply')
    apply.add_argument('--plan',required=True)
    apply.add_argument('--confirm',required=True)
    beg=sub.add_parser('begin')
    beg.add_argument('--module',required=True)
    beg.add_argument('--category',required=True,choices=('inheritance','feature','fix','migration','refactor','tooling'))
    beg.add_argument('--task',required=True)
    test=sub.add_parser('test')
    test.add_argument('--name',required=True)
    test.add_argument('command',nargs=argparse.REMAINDER)
    finish=sub.add_parser('finish')
    finish.add_argument('--result',required=True,choices=('passed','partial','blocked'))
    args=parser.parse_args()

    with connection() as c:
        checkpoint=c.execute('SELECT baseline FROM changes WHERE id=0').fetchone()
        active=c.execute("SELECT id,baseline,task,module FROM changes WHERE status='active' LIMIT 1").fetchone()
        if args.action=='init':
            if checkpoint: raise ValueError('AEL already initialized; do not overwrite')
            c.execute('INSERT INTO changes(id,task,module,category,status,started,start_epoch,elapsed_seconds,baseline,changed_files,warnings,tests,result) VALUES (0,?,?,?,?,?,?,?,?,?,?,?,?)',
                      ('WP0 pre-scaffold','tooling','inheritance','checkpoint',timestamp(),0,0,json.dumps(snapshot(),sort_keys=True),'[]','[]','[]','checkpoint'))
            print('AEL_V5_INITIALIZED',len(snapshot()),'files')
            return
        if checkpoint is None:raise ValueError('AEL init required')
        previous=json.loads(active[1] if active else checkpoint[0])
        now=snapshot()
        changed=sorted(k for k in previous.keys()|now.keys() if previous.get(k)!=now.get(k))
        if args.action=='reconcile-plan':
            if active:raise ValueError('AEL_RECONCILE_ACTIVE_TASK_FORBIDDEN')
            plan=reconciliation_plan(previous,now,args.reason,args.evidence)
            out=Path(args.out)
            out.parent.mkdir(parents=True,exist_ok=True)
            if out.exists():raise ValueError('AEL_RECONCILE_PLAN_EXISTS')
            out.write_text(json.dumps(plan,ensure_ascii=False,indent=2,sort_keys=True)+'\n')
            print('AEL_V5_RECONCILE_PLAN','files='+str(len(plan['changes'])),
                  'digest='+plan['planDigest'],'path='+str(out))
            return
        if args.action=='reconcile-apply':
            apply_reconciliation(c,args.plan,args.confirm)
            return
        if args.action=='check':
            print('AEL_V5_CHECK','active='+str(active[3] if active else 'none'),'files='+str(len(changed)))
            for f in changed:print(' FILE',f)
            if active:
                for w in warnings(changed,active[3]):print(' WARNING',w)
            elif changed:raise SystemExit(2)
            print_reconciliation_summary(c)
            show_findings(c)
            return
        if args.action=='review':
            from ael_findings import review
            review(c, ROOT, record=True)
            try:
                from ael_ownership import review as architecture_review
            except ModuleNotFoundError as error:
                if error.name!='ael_ownership':raise
            else:architecture_review(c, ROOT, record=True)
            return
        if args.action=='report':
            rows=c.execute("SELECT task,module,category,elapsed_seconds,changed_files,warnings,tests,result FROM changes WHERE status='finished' ORDER BY id").fetchall()
            print('AEL_V5_REPORT',json.dumps({'tasks':len(rows),'elapsedSeconds':round(sum(row[3] for row in rows),2)}))
            for task,module,category,elapsed,files,warn,tests,result in rows:
                print(' TASK',json.dumps({'task':task,'module':module,'category':category,'result':result,
                    'elapsedSeconds':elapsed,'changedFiles':len(json.loads(files)),
                    'boundaryWarnings':sum(x.startswith('BOUNDARY') for x in json.loads(warn)),
                    'spreadWarnings':sum(x.startswith('SPREAD') for x in json.loads(warn)),
                    'tests':json.loads(tests)},ensure_ascii=False))
            print_reconciliation_summary(c)
            show_findings(c)
            return
        if args.action=='begin':
            if active or changed:raise ValueError('AEL active or unrecorded change; no silent rebaseline')
            if args.module not in ('tooling','shell') and not (ROOT/'plugins'/args.module).is_dir():
                # WP1+ must begin AEL *before* the new plugin directory contains any code.
                # Only a frozen V4 business module in an explicit migration may do this.
                frozen=json.loads((ROOT/'baseline/v4-freeze.json').read_text())
                allowed=frozen['pluginDescriptors'].keys()
                if args.category!='migration' or args.module not in allowed:
                    raise ValueError('Unknown V5 module; require known frozen V4 owner and migration category')
            c.execute('''INSERT INTO changes(task,module,category,status,started,start_epoch,baseline,changed_files,warnings,tests,result)
                VALUES(?,?,?,?,?,?,?,?,?,?,?)''',(args.task,args.module,args.category,'active',timestamp(),time.time(),
                  json.dumps(previous,sort_keys=True),'[]','[]','[]','-'))
            print('AEL_V5_BEGIN',args.module,args.category,args.task)
            return
        if not active:raise ValueError('AEL begin required')
        if args.action=='test':
            cmd=args.command[1:] if args.command and args.command[0]=='--' else args.command
            if not cmd:raise ValueError('Missing test command')
            t=time.monotonic()
            code=subprocess.run(cmd,cwd=ROOT).returncode
            elapsed=round(time.monotonic()-t,2)
            previous_tests=json.loads(c.execute('SELECT tests FROM changes WHERE id=?',(active[0],)).fetchone()[0])
            previous_tests.append({'name':args.name,'exit':code,'seconds':elapsed})
            c.execute('UPDATE changes SET tests=? WHERE id=?',(json.dumps(previous_tests),active[0]))
            c.commit()
            print('AEL_V5_TEST',args.name,'exit='+str(code),'seconds='+str(elapsed),flush=True)
            raise SystemExit(code)
        if args.action=='finish':
            if args.result=='passed':
                violations=settings_owner_violations(changed,previous,active[3])
                if violations:
                    raise ValueError('AEL_SETTINGS_OWNERSHIP_BLOCKED: '+','.join(violations))
            test_history=json.loads(c.execute('SELECT tests FROM changes WHERE id=?',(active[0],)).fetchone()[0])
            latest={record['name']:record for record in test_history}
            if args.result=='passed' and (not latest or any(record['exit'] for record in latest.values())):
                raise ValueError('Passed requires all latest test names to pass; failures remain in audit history')
            issues=warnings(changed,active[3])
            started=c.execute('SELECT start_epoch FROM changes WHERE id=?',(active[0],)).fetchone()[0]
            seconds=round(time.time()-started,2)
            c.execute('''UPDATE changes SET status='finished',ended=?,elapsed_seconds=?,changed_files=?,warnings=?,result=? WHERE id=?''',
                (timestamp(),seconds,json.dumps(changed),json.dumps(issues),args.result,active[0]))
            c.execute('UPDATE changes SET baseline=? WHERE id=0',(json.dumps(now,sort_keys=True),))
            print('AEL_V5_FINISHED',args.result,'changedFiles='+str(len(changed)),'boundary='+str(sum(x.startswith('BOUNDARY') for x in issues)),
                'spread='+str(sum(x.startswith('SPREAD') for x in issues)),'seconds='+str(seconds))
            for issue in issues:print(' WARNING',issue)
            show_findings(c)

if __name__=='__main__':
    try:main()
    except (OSError,ValueError,sqlite3.Error) as e:
        print('AEL_V5_ERROR',str(e),file=sys.stderr)
        sys.exit(2)
