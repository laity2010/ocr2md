#!/usr/bin/env python3
"""MOPJO-only architecture ledger: reproducible scope, churn, build timing and boundaries.
Never reads/writes the V4 AEL or any OCR2MD source outside this package.
"""
import argparse
import hashlib
import json
import sqlite3
import subprocess
import time
from datetime import datetime,timezone
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/'.runtime'/'ael.sqlite'
EXT={'.ts','.tsx','.js','.mjs','.json','.py','.sh','.md'}
SKIP={'node_modules','dist','.runtime','__pycache__','.git'}
def stamp():return datetime.now(timezone.utc).isoformat(timespec='seconds')
def digest(path):return hashlib.sha256(path.read_bytes()).hexdigest()
def snapshot():
    result={}
    for p in sorted(ROOT.rglob('*')):
        if not p.is_file() or p.is_symlink() or any(x in SKIP for x in p.relative_to(ROOT).parts):continue
        if p.suffix in EXT and p.name!='WP06_BASELINE.json':
            result[p.relative_to(ROOT).as_posix()]=digest(p)
    return result
def old_wp06():
    # The WP06.0 manifest predates any copies or rewired imports.
    current=snapshot()
    record=json.loads((ROOT/'WP06_BASELINE.json').read_text())
    for p,sha in record['sourceFiles'].items():current[p]=sha
    current['package.json']=record['packageJsonSha256']
    for name in record['importedSharedModules']:current.pop('src/ir/'+name+'.ts',None)
    for p in ['package-lock.json','scripts/ael.py','scripts/verify-isolation.mjs',
              'tests/run-isolated-wp6.sh','WP06_ARCHITECTURE.md']:current.pop(p,None)
    return current
def opening():
    DB.parent.mkdir(parents=True,exist_ok=True)
    conn=sqlite3.connect(DB)
    conn.execute('''CREATE TABLE IF NOT EXISTS changes
      (id INTEGER PRIMARY KEY, status TEXT, task TEXT, started TEXT, finished TEXT,
       seconds REAL, baseline TEXT, files TEXT, warnings TEXT, tests TEXT, result TEXT)''')
    return conn
def find_active(c):
    return c.execute("SELECT id,baseline,started FROM changes WHERE status='active'").fetchone()
def warning_list(paths):
    problems=[]
    for p in paths:
        if p.startswith('../') or p.startswith('/'):problems.append('BOUNDARY '+p)
    production=[p for p in paths if p.startswith('src/') or p=='package.json']
    if len(production)>8:problems.append('SPREAD '+str(len(production))+' production files (planned IR extraction; inspect)')
    return problems
