#!/usr/bin/env python3
"""WP8: prevent alternate physical-chapter API from bypassing conditional saves.

Audits *only* the isolated trial chapter directory. Replays two independent
authorized clients, restores exact original chapter bytes and manifest data.
"""
import hashlib
import http.cookiejar
import json
import os
from pathlib import Path
import urllib.error
import urllib.parse
import urllib.request

origin=os.environ['WP8_AUDIT_ORIGIN']
root=Path(os.environ['WP8_AUDIT_TRIAL_DIR']).resolve()
assert root.name=='wp8-legacy-cas' and 'virtual-chapters' in str(root)
manifest_path=root/'chapter'/'manifest.json'
before_manifest=manifest_path.read_bytes()
manifest=json.loads(before_manifest)
filename=manifest['files'][1]['name']
document=root/'chapter'/filename
original=document.read_bytes()
sha=lambda b:hashlib.sha256(b).hexdigest()
code=(root/'private'/'test-unlock').read_text().strip()
endpoint=origin+'/labs/cm-html/api/document?chapter='+urllib.parse.quote(filename)
clients=[]
for _ in range(2):
    op=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    auth=urllib.request.Request(origin+'/labs/cm-html/api/unlock',
        json.dumps({'code':code}).encode(),{'Origin':origin,'Content-Type':'application/json'},method='POST')
    with op.open(auth,timeout=12) as r:assert r.status==200
    clients.append(op)
def get(op):
    with op.open(endpoint,timeout=12) as r:return r.read(),r.headers.get('ETag')
def put(op,body,revision):
    headers={'Origin':origin,'Content-Type':'text/plain; charset=utf-8'}
    if revision is not None:headers['If-Match']=revision
    req=urllib.request.Request(endpoint,body,headers,method='PUT')
    try:
        with op.open(req,timeout=12) as r:return r.status,r.headers.get('ETag')
    except urllib.error.HTTPError as error:return error.code,error.headers.get('ETag')

a,b=clients
bodyA,revA=get(a);bodyB,revB=get(b)
assert bodyA==bodyB==original and revA==revB=='"'+sha(original)+'"'
first=original+b'\nWP8_CHAPTER_EDITOR_A\n'
second=original+b'\nWP8_CHAPTER_EDITOR_B\n'
try:
    assert put(a,first,None)[0]==428
    assert document.read_bytes()==original
    assert put(a,first,revA)[0]==200
    assert document.read_bytes()==first
    assert put(b,second,revB)[0]==412
    assert document.read_bytes()==first
    assert put(a,original,revA)[0]==412
    assert put(a,original,'"'+sha(first)+'"')[0]==200
    assert document.read_bytes()==original
finally:
    if document.read_bytes()!=original:
        assert document.read_bytes()==first, 'Unknown additional chapter writer'
        assert put(a,original,'"'+sha(first)+'"')[0]==200
    assert document.read_bytes()==original, 'Chapter trial was not restored'
    final_manifest=json.loads(manifest_path.read_bytes())
    assert final_manifest['sourceSha256']==manifest['sourceSha256']
    assert final_manifest['files']==manifest['files'], 'Chapter manifest file hashes changed after restore'
    # generatedAt records the legitimate per-save manifest revision; it is
    # expected to advance during this audit's two successful writes.
print('WP8_LEGACY_CHAPTER_CAS_PASS',json.dumps({
    'chapter':filename,'missing_revision':428,'stale_revision':412,
    'second_editor_rejected':True,'restored_sha256':sha(original)}))
