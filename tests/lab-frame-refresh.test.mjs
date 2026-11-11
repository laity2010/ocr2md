import assert from 'node:assert/strict';
import test from 'node:test';
import {shouldReload,startFrameAutoUpdate} from '../ui/frame/refresh.js';

test('F04 exact lab-frame manifest is the only update trigger',()=>{
  assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'lab-frame',version:'v1'}),false);
  assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'lab-frame',version:'v2'}),true);
  assert.equal(shouldReload('v1',{schema:'ocr2md-frame/v1',name:'ocr-review',version:'v2'}),false);
  assert.equal(shouldReload('v1',{schema:'untrusted',name:'lab-frame',version:'v2'}),false);
});

test('F03 update is immediately reloaded, without save or beforeunload',async()=>{
  let reloads=0,requests=0,listener=null;
  const doc={visibilityState:'visible',addEventListener:(name,fn)=>{assert.equal(name,'visibilitychange');listener=fn;},removeEventListener:()=>{listener=null;}};
  const status=[];
  const handle=startFrameAutoUpdate({version:'v1',documentRef:doc,intervalMs:60000,
    report:(message,kind)=>status.push([message,kind]),reload:()=>{reloads++;},
    fetchVersion:async()=>{requests++;return {schema:'ocr2md-frame/v1',name:'lab-frame',version:'v2'};}});
  assert.equal(await handle.check(),true);
  assert.equal(reloads,1);
  assert.equal(await handle.check(),false);
  assert.equal(reloads,1);
  assert.equal(requests,1);
  assert.match(status[0][0],/自动更新/);
  handle.dispose();assert.equal(listener,null);
});
