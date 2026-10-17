#!/usr/bin/env python3
"""Atomically deploy one public V5 runtime directory, never source/tests/Vault.

Historical releases are outside the served directory; no V4 modifications.
"""
import hashlib,json,shutil,datetime,os,sys,re,subprocess
from pathlib import Path

v5=Path(__file__).resolve().parent.parent
repo=v5.parent.parent
release=repo/'.runtime/ocr2md-public'
backup_root=repo/'.runtime/ocr2md-release-rollback'
stage=release.with_name('ocr2md-public-stage-'+str(os.getpid()))


# Publishing assembles ONLY previously built, source-hash-verified components.
# Compiling Settings is a separate operation in its own repository; no rebuild here.
def stage_development_components(stage_root):
    # ONE public WCP manifest owns both runtime and AppFrame 0.1.11.
    central_wcp=repo.parent/'web-component-platform/published/components/v1'
    wcp_manifest=json.loads((central_wcp/'manifest.json').read_text())
    if wcp_manifest['stable']!='0.1.11':raise RuntimeError('WCP_PLATFORM_VERSION_MISMATCH')
    wcp_root=v5/'vendor/wcp/components/v1'
    for name in ('loader.js','manifest.json'):
        if (central_wcp/name).read_bytes()!=(wcp_root/name).read_bytes():
            raise RuntimeError('WCP_PUBLIC_ENTRY_MIRROR_DRIFT '+name)
    for info in wcp_manifest['releases']:
        source=central_wcp/info['entry'];mirror=wcp_root/info['entry']
        if not mirror.is_file() or mirror.read_bytes()!=source.read_bytes():
            raise RuntimeError('WCP_RUNTIME_MIRROR_DRIFT '+info['entry'])
        if hashlib.sha256(source.read_bytes()).hexdigest()!=info['sha256']:
            raise RuntimeError('WCP_RUNTIME_RELEASE_SHA_MISMATCH '+info['version'])
    current=next(r for r in wcp_manifest['releases'] if r['version']==wcp_manifest['stable'])
    for key,sha in (('entry','sha256'),('style','styleSha256')):
        source=central_wcp/current['frame'][key]
        mirror=wcp_root/current['frame'][key]
        if not mirror.is_file() or source.read_bytes()!=mirror.read_bytes():
            raise RuntimeError('WCP_FRAME_MIRROR_DRIFT '+key)
        if hashlib.sha256(source.read_bytes()).hexdigest()!=current['frame'][sha]:
            raise RuntimeError('WCP_FRAME_RELEASE_SHA_MISMATCH '+key)
    settings_root=repo.parent/'agent-link-monitor/shared-settings'
    version=json.loads((settings_root/'package.json').read_text())['version']
    if version!='0.1.18':raise RuntimeError('V5_SETTINGS_SOURCE_VERSION_MISMATCH '+version)
    # Explicit separate module build: scripts/prepare-shared-settings.py.
    from importlib.util import spec_from_file_location,module_from_spec
    spec=spec_from_file_location('v5_settings_candidate',v5/'scripts/prepare-shared-settings.py')
    if not spec or not spec.loader:raise RuntimeError('SETTINGS_CANDIDATE_READER_UNAVAILABLE')
    component=module_from_spec(spec);spec.loader.exec_module(component)
    pointer=repo/'.runtime/ocr2md-component-candidates/shared-settings-current.json'
    if not pointer.is_file():raise RuntimeError('SHARED_SETTINGS_CANDIDATE_REQUIRED: run python3 scripts/prepare-shared-settings.py')
    candidate=json.loads(pointer.read_text())
    if candidate['version']!=version or candidate['sourceDigest']!=component.digest_source():
        raise RuntimeError('SHARED_SETTINGS_CANDIDATE_STALE: rebuild module before publishing')
    build_dir=repo/'.runtime/ocr2md-component-candidates/shared-settings'/candidate['artifact']
    if not build_dir.is_dir():raise RuntimeError('SHARED_SETTINGS_CANDIDATE_FILES_MISSING')
    for name,expected in candidate['files'].items():
        content=(build_dir/name).read_bytes()
        if hashlib.sha256(content).hexdigest()!=expected:raise RuntimeError('SHARED_SETTINGS_CANDIDATE_DIGEST_MISMATCH')
    target=stage_root/'vendor/shared-settings/v1/releases'/version
    target.mkdir(parents=True,exist_ok=True)
    checks={}
    for name in ('settings-panel.js','settings-grid.js'):
        source=build_dir/name
        data=source.read_bytes()
        shutil.copy2(source,target/name)
        checks[name]={'sha256':hashlib.sha256(data).hexdigest(),'size':len(data),'file':name}
    style=target/'sarasa-ui.css'
    checks['sarasa-ui.css']={'sha256':hashlib.sha256(style.read_bytes()).hexdigest(),
       'size':style.stat().st_size,'file':style.name}
    manifest_path=stage_root/'vendor/shared-settings/v1/manifest.json'
    snapshot=json.loads(manifest_path.read_text())
    snapshot['previous']=snapshot.get('stable','0.1.17')
    snapshot['version']=version
    snapshot['stable']=version
    snapshot['channel']='ocr2md-development-only'
    snapshot['releases']=[{'version':version,'panel':checks['settings-panel.js'],
      'grid':checks['settings-grid.js'],'css':checks['sarasa-ui.css']},
      *(x for x in snapshot['releases'] if x.get('version')!=version)]
    manifest_path.write_text(json.dumps(snapshot,ensure_ascii=False,indent=2)+'\n')
    print('DEV_COMPONENT_CANDIDATE_VERIFIED',version,checks['settings-panel.js']['sha256'])
    return version,checks['settings-panel.js']['sha256'],wcp_manifest['stable']

