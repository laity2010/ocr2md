/** Mirror independently published public components into the OCR2MD RELEASE
 * as byte-for-byte snapshots. WCP hash/signature and rollback contract stays
 * intact. A new OCR2MD release can consume newer published component versions
 * after passing these checks; no silent CDN rewrite, no copies per network. */
import {readFile,writeFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash} from 'node:crypto';
const source=resolve('ui-spikes/v4-directory');
const localWcp=resolve('../web-component-platform/published/components/v1');
const localShared=resolve('../agent-link-monitor/web');
const root=join(source,'vendor');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const copy=async(from,to,expected)=>{
 const b=await readFile(from);
 if(expected &&(expected.sha256!==hash(b)||expected.size!==b.byteLength))
  throw Error('V4_PUBLIC_DEPENDENCY_INTEGRITY_FAILED '+from);
 await mkdir(dirname(to),{recursive:true});await writeFile(to,b);
 return {sha256:hash(b),size:b.byteLength};
};
const manifest=JSON.parse(await readFile(join(localWcp,'manifest.json'),'utf8'));
if(manifest.schemaVersion!==1||!/^\d+\.\d+\.\d+$/.test(manifest.stable)||
 !manifest.releases.some(x=>x.version===manifest.stable))throw Error('V4_WCP_MANIFEST_UNSUPPORTED');
const outWcp=join(root,'wcp/components/v1');
await copy(join(localWcp,'loader.js'),join(outWcp,'loader.js'));
await copy(join(localWcp,'manifest.json'),join(outWcp,'manifest.json'));
for(const release of manifest.releases){
 if(!/^releases\/\d+\.\d+\.\d+\/wcp-workbench\.js$/.test(release.entry))throw Error('V4_WCP_UNEXPECTED_RELEASE');
 await copy(join(localWcp,release.entry),join(outWcp,release.entry),release);
}
const settingsSrc=join(localShared,'shared-settings/v1');
const settings=JSON.parse(await readFile(join(settingsSrc,'manifest.json'),'utf8'));
if(settings.schemaVersion!==2||!settings.releases.some(x=>x.version===settings.stable))
 throw Error('V4_SHARED_SETTINGS_MANIFEST_UNSUPPORTED');
const outSettings=join(root,'shared-settings/v1');
await copy(join(settingsSrc,'manifest.json'),join(outSettings,'manifest.json'));
await copy(join(settingsSrc,'settings-panel.js'),join(outSettings,'settings-panel.js'));
for(const release of settings.releases){
 if(!/^\d+\.\d+\.\d+$/.test(release.version))throw Error('V4_SETTINGS_RELEASE_VERSION_INVALID');
 const from=join(settingsSrc,'releases',release.version);
 const to=join(outSettings,'releases',release.version);
 for(const item of ['panel','grid','css']){
  const asset=release[item];
  if(!asset||!['settings-panel.js','settings-grid.js','sarasa-ui.css'].includes(asset.file))
   throw Error('V4_SHARED_SETTINGS_ASSET_UNEXPECTED '+item);
  await copy(join(from,asset.file),join(to,asset.file),asset);
 }
 await copy(join(from,'manifest.json'),join(to,'manifest.json'));
}
const sourceSrc=join(localShared,'shared-source/v1');
const srcManifest=JSON.parse(await readFile(join(sourceSrc,'manifest.json'),'utf8'));
if(srcManifest.tag!=='laity-source-surface')throw Error('V4_SHARED_SOURCE_MANIFEST_UNSUPPORTED');
const outSource=join(root,'shared-source/v1');
await copy(join(sourceSrc,'source-surface.js'),join(outSource,'source-surface.js'));
await copy(join(sourceSrc,'manifest.json'),join(outSource,'manifest.json'));
console.log('V4_PUBLIC_DEPENDENCIES_MIRRORED',JSON.stringify({wcp:manifest.stable,
  wcpReleases:manifest.releases.length,settings:settings.stable,
  settingsReleases:settings.releases.length,source:srcManifest.version,
  scope:'single-canonical-release'}));
