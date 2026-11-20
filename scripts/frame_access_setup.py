#!/usr/bin/env python3
"""Provision a private Frame-only access code and explicit allowed roots (no Main)."""
from __future__ import annotations
import argparse
import json
import os
from pathlib import Path
import secrets
import stat
import sys
from frame_access import CONFIG, settings

parser=argparse.ArgumentParser(description=__doc__)
parser.add_argument('--root',action='append',default=[],help='Explicit existing approved directory (repeatable)')
parser.add_argument('--show-code',action='store_true',help='Print private access code for the Mac owner')
parser.add_argument('--add-root',help='Allow an additional existing directory without rotating the access code')
args=parser.parse_args()
if args.show_code:
    doc,_=settings()
    print(doc['code'])
    raise SystemExit
if args.add_root:
    doc,roots=settings()
    candidate=Path(args.add_root).expanduser()
    if candidate.is_symlink() or not candidate.is_dir():
        raise SystemExit('Expected a real existing directory')
    new=str(candidate.resolve(strict=True))
    if new in doc['allowedRoots']:
        print('Already allowed; no change made.')
        raise SystemExit
    doc['allowedRoots'].append(new)
    tmp=CONFIG.with_name(CONFIG.name+'.new-'+secrets.token_hex(6))
    fd=os.open(tmp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
    try:
        with os.fdopen(fd,'w',encoding='utf8') as f:
            json.dump(doc,f,ensure_ascii=False,indent=2)
            f.write('\n');f.flush();os.fsync(f.fileno())
        os.replace(tmp,CONFIG)
    finally:
        try:tmp.unlink()
        except FileNotFoundError:pass
    print('Frame root added, code unchanged. Refresh the browser directory list.')
    raise SystemExit
if CONFIG.exists():
    print('Frame access already provisioned; not overwriting secret or roots.')
    raise SystemExit
roots=args.root or [str(Path.home()/p) for p in ('Documents','Library/CloudStorage','Downloads')]
allowed=[]
for raw in roots:
    p=Path(raw).expanduser()
    if p.is_symlink() or not p.is_dir():
        raise SystemExit('Expected a real existing directory: '+str(p))
    resolved=str(p.resolve(strict=True))
    if resolved not in allowed:allowed.append(resolved)
if not allowed:raise SystemExit('At least one allowed root is required')
CONFIG.parent.mkdir(parents=True,exist_ok=True)
fd=os.open(CONFIG,os.O_WRONLY|os.O_CREAT|os.O_EXCL|getattr(os,'O_NOFOLLOW',0),0o600)
try:
    doc={'schema':'ocr2md-frame-access/v1','code':secrets.token_hex(8).upper(),
         'secret':secrets.token_hex(32),'allowedRoots':allowed}
    with os.fdopen(fd,'w',encoding='utf8') as f:
        json.dump(doc,f,ensure_ascii=False,indent=2)
        f.write('\n');f.flush();os.fsync(f.fileno())
except BaseException:
    try:os.unlink(CONFIG)
    except FileNotFoundError:pass
    raise
print(f'Frame independent access configured: {len(allowed)} allowed roots; private file permissions 0600.')
print('On the Mac, run: python3 scripts/frame_access_setup.py --show-code')
