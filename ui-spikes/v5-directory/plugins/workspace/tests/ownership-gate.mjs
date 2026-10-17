/** Prevent a future workspace edit from silently recombining the old spaghetti. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const owner=read('plugins/workspace/workspace.js');
const service=read('plugins/workspace/directory-service.js');
const auth=read('plugins/workspace/device-auth.js');
const contracts=read('plugins/workspace/directory-contracts.js');
const descriptor=JSON.parse(read('plugins/workspace/plugin.json'));
const registry=read('plugins/registry.generated.js');
assert.equal(descriptor.enabled,true,'accepted workspace must appear in live registry');
assert.deepEqual(descriptor.actions?.map(a=>a.id),
 ['workspace-parent','workspace-refresh','workspace-set-root','workspace-layout-mode'],
 'all Workspace buttons must be owned by the standard WCP action toolbar');
assert(!owner.includes('workspace-module-tools'),
 'do not reintroduce a flex-growing, in-content duplicate toolbar');
assert(registry.includes('workspace/index.js'));
assert(registry.includes('ocr2md:workspace'));
assert.deepEqual(JSON.parse(read('plugins/filesystem/plugin.json')).enabled,false);
for(const word of ['v4-module-mount','v4-top-actions','document.body.dataset','document.body.append','SHARED_SOURCE_UPSTREAM','document.getElementById(', 'boundary.ir.', 'clean.chapter.'])
 assert(!owner.includes(word),'V4/global/business coupling reintroduced: '+word);
assert(owner.includes("import {ResidentHost} from '../../components/resident.js'"),
 'Workspace may preserve DOM only through the published shared ResidentHost API');
for(const word of ['boundary.ir.','clean.chapter.','DIRjson','/chapters/commit','/ir/','POST','PUT','DELETE',"request('read'","request('pair'"])
 assert(!service.includes(word),'Directory service crossed ownership: '+word);
for(const word of ['boundary.ir.','clean.chapter.','ocr2md:chapter-boundary','ocr2md:mopjo'])
 assert(!contracts.includes(word),'Workspace contract imported other business owner: '+word);
assert(service.includes("method")===false,'Do not expose generic filesystem request method');
for(const name of ['status','authorize','list','activate','current','selected'])
 assert(contracts.includes('workspace.'+name),'Missing public directory contract '+name);
assert(!contracts.includes('workspace.preview'),'Workspace may not read file contents');
assert(!contracts.includes('pdfCount'),'Workspace may not classify books');
assert(auth.includes("const url='/__v5/auth/remember'"),'device auth must use only its gateway endpoint');
assert(!auth.includes('localStorage')&&!auth.includes('sessionStorage'),'device auth must not persist Vault keys');
assert(existsSync(resolve(root,'plugins/workspace/workspace-grid.js')));
const original=read('plugins/filesystem/workspace-fs.js');
assert(original.includes('boundary.ir.load')&&original.includes('clean.chapter.begin'),
 'historical debt remains quarantined and unchanged');
console.log('WORKSPACE_V5_OWNER_BOUNDARY_PASS',{active:true,pureDirectory:true,
  v4SelectorsAbsent:true,dirtyFilesystemQuarantined:true});
