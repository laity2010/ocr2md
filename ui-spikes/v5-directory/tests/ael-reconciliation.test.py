#!/usr/bin/env python3
"""V5 AEL explicit historical reconciliation: scratch fixtures only."""
from pathlib import Path
import hashlib
import json
import sqlite3
import shutil
import subprocess
import tempfile

src=Path(__file__).resolve().parents[1]/'scripts/ael.py'
with tempfile.TemporaryDirectory(prefix='ocr2md-v5-ael-reconcile-') as td:
    root=Path(td)
    (root/'scripts').mkdir()
    (root/'plugins/workspace').mkdir(parents=True)
    (root/'plugins/settings').mkdir(parents=True)
    (root/'baseline').mkdir()
    (root/'baseline/v4-freeze.json').write_text(json.dumps({'pluginDescriptors':{}}))
    shutil.copy2(src,root/'scripts/ael.py')
    script=root/'scripts/ael.py'
    plan=root/'.runtime/historical-plan.json'
    def call(*args,code=0):
        out=subprocess.run(['python3',str(script),*args],cwd=root,text=True,capture_output=True)
        assert out.returncode==code,(args,out.returncode,out.stdout,out.stderr)
        return out.stdout+out.stderr
    def snapshot_tasks():
        with sqlite3.connect(root/'.runtime/ael.sqlite') as c:
            return c.execute('SELECT id,task,module,status,result,baseline FROM changes WHERE id>0').fetchall()

    call('init')
    before_tasks=snapshot_tasks()
    # Out-of-band historical changes are correctly blocked.
    user_file=root/'plugins/workspace/ui.js'
    user_file.write_text('export const current=1;\n')
    assert 'files=1' in call('check',code=2)
    assert 'unrecorded change' in call('begin','--module','workspace','--category','fix',
                                       '--task','should block',code=2)
    call('reconcile-plan','--out',str(plan),'--reason','Prior reviewed historical work not yet recorded',
         '--evidence','Verified exact historic file hashes and test fixture')
    original=json.loads(plan.read_text())
    assert len(original['changes'])==1
    assert original['changes'][0]['owner']=='workspace'
    assert original['changes'][0]['provenance']=='development-only'
    digest=original['planDigest']
    # A forged plan is rejected even with the original digest.
    forged=root/'.runtime/forged.json'
    altered=json.loads(plan.read_text())
    altered['changes'][0]['owner']='shell'
    forged.write_text(json.dumps(altered))
    assert 'CONFIRMATION_MISMATCH' in call('reconcile-apply','--plan',str(forged),
                                             '--confirm',digest,code=2)
    assert 'CONFIRMATION_MISMATCH' in call('reconcile-apply','--plan',str(plan),
                                             '--confirm','invalid',code=2)
    user_file.write_text('export const current=2;\n')
    assert 'STALE_SNAPSHOT' in call('reconcile-apply','--plan',str(plan),'--confirm',digest,code=2)
    user_file.write_text('export const current=1;\n')
    assert 'files=1' in call('check',code=2)
    # Explicit approval, append-only event, recoverable backup, old history untouched.
    assert 'files=1' in call('reconcile-apply','--plan',str(plan),'--confirm',digest)
    assert 'files=0' in call('check')
    assert 'HISTORICAL_ARCHIVE' in call('report')
    assert before_tasks==snapshot_tasks()
    with sqlite3.connect(root/'.runtime/ael.sqlite') as c:
        row=c.execute('SELECT plan_digest,before_digest,after_digest,changes_json,backup_name '
                      'FROM historical_reconciliations').fetchone()
        assert row[0]==digest and len(json.loads(row[3]))==1
        backup=root/'.runtime/ael-backups'/row[4]
        assert backup.is_file()
        with sqlite3.connect(backup) as b:
            assert 'historical_reconciliations' not in [x[0] for x in b.execute(
                "select name from sqlite_master where type='table'")]
        count=c.execute('SELECT COUNT(*) FROM changes WHERE id>0').fetchone()[0]
        assert count==0
    # A brand new change remains blocked; approved work is not a monitoring bypass.
    user_file.write_text('export const current=3;\n')
    assert 'files=1' in call('check',code=2)
    assert 'unrecorded change' in call('begin','--module','workspace','--category','fix',
                                       '--task','should still block',code=2)
    user_file.write_text('export const current=1;\n')
    call('begin','--module','workspace','--category','fix','--task','new work')
    user_file.write_text('export const current=4;\n')
    assert 'files=1' in call('check')
    assert 'SMOKE_OK' in call('test','--name','smoke','--','python3','-c','print("SMOKE_OK")')
    assert 'boundary=0' in call('finish','--result','passed')
    assert 'files=0' in call('check')
    print('AEL_V5_RECONCILIATION_ISOLATION_PASS',
          json.dumps({'historicalArchive':True,'stalePlanRejected':True,
                      'tamperingRejected':True,'backupVerified':True,
                      'newChangesStillDetected':True,'beginTestFinish':True}))

