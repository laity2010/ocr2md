/** WP3/4 release: immutable tested V4 runtime under a separate public path.
 * No WCP/Cloudflare backend restarts, no access to book files, no overwrite
 * of stable /v4-directory. Assets are curated to runtime formats only.
 */
import {cp,mkdir,readdir,readFile,rename,rm,stat} from 'node:fs/promises';
import {join,resolve,extname,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const repo=resolve('.');
const source=join(repo,'ui-spikes/v4-directory');
// Never release while LAN and Cloudflare read independent V4 snapshots.
const unified=spawnSync(process.execPath,['ui-spikes/v4-directory/scripts/link-lan-origin.mjs','--check'],
 {cwd:repo,stdio:'inherit',timeout:80000});
if(unified.status!==0)throw Error('WP3_LAN_PUBLIC_RELEASE_SOURCES_DIVERGED');
const root=join(repo,'ui-spikes/v2');
const stable=join(root,'v4-directory');
const candidateName='v4-wp3-candidate';
const deployed=join(root,candidateName);
const isUpgrade=process.argv.includes('--upgrade');
const isDiagnostic=process.argv.includes('--diagnostic');
const isThemeFix=process.argv.includes('--theme-fix');
const isSettingsThemeFix=process.argv.includes('--settings-theme-fix');
const isLocalFastStart=process.argv.includes('--local-fast-start');
const isHeaderGeometryFix=process.argv.includes('--header-geometry-fix');
if((isDiagnostic||isThemeFix||isSettingsThemeFix||isLocalFastStart||isHeaderGeometryFix)&&!isUpgrade)throw Error('WP3_THEME_FIX_OR_DIAGNOSTIC_REQUIRES_CANDIDATE_UPGRADE');
if([isDiagnostic,isThemeFix,isSettingsThemeFix,isLocalFastStart,isHeaderGeometryFix].filter(Boolean).length>1)throw Error('WP3_RELEASE_MODES_ARE_MUTUALLY_EXCLUSIVE');
if(process.argv.slice(2).some(flag=>!['--upgrade','--diagnostic','--theme-fix','--settings-theme-fix','--local-fast-start','--header-geometry-fix'].includes(flag)))throw Error('WP3_UNKNOWN_RELEASE_FLAG');
const internal='http://127.0.0.1:4176/'+candidateName+'/';
const publicUrl='https://ocr2md.laity.bid/'+candidateName+'/';
const data=JSON.parse(await readFile(join(source,'build-info.json'),'utf8'));
const stableData=JSON.parse(await readFile(join(stable,'build-info.json'),'utf8'));
if(!/^v4-\d{6}-\d{4}$/.test(data.id)||data.id<=stableData.id)throw Error('WP3_CANDIDATE_VERSION_NOT_ADVANCING');
const runtimeExtensions=new Set(['.js','.mjs','.json','.css','.woff','.woff2','.ttf','.otf','.gif','.png','.svg','.jpg','.jpeg','.webp','.wasm']);
const files=['index.html','app.js','component-inventory.js','settings.schema.json','build-info.json'];
async function inventory(dirname,prefix){
 for(const item of await readdir(join(source,dirname),{withFileTypes:true})){
  const sub=join(dirname,item.name);
  if(item.isSymbolicLink())throw Error('WP3_SYMLINK_IN_RELEASE '+sub);
  if(item.isDirectory()){await inventory(sub,prefix);continue}
  if(item.isFile()&&runtimeExtensions.has(extname(item.name).toLowerCase()))files.push(sub);
 }
}
for(const dir of ['assets','components','plugins','vendor'])await inventory(dir);
if(files.length<20)throw Error('WP3_RUNTIME_NOT_COMPLETE');
const checksums=data.assets;
if(!checksums||Object.keys(checksums).length<8)throw Error('WP3_NO_BUILD_HASH_MANIFEST');
async function validate(dirname){
 const info=JSON.parse(await readFile(join(dirname,'build-info.json'),'utf8'));
 if(info.id!==data.id||JSON.stringify(info.assets)!==JSON.stringify(data.assets))throw Error('WP3_MANIFEST_MISMATCH');
 for(const [path,expected] of Object.entries(checksums)){
  const bytes=await readFile(join(dirname,path));
  if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error('WP3_HASH_MISMATCH '+path);
 }
}
await validate(source);
let predecessor=null;
if(isUpgrade){
 try{predecessor=JSON.parse(await readFile(join(deployed,'build-info.json'),'utf8'))}
 catch(error){throw Error('WP3_UPGRADE_NEEDS_LIVE_CANDIDATE '+error.code)}
 if(data.id<=predecessor.id)throw Error('WP3_UPGRADE_ID_MUST_ADVANCE '+predecessor.id+' -> '+data.id);
 // WP3 is a controlled canary for Safari navigation, not a business release.
 // Fail closed if any bundled plugin or CSS code is modified.
 const changed=Object.keys(data.assets).filter(name=>data.assets[name]!==predecessor.assets?.[name]).sort();
 const allowedDiagnostic=new Set(['index.html','app.js','plugins/workspace/workspace.js','plugins/workspace/workspace-grid.js','plugins/workspace/ag-grid-base.min.css','plugins/chapter-boundary/boundary.js','plugins/chapter-boundary/legacy.js']);
 const normalize=source=>source.replace(/v4-\d{6}-\d{4}/g,'v4-RELEASE')
   .replace(/生成时间：\d{6}-\d{6}/g,'生成时间：TIMESTAMP');
 if(isThemeFix){
  // Explicit CSS-only UIC fix: preserve every code asset byte-for-byte apart
  // from stamped entry HTML/app JS; do not relax the original WP3 policy.
  const allowed=new Set(['app.js','index.html','build-info.json','plugins/chapter-boundary/legacy-theme.css']);
  const differences=[];
  for(const name of files){
   let old;try{old=await readFile(join(deployed,name))}catch{old=null}
   if(!old||!old.equals(await readFile(join(source,name))))differences.push(name);
  }
  for(const name of differences)if(!allowed.has(name))throw Error('WP3_THEME_FIX_UNEXPECTED_ASSET '+name);
  if(!differences.includes('plugins/chapter-boundary/legacy-theme.css'))
   throw Error('WP3_THEME_FIX_MISSING_TARGET_CSS');
  for(const name of ['app.js','index.html']){
   if(normalize(await readFile(join(deployed,name),'utf8'))!==
      normalize(await readFile(join(source,name),'utf8')))
    throw Error('WP3_THEME_FIX_UNEXPECTED_ENTRY_CHANGE '+name);
  }
  console.log('WP3_THEME_FIX_ONLY_CSS_CHANGED',JSON.stringify({from:predecessor.id,to:data.id,differences}));
 }else if(isSettingsThemeFix){
  // Strict settings-only scoped CSS release; shared settings implementation,
  // WCP, all other components, user data, and production remain untouched.
  const allowed=new Set(['app.js','index.html','build-info.json','plugins/settings/settings.js']);
  const differences=[];
  for(const name of files){
    let earlier;try{earlier=await readFile(join(deployed,name))}catch{earlier=null}
    if(!earlier||!earlier.equals(await readFile(join(source,name))))differences.push(name);
  }
  for(const name of differences){
    if(!allowed.has(name))throw Error('WP3_SETTINGS_THEME_UNEXPECTED_RUNTIME_CHANGE '+name);
  }
  if(!differences.includes('plugins/settings/settings.js'))throw Error('WP3_SETTINGS_THEME_CSS_NOT_CHANGED');
  const current=await readFile(join(source,'plugins/settings/settings.js'),'utf8');
  const previous=await readFile(join(deployed,'plugins/settings/settings.js'),'utf8');
  const first=current.indexOf('  /* SETTINGS_AG_SCOPED_DARK_THEME:');
  const last=first<0?-1:current.indexOf('  }\n',first);
  if(first<0||last<0||current.slice(0,first)+current.slice(last+4)!==previous)
    throw Error('WP3_SETTINGS_THEME_MODIFIED_NON_CSS_CODE');
  for(const name of ['app.js','index.html']){
   if(normalize(await readFile(join(deployed,name),'utf8'))!==
      normalize(await readFile(join(source,name),'utf8')))
    throw Error('WP3_SETTINGS_THEME_ENTRY_CODE_CHANGED '+name);
  }
  console.log('WP3_SETTINGS_THEME_ONLY_CSS_PASS',JSON.stringify({from:predecessor.id,to:data.id,differences}));
 }else if(isHeaderGeometryFix){
  // TOPBAR-01 only: exactly ONE module-independent shell CSS edit plus
  // automatically stamped build ids. Never include app/other module changes.
  const allowed=new Set(['index.html','app.js','build-info.json','assets/v4.css']);
  const differences=[];
  for(const name of files){
   let earlier;try{earlier=await readFile(join(deployed,name))}catch{earlier=null}
   if(!earlier||!earlier.equals(await readFile(join(source,name))))differences.push(name);
  }
  for(const name of differences){
   if(!allowed.has(name))throw Error('WP3_TOPBAR_FIX_UNRELATED_RUNTIME_CHANGE '+name);
  }
  if(!differences.includes('assets/v4.css'))throw Error('WP3_TOPBAR_FIX_NO_SCOPED_CSS');
  const cssNow=await readFile(join(source,'assets/v4.css'),'utf8');
  const cssOld=await readFile(join(deployed,'assets/v4.css'),'utf8');
  const marker='/* TOPBAR-01:';
  const start=cssNow.indexOf(marker);
  if(start<0||cssNow.slice(0,start).trimEnd()!==cssOld.trimEnd()||
     !cssNow.slice(start).includes('#v4-workflow-controls'))
   throw Error('WP3_TOPBAR_FIX_MODIFIED_OTHER_CSS');
  for(const name of ['app.js','index.html']){
   if(normalize(await readFile(join(deployed,name),'utf8'))!==
      normalize(await readFile(join(source,name),'utf8')))
    throw Error('WP3_TOPBAR_FIX_MODIFIED_ENTRY '+name);
  }
  console.log('WP3_TOPBAR_GEOMETRY_ONLY_CSS_PASS',JSON.stringify({from:predecessor.id,to:data.id,differences}));
 }else if(isLocalFastStart){
  // Explicit single-feature scope: public component snapshots, WCP entry
  // loader preference, Settings local URL, Workspace theme+radio. Reject all
  // unrelated module, Vault, or CSS changes across the entire runtime tree.
  const allowed=new Set(['index.html','app.js','build-info.json',
    'plugins/settings/settings.js','plugins/workspace/workspace.js',
    'plugins/workspace/workspace-grid.js']);
  const differences=[];
  for(const name of files){
   let earlier;try{earlier=await readFile(join(deployed,name))}catch{earlier=null}
   const newer=await readFile(join(source,name));
   if(!earlier||!earlier.equals(newer))differences.push(name);
  }
  for(const name of differences){
   if(!allowed.has(name)&&!name.startsWith('vendor/'))
    throw Error('WP3_LOCAL_FAST_START_UNRELATED_CHANGE '+name);
  }
  if(!differences.some(name=>name.startsWith('vendor/'))||
     !differences.includes('plugins/workspace/workspace-grid.js')||
     !differences.includes('app.js'))throw Error('WP3_LOCAL_FAST_START_INCOMPLETE_DIFF');
  if(!Object.keys(data.assets).some(name=>name.startsWith('vendor/wcp/')))
   throw Error('WP3_LOCAL_FAST_START_UNHASHED_VENDOR');
  console.log('WP3_LOCAL_FAST_START_SCOPED_FILES_PASS',JSON.stringify({
    from:predecessor.id,to:data.id,differences:differences.length,vendorFiles:differences.filter(x=>x.startsWith('vendor/')).length}));
 }else if(!isDiagnostic){
  if(JSON.stringify(changed)!==JSON.stringify(['app.js','index.html']))
   throw Error('WP3_UPGRADE_NOT_VERSION_ONLY '+changed.join(','));
  for(const name of changed){
   const earlier=normalize(await readFile(join(deployed,name),'utf8'));
   const newer=normalize(await readFile(join(source,name),'utf8'));
   if(earlier!==newer)throw Error('WP3_UPGRADE_RUNTIME_CODE_CHANGED '+name);
  }
  console.log('WP3_CANARY_VERSION_ONLY',JSON.stringify({from:predecessor.id,to:data.id}));
 }else{
  // An explicit WP3 diagnostic canary has a *narrow* code-change whitelist.
  // Compare the ENTIRE runtime package, including unhased auxiliary JS assets.
  const differences=[];
  for(const name of files){
   let earlier;try{earlier=await readFile(join(deployed,name))}catch{earlier=null}
   const newer=await readFile(join(source,name));
   if(!earlier||!earlier.equals(newer))differences.push(name);
  }
  for(const name of differences){
   if(name==='build-info.json')continue;
   if(!allowedDiagnostic.has(name))throw Error('WP3_DIAGNOSTIC_UNAUTHORIZED_RUNTIME_CHANGE '+name);
  }
  for(const name of ['app.js','index.html']){
   const earlier=normalize(await readFile(join(deployed,name),'utf8'));
   const newer=normalize(await readFile(join(source,name),'utf8'));
   if(earlier!==newer)throw Error('WP3_DIAGNOSTIC_ENTRY_CODE_CHANGED '+name);
  }
  const workspaceChanged=differences.includes('plugins/workspace/workspace.js');
  const boundaryAdapters=['plugins/chapter-boundary/boundary.js','plugins/chapter-boundary/legacy.js']
    .filter(name=>differences.includes(name));
  if(boundaryAdapters.length>1)throw Error('WP3_DIAGNOSTIC_MULTIPLE_BOUNDARY_CODE_CHANGES');
  const boundaryChanged=boundaryAdapters.length===1;
  if(Number(workspaceChanged)+Number(boundaryChanged)!==1)
   throw Error('WP3_DIAGNOSTIC_REQUIRES_ONE_MODULE_CHANGE');
  console.log('WP3_DIAGNOSTIC_CODE_WHITELIST_PASS',JSON.stringify({from:predecessor.id,to:data.id,differences}));
 }
}
const run=(file,env={},timeout=260000)=>{
 const r=spawnSync(process.execPath,[file],{cwd:repo,env:{...process.env,...env},stdio:'inherit',timeout});
 if(r.status!==0)throw Error('WP3_PREDEPLOY_TEST_FAILED '+file+' status='+r.status);
};
// Already-built candidate is tested as-is, never restamp or modify it here.
// Diagnostic changes to the boundary adapter require the real-document retry
// regression; boot-only and global-DOM row counts cannot detect orphan views.
if(isDiagnostic&&
 (await readFile(join(source,'plugins/chapter-boundary/boundary.js'),'utf8'))!==
 (await readFile(join(deployed,'plugins/chapter-boundary/boundary.js'),'utf8'))){
 run('ui-spikes/v4-directory/tests/boundaryMountRecoveryBrowser.mjs');
 run('ui-spikes/v4-directory/tests/topbarModuleSwitchGeometryBrowser.mjs',{},145000);
}
if(isDiagnostic&&
 !(await readFile(join(source,'plugins/chapter-boundary/legacy.js'))).equals(
  await readFile(join(deployed,'plugins/chapter-boundary/legacy.js')))){
 run('ui-spikes/v4-directory/tests/markingsReadback.test.mjs');
 // The rebuilt editor must still show the real book; never write user's Vault.
 run('ui-spikes/v4-directory/tests/boundaryMountRecoveryBrowser.mjs');
}
run('ui-spikes/v4-directory/tests/wp2UpgradeGate.mjs',
 isUpgrade?{WP2_STABLE:deployed,WP2_CANDIDATE:source}:{});
if(isUpgrade&&(isDiagnostic||isThemeFix||isSettingsThemeFix||isLocalFastStart||isHeaderGeometryFix)){
 // WP2's boot test cannot catch the iPhone issue where the grid is healthy
 // but the rows are physically outside its visible viewport. Hard gate it.
 run('ui-spikes/v4-directory/tests/wp3DirectoryRowsUpgradeBrowser.mjs',{
  WP3_OLD_ROOT:deployed,WP3_NEW_ROOT:source,
  WP3_EXPECT_GRID_HEALTH:'1',WP3_REQUIRE_VISIBLE_MOUNT:'1',WP3_REQUIRE_DARK_GRID:'1',WP3_REQUIRE_PINNED_SPACER_GUARD:'1',WP3_REQUIRE_PINNED_SPACER_GUARD:'1'});
}

if(isThemeFix)run('ui-spikes/v4-directory/tests/chapterBoundaryThemeIsolationBrowser.mjs',{},110000);
if(isSettingsThemeFix)run('ui-spikes/v4-directory/tests/settingsAgThemeIsolationBrowser.mjs',{},185000);
if(isLocalFastStart)run('ui-spikes/v4-directory/tests/localDependenciesWorkspaceSelectionBrowser.mjs',{},140000);
if(isHeaderGeometryFix)run('ui-spikes/v4-directory/tests/topbarModuleSwitchGeometryBrowser.mjs',{},145000);
const unique=data.id+'-'+randomUUID();
const stage=join(root,'.v4-wp3-stage-'+unique);
await mkdir(stage,{recursive:false});
for(const file of files){
 await mkdir(join(stage,relative(source,join(source,file)).split('/').slice(0,-1).join('/')),{recursive:true});
 await cp(join(source,file),join(stage,file));
}
await validate(stage);
// Retain the entire previous canary for immediate rollback.
const previousPath=predecessor?join(root,'.v4-wp3-previous-'+predecessor.id+'-'+randomUUID()):null;
if(predecessor){
 const current=JSON.parse(await readFile(join(deployed,'build-info.json'),'utf8'));
 if(current.id!==predecessor.id)throw Error('WP3_CONCURRENT_UPDATE_DETECTED');
 await rename(deployed,previousPath);
 try{await rename(stage,deployed)}catch(error){await rename(previousPath,deployed);throw error}
}else{
 try{await stat(deployed);throw Error('WP3_CANDIDATE_ALREADY_EXISTS_NO_OVERWRITE')}catch(e){if(e.code!=='ENOENT')throw e}
 await rename(stage,deployed);
}
try{
 const head={headers:{'User-Agent':'OCR2MD-WP3-Public-Candidate-Verification'},cache:'no-store'};
 for(const base of [internal,publicUrl]){
  // Cloudflare edge can briefly return the preceding directory after an
  // atomic origin swap. Wait a bounded interval for the EXACT candidate ID;
  // never accept stale IDs and always roll back if convergence fails.
  let response,observed='HTTP_ERROR';
  for(let attempt=0;attempt<=(base===publicUrl?12:0);attempt++){
   try{
    response=await fetch(base+'build-info.json?t='+Date.now()+'-check-'+attempt,head);
    observed=response.ok?(await response.json()).id:'HTTP_'+response.status;
   }catch(error){observed='NETWORK_'+String(error).slice(0,90)}
   if(observed===data.id)break;
   if(attempt>=12||base!==publicUrl)break;
   console.log('WP3_WAIT_PUBLIC_RELEASE_CONVERGENCE',JSON.stringify({attempt,expected:data.id,observed}));
   await new Promise(resolve=>setTimeout(resolve,5500));
  }
  if(observed!==data.id)throw Error('WP3_RELEASE_VERSION_MISMATCH '+base+' observed='+observed+' expected='+data.id);
  const doc=await fetch(base+'?verify='+data.id,head);
  if(!doc.ok||(await doc.text()).includes('data-build-id="'+data.id+'"')===false)throw Error('WP3_RELEASE_HTML_MISMATCH '+base);
  for(const [file,digest] of Object.entries(checksums)){
   if(file==='index.html')continue; // Cloudflare may inject an analytics script.
   const url=base+file+'?v='+data.id;
   const res=await fetch(url,head);
   if(!res.ok)throw Error('WP3_HTTP_ASSET_FAILED '+url+' '+res.status);
   const actual=createHash('sha256').update(Buffer.from(await res.arrayBuffer())).digest('hex');
   if(actual!==digest)throw Error('WP3_HTTP_ASSET_HASH_FAILED '+file+' '+base);
  }
  console.log('WP3_STATIC_ORIGIN_VERIFIED',base,data.id);
 }
 const linked=spawnSync(process.execPath,['ui-spikes/v4-directory/scripts/link-lan-origin.mjs','--check'],
  {cwd:repo,stdio:'inherit',timeout:80000});
 if(linked.status!==0)throw Error('WP3_POSTPROMOTION_LAN_ALIAS_FAILED');
 console.log('WP3_PUBLIC_CANDIDATE_RELEASE_PASS',JSON.stringify({id:data.id,url:publicUrl,stable:stableData.id,previous:predecessor?.id??null,rollback:previousPath,assets:files.length,hashed:Object.keys(checksums).length}));
}catch(e){
 const failed=join(root,'.v4-wp3-failed-'+unique);
 await rename(deployed,failed);
 if(previousPath)await rename(previousPath,deployed);
 console.error('WP3_ROLLED_BACK_CANDIDATE_PATH; preserved failure snapshot',failed);
 throw e;
}
