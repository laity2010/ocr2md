#!/usr/bin/env python3
"""Publish exactly ONE Lab static release root from validated, Git-backed builds.

This is a deployment operation; Lab API runtimes and their source worktrees
remain separate. The published static root has one release-manifest.json with
per-module build hashes, never pretending independent experiments share a SHA.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
from datetime import datetime, timezone

NAMES=('cm-html','sentence-benchmark','translation-lab')
SCHEMA='ocr2md-lab-unified-release/v1'
LIMIT=70*1024*1024


def hash_file(path):
    value=hashlib.sha256()
    with path.open('rb') as inp:
        for chunk in iter(lambda:inp.read(1024*1024),b''):
            value.update(chunk)
    return value.hexdigest()


def validate_source(name,path):
    path=Path(path)
    if name not in NAMES or path.is_symlink() or not path.is_dir() or \
       path.name!='dist' or path.parent.name!=name or path.parent.parent.name!='labs':
        raise ValueError(f'Invalid Lab release input: {name}')
    src=json.loads((path/'release-version.json').read_text(encoding='utf-8'))
    if src.get('mode')!='lab' or src.get('name')!=name or not re.fullmatch('[0-9a-f]{40}',src.get('baseCommit','')):
        raise ValueError(f'Incorrect Lab build/version identity: {name}')
    repo=path.parent.parent.parent
    if not (repo/'.git').exists():
        raise ValueError('Release input must come from a Git worktree')
    if subprocess.run(['git','cat-file','-e',src['baseCommit']+'^{commit}'],cwd=repo,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL).returncode!=0:
        raise ValueError(f'Unknown Git source commit for {name}')
    files={};size=0
    for f in sorted(path.rglob('*')):
        if f.is_symlink():raise ValueError('Refuse symlinked Lab asset')
        if not f.is_file():continue
        rel=f.relative_to(path)
        if any(part.startswith('.') for part in rel.parts):raise ValueError('Refuse hidden Lab artifact')
        if f.suffix.lower() not in {'.css','.dic','.html','.js','.json','.mjs','.svg','.ttf','.txt','.woff','.woff2','.png','.jpeg','.jpg','.webp','.gif','.wasm','.ico'}:
            raise ValueError('Unexpected Lab build asset extension: '+str(rel))
        size+=f.stat().st_size
        if size>LIMIT:raise ValueError('Lab build exceeds limit')
        files[str(rel)]=hash_file(f)
    if 'index.html' not in files or 'release-version.json' not in files:
        raise ValueError('Incomplete Lab build: '+name)
    if len(files)>1000:raise ValueError('Too many Lab assets')
    return {'name':name,'sourceCommit':src['baseCommit'],'version':src['version'],
            'assetCount':len(files),'bytes':size,'files':files}


def publish(output,sources,home,keep_backup=False):
    output=Path(output).absolute()
    if not output.is_absolute() or output.is_symlink() or len(sources)!=len(NAMES) or set(sources)!=set(NAMES):
        raise ValueError('Exactly three known Lab modules required')
    if not home.is_file() or home.is_symlink() or home.suffix!='.html':
        raise ValueError('Missing trusted shared Lab homepage')
    if output.parent.is_symlink() or not output.parent.is_dir():
        raise ValueError('Release parent missing/unsafe')
    validated={name:validate_source(name,path) for name,path in sources.items()}
    portal=home.read_bytes()
    common={'schema':SCHEMA,'modules':validated,'homeSha256':hashlib.sha256(portal).hexdigest()}
    release_id=hashlib.sha256(json.dumps(common,sort_keys=True,separators=(',',':'),ensure_ascii=False).encode('utf-8')).hexdigest()
    manifest={**common,'releaseId':release_id,'publishedAt':datetime.now(timezone.utc).isoformat()}
    stage=output.parent/('.'+output.name+'.stage-'+secrets.token_hex(5))
    previous=output.parent/('.'+output.name+'.old-'+secrets.token_hex(5))
    if previous.exists():raise ValueError('Unexpected preexisting rollback folder')
    stage.mkdir(mode=0o755)
    swapped=False
    try:
        (stage/'index.html').write_bytes(portal)
        for name,path in sources.items():
            shutil.copytree(path,stage/name,symlinks=False)
        (stage/'release-manifest.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf8')
        for name,meta in validated.items():
            for rel,digest in meta['files'].items():
                if hash_file(stage/name/rel)!=digest:raise ValueError('Failed release asset verification '+name+'/'+rel)
        if output.exists():
            if not output.is_dir() or not (output/'release-manifest.json').is_file():
                raise ValueError('Refuse unknown live publish directory')
            os.replace(output,previous)
            swapped=True
        try:os.replace(stage,output)
        except Exception:
            if swapped:os.replace(previous,output)
            raise
    finally:
        if stage.exists():shutil.rmtree(stage)
    if swapped and not keep_backup:shutil.rmtree(previous)
    return manifest,previous if swapped and keep_backup else None


def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',required=True,type=Path)
    parser.add_argument('--module',action='append',required=True,help='name=/absolute/path/to/labs/name/dist')
    parser.add_argument('--home',required=True,type=Path)
    parser.add_argument('--keep-backup',action='store_true')
    args=parser.parse_args()
    sources={}
    for item in args.module:
        name,separator,path=item.partition('=')
        if not separator or name in sources:parser.error('Invalid duplicate --module')
        sources[name]=Path(path)
    manifest,old=publish(args.output,sources,args.home,args.keep_backup)
    print(json.dumps({'releaseId':manifest['releaseId'],'root':str(args.output),
       'modules':{k:{x:v[x] for x in ('sourceCommit','version','assetCount','bytes')}
                  for k,v in manifest['modules'].items()},
       'rollback':str(old) if old else None},ensure_ascii=False,indent=2))

if __name__=='__main__':main()
