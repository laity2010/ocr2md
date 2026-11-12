#!/usr/bin/env python3
"""Publish lab-ocr via the existing checksummed unified Lab release gateway.

Reuse the frame publisher; retire only the obsolete OCR Review module and card.
No tunnel, database, or unrelated Lab may be changed.
"""
import argparse
import datetime as dt
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import v6_frame_publish as publisher

NAME='lab-ocr'
LEGACY='ocr-review'
CARD='''      <article id="lab-ocr"><div class="kind">07 · OCR Review Lab</div><h2>lab-ocr · OCR 审阅</h2>
        <p>从 MinerU JSON 生成原始块表与 Span 扁平表；SQLite 导航、CM6 状态、AG 分类定位及四窗框架已接入实验。</p>
        <a class="open" href="/labs/lab-ocr/">进入 lab-ocr</a></article>
'''

def retire_legacy(release):
    with (release/'.lab-unified-publish.lock').open('a+b') as lock:
        fcntl.flock(lock.fileno(),fcntl.LOCK_EX)
        manifest_path=release/'release-manifest.json'
        manifest=json.loads(manifest_path.read_text())
        if manifest.get('schema')!='ocr2md-lab-unified-release/v1':
            raise RuntimeError('Unknown unified Lab release schema')
        home_path=release/'index.html'
        old_home=home_path.read_bytes()
        if publisher.sha(old_home)!=manifest.get('homeSha256'):
            raise RuntimeError('Home checksum mismatch')
        for name,entry in manifest['modules'].items():
            folder=release/name
            if folder.is_symlink() or publisher.fingerprints(folder)[0]!=entry['files']:
                raise RuntimeError('Lab release mismatch: '+name)
        html=old_home.decode('utf-8')
        cards=[m for m in re.finditer(r'(?m)^[ \t]*<article\b.*?</article>[ \t]*(?:\n|$)',html,re.S)
               if 'href="/labs/'+LEGACY+'/"' in m.group(0)]
        if len(cards)>1:raise RuntimeError('Ambiguous obsolete OCR Review home cards')
        if cards:
            match=cards[0]
            html=html[:match.start()]+html[match.end():]
        if LEGACY not in manifest['modules'] and not cards:
            return
        if LEGACY not in manifest['modules'] or not cards:
            raise RuntimeError('Obsolete Lab card and manifest are out of sync')
        del manifest['modules'][LEGACY]
        home_bytes=html.encode('utf-8')
        manifest['homeSha256']=publisher.sha(home_bytes)
        manifest['publishedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
        manifest['releaseId']=publisher.sha(json.dumps(
            {k:manifest[k] for k in ('schema','modules','homeSha256')},
            sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
        temp_home=release/(f'.lab-ocr-home-{os.getpid()}')
        temp_manifest=release/(f'.lab-ocr-manifest-{os.getpid()}')
        try:
            if temp_home.exists() or temp_manifest.exists():
                raise RuntimeError('Existing staging files')
            temp_home.write_bytes(home_bytes)
            temp_manifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
            os.replace(temp_home,home_path)
            os.replace(temp_manifest,manifest_path)
        finally:
            temp_home.unlink(missing_ok=True)
            temp_manifest.unlink(missing_ok=True)
        legacy_folder=release/LEGACY
        if legacy_folder.is_symlink():raise RuntimeError('Refuse obsolete release symlink')
        if legacy_folder.exists():shutil.rmtree(legacy_folder)
        print('LAB_OCR_LEGACY_RETIRED',LEGACY,manifest['releaseId'])

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',type=Path,required=True)
    release=parser.parse_args().release_root.resolve()
    publisher.NAME=NAME
    publisher.CARD=CARD
    publisher.publish(release)
    retire_legacy(release)

if __name__=='__main__':main()
