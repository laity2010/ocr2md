import test from 'node:test';
import assert from 'node:assert/strict';
import {createReviewHistory} from '../ui/sentence/review-history.js';
test('CM6 native history stages reversible effects, commits only on acknowledgement',()=>{
 const h=createReviewHistory(),a={sourceLine:12,previousEngine:null,adoptedEngine:'intl'};
 const first=h.prepare(a);
 assert.deepEqual(h.depth(),{undo:0,redo:0});
 first.commit();assert.deepEqual(h.depth(),{undo:1,redo:0});
 const b={...a,previousEngine:'intl',adoptedEngine:'wink-nlp'};
 h.prepare(b).commit();
 assert.deepEqual(h.depth(),{undo:2,redo:0});
 const undo=h.prepareHistory('undo');
 assert.deepEqual(undo.change,{...b,previousEngine:'wink-nlp',adoptedEngine:'intl'});
 // Failure discards the staged transaction; history remains intact.
 assert.deepEqual(h.depth(),{undo:2,redo:0});
 h.prepareHistory('undo').commit();assert.deepEqual(h.depth(),{undo:1,redo:1});
 assert.deepEqual(h.prepareHistory('redo').change,b);
 h.prepareHistory('redo').commit();assert.deepEqual(h.depth(),{undo:2,redo:0});
 h.prepareHistory('undo').commit();
 h.prepare({...a,previousEngine:'intl',adoptedEngine:null}).commit();
 assert.deepEqual(h.depth(),{undo:2,redo:0});
 h.reset();assert.deepEqual(h.depth(),{undo:0,redo:0});
});

import {createMDLineSnapshot,sha256} from '../ui/sentence/snapshot.js';
import {applyArbitrationRows,requestArbitration} from '../ui/sentence/persisted.js';
test('arbitration receipt is line-local, exact, candidate-bound and source-bound',async()=>{
 const snapshot=await createMDLineSnapshot('A. B.\n\n');
 const candidates_json=JSON.stringify(Object.fromEntries(['intl','sentence-splitter','wink-nlp'].map((id,i)=>[id,{status:'ok',version:'fixture',boundaries:i===1?[]:[2],protected_ranges:[]}])));
 const a={source_document_hash:snapshot.documentVersion,source_line:1,source_line_hash:snapshot.lines[0].sha256,sentence_index:0,from_utf16:0,to_utf16:5,sentence_text:'A. B.',line_eol:'\n',candidates_json,review_state:'disputed',adopted_engine:null};
 const b={...a,source_line:2,source_line_hash:snapshot.lines[1].sha256,to_utf16:0,sentence_text:'',review_state:'no_split'};
 const change={sourceLine:1,previousEngine:null,adoptedEngine:'intl'};
 const changed=[{...a,to_utf16:2,sentence_text:'A.',line_eol:'',review_state:'adopted',adopted_engine:'intl'},
  {...a,sentence_index:1,from_utf16:2,sentence_text:' B.',candidates_json:null,review_state:null,adopted_engine:null}];
 const result=applyArbitrationRows(snapshot,[a,b],change,changed);
 assert.deepEqual(result.rows,[...changed,b]);assert.equal(result.rows[2],b);assert.equal(result.reviewLine.adoptedEngine,'intl');
 for(const invalid of [[{...changed[0],sentence_text:'X.'},changed[1]], [{...changed[0],candidates_json:'{}'},changed[1]], [...changed,b], [{...a,adopted_engine:'intl',review_state:'adopted'}]]){
  assert.throws(()=>applyArbitrationRows(snapshot,[a,b],change,invalid));
 }
 const digest=await sha256(candidates_json);
 const receipt=await requestArbitration('/isolated',snapshot,[a,b],change,{fetcher:async(url,opts)=>{
  assert.equal(url,'/labs/lab-sentence/api/sentence/arbitrate');
  assert.deepEqual(JSON.parse(opts.body),{workspace:'/isolated',source_document_hash:snapshot.documentVersion,source_line:1,source_line_hash:a.source_line_hash,candidates_hash:digest,previous_engine:null,adopted_engine:'intl'});
  return {ok:true,json:async()=>({state:'ready',source_document_hash:snapshot.documentVersion,rows:changed})};
 }});
 assert.deepEqual(receipt,result);
 await assert.rejects(requestArbitration('/isolated',snapshot,[a,b],change,{fetcher:async()=>({ok:false,status:409,json:async()=>({error:'conflict'})})}),/conflict/);
 assert.deepEqual([a,b].map(r=>r.adopted_engine),[null,null]);
});
