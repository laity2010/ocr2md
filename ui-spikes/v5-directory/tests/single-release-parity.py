#!/usr/bin/env python3
"""Verify LAN-first and Cloudflare remote use identical V5 assets from ONE deploy.

Requires the locally trusted LAN CA, checks both origins and legacy denial.
Read-only; no user Vault data or keys are transmitted.
"""
import hashlib
import json
import subprocess
from pathlib import Path

LAN='https://192.168.1.10:4443'
REMOTE='https://ocr2md.laity.bid'
CA=Path.home()/'Library/Application Support/ocr2md/lan-tls/root-ca.crt'
assert CA.is_file(),'OCR2MD_LAN_CA_MISSING'

def get(origin,path):
    ca=['--cacert',str(CA)] if origin==LAN else []
    return subprocess.check_output(['curl','--fail','--silent','--show-error','--location',
        '--max-time','15',*ca,origin+path])

def status(origin,path):
    ca=['--cacert',str(CA)] if origin==LAN else []
    return int(subprocess.check_output(['curl','--silent','--max-time','15',*ca,
        '--output','/dev/null','--write-out','%{http_code}',origin+path]).decode())

version=json.loads(get(LAN,'/release-info.json'))
assert version['release'].startswith('ocr2md-v5-')
assert version['modules']==['ocr2md:settings']
assets=['/','/index.html','/app.js','/vendor/wcp/components/v1/releases/0.1.8/app-frame.js','/vendor/wcp/components/v1/releases/0.1.8/wcp-workbench.js','/vendor/wcp/components/v1/manifest.json','/vendor/wcp/components/v1/loader.js',
        '/plugins/registry.generated.js','/plugins/settings/settings.js',
        '/vendor/shared-settings/v1/releases/0.1.18/settings-panel.js',
        '/components/tripane.js','/release-info.json']
for path in assets:
    one=get(LAN,path);other=get(REMOTE,path)
    assert one==other,('LAN_REMOTE_VERSION_DRIFT',path,hashlib.sha256(one).hexdigest(),hashlib.sha256(other).hexdigest())
    print('ONE_RELEASE_IDENTICAL',path,len(one),hashlib.sha256(one).hexdigest()[:16])
for origin in (LAN,REMOTE):
    for route in ('/v4-directory/','/v4-wp3-candidate/','/v5-directory/'):
        assert status(origin,route)==410,(origin,route)
    for path in ('/plugins/filesystem/plugin.json','/plugins/filesystem/index.js','/plugins/filesystem/workspace-fs.js'):
        assert status(origin,path)==404,(origin,'legacy-module-exposed',path)
    for op in ('pair','bootstrap','list','stat','read'):
        assert status(origin,'/__v3/fs?op='+op+'&path=%2Focr2md')==403,(origin,op)
    assert status(origin,'/__v3/fs?op=status')==200
print('V5_SINGLE_DEPLOY_LAN_PUBLIC_PASS',json.dumps({
    'origin_local':LAN,'origin_remote':REMOTE,'release':version['release'],
    'digest':version['digest'],'files':version['files'],'matchedAssets':len(assets),
    'blockedLegacyRoutes':3,'blockedVaultOps':5},ensure_ascii=False))
