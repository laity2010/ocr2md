import test from 'node:test';
import assert from 'node:assert/strict';
import {createMDLineSnapshot,sha256} from '../ui/sentence/snapshot.js';
import {createReviewSession,choiceRows} from '../ui/sentence/review-session.js';
import {saveSentenceChoices} from '../ui/sentence/persisted.js';
async function fixture(){
 const snapshot=await createMDLineSnapshot('A. B.\nC. D.\n');
 const candidates_json=JSON.stringify(Object.fromEntries(['intl','sentence-splitter','wink-nlp'].map((id,i)=>[id,{status:'ok',version:'fixture',boundaries:i===1?[]:[2],protected_ranges:[]}])));
 const rows=snapshot.lines.map(l=>({source_document_hash:snapshot.documentVersion,source_line:l.sourceLine,source_line_hash:l.sha256,sentence_index:0,from_utf16:0,to_utf16:l.text.length,raw:l.text+l.ownedTail,type:l.type,level:l.level,candidates_json,review_state:'disputed',adopted_engine:null}));
 return {snapshot,rows};
}
function clock(){
 let n=0;const queue=new Map();
 return {set(fn,delay){assert.equal(delay,850);queue.set(++n,fn);return n;},clear(id){queue.delete(id);},size:()=>queue.size,tick(){const work=[...queue.values()];queue.clear();for(const fn of work)fn();}};
}
test('native CM6 history, immediate row projection, zero writes for net-zero edits, one final batch',async()=>{
 const {snapshot,rows}=await fixture(),timer=clock(),sent=[];
 const s=createReviewSession(snapshot,rows,{save:async b=>{sent.push(b)},timers:timer});
 assert(s.choose(1,'intl'));assert.equal(s.rows().length,3);
 assert.equal(s.history('undo'),1);assert.equal(s.rows().length,2);
 assert.equal(s.history('redo'),1);assert.equal(s.history('undo'),1);
 assert.equal(timer.size(),0);timer.tick();assert.equal(sent.length,0);
 s.choose(1,'intl');s.choose(1,'wink-nlp');s.choose(2,'intl');
 assert.equal(s.rows().length,4);assert.equal(sent.length,0);assert.equal(timer.size(),1);
 timer.tick();assert(await s.flush());assert.equal(sent.length,1);
 assert.deepEqual(sent[0].map(c=>[c.line,c.previous,c.next]),[[1,null,'wink-nlp'],[2,null,'intl']]);
 assert.equal(s.pending(),false);assert.equal(s.depth().undo,3);
 s.history('undo');s.history('redo');timer.tick();assert.equal(sent.length,1);
 s.dispose();
});
test('edits during in-flight request are immediate; late ack never replaces newer choices; failure retains history and retry',async()=>{
 const {snapshot,rows}=await fixture(),timer=clock(),sent=[];
 let release,fail=false;
 const s=createReviewSession(snapshot,rows,{timers:timer,save:b=>{sent.push(b);if(fail)return Promise.reject(Error('offline'));return new Promise(resolve=>release=resolve);}});
 s.choose(1,'intl');timer.tick();assert.equal(sent.length,1);
 s.choose(1,'sentence-splitter');s.choose(2,'intl');assert.equal(s.rows().length,3);assert.equal(s.choices().get(1),'sentence-splitter');
 release();await Promise.resolve();await Promise.resolve();
 assert.equal(s.choices().get(1),'sentence-splitter');
 fail=true;timer.tick();assert.equal(await s.flush(),false);
 assert(s.pending());assert.equal(s.depth().undo,3);
 // Same uncertain batch is retried, not silently lost.
 fail=false;const retry=s.flush();assert.equal(sent.length,3);assert.deepEqual(sent[1],sent[2]);
 release();assert(await retry);assert.equal(s.pending(),false);
 s.dispose();
});
test('batch HTTP contains identities and choices only; exact receipt required',async()=>{
 const {snapshot,rows}=await fixture();
 const batch=[{line:1,previous:null,next:'intl',first:rows[0]}];
 const expected=choiceRows(snapshot.lines[0],[rows[0]],'intl');
 const hash=await sha256(rows[0].candidates_json);
 await saveSentenceChoices('/fixture',snapshot,batch,{fetcher:async(url,opts)=>{
  assert.equal(url,'/labs/lab-sentence/api/sentence/save');
  assert.deepEqual(JSON.parse(opts.body),{workspace:'/fixture',source_document_hash:snapshot.documentVersion,changes:[{source_line:1,source_line_hash:rows[0].source_line_hash,candidates_hash:hash,previous_engine:null,adopted_engine:'intl'}]});
  return {ok:true,json:async()=>({state:'ready',source_document_hash:snapshot.documentVersion,rows:expected})};
 }});
 await assert.rejects(saveSentenceChoices('/fixture',snapshot,batch,{fetcher:async()=>({ok:true,json:async()=>({state:'ready',source_document_hash:snapshot.documentVersion,rows:[rows[0]]})})}));
});

test('RAW projection preserves inherited type and quote depth, tail belongs only to final sentence',async()=>{
 const snapshot=await createMDLineSnapshot('>> A. B.\n \t\n\n# Title\n\n~~~\n# literal\n~~~\n');
 const l=snapshot.lines[0],candidates_json=JSON.stringify(Object.fromEntries(['intl','sentence-splitter','wink-nlp'].map((id,i)=>[id,{status:'ok',version:'fixture',boundaries:i===1?[]:[5],protected_ranges:[]}])));
 assert.deepEqual(snapshot.lines.map(l=>[l.sourceLine,l.ownerLine,l.type,l.level]),[[1,1,'text','>>'],[2,1,'blank',''],[3,1,'blank',''],[4,4,'title',''],[5,4,'blank',''],[6,6,'text',''],[7,7,'text',''],[8,8,'text','']]);
 const first={source_document_hash:snapshot.documentVersion,source_line:1,source_line_hash:l.sha256,sentence_index:0,from_utf16:0,to_utf16:l.text.length,raw:l.text+l.ownedTail,type:l.type,level:l.level,candidates_json,review_state:'disputed',adopted_engine:null};
 const s=createReviewSession(snapshot,[first],{save:async()=>{},timers:clock()});
 assert(s.choose(1,'intl'));
 assert.deepEqual(s.rows().map(r=>[r.raw,r.type,r.level]),[['>> A.','text','>>'],[' B.\n \t\n\n','text','>>']]);
 assert.equal(s.history('undo'),1);assert.deepEqual(s.rows(),[first]);assert.equal(s.history('redo'),1);
 assert.equal(s.rows().map(r=>r.raw).join(''),first.raw);s.dispose();
});
