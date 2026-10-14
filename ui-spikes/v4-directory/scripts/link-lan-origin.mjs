/** One build, two static routes: replace obsolete LAN FastDev V4 copies with
 * links to the SAME canonical release slots served by Cloudflare / 4176.
 * One-time migration is idempotent; never touches Obsidian, server processes,
 * WCP modules or existing public release folders. Old LAN copies are archived
 * outside the HTTP-served FastDev stage, not deleted.
 *
 * IMPORTANT: LAN FastDev currently uses HTTP. The static file linkage is
 * correct but Safari WCP still requires a trusted HTTPS origin to run.
 */
import {realpath,readFile,rename,symlink,lstat,mkdir,readdir} from 'node:fs/promises';
import {resolve,join,dirname} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
const project=resolve('ui-spikes/v2');
const stageRoot=resolve(process.env.OCR2MD_FASTDEV_STAGE??'/tmp/wcp-tripane-lan-v4-20261013/stage');
const local='http://192.168.1.10:4292/';
const names=['v4-directory','v4-wp3-candidate'];
const workdir=resolve('.');
const auditOnly=process.argv.includes('--check');
if(process.argv.slice(2).some(flag=>flag!=='--check'))throw Error('UNKNOWN_ARGUMENT');
const processList=spawnSync('ps',['-ax','-o','pid=,command='],{encoding:'utf8',timeout:5000});
if(processList.status!==0||!processList.stdout.includes('fastdev-lan-server.py 192.168.1.10 4292 '+stageRoot))
 throw Error('LAN_SERVER_TOPOLOGY_CHANGED_OR_NOT_RUNNING');
if(!processList.stdout.includes('dev_server.py --bind 127.0.0.1 --port 4176 --directory '+project))
 throw Error('PUBLIC_CANONICAL_SERVER_TOPOLOGY_CHANGED');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const version=async path=>JSON.parse(await readFile(join(path,'build-info.json'),'utf8'));
const expected=new Map();
for(const name of names){
 const path=join(project,name);
 if((await realpath(path))!==path)throw Error('CANONICAL_RELEASE_IS_NOT_REAL_DIRECTORY '+name);
 const info=await version(path);
 if(!/^v4-\d{6}-\d{4}$/.test(info.id)||Object.keys(info.assets??{}).length<8)
  throw Error('CANONICAL_RELEASE_INCOMPLETE '+name);
 for(const [file,digest] of Object.entries(info.assets)){
  if(file.startsWith('/')||file.split('/').includes('..')||hash(await readFile(join(path,file)))!==digest)
   throw Error('CANONICAL_ASSET_HASH_BAD '+name+' '+file);
 }
 expected.set(name,{path,info});
}
await realpath(stageRoot); // refuse non-existent stage rather than silently create one
const statuses=[];
for(const name of names){
 const path=join(stageRoot,name);
 let exists=true,st;
 try{st=await lstat(path)}catch(e){if(e.code==='ENOENT')exists=false;else throw e}
 const target=expected.get(name).path;
 if(exists&&st.isSymbolicLink()){
  const actual=await realpath(path);
  if(actual!==target)throw Error('LAN_ALIAS_POINTS_TO_UNKNOWN_SOURCE '+name);
  statuses.push({name,status:'already-linked',version:expected.get(name).info.id});
 }else if(exists&&st.isDirectory()){
  if(auditOnly)throw Error('LAN_STILL_HAS_INDEPENDENT_STATIC_COPY '+name);
  // Rename instead of deleting. These archives are OUTSIDE the published
  // static directory and contain exactly the old staging bytes.
  const archiveRoot=join(dirname(stageRoot),'retained-pre-unification-static');
  await mkdir(archiveRoot,{recursive:true});
  const backup=join(archiveRoot,name+'-'+randomUUID());
  const temp=join(stageRoot,'.prepared-link-'+name+'-'+randomUUID());
  await symlink(target,temp,'dir');
  await rename(path,backup);
  try{await rename(temp,path)}catch(e){await rename(backup,path);throw e}
  statuses.push({name,status:'migrated',archive:backup,version:expected.get(name).info.id});
 }else if(!exists){
  if(auditOnly)throw Error('LAN_STATIC_ALIAS_MISSING '+name);
  const tmp=join(stageRoot,'.prepared-link-'+name+'-'+randomUUID());
  await symlink(target,tmp,'dir');await rename(tmp,path);
  statuses.push({name,status:'linked',version:expected.get(name).info.id});
 }else throw Error('LAN_STATIC_SLOT_NOT_DIRECTORY '+name);
}
for(const name of names){
 const expectedPath=expected.get(name).path;
 if((await realpath(join(stageRoot,name)))!==expectedPath)throw Error('LAN_RELEASE_ALIAS_REALPATH_MISMATCH '+name);
 const info=expected.get(name).info;
 const response=await fetch(local+name+'/build-info.json?validate='+Date.now(),{cache:'no-store'});
 if(!response.ok)throw Error('LAN_ALIAS_HTTP_FAIL '+name+' '+response.status);
 const served=await response.json();
 if(JSON.stringify(served)!==JSON.stringify(info))throw Error('LAN_ALIAS_BUILD_DIFFERS_FROM_PUBLIC '+name);
 const html=await (await fetch(local+name+'/?build='+info.id,{cache:'no-store'})).text();
 if(!html.includes('data-build-id="'+info.id+'"'))throw Error('LAN_ALIAS_HTML_BUILD_MISMATCH '+name);
 for(const [file,digest] of Object.entries(info.assets)){
  const res=await fetch(local+name+'/'+file+'?unified='+info.id,{cache:'no-store'});
  if(!res.ok||hash(Buffer.from(await res.arrayBuffer()))!==digest)throw Error('LAN_ALIAS_ASSET_HASH_MISMATCH '+name+' '+file);
 }
 console.log('OCR2MD_ONE_RELEASE_TWO_STATIC_ROUTES_PASS',JSON.stringify({name,build:info.id,
   samePhysicalDirectory:true,verifiedAssets:Object.keys(info.assets).length,lan:local+name+'/',canonical:expectedPath}));
}
console.log('OCR2MD_LAN_STATIC_UNIFICATION_PASS',JSON.stringify({statuses,auditOnly}));
