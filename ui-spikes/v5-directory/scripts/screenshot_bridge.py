#!/usr/bin/env python3
"""Private screenshot-to-HTTPS bridge: no upload API, no directory listing.

The only trusted writer is a local CLI. A public link is a time-limited
bearer capability: anyone who possesses its unguessable URL may view it.
Never publish credentials, an authenticated page, or sensitive materials
without visually reviewing/redacting the screenshot first.
"""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import struct
import time

TOKEN_PATTERN=re.compile(r"[0-9a-f]{48}\Z")
PUBLIC_PATH=re.compile(r"/__v5/screenshots/([0-9a-f]{48})\.png\Z")
PNG_SIGNATURE=b"\x89PNG\r\n\x1a\n"
MAX_IMAGE_BYTES=12*1024*1024
MAX_LIFETIME=24*60*60


def inspect_png(raw: bytes):
    if len(raw)>MAX_IMAGE_BYTES or len(raw)<100 or not raw.startswith(PNG_SIGNATURE) or raw[12:16]!=b'IHDR':
        raise ValueError('SCREENSHOT_PNG_REQUIRED')
    width,height=struct.unpack('>II',raw[16:24])
    if not (100<=width<=16000 and 100<=height<=16000):
        raise ValueError('SCREENSHOT_DIMENSIONS_INVALID')
    return width,height


def _folder(folder: Path):
    if folder.is_symlink():raise ValueError('SCREENSHOT_ROOT_SYMLINK')
    folder.mkdir(parents=True,exist_ok=True,mode=0o700)
    os.chmod(folder,0o700)
    return folder


def publish(folder:Path, source:Path, *, label:str, lifetime:int=3600, now:int|None=None):
    """Local-only publish; caller must visually review/approve source first."""
    if not (60<=lifetime<=MAX_LIFETIME):raise ValueError('SCREENSHOT_LIFETIME_INVALID')
    if not label or len(label)>120:raise ValueError('SCREENSHOT_LABEL_INVALID')
    if source.is_symlink() or not source.is_file():raise ValueError('SCREENSHOT_SOURCE_NOT_REGULAR')
    if source.stat().st_size>MAX_IMAGE_BYTES:raise ValueError('SCREENSHOT_TOO_LARGE')
    raw=source.read_bytes();dims=inspect_png(raw)
    folder=_folder(folder)
    nonce=secrets.token_hex(24)
    ts=int(time.time()) if now is None else now
    metadata={'v':1,'id':nonce,'created':ts,'expires':ts+lifetime,'label':label,
              'sha256':hashlib.sha256(raw).hexdigest(),'bytes':len(raw),'pixels':list(dims)}
    dest=folder/(nonce+'.png');manifest=folder/(nonce+'.json')
    # A directory inside .runtime with mode 0700, no gateway file uploads.
    with dest.open('xb') as handle:
        os.chmod(dest,0o600);handle.write(raw)
    with manifest.open('x',encoding='utf8') as handle:
        os.chmod(manifest,0o600);json.dump(metadata,handle,ensure_ascii=False)
    return metadata


def retrieve(folder:Path, route:str, *, now:int|None=None):
    match=PUBLIC_PATH.fullmatch(route)
    if not match or folder.is_symlink():return None
    nonce=match.group(1);manifest=folder/(nonce+'.json');picture=folder/(nonce+'.png')
    if manifest.is_symlink() or picture.is_symlink():return None
    try:
        data=json.loads(manifest.read_text(encoding='utf8'))
        instant=int(time.time()) if now is None else now
        if data['v']!=1 or data['id']!=nonce or data['expires']<=instant or data['created']>instant+60:return None
        if data['expires']-data['created']>MAX_LIFETIME:return None
        if picture.stat().st_size!=data['bytes'] or data['bytes']>MAX_IMAGE_BYTES:return None
        raw=picture.read_bytes()
        if hashlib.sha256(raw).hexdigest()!=data['sha256']:return None
        inspect_png(raw)
        return raw
    except (OSError,ValueError,KeyError,TypeError,struct.error):
        return None
