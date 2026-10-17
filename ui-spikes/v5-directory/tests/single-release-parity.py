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

def forget_device_probe(origin):
    """Harmless opt-out on curl's isolated cookie-less session, not user's browser."""
    ca=['--cacert',str(CA)] if origin==LAN else []
    result=subprocess.check_output(['curl','--silent','--show-error','--max-time','15',*ca,
        '--dump-header','-','--output','/dev/null','--request','POST',
        '--header','Origin: '+origin,'--header','Content-Type: application/json',
        '--data-binary','{"remember":false}',origin+'/__v5/auth/remember']).decode('latin-1')
    assert ' 200 ' in result,('REMEMBER_FORGET_POST_DENIED',origin)
    assert 'set-cookie: __host-ocr2md-workspace=' in result.lower(),('AUTH_COOKIE_MISSING',origin)
    assert 'Max-Age=0' in result and 'HttpOnly' in result and 'Secure' in result

version=json.loads(get(LAN,'/release-info.json'))
assert version['release'].startswith('ocr2md-v5-')
assert version['modules']==['ocr2md:settings','ocr2md:workspace']
assets=['/','/index.html','/app.js','/vendor/wcp/components/v1/releases/0.1.11/app-frame.js','/vendor/wcp/components/v1/releases/0.1.11/wcp-workbench.js','/vendor/wcp/components/v1/manifest.json','/vendor/wcp/components/v1/loader.js',
        '/plugins/registry.generated.js','/plugins/settings/settings.js',
        '/plugins/workspace/workspace.js','/plugins/workspace/directory-service.js',
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
    for op in ('pair','bootstrap','stat','read'):
        assert status(origin,'/__v3/fs?op='+op+'&path=%2Focr2md')==403,(origin,op)
    assert status(origin,'/__v3/fs?op=list&path=%2Focr2md')==401,(origin,'list-without-key')
    assert status(origin,'/__v3/fs?op=status')==200
    forget_device_probe(origin)
    assert status(origin,'/__v5/auth/remember')==405
print('V5_SINGLE_DEPLOY_LAN_PUBLIC_PASS',json.dumps({
    'origin_local':LAN,'origin_remote':REMOTE,'release':version['release'],
    'digest':version['digest'],'files':version['files'],'matchedAssets':len(assets),
    'blockedLegacyRoutes':3,'blockedVaultOps':5},ensure_ascii=False))
