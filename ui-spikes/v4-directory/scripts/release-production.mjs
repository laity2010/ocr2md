/** WP4/4: promote a user-accepted public candidate byte-for-byte to stable V4.
 * Requires explicit --approve-build=<candidate id>; never rebuilds or edits
 * source, Vault, tunnel, backend, other module or user data. Any test failure
 * blocks release; preserves old stable as complete rollback snapshot.
 */
import {cp,mkdir,rename,readFile,readdir,stat} from 'node:fs/promises';
import {resolve,join,relative} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const root=resolve('ui-spikes/v2');
const unified=spawnSync(process.execPath,['ui-spikes/v4-directory/scripts/link-lan-origin.mjs','--check'],
 {cwd:resolve('.'),stdio:'inherit',timeout:80000});
if(unified.status!==0)throw Error('WP4_SINGLE_SOURCE_LAN_PUBLIC_AUDIT_FAILED');
const live=join(root,'v4-directory');
const candidate=join(root,'v4-wp3-candidate');
const production='https://ocr2md.laity.bid/v4-directory/';
const preflight='http://127.0.0.1:4176/v4-directory/';
const canary='https://ocr2md.laity.bid/v4-wp3-candidate/';
const flags=process.argv.slice(2);
const approved=flags.find(f=>f.startsWith('--approve-build='))?.split('=')[1];
if(flags.length!==1||!/^v4-\d{6}-\d{4}$/.test(approved??''))
 throw Error('WP4_USER_APPROVAL_REQUIRED --approve-build=v4-YYMMDD-HHMM');
const readInfo=async path=>JSON.parse(await readFile(join(path,'build-info.json'),'utf8'));
const old=await readInfo(live),next=await readInfo(candidate);
if(old.id>=next.id||next.id!==approved)
 throw Error('WP4_APPROVED_BUILD_MISMATCH: '+JSON.stringify({current:old.id,candidate:next.id,approved}));
if(Object.keys(next.assets??{}).length<8)throw Error('WP4_MANIFEST_UNEXPECTED');
const hash=buffer=>createHash('sha256').update(buffer).digest('hex');
const headers={headers:{'User-Agent':'OCR2MD-WP4-Release'},cache:'no-store'};
const info=async url=>{const resp=await fetch(url+'build-info.json?check='+Date.now(),headers);
 if(!resp.ok)throw Error('WP4_HTTP_'+resp.status+' '+url);
 return await resp.json();};
async function files(path,prefix=''){
 const out=[];
 for(const entry of await readdir(path,{withFileTypes:true})){
  if(entry.isSymbolicLink())throw Error('WP4_SYMLINK_REFUSED '+join(path,entry.name));
  if(entry.isDirectory())out.push(...await files(join(path,entry.name),prefix+entry.name+'/'));
  else if(entry.isFile())out.push(prefix+entry.name);
  else throw Error('WP4_UNSUPPORTED_DIRECTORY_ENTRY '+entry.name);
 }
 return out.sort();
}
async function verify(dir){
 const data=await readInfo(dir);
 if(JSON.stringify(data)!==JSON.stringify(next))throw Error('WP4_LOCAL_MANIFEST_MISMATCH '+dir);
 for(const [name,digest] of Object.entries(data.assets)){
  if(name.includes('..')||name.startsWith('/'))throw Error('WP4_ASSET_PATH_INVALID '+name);
  if(hash(await readFile(join(dir,name)))!==digest)throw Error('WP4_LOCAL_ASSET_HASH '+name);
 }
}
await verify(candidate);
const packageFiles=await files(candidate);
if(packageFiles.length<100||!packageFiles.includes('plugins/workspace/ag-grid-base.min.css'))
 throw Error('WP4_CANDIDATE_RUNTIME_INCOMPLETE');
const ps=spawnSync('ps',['-ax','-o','pid=,command='],{encoding:'utf8',timeout:5000});
if(ps.status!==0||!ps.stdout.includes('dev_server.py --bind 127.0.0.1 --port 4176 --directory '+root))
 throw Error('WP4_4176_STATIC_AND_VAULT_SERVICE_UNVERIFIED');
