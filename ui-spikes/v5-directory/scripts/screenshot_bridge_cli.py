#!/usr/bin/env python3
"""OCR2MD screenshot bridge. Two deliberately separate steps:

1. capture-ipad: capture the foreground Safari page from an already paired iPad.
2. publish: after visual review, share a selected PNG on the application's
   public domain with a random, expiring URL. No remote file uploads.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time

from screenshot_bridge import publish, MAX_LIFETIME

ROOT=Path(__file__).resolve().parents[3]
BRIDGE_ROOT=ROOT/'.runtime/ocr2md-screenshot-bridge'
EVIDENCE_ROOT=ROOT/'.runtime/ocr2md-build-evidence'
PUBLIC_URL='https://ocr2md.laity.bid/__v5/screenshots/'


def main():
    p=argparse.ArgumentParser(description=__doc__,formatter_class=argparse.RawDescriptionHelpFormatter)
    subs=p.add_subparsers(dest='cmd',required=True)
    capture=subs.add_parser('capture-ipad',help='capture currently opened iPad Safari page to PRIVATE directory')
    capture.add_argument('--url-contains',default='ocr2md.laity.bid/',help='unique Safari URL fragment')
    capture.add_argument('--attempts',type=int,default=1)
    capture.add_argument('--timeout',type=int,default=12)
    share=subs.add_parser('publish',help='publish REVIEWED local screenshot as expiring capability link')
    share.add_argument('source',type=Path)
    share.add_argument('--label',required=True)
    share.add_argument('--hours',type=float,default=1.0)
    share.add_argument('--reviewed',action='store_true',help='confirm image checked for passwords, tokens, private document content')
    args=p.parse_args()
    if args.cmd=='capture-ipad':
        if not ('ocr2md.laity.bid' in args.url_contains or '192.168.1.10' in args.url_contains):
            raise ValueError('IPAD_CAPTURE_MUST_TARGET_OCR2MD')
        if not 1<=args.attempts<=3 or not 2<=args.timeout<=30:raise ValueError('IPAD_CAPTURE_LIMITS_INVALID')
        source=BRIDGE_ROOT/'private'/('ipad-'+time.strftime('%Y%m%d-%H%M%S')+'.png')
        source.parent.mkdir(mode=0o700,parents=True,exist_ok=True)
        result=subprocess.run([sys.executable,str(ROOT/'scripts/ipad_safari_capture.py'),
                               '--url-contains',args.url_contains,'--output',str(source),
                               '--attempts',str(args.attempts),'--timeout',str(args.timeout)],
                              capture_output=True,text=True,timeout=5*args.timeout+30)
        if result.returncode:
            print('IPAD_SCREENSHOT_UNAVAILABLE: iPad must be paired and Safari Web Inspector enabled.',file=sys.stderr)
            print(result.stderr[-1800:],file=sys.stderr)
            return 1
        evidence=json.loads(result.stdout)
        os.chmod(source,0o600)
        print(json.dumps({'status':'PRIVATE_REVIEW_REQUIRED','capture':'physical-ipad-safari',
                          'local_png':str(source),'pixels':evidence.get('image_px'),
                          'sha256':evidence.get('sha256')},ensure_ascii=False))
        return 0
    if not args.reviewed:
        print('PUBLIC_SHARE_REQUIRES_VISUAL_REVIEW: use --reviewed only after checking screenshot',file=sys.stderr)
        return 2
    source=args.source.resolve(strict=True)
    approved=(EVIDENCE_ROOT.resolve(),(BRIDGE_ROOT/'private').resolve())
    if not any(source.is_relative_to(parent) for parent in approved):
        print('SCREENSHOT_SOURCE_OUTSIDE_PRIVATE_EVIDENCE_ROOT',file=sys.stderr)
        return 2
    if args.source.is_symlink():return 2
    seconds=round(args.hours*3600)
    if not 60<=seconds<=MAX_LIFETIME:return 2
    metadata=publish(BRIDGE_ROOT/'shared',source,label=args.label,lifetime=seconds)
    url=PUBLIC_URL+metadata['id']+'.png'
    print(json.dumps({'status':'SHARED_WITH_EXPIRY','url':url,'expires':metadata['expires'],
                     'sha256':metadata['sha256'],'bytes':metadata['bytes'],
                     'pixels':metadata['pixels'],'label':metadata['label']},ensure_ascii=False))
    return 0


if __name__=='__main__':raise SystemExit(main())
