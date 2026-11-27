import assert from 'node:assert/strict';
import test from 'node:test';
import {sampleSnapshot} from './translation-original-fixture.mjs';
import {preparedFixture} from './translation-preparation-fixture.mjs';
import {validatePreparation,initializePreparation,initializeTable,loadTable} from '../ui/translation/preparation.js';
test('actual Python preparation projected without losing source; rejects bad ranges, identity and flags',async()=>{
  const original=await sampleSnapshot('',true),result=preparedFixture(original),value=validatePreparation(result,original);
  assert.equal(value.rows.length,5);
  assert.equal(value.rows.at(-1).translatable,false);
  assert.equal(value.rows.at(-1).protected.map(x=>x.text).join(''),value.rows.at(-1).raw);
  assert(value.rows[3].protected.some(x=>x.kind==='html_tag'));
  assert(Object.isFrozen(value.rows[3].protected[0]));
  for(const change of [x=>x.rows[0].raw+='x',x=>x.rows[0].text+='x',x=>x.rows.reverse(),x=>x.rows[0].protected[0].to++,x=>x.rows.at(-1).protected=[],x=>x.rows[0].translatable=false,x=>x.rows[0].sentence_sha256='x']){
    const bad=structuredClone(result);change(bad);assert.throws(()=>validatePreparation(bad,original));
  }
});
test('client only POSTs source identity; failure remains failure',async()=>{
  const original=await sampleSnapshot('',true),result=preparedFixture(original);
  const value=await initializePreparation('/book',original,{fetcher:async(url,opt)=>{
    assert.equal(url,'/labs/lab-translation/api/translation/initialize');assert.equal(opt.method,'POST');assert.equal(opt.credentials,'same-origin');
    assert.deepEqual(JSON.parse(opt.body),{workspace:'/book',source_document_hash:original.source_document_hash,sentence_sha256:original.sentence_sha256});
    return {ok:true,json:async()=>result};
  }});
  assert.deepEqual(value,result);
  await assert.rejects(initializePreparation('/book',original,{fetcher:async()=>({ok:false,json:async()=>({error:'拒绝覆盖'})})}),/拒绝覆盖/);
});

test('single logical init: transient GET then POST; cancellation or failure never returns a partial table',async()=>{
 const original=await sampleSnapshot(' ⟦P0⟧',true),result=preparedFixture(original),calls=[];
 const fetcher=async(url,opt)=>{calls.push(opt.method);return {ok:true,json:async()=>opt.method==='GET'?original:result};};
 assert.deepEqual(await initializeTable('/book',{fetcher}),result);
 assert.deepEqual(calls,['GET','POST']);
 const controller=new AbortController();
 await assert.rejects(initializeTable('/book',{signal:controller.signal,fetcher:async()=>{controller.abort();return {ok:true,json:async()=>original};}}),/取消/);
 await assert.rejects(initializeTable('/book',{fetcher:async(url,opt)=>opt.method==='GET'?{ok:true,json:async()=>original}:{ok:false,json:async()=>({error:'拒绝覆盖'})}}),/拒绝覆盖/);
});


test('saved table GET only; missing/legacy distinct; ready digest and refill verified',async()=>{
  const original=await sampleSnapshot('',true),ready=preparedFixture(original,'ready');
  const fetchValue=value=>async(url,opt)=>{
    assert.equal(url,'/labs/lab-translation/api/translation/load?workspace=%2Fbook');
    assert.equal(opt.method,'GET');assert.equal(opt.credentials,'same-origin');assert.equal(opt.body,undefined);
    return {ok:true,json:async()=>value};
  };
  assert.deepEqual(await loadTable('/book',{fetcher:fetchValue(ready)}),ready);
  for(const state of ['missing','legacy'])assert.deepEqual(await loadTable('/book',{fetcher:fetchValue({schema:ready.schema,state})}),{state});
  const wrong=structuredClone(ready);wrong.source_document_hash='0'.repeat(64);
  for(const r of wrong.rows)r.source_document_hash=wrong.source_document_hash;
  await assert.rejects(loadTable('/book',{fetcher:fetchValue(wrong)}),/摘要/);
  await assert.rejects(loadTable('/book',{fetcher:async()=>({ok:false,json:async()=>({error:'来源已变化'})})}),/来源已变化/);
});