for(const [url,want] of [[preflight,old.id],[production,old.id],[canary,next.id]]){
 const meta=await info(url);
 if(meta.id!==want)throw Error('WP4_ORIGIN_VERSION_CHANGED '+url+' '+meta.id+' != '+want);
}
// Current live backend is already serving the accepted candidate on the SAME
// hostname and 4176 process. No backend restart or byte-changing rebuild.
// All release safety gates use HTTP fixture Vault responses (GET 401), never
// user cookies and never an authenticated or writable book.
const suffix=next.id+'-'+randomUUID();
const stageRoot=join(root,'.v4-wp4-stage-'+suffix);
const stage=join(stageRoot,'v4-directory');
const backup=join(root,'.v4-wp4-backup-'+old.id+'-'+randomUUID());
await mkdir(stageRoot,{recursive:false});
await cp(candidate,stage,{recursive:true});
await verify(stage);
const stageFiles=await files(stage);
if(JSON.stringify(stageFiles)!==JSON.stringify(packageFiles))throw Error('WP4_STAGED_FILE_INVENTORY_MISMATCH');
for(const file of packageFiles){
 if(hash(await readFile(join(stage,file)))!==hash(await readFile(join(candidate,file))))
  throw Error('WP4_STAGED_RUNTIME_FILE_MISMATCH '+file);
}
console.log('WP4_STAGED_SNAPSHOT_VERIFIED',JSON.stringify({from:old.id,to:next.id,files:stageFiles.length,manifestAssets:Object.keys(next.assets).length}));
function test(file,env={},timeout=260000){
 const result=spawnSync(process.execPath,[file],{cwd:resolve('.'),env:{...process.env,...env},stdio:'inherit',timeout});
 if(result.status!==0)throw Error('WP4_RELEASE_GATE_FAILED '+file+' '+result.status);
}
// Both browsers: 1024/768 version + viewport smoke, real WCP upgrade / errors,
// AND actual stable-0816 to approved-1400 5-row viewport + dark-theme check.
test('ui-spikes/v4-directory/tests/buildVersionBrowser.mjs',{V4_TEST_STATIC_ROOT:stageRoot},150000);
test('ui-spikes/v4-directory/tests/wp2UpgradeGate.mjs',{WP2_STABLE:live,WP2_CANDIDATE:stage});
test('ui-spikes/v4-directory/tests/wp3DirectoryRowsUpgradeBrowser.mjs',{
 WP3_OLD_ROOT:live,WP3_NEW_ROOT:stage,WP3_EXPECT_GRID_HEALTH:'1',
 WP3_REQUIRE_VISIBLE_MOUNT:'1',WP3_REQUIRE_DARK_GRID:'1',
 WP3_REQUIRE_PINNED_SPACER_GUARD:'1'});
for(const [url,want] of [[preflight,old.id],[production,old.id],[canary,next.id]]){
 if((await info(url)).id!==want)throw Error('WP4_CONCURRENT_CHANGE_BEFORE_PROMOTION '+url);
}
if((await readInfo(live)).id!==old.id|| (await readInfo(candidate)).id!==next.id)
 throw Error('WP4_LOCAL_CHANGED_BEFORE_PROMOTION');
// Two rename calls in same parent filesystem; preserve old folder entirely.
await rename(live,backup);
try{await rename(stage,live)}catch(e){await rename(backup,live);throw e}
try{
 for(const url of [preflight,production]){
  if((await info(url)).id!==next.id)throw Error('WP4_LIVE_WRONG_RELEASE '+url);
  const html=await fetch(url+'?build='+next.id,headers);
  if(!html.ok||!(await html.text()).includes('data-build-id="'+next.id+'"'))
   throw Error('WP4_LIVE_HTML_WRONG '+url);
  for(const [name,digest] of Object.entries(next.assets)){
   if(name==='index.html')continue; // CF adds analytics to HTML
   const response=await fetch(url+name+'?release='+next.id,headers);
   if(!response.ok||hash(Buffer.from(await response.arrayBuffer()))!==digest)
    throw Error('WP4_LIVE_HASH_WRONG '+url+name);
  }
  const agCss=await fetch(url+'plugins/workspace/ag-grid-base.min.css?release='+next.id,headers);
  if(!agCss.ok||hash(Buffer.from(await agCss.arrayBuffer()))!==hash(await readFile(join(candidate,'plugins/workspace/ag-grid-base.min.css'))))
   throw Error('WP4_LIVE_GRID_STYLES_MISSING '+url);
  console.log('WP4_POSTPROMOTION_HTTP_PASS',url,next.id);
 }
 // LAN aliases must immediately see the SAME switched production slot.
 const synced=spawnSync(process.execPath,['ui-spikes/v4-directory/scripts/link-lan-origin.mjs','--check'],
  {cwd:resolve('.'),stdio:'inherit',timeout:80000});
 if(synced.status!==0)throw Error('WP4_POSTPROMOTION_LAN_ALIAS_FAILED');
 console.log('WP4_PRODUCTION_PROMOTION_PASS',JSON.stringify({from:old.id,to:next.id,production,
  candidate:canary,backup,files:packageFiles.length}));
}catch(error){
 const rejected=join(root,'.v4-wp4-failed-'+suffix);
 await rename(live,rejected);
 await rename(backup,live);
 console.error('WP4_PRODUCTION_ROLLBACK_PASS',JSON.stringify({restored:old.id,failedSnapshot:rejected,error:String(error)}));
 throw error;
}