def main():
    ap=argparse.ArgumentParser(description=__doc__)
    sp=ap.add_subparsers(dest='action',required=True)
    sp.add_parser('init');sp.add_parser('check');sp.add_parser('report')
    b=sp.add_parser('begin');b.add_argument('--task',required=True)
    e=sp.add_parser('test');e.add_argument('--name',required=True);e.add_argument('command',nargs=argparse.REMAINDER)
    f=sp.add_parser('finish');f.add_argument('--result',choices=['passed','partial','blocked'],required=True)
    a=ap.parse_args()
    with opening() as c:
        checkpoint=c.execute('SELECT baseline FROM changes WHERE id=0').fetchone()
        active=find_active(c)
        if a.action=='init':
            if checkpoint:raise RuntimeError('MOPJO_AEL_ALREADY_INITIALIZED')
            base=old_wp06()
            c.execute('INSERT INTO changes(id,status,task,baseline,files,warnings,tests,result) VALUES (0,?,?,?,?,?,?,?)',
                      ('checkpoint','WP06 frozen baseline',json.dumps(base,sort_keys=True),'[]','[]','[]','baseline'))
            print('MOPJO_AEL_INIT',len(base),'frozen pre-migration paths');return
        if not checkpoint:raise RuntimeError('MOPJO_AEL_REQUIRES_INIT')
        old=json.loads(active[1] if active else checkpoint[0]);cur=snapshot()
        changed=sorted(p for p in set(old)|set(cur) if old.get(p)!=cur.get(p))
        if a.action=='check':
            print('MOPJO_AEL_CHECK','active='+('yes' if active else 'no'),'changes='+str(len(changed)),'warnings='+str(len(warning_list(changed))))
            for s in warning_list(changed):print(' WARNING',s)
            for p in changed:print(' FILE',p)
            if not active and changed:raise SystemExit(2)
            return
        if a.action=='report':
            rows=c.execute("SELECT task,result,seconds,files,warnings,tests FROM changes WHERE status='finished' ORDER BY id").fetchall()
            print('MOPJO_AEL_REPORT', 'tasks='+str(len(rows)),'elapsed_seconds='+str(round(sum(row[2] for row in rows),1)))
            for task,result,elapsed,files,warnings,tests in rows:
                print(' TASK',task,'result='+result,'seconds='+str(round(elapsed,1)),'changed_files='+str(len(json.loads(files))),
                      'warnings='+str(len(json.loads(warnings))))
                for w in json.loads(warnings):print('  WARNING',w)
                for t in json.loads(tests):print('  TEST',t['name'],'exit='+str(t['exit']),'seconds='+str(t['seconds']))
            return
        if a.action=='begin':
            if active:raise RuntimeError('MOPJO_AEL_ALREADY_ACTIVE')
            # Initial WP06 is reconstructed from the explicitly frozen WP06_BASELINE.json,
            # including already migrated files; subsequent work requires a clean checkpoint.
            count=c.execute("SELECT COUNT(*) FROM changes WHERE id>0").fetchone()[0]
            if count>0 and changed:raise RuntimeError('MOPJO_AEL_UNRECORDED_CHANGES')
            c.execute("INSERT INTO changes(status,task,started,seconds,baseline,files,warnings,tests,result) VALUES(?,?,?,?,?,?,?,?,?)",
                      ('active',a.task,stamp(),time.time(),json.dumps(old),'[]','[]','[]','-'))
            print('MOPJO_AEL_BEGIN',a.task,'baseline_files='+str(len(old)));return
        if not active:raise RuntimeError('MOPJO_AEL_BEGIN_REQUIRED')
        if a.action=='test':
            cmd=a.command[1:] if a.command and a.command[0]=='--' else a.command
            if not cmd:raise RuntimeError('MOPJO_AEL_TEST_COMMAND_REQUIRED')
            t=time.monotonic();exit_code=subprocess.run(cmd,cwd=ROOT).returncode;duration=round(time.monotonic()-t,2)
            tests=json.loads(c.execute('SELECT tests FROM changes WHERE id=?',(active[0],)).fetchone()[0])
            tests.append({'name':a.name,'exit':exit_code,'seconds':duration})
            c.execute('UPDATE changes SET tests=? WHERE id=?',(json.dumps(tests),active[0]))
            print('MOPJO_AEL_TEST',a.name,'exit='+str(exit_code),'seconds='+str(duration))
            c.commit()  # Persist test evidence even when the child fails or SystemExit propagates.
            raise SystemExit(exit_code)
        if a.action=='finish':
            tests=json.loads(c.execute('SELECT tests FROM changes WHERE id=?',(active[0],)).fetchone()[0])
            if a.result=='passed' and (not tests or any(x['exit'] for x in tests)):
                raise RuntimeError('MOPJO_AEL_PASS_REQUIRES_TEST_EVIDENCE')
            warnings=warning_list(changed)
            seconds=round(time.time()-float(c.execute('SELECT seconds FROM changes WHERE id=?',(active[0],)).fetchone()[0]),1)
            c.execute('UPDATE changes SET status=?,finished=?,seconds=?,files=?,warnings=?,result=? WHERE id=?',
                      ('finished',stamp(),seconds,json.dumps(changed),json.dumps(warnings),a.result,active[0]))
            c.execute('UPDATE changes SET baseline=? WHERE id=0',(json.dumps(cur,sort_keys=True),))
            print('MOPJO_AEL_FINISHED',a.result,'files='+str(len(changed)),'warnings='+str(len(warnings)),'seconds='+str(seconds))
            for w in warnings:print(' WARNING',w)
            return

if __name__=='__main__':
    try:main()
    except RuntimeError as e:
        print('MOPJO_AEL_ERROR',e)
        raise SystemExit(2)