# AEL verifies module scope before the immutable release assembly begins.
ael_db=v5/'.ael/ledger.sqlite'
if ael_db.is_file():
    ael=repo.parent/'web-component-platform/tools/ael/ael.py'
    if not ael.is_file():raise RuntimeError('AEL_AUTHORITY_UNAVAILABLE')
    gate=subprocess.run(['python3',str(ael),'--root',str(v5),'--policy',str(v5/'ael-policy.json'),'check'],
                        text=True,capture_output=True,timeout=25)
    if gate.returncode or '"active": null' not in gate.stdout or '"files": 0' not in gate.stdout:
        raise RuntimeError('AEL_RELEASE_GATE_NOT_CLEAN '+(gate.stdout+gate.stderr)[-600:])
elif (v5/'ael-policy.json').is_file():
    raise RuntimeError('AEL_V5_NOT_INITIALIZED')

items=('index.html','app.js','plugins','components','vendor')
try:
    stage.mkdir(parents=True,exist_ok=False)
    # Source may retain legacy WIP for audit; only enabled, registry-approved
    # plugin sources are allowed inside the served artifact. Old mixed
    # filesystem/DIRjson/chapters implementation must not be published.
    registered=[]
    for descriptor in sorted((v5/'plugins').glob('*/plugin.json')):
        entry=json.loads(descriptor.read_text())
        if entry.get('enabled',True):registered.append((descriptor.parent.name,entry['id']))
    registered_ids=[x[1] for x in registered]
    registry=(v5/'plugins/registry.generated.js').read_text()
    for _,module_id in registered:
        if ('\"id\":\"'+module_id+'\"') not in registry:
            raise RuntimeError('REGISTRY_SOURCE_MISMATCH '+module_id)
    for item in items:
        src=v5/item
        if src.is_dir():shutil.copytree(src,stage/item,ignore=shutil.ignore_patterns('__pycache__','*.pyc'))
        else:shutil.copy2(src,stage/item)
    # Backwards-compatible legacy snapshots remain in source control, but the
    # running V5 exposes only the unified WCP platform, not separate AppFrame.
    old_frame=stage/'vendor/wcp/components/app-frame'
    if old_frame.is_dir():shutil.rmtree(old_frame)
    for plugin_dir in (stage/'plugins').iterdir():
        if plugin_dir.is_dir() and plugin_dir.name not in {name for name,_ in registered}:
            shutil.rmtree(plugin_dir)
    staged_registry=(stage/'plugins/registry.generated.js').read_text()
    for descriptor in (v5/'plugins').glob('*/plugin.json'):
        if json.loads(descriptor.read_text()).get('enabled',True)==False:
            if descriptor.parent.name+'/index.js' in staged_registry:
                raise RuntimeError('DISABLED_PLUGIN_STILL_IN_REGISTRY '+descriptor.parent.name)
    settings_version,settings_source_sha,wcp_version=stage_development_components(stage)
    # A failed public import breaks ALL module startup. Validate at least
    # Shell's declared static import closure before swapping the live stage.
    shell=(stage/'app.js').read_text()
    for rel in re.findall(r"\bfrom\s+['\"]\./([^'\"]+)['\"]",shell):
        entry=(stage/rel).resolve()
        if not entry.is_relative_to(stage.resolve()) or not entry.is_file():
            raise RuntimeError('V5_SHELL_ASSET_NOT_PUBLISHED '+rel)
    # The public plugin directory serves only UI/service assets; never debug source.
    for path in stage.rglob('*'):
        if path.is_symlink():raise RuntimeError('Symlink in release: '+str(path))
    # One immutable build ID, exact to the second, used by the visible badge
    # and the machine-readable release record; both LAN/public share this stage.
    built_at=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=8)))
    build_id='v5-'+built_at.strftime('%y%m%d-%H%M%S')
    # AppFrame receives the same buildId through the host attribute, a pure
    # boot parameter; the Shell performs no network access of its own.
    html=stage/'index.html'
    template=html.read_text()
    token='data-build-id="v5-development"'
    if template.count(token)!=1:raise RuntimeError('APP_FRAME_BUILD_PLACEHOLDER_INVALID')
    html.write_text(template.replace(token,'data-build-id="'+build_id+'"'))
    files=sorted(p for p in stage.rglob('*') if p.is_file())
    info={'release':'ocr2md-v5-workspace','buildId':build_id,
          'buildTime':built_at.isoformat(timespec='seconds'),
          'wcpVersion':wcp_version,
          'sharedSettings':{'version':settings_version,'sourceBuiltSha256':settings_source_sha},'modules':registered_ids,
          'files':len(files),'digest':hashlib.sha256('\n'.join(
              str(p.relative_to(stage))+':'+hashlib.sha256(p.read_bytes()).hexdigest()
              for p in files).encode()).hexdigest(),
          'publishedAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (stage/'release-info.json').write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
    backup_root.mkdir(exist_ok=True)
    if release.exists():
        frozen=backup_root/('rollback-'+datetime.datetime.now().strftime('%Y%m%d-%H%M%S'))
        os.replace(release,frozen)
    os.replace(stage,release)
    print('OCR2MD_V5_SINGLE_RELEASE_PUBLISHED',json.dumps(info,ensure_ascii=False),'dir='+str(release))
    # One build = one immediately published V5 release = one screenshot gate.
    # The gate uses fresh WebKit (iPad-sized) and captures BOTH real modules.
    # It does not read private Vault data or capture an authenticated browser.
    # The minimal offline publisher fixture deliberately omits the optional
    # visual module; the REAL V5 repo always includes it.
    visual=v5/'scripts/capture-release-visual.mjs'
    if visual.is_file():
        result=subprocess.run(['node',str(visual),build_id],cwd=v5,
                              text=True,timeout=125,capture_output=True)
        if result.stdout:print(result.stdout.rstrip(),flush=True)
        if result.returncode:
            print('V5_PUBLISHED_BUT_VISUAL_UNVERIFIED',build_id,
                  (result.stderr or '')[-1200:],flush=True)
            raise RuntimeError('V5 visual screenshot verification failed; release is live but NOT accepted')
    else:
        print('V5_VISUAL_GATE_OMITTED_IN_ISOLATED_FIXTURE',flush=True)
except Exception:
    if stage.exists():shutil.rmtree(stage)
    raise
