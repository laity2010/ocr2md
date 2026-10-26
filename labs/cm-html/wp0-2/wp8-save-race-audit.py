#!/usr/bin/env python3
"""WP8 write-safety audit against an *isolated WP7 trial copy only*.

Two authenticated editors PUT separately modified versions of a stale source
with identical If-Match. The current V6 save service ignores If-Match; report
the overwrite as a BLOCKING finding. Always restore baseline via authorized
PUT and assert the source SHA before exiting. Does not touch formal workspace.
"""
from pathlib import Path
import hashlib
import http.cookiejar
import json
import os
import urllib.request

origin = os.environ['WP8_AUDIT_ORIGIN']
trial = Path(os.environ['WP8_AUDIT_TRIAL_DOC']).resolve()
source = Path(os.environ['WP8_AUDIT_CANDIDATE']).resolve()
unlock = Path(os.environ['WP8_AUDIT_UNLOCK_FILE']).resolve()
assert trial.is_file() and source.is_file() and trial != source
assert trial.parent.name == 'wp7-trial' and 'virtual-chapters' in str(trial)
baseline = source.read_bytes()
assert trial.read_bytes() == baseline, 'Trial did not start from candidate'
digest = hashlib.sha256(baseline).hexdigest()
code = unlock.read_text().strip()
endpoint = origin + '/labs/cm-html/api/document'
clients = []
for _ in range(2):
    cookies = http.cookiejar.CookieJar()
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cookies))
    request = urllib.request.Request(
        origin+'/labs/cm-html/api/unlock',
        json.dumps({'code':code}).encode('utf8'),
        {'Content-Type':'application/json','Origin':origin},method='POST')
    with opener.open(request,timeout=12) as response:
        assert response.status == 200
    clients.append(opener)
def put(opener,body):
    request = urllib.request.Request(endpoint,body,
      {'Content-Type':'text/plain; charset=utf-8','Origin':origin,
       'If-Match':'"'+digest+'"'},method='PUT')
    with opener.open(request,timeout=18) as response:
        return response.status
stale_a=baseline+b'\nWP8_CONCURRENT_EDITOR_A\n'
stale_b=baseline+b'\nWP8_CONCURRENT_EDITOR_B\n'
result={}
try:
    old_a=clients[0].open(endpoint,timeout=10).read()
    old_b=clients[1].open(endpoint,timeout=10).read()
    assert old_a==baseline==old_b
    result['editorA_status']=put(clients[0],stale_a)
    result['editorB_status']=put(clients[1],stale_b)
    after=trial.read_bytes()
    result['lost_editorA']=after==stale_b and b'WP8_CONCURRENT_EDITOR_A' not in after
    result['stale_if_match_accepted']=result['editorB_status']==200
finally:
    restored=put(clients[0],baseline)
    assert restored==200
    assert trial.read_bytes()==baseline, 'WP8 trial data was not restored'
    assert hashlib.sha256(trial.read_bytes()).hexdigest()==digest
assert result['editorA_status']==200 and result['editorB_status']==200 and result['lost_editorA']
print('WP8_MULTI_EDITOR_OVERWRITE_CONFIRMED_BLOCKER',json.dumps({
    **result,'trial_restored_sha256':digest,'only_isolated_trial_modified':True
}))
