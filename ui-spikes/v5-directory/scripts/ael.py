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
    return files

def owner(name):
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
        if args.action=='check':
            print('AEL_V5_CHECK','active='+str(active[3] if active else 'none'),'files='+str(len(changed)))
            for f in changed:print(' FILE',f)
            if active:
                for w in warnings(changed,active[3]):print(' WARNING',w)
            elif changed:raise SystemExit(2)
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
