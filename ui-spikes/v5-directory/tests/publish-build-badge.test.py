#!/usr/bin/env python3
"""Offline development publisher fixture: prebuilt Settings, no cross-component build on publish."""
import hashlib,json,re,shutil,subprocess,tempfile
from pathlib import Path
src=Path(__file__).resolve().parents[1]
with tempfile.TemporaryDirectory(prefix='v5-dev-publish-contract-') as temp:
 base=Path(temp);repo=base/'ocr2md-repo';v5=repo/'ui-spikes/v5-directory'
 for folder in ('scripts','plugins/settings','plugins/filesystem','components','vendor/wcp/components/v1',
  'vendor/shared-settings/v1/releases/0.1.18'):(v5/folder).mkdir(parents=True,exist_ok=True)
 for name in ('index.html','app.js'):shutil.copy2(src/name,v5/name)
 shutil.copy2(src/'scripts/publish-single-release.py',v5/'scripts/publish-single-release.py')
 shutil.copy2(src/'scripts/prepare-shared-settings.py',v5/'scripts/prepare-shared-settings.py')
 shutil.copy2(src/'plugins/registry.generated.js',v5/'plugins/registry.generated.js')
 for name in ('settings','filesystem'):
  shutil.copy2(src/f'plugins/{name}/plugin.json',v5/f'plugins/{name}/plugin.json')
 (v5/'plugins/settings/index.js').write_text('export const modules=[];')
 (v5/'plugins/filesystem/index.js').write_text('// inactive and must never deploy')
 (v5/'plugins/filesystem/workspace-fs.js').write_text('legacy DIRjson boundary.ir.load clean.chapter.begin')
 (v5/'components/renderer.js').write_text('export const version=1;')
 (v5/'vendor/shared-settings/v1/manifest.json').write_text(json.dumps({'version':'0.1.17','stable':'0.1.17','releases':[]}))
 (v5/'vendor/shared-settings/v1/releases/0.1.18/sarasa-ui.css').write_text('/* shared css */')
 central=base/'web-component-platform/published/components/v1';central.mkdir(parents=True)
 source=Path('/Users/daisor/AgentDock/web-component-platform/published/components/v1')
 for name in ('manifest.json','loader.js'):
  shutil.copy2(source/name,central/name)
  shutil.copy2(src/'vendor/wcp/components/v1'/name,v5/'vendor/wcp/components/v1'/name)
 manifest=json.loads((central/'manifest.json').read_text())
 for release in manifest['releases']:
  path=release['entry']
  for target in (central/ path,v5/'vendor/wcp/components/v1'/path):
   target.parent.mkdir(parents=True,exist_ok=True)
   shutil.copy2(source/path,target)
  if release['version']==manifest['stable']:
   for path in (release['frame']['entry'],release['frame']['style']):
    for target in (central/path,v5/'vendor/wcp/components/v1'/path):
     target.parent.mkdir(parents=True,exist_ok=True)
     shutil.copy2(source/path,target)
 shared=base/'agent-link-monitor/shared-settings';(shared/'scripts').mkdir(parents=True)
 (shared/'package.json').write_text(json.dumps({'name':'isolated-shared-source','version':'0.1.18',
  'scripts':{'build':'node scripts/build.mjs'}}))
 (shared/'scripts/build.mjs').write_text('''import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const p=resolve('.tmp-build');await mkdir(p,{recursive:true});
await writeFile(resolve(p,'settings-panel.js'),'export const fromAuthoritativeSource=true;');
await writeFile(resolve(p,'settings-grid.js'),'export const grid=1;');
console.log('FASTDEV_CANDIDATE_BUILD_OK '+JSON.stringify({directory:p,productionUntouched:true}));''')
 original=(v5/'index.html').read_bytes()
 first=subprocess.run(['python3',str(v5/'scripts/publish-single-release.py')],text=True,capture_output=True,timeout=25)
 assert first.returncode!=0 and 'SHARED_SETTINGS_CANDIDATE_REQUIRED' in first.stderr,(first.stdout,first.stderr)
 assert not (repo/'.runtime/ocr2md-public').exists(),'no publication before separate component build'
 candidate=subprocess.run(['python3',str(v5/'scripts/prepare-shared-settings.py')],text=True,capture_output=True,timeout=25)
 assert candidate.returncode==0,(candidate.stdout,candidate.stderr)
 assert 'SHARED_SETTINGS_MODULE_CANDIDATE_READY' in candidate.stdout
 candidate_record=json.loads((repo/'.runtime/ocr2md-component-candidates/shared-settings-current.json').read_text())
 assert candidate_record['version']=='0.1.18'
 fake_source=shared/'scripts/build.mjs'
 saved=fake_source.read_text()
 fake_source.write_text(saved+'\n// changed source invalidates previous candidate\n')
 outdated=subprocess.run(['python3',str(v5/'scripts/publish-single-release.py')],text=True,capture_output=True,timeout=25)
 assert outdated.returncode!=0 and 'SHARED_SETTINGS_CANDIDATE_STALE' in outdated.stderr,(outdated.stdout,outdated.stderr)
 fake_source.write_text(saved)
 out=subprocess.run(['python3',str(v5/'scripts/publish-single-release.py')],text=True,capture_output=True,timeout=25)
 assert out.returncode==0,(out.stdout,out.stderr)
 release=repo/'.runtime/ocr2md-public';info=json.loads((release/'release-info.json').read_text());bid=info['buildId']
 assert re.fullmatch(r'v5-\d{6}-\d{6}',bid)
 assert info['modules']==['ocr2md:settings']
 assert info['sharedSettings']['version']=='0.1.18'
 assert hashlib.sha256((release/'vendor/shared-settings/v1/releases/0.1.18/settings-panel.js').read_bytes()).hexdigest()==info['sharedSettings']['sourceBuiltSha256']
 assert not (release/'plugins/filesystem').exists()
 assert 'frame.watchBuild(' in (release/'app.js').read_text()
 assert info['wcpVersion']=='0.1.11'
 assert not (release/'vendor/wcp/components/app-frame').exists()
 assert 'data-build-id="'+bid+'"' in (release/'index.html').read_text()
 assert (v5/'index.html').read_bytes()==original
 assert not (base/'agent-link-monitor/web').exists(),'must not write authoritative central publication'
 print('V5_DEV_PUBLISHER_ISOLATED_PASS',json.dumps({'version':bid,'registeredModules':info['modules'],
   'inactiveLegacyExcluded':True,'centralStableUntouched':True,'prebuiltCandidateUsed':True}))
