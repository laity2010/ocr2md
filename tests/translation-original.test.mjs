import assert from 'node:assert/strict';
import test from 'node:test';
import {createHash} from 'node:crypto';
import {validateOriginalSnapshot,readOriginalSnapshot,createOriginalSession,canonicalRows} from '../ui/translation/original-sentences.js';
import {sampleSnapshot} from './translation-original-fixture.mjs';
test('original snapshot preserves exact RAW and every field, verifies identity, and freezes references',async()=>{
 const input=await sampleSnapshot();const result=await validateOriginalSnapshot(input);
 assert.deepEqual(result,input);assert(Object.isFrozen(result.rows[0]));assert(Object.isFrozen(result.rows));
 assert.equal(result.rows.map(x=>x.raw).join(''),'# Heading\n\n> A. B. 😀\n<table><tr><td>Text</td></tr></table>\n');
 assert.equal(createHash('sha256').update(canonicalRows(input.rows)).digest('hex'),input.sentence_sha256);
 for(const change of [x=>x.rows[0].raw+='bad',x=>x.rows[1].type='other',x=>x.rows.reverse(),x=>x.rows[1].sentence_index=3,x=>x.rows[0].level='x',x=>x.source_document_hash='a'.repeat(64),x=>x.rows[0].extra='bad']){
   const bad=structuredClone(input);change(bad);await assert.rejects(validateOriginalSnapshot(bad));
 }
});
test('public GET only, no cache, same-origin; errors not accepted',async()=>{
 const input=await sampleSnapshot();let calls=0;
 const result=await readOriginalSnapshot('/book & 1',{fetcher:async(url,options)=>{
  calls++;assert.equal(new URL(url,'https://demo').searchParams.get('workspace'),'/book & 1');assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.credentials,'same-origin');assert.equal(options.body,undefined);return {ok:true,json:async()=>input};
 }});assert.deepEqual(result,input);assert.equal(calls,1);
 await assert.rejects(readOriginalSnapshot('/book',{fetcher:async()=>({ok:false,json:async()=>({error:'旧句表'})})}),/旧句表/);
});
test('generation isolation, same-book refresh, failure clears data, invalidation aborts late replies',async()=>{
 const snapshots=[await sampleSnapshot(),await sampleSnapshot(' new')],pending=[],events=[];
 const session=createOriginalSession({reader:(path,{signal})=>new Promise((resolve,reject)=>pending.push({path,signal,resolve,reject})),onChange:value=>events.push(value?.workspace??null)});
 const first=session.initialize('/a');const second=session.initialize('/b');assert.equal(pending[0].signal.aborted,true);pending[1].resolve(snapshots[1]);await second;pending[0].resolve(snapshots[0]);assert.equal(await first,null);assert.equal(session.current.workspace,'/b');
 const refresh=session.initialize('/b');assert.equal(session.current.snapshot,snapshots[1]);pending[2].resolve(snapshots[0]);await refresh;assert.equal(session.current.snapshot,snapshots[0]);
 const fail=session.initialize('/b');pending[3].reject(Error('stale'));await assert.rejects(fail,/stale/);assert.equal(session.current,null);
 const late=session.initialize('/a');session.invalidate();pending[4].resolve(snapshots[0]);assert.equal(await late,null);assert.equal(session.current,null);
 assert(events.includes('/b'));assert.equal(events.at(-1),null);
});
