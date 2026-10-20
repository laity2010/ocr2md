#!/usr/bin/env python3
"""Install exactly two fixed release slots and atomically select one."""
from pathlib import Path
import os
import shutil
import subprocess
import sys
import json
import time
ROOT = Path(__file__).resolve().parents[1]
STATE = ROOT / '.v6'
SLOTS = STATE / 'slots'
CURRENT = STATE / 'current'

def activate(slot):
    target = SLOTS / slot
    if slot not in ('A','B') or not target.is_dir():
        raise RuntimeError('Unknown/missing release slot')
    tmp = STATE / ('.next-current-' + str(os.getpid()))
    tmp.symlink_to(Path('slots') / slot)
    os.replace(tmp, CURRENT)
    print('V6_ACTIVE_RELEASE',slot)

if len(sys.argv)==2 and sys.argv[1] in ('A','B'):
    activate(sys.argv[1]);sys.exit(0)
if len(sys.argv)!=1:
    raise SystemExit('Usage: python3 scripts/v6_publish.py [A|B]')
source=ROOT/'dist'
if not (source/'index.html').is_file():
    raise RuntimeError('Missing V6 dist/index.html; build first')
SLOTS.mkdir(parents=True,exist_ok=True)
active=CURRENT.resolve().name if CURRENT.is_symlink() else ''
slot='B' if active=='A' else 'A'
target=SLOTS/slot
staging=SLOTS/(slot+'.incoming')
if staging.exists():
    raise RuntimeError('Unexpected staging data; refusing overwrite')
shutil.copytree(source,staging)
commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
(staging/'release.json').write_text(json.dumps({'commit':commit,'time':int(time.time()),'slot':slot})+'\n')
if target.exists():
    # Replace only the inactive slot after a complete successful copy.
    shutil.rmtree(target)
os.replace(staging,target)
activate(slot)
print('V6_RELEASE_COMMIT',commit)
