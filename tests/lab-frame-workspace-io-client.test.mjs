/** Direct public F02 client API contract: methods, credentials, failures. */
import assert from 'node:assert/strict';
import {createFrameWorkspaceIO} from '../ui/frame/workspace-io.js';
const requests=[];
const adapter=createFrameWorkspaceIO({base:'/labs/lab-frame/api/workspace-io/',
  fetcher:async (url,options)=>{
    requests.push({url,...options});
    if(url.includes('/probe'))return {ok:true,json:async()=>({verified:true,readable:true,writable:true})};
    if(url.includes('/read'))return {ok:true,json:async()=>({contentBase64:'YWJj',sha256:'a'.repeat(64)})};
    if(url.includes('/list'))return {ok:true,json:async()=>({entries:[]})};
    return {ok:true,json:async()=>({created:true,replaced:true})};
  }});
const root='/tmp/Frame Books/current book';
assert.equal((await adapter.probe(root)).verified,true);
await adapter.listFiles(root,'sub dir');
await adapter.readFile(root,'notes.md');
await adapter.createFile(root,'sub/new.md','YWJj');
await adapter.replaceFile(root,'sub/new.md','eHl6','a'.repeat(64));
assert.deepEqual(requests.map(x=>x.method),['POST','GET','GET','POST','POST']);
assert(requests.every(x=>x.credentials==='same-origin'));
assert(requests[1].url.includes('workspace=%2Ftmp%2FFrame+Books%2Fcurrent+book'));
assert.deepEqual(JSON.parse(requests[4].body),{
  workspace:root,path:'sub/new.md',contentBase64:'eHl6',expectedSha256:'a'.repeat(64)});
const bad=createFrameWorkspaceIO({fetcher:async()=>({ok:false,status:403,json:async()=>({error:'无编辑授权'})})});
await assert.rejects(bad.probe(root),/无编辑授权/);
const falsePositive=createFrameWorkspaceIO({fetcher:async()=>({ok:true,json:async()=>({verified:true,readable:true,writable:false})})});
await assert.rejects(falsePositive.probe(root),/未完成/);
await assert.rejects(adapter.probe(''),/绑定工作目录/);
console.log('LAB_FRAME_PUBLIC_IO_CLIENT_PASS',requests.length);
