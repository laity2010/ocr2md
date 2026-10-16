#!/usr/bin/env python3
"""WP0 V5 AEL test, entirely within an OS temp fixture; tests module owner isolation."""
import json
import shutil
import subprocess
import tempfile
from pathlib import Path

source=Path(__file__).resolve().parents[1]/'scripts/ael.py'
with tempfile.TemporaryDirectory(prefix='v5-wp0-ael-') as temp:
    root=Path(temp)
    (root/'scripts').mkdir()
    (root/'plugins/workspace').mkdir(parents=True)
    (root/'baseline').mkdir()
    (root/'baseline/v4-freeze.json').write_text(json.dumps({'pluginDescriptors':{'settings':{'id':'ocr2md:settings'}}}))
    shutil.copy2(source,root/'scripts/ael.py')
    script=root/'scripts/ael.py'
    def call(*args,expect=0):
        p=subprocess.run(['python3',str(script),*args],cwd=root,encoding='utf-8',capture_output=True)
        if p.returncode!=expect:
            raise AssertionError(f'{args}: expected {expect}, actual {p.returncode}; {p.stdout} {p.stderr}')
        return p.stdout
    call('init')
    call('check')
    call('begin','--module','settings','--category','migration','--task','isolated-settings')
    (root/'plugins/settings').mkdir()
    (root/'plugins/settings/ui.js').write_text('export const setting=1;\n')
    check=call('check')
    assert 'files=1' in check and 'BOUNDARY' not in check
    call('test','--name','settings-smoke','--','python3','-c','print("SMOKE_OK")')
    done=call('finish','--result','passed')
    assert 'boundary=0' in done and 'changedFiles=1' in done
    call('check')
    call('begin','--module','settings','--category','fix','--task','cross-owner-negative-case')
    (root/'plugins/workspace/grid.js').write_text('export const grid=1;\n')
    check=call('check')
    assert 'BOUNDARY plugins/workspace/grid.js' in check
    done=call('finish','--result','partial')
    assert 'boundary=1' in done
    report=call('report')
    assert 'AEL_V5_REPORT' in report and '\"tasks\": 2' in report
    print('V5_WP0_AEL_MODULE_ISOLATION_PASS',json.dumps({
        'settingsOwnFileBoundaryWarnings':0,
        'crossPluginNegativeBoundaryWarnings':1,
        'testExitCaptured':True,'separateRuntimeDb':True,'tempOnly':True
    }))
