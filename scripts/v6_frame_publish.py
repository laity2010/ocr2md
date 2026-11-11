#!/usr/bin/env python3
"""Publish only the dataless frame to the existing unified Lab static gateway.

This is a standalone showcase, NOT a Main mirror-Lab promotion. No business
backend, DB, permissions or other Lab folder may be touched.
"""
import argparse
import datetime as dt
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess

ROOT=Path(__file__).resolve().parents[1]
NAME='lab-frame'
CARD='''      <article id="lab-frame"><div class="kind">06 · Frame Lab</div><h2>空白四窗框架</h2>
        <p>与 Main 一致的四窗布局、样式、版本标牌、全局状态栏与空白全局设置。无文档及 SQL 绑定，支持自动更新。</p>
        <a class="open" href="/labs/lab-frame/">进入 Lab Frame</a></article>
'''

def sha(data):return hashlib.sha256(data).hexdigest()
def fingerprints(folder):
    files={};total=0
    for p in sorted(folder.rglob('*')):
        if p.is_file():
            if p.is_symlink():raise RuntimeError('Symlink file forbidden in release')
            data=p.read_bytes();files[p.relative_to(folder).as_posix()]=sha(data);total+=len(data)
    return files,total

def publish(release):
    source=ROOT/'labs'/NAME/'dist'
    if not source.is_dir():raise RuntimeError('Build lab-frame first')
    commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    if subprocess.check_output(['git','status','--porcelain'],cwd=ROOT,text=True).strip():
        raise RuntimeError('Uncommitted source: commit before build and release')
    version=json.loads((source/'release-version.json').read_text())
    if version.get('commit')!=commit or version.get('name')!=NAME:
        raise RuntimeError('Build source SHA does not match committed frame')
    if not release.is_dir() or release.is_symlink():raise RuntimeError('Missing trusted release root')
    lock=release/'.lab-unified-publish.lock'
    with lock.open('a+b') as file:
      fcntl.flock(file.fileno(),fcntl.LOCK_EX)
      manifestPath=release/'release-manifest.json'
      manifest=json.loads(manifestPath.read_text())
      if manifest.get('schema')!='ocr2md-lab-unified-release/v1':
          raise RuntimeError('Unexpected Lab gateway release schema')
      currentHome=(release/'index.html').read_bytes()
      if sha(currentHome)!=manifest['homeSha256']:
          raise RuntimeError('Lab home checksum mismatch; refuse overwrite')
      otherHashes={}
      for name,entry in manifest['modules'].items():
          if name==NAME:continue
          folder=release/name
          if folder.is_symlink():raise RuntimeError('Symlink module forbidden: '+name)
          files,_=fingerprints(folder)
          if files!=entry['files']:raise RuntimeError('Existing Lab module changed: '+name)
          otherHashes[name]=files
      html=currentHome.decode('utf-8')
      if f'id="{NAME}"' not in html:
          if '</section>' not in html:raise RuntimeError('Home cards closing tag missing')
          html=html.replace('    </section>',CARD+'    </section>',1)
      homeBytes=html.encode('utf-8')
      files,total=fingerprints(source)
      manifest['modules'][NAME]={'name':NAME,'sourceCommit':commit,
        'version':version['version'],'assetCount':len(files),'bytes':total,'files':files}
      manifest['homeSha256']=sha(homeBytes)
      manifest['publishedAt']=dt.datetime.now(dt.timezone.utc).isoformat()
      manifest['releaseId']=sha(json.dumps({k:manifest[k] for k in ('schema','modules','homeSha256')},sort_keys=True,separators=(',',':'),ensure_ascii=False).encode())
      dest=release/NAME
      stage=release/(f'.{NAME}-stage-{os.getpid()}')
      retired=release/(f'.{NAME}-retired-{os.getpid()}')
      tmpHome=release/(f'.frame-home-{os.getpid()}')
      tmpManifest=release/(f'.frame-manifest-{os.getpid()}')
      if any(p.exists() for p in [stage,retired,tmpHome,tmpManifest]):
          raise RuntimeError('Existing staging file; refuse overwrite')
      if dest.is_symlink():raise RuntimeError('Refuse linked destination')
      swapped=False
      try:
          shutil.copytree(source,stage)
          if fingerprints(stage)[0]!=files:raise RuntimeError('Staging verification failed')
          tmpHome.write_bytes(homeBytes)
          tmpManifest.write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n')
          if dest.exists():os.rename(dest,retired);swapped=True
          os.rename(stage,dest)
          os.replace(tmpHome,release/'index.html')
          os.replace(tmpManifest,manifestPath)
      except BaseException:
          if not dest.exists() and swapped and retired.exists():os.rename(retired,dest)
          raise
      finally:
          if stage.exists():shutil.rmtree(stage)
          for temp in (tmpHome,tmpManifest):
              if temp.exists():temp.unlink()
      if retired.exists():shutil.rmtree(retired)
      for name,expected in otherHashes.items():
          if fingerprints(release/name)[0]!=expected:
              raise RuntimeError('Post-publication other Lab mismatch: '+name)
      print('LAB_FRAME_PUBLISHED',version['version'],commit,'files',len(files),
            'releaseId',manifest['releaseId'],'otherLabsPreserved',len(otherHashes))

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',type=Path,required=True)
    args=parser.parse_args()
    publish(args.release_root.resolve())
