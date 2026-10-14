/** Independent V4 business-module bundling; V3 sources remain read-only. */
import {resolve,dirname,join} from 'node:path';
import {mkdir,copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const here=dirname(fileURLToPath(import.meta.url));
const root=resolve(here,'..');
const {build}=await import('file://'+resolve(root,'../../../web-component-platform/node_modules/esbuild/lib/main.js'));
// Build is manifest-driven: adding or editing a plugin must never require
// modifying the application entry, WCP core or this build pipeline.
for(const candidate of await readdir(resolve(root,'plugins'),{withFileTypes:true})){
 if(!candidate.isDirectory())continue;
 const dir=resolve(root,'plugins',candidate.name);
 const manifestPath=join(dir,'plugin.json');
 let descriptor;
 try{descriptor=JSON.parse(await readFile(manifestPath,'utf8'))}
 catch(error){if(error.code==='ENOENT')continue;throw error}
 for(const artifact of descriptor.bundles??[]){
  const {entry,output}=artifact;
  if(!/^[a-z][a-z0-9-]*\.ts$/.test(entry)||
     !/^[a-z][a-z0-9-]*\.js$/.test(output)||
     !output.endsWith(entry.slice(0,-3)+'.js'))
   throw Error('INVALID_PLUGIN_BUILD_DECLARATION '+candidate.name);
  await build({entryPoints:[join(dir,entry)],outfile:join(dir,output),
    bundle:true,format:'esm',platform:'browser',target:'es2022',minify:true,logLevel:'silent',
    alias:{crypto:resolve(root,'../v3-directory/src/browserCryptoShim.ts')},
    loader:{'.css':'empty','.woff':'file','.woff2':'file','.ttf':'file'}});
 }
}
// TriPane is built ONCE by WCP as an independently versioned UI asset.
// OCR2MD copies the exact published bytes, never bundles Dockview in a business module.
const wcp=resolve(root,'../../../web-component-platform');
const manifest=JSON.parse(await readFile(join(wcp,'published/components/tripane/v1/manifest.json'),'utf8'));
const version=manifest.stable;
const entry=manifest.releases.find(item=>item.version===version);
if(!entry||!/^\d+\.\d+\.\d+$/.test(version))throw Error('WCP_TRIPANE_MANIFEST_INVALID');
const directory=resolve(root,'components');
await mkdir(directory,{recursive:true});
for(const [sourceName,targetName] of [['tripane.js','tripane.js'],['dockview.css','dockview.css']]){
 const from=join(wcp,'published/components/tripane/v1/releases',version,sourceName);
 const bytes=await readFile(from);
 const digest=createHash('sha256').update(bytes).digest('hex');
 if(digest!==entry.assets[sourceName]?.sha256||bytes.length!==entry.assets[sourceName]?.size)
  throw Error('WCP_TRIPANE_ARTIFACT_INTEGRITY_FAILED '+sourceName);
 await copyFile(from,join(directory,targetName));
}
// Mirror other independently published public components without modifying WCP.
await import('./sync-public-dependencies.mjs');
// Independent WCP ResidentHost uses the same immutable+hash-checked supply path.
const residentManifest=JSON.parse(await readFile(join(wcp,'published/components/resident/v1/manifest.json'),'utf8'));
const resident=residentManifest.releases.find(r=>r.version===residentManifest.stable);
if(!resident||!/^\d+\.\d+\.\d+$/.test(residentManifest.stable))throw Error('WCP_RESIDENT_MANIFEST_INVALID');
const residentBytes=await readFile(join(wcp,'published/components/resident/v1/releases',residentManifest.stable,'resident.js'));
if(residentBytes.length!==resident.assets['resident.js']?.size||
 createHash('sha256').update(residentBytes).digest('hex')!==resident.assets['resident.js']?.sha256)
 throw Error('WCP_RESIDENT_ASSET_INTEGRITY_FAILED');
await writeFile(join(directory,'resident.js'),residentBytes);
await writeFile(join(directory,'resident-manifest.json'),JSON.stringify({schemaVersion:1,source:'wcp',version:residentManifest.stable,assets:resident.assets},null,2)+'\n');
await writeFile(join(directory,'manifest.json'),JSON.stringify({schemaVersion:1,source:'wcp',version,assets:entry.assets},null,2)+'\n');
await import('./build-registry.mjs');
// Regression gate: even independently built plugins may not import another plugin.
await import('./check-plugin-boundaries.mjs');
// The build ID belongs to THIS compiled set of assets, never to page load time.
await import('./stamp-build.mjs');
console.log('V4_WORKSPACE_BUNDLES_BUILT',JSON.stringify({triPane:version,integrity:'verified'}));
