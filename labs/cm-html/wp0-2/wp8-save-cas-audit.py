#!/usr/bin/env python3
"""Two independently authorized clients test versioned root Markdown writes.
Writes ONLY a dedicated WP7 trial copy; always restores it in finally.
"""
import hashlib, http.cookiejar, json, os, urllib.request, urllib.error
from pathlib import Path
origin=os.environ['WP8_AUDIT_ORIGIN']
trial=Path(os.environ['WP8_AUDIT_TRIAL_DOC']).resolve()
candidate=Path(os.environ['WP8_AUDIT_CANDIDATE']).resolve()
code=Path(os.environ['WP8_AUDIT_UNLOCK_FILE']).read_text().strip()
assert trial.parent.name=='wp7-trial' and 'virtual-chapters' in str(trial)
original=candidate.read_bytes()
assert trial.read_bytes()==original
digest='"'+hashlib.sha256(original).hexdigest()+'"'
endpoint=origin+'/labs/cm-html/api/document'
clients=[]
for _ in range(2):
    opener=urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    request=urllib.request.Request(origin+'/labs/cm-html/api/unlock',json.dumps({'code':code}).encode(),
      {'Content-Type':'application/json','Origin':origin},method='POST')
    with opener.open(request,timeout=8) as res:assert res.status==200
    clients.append(opener)
def get(opener):
    with opener.open(endpoint,timeout=8) as res:
        return res.read(),res.headers.get('ETag')
def put(opener,body,etag):
    headers={'Content-Type':'text/plain; charset=utf-8','Origin':origin}
    if etag is not None:headers['If-Match']=etag
    req=urllib.request.Request(endpoint,body,headers,method='PUT')
    try:
        with opener.open(req,timeout=12) as res:
            return res.status,res.headers.get('ETag')
    except urllib.error.HTTPError as error:return error.code,error.headers.get('ETag')
a,b=clients
before_a,revision_a=get(a)
before_b,revision_b=get(b)
assert before_a==original==before_b and revision_a==digest==revision_b
changed_a=original+b'\nWP8_AUTHOR_A\n'
changed_b=original+b'\nWP8_AUTHOR_B\n'
after_rev=None
try:
    assert put(a,changed_a,None)[0]==428
    assert trial.read_bytes()==original
    assert put(a,changed_a,'"0000000000000000"')[0]==412
    assert trial.read_bytes()==original
    assert put(a,changed_a,digest)[0]==200
    after_a=trial.read_bytes()
    assert after_a==changed_a
    _,after_rev=get(a)
    assert after_rev=='"'+hashlib.sha256(changed_a).hexdigest()+'"'
    stale,status_tag=put(b,changed_b,digest)
    assert stale==412 and status_tag is None
    assert trial.read_bytes()==changed_a,'Stale editor overwrote first editor'
    assert put(a,original,digest)[0]==412,'Old ETag must stay stale'
    assert put(a,original,after_rev)[0]==200
    assert trial.read_bytes()==original
    print('WP8_TWO_CLIENT_CAS_PASS',json.dumps({
      'first_author_saved':True,'missing_revision_428':True,
      'stale_revision_412':True,'second_author_rejected':True,
      'no_lost_update':True,'original_sha256':digest.strip('"')}))
finally:
    current=trial.read_bytes()
    if current!=original:
        # Only restore if this audit's first edit is the entire current file;
        # never overwrite a third client that may have modified the trial.
        if current!=changed_a:raise AssertionError('Unexpected third-party trial change')
        latest='"'+hashlib.sha256(current).hexdigest()+'"'
        assert put(a,original,latest)[0]==200
    assert trial.read_bytes()==original,'Trial candidate not restored'
