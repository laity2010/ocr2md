#!/usr/bin/env python3
"""AEL retrospective findings self-test. Only writes to temporary fixture."""
import json
import shutil
import sqlite3
import subprocess
import tempfile
from pathlib import Path

origin=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='ael-migration-review-') as tmp:
 root=Path(tmp); v5=root/'v5-directory'; v4=root/'v4-directory'
 for rel in ['scripts/ael.py','scripts/ael_findings.py','index.html','app.js',
             'plugins/settings/settings.schema.json','plugins/settings/settings.js',
             'vendor/shared-settings/v1/releases/0.1.17/settings-panel.js']:
  dst=v5/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(origin/rel,dst)
 for rel in ['index.html','plugins/settings/settings.schema.json']:
  dst=v4/rel;dst.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(origin.parent/'v4-directory'/rel,dst)
 # Recreate first two completed migration records only in disposable DB.
 script=v5/'scripts/ael.py'
 def cmd(*args,expected=0):
  p=subprocess.run(['python3',str(script),*args],cwd=v5,encoding='utf8',capture_output=True)
  assert p.returncode==expected,(args,p.stdout,p.stderr)
  return p.stdout
 cmd('init')
 db=v5/'.runtime/ael.sqlite'
 with sqlite3.connect(db) as c:
  for task_id in (2,7):
   c.execute('INSERT INTO changes(id,task,module,category,status,started,ended,result,elapsed_seconds,changed_files,warnings,tests) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)',
            (task_id,f'Original historical task {task_id}','settings' if task_id==2 else 'shell',
             'migration','finished','2026-10-16','2026-10-16','passed',0,'[]','[]','[]'))
  previous=c.execute('SELECT id,task,module,status,result FROM changes ORDER BY id').fetchall()
 # no rows invented, original immutable
 findings=v5/'scripts/ael_findings.py'
 def sub(*args):
  p=subprocess.run(['python3',str(findings),*args,'--root',str(v5),'--db',str(db)],capture_output=True,text=True)
  assert p.returncode==0,(p.stdout,p.stderr)
  return p.stdout
 assert 'SEEDED 3' in sub('seed')
 assert 'SEEDED 0' in sub('seed')
 r=cmd('review')
 assert r.count(' FINDING ')==3,r
 for key in ('V5-MIG-UI-001','V5-MIG-SET-002','V5-MIG-SET-003'):assert key in r
 # These older probe expectations were for the V4-inheritance candidate.
 # Current V5 has six Settings entries, uses label presentation explicitly,
 # and still requires a real V4-vs-V5 review before resolving the finding.
 assert 'CONFIG_NOT_IN_SCHEMA_VERIFY_RUNTIME' in r
 assert 'RUNTIME_V4_V5_COMPARISON_REQUIRED' in r
 assert 'DEVIATION_REQUIRES_REVIEW' in r
 assert 'AEL_MIGRATION_FINDINGS_OPEN 3' in cmd('check')
 assert 'AEL_MIGRATION_FINDINGS_OPEN 3' in cmd('report')
 cmd('review')
 with sqlite3.connect(db) as c:
  assert c.execute('SELECT count(*) FROM migration_findings').fetchone()[0]==3
  assert c.execute('SELECT count(*) FROM migration_reviews').fetchone()[0]==6
  assert c.execute('SELECT id,task,module,status,result FROM changes ORDER BY id').fetchall()==previous
  assert c.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
 print('AEL_RETROSPECTIVE_MIGRATION_REVIEW_PASS',json.dumps({
  'recordedFindings':3,'sourceTasks':[2,7],'twoAuditRuns':6,
  'originalHistoryUnchanged':True,'checkAndReportAdvisoryOnly':True,
  'sourceFilesUntouched':True,'fixtureOnly':True}))
