import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {composeOwnedSource} from '../ui/v2-block-source.js';
import {createMdLineIndex} from '../ui/v2-md-line-index.js';
import {projectV2NoteMatch,resolveV2NoteEndpoint,noteMatchColumns} from '../ui/v2-note-match.js';
const rows=[
 ['An example<sup>7</sup> and more<sup>9</sup>.\n\n',0,0],
 ['## Notes\n\n',1,0],
 ['7. Footnote body\nContinuation\n\n',1,1],
 ['9. Another footnote\n\n',1,2],
 ['~~~\nFake<sup>8</sup>\n~~~\n\n',2,0],
].map(([markdownText,p,b],i)=>({logicalId:i+1,baseBlockId:i+1,logicalOrder:i+1,blockType:'text',p,b,s:0,parentId:null,markdownText}));
const composed=composeOwnedSource(rows),doc=EditorState.create({doc:composed.source}).doc;
const idx=createMdLineIndex(doc,composed.blocks),p=projectV2NoteMatch(idx);
assert.equal(p.index.stats.references,2);
assert.equal(p.index.stats.matched,2);
assert.deepEqual(p.rows.map(r=>[r.number,r.kind]),[['7','注引'],['7','注文'],['8','缺号'],['9','注引'],['9','注文']]);
assert.equal(p.rows[1].text,'Footnote body\nContinuation\n');
for(const row of p.rows.filter(r=>r.kind!=='缺号')){
 const line=resolveV2NoteEndpoint(idx,row);
 assert(line);assert.equal(line.pbs,row.pbs);
 assert.equal(line.md_line.slice(row.from,row.to),row.raw);
}
assert.equal(resolveV2NoteEndpoint(idx,p.rows[2]),null);
assert.equal(resolveV2NoteEndpoint(createMdLineIndex(doc,composed.blocks),p.rows[0]),null);
assert.deepEqual(noteMatchColumns().map(c=>c.field),['number','kind','text','match_state','pbs','line_no','evidence','strength','reason','conversion_error','scope','candidate_count','note_row_id','line_id']);
assert.equal(noteMatchColumns()[0].pinned,'left');
assert.equal(noteMatchColumns()[3].pinned,'right');
assert.equal(doc.toString(),composed.source);
console.log('WP26A_NOTE_MATCH_DIRECT_PASS');
const {createV2NoteSession}=await import('../ui/v2-note-session.js');
const session=createV2NoteSession();
let scan=session.project(idx);
let ref=scan.rows.find(r=>r.kind==='注引'&&r.number==='7');
assert.equal(ref.match_state,'已匹配');
session.choose(idx,ref,'忽略',null);
assert.equal(session.project(idx).rows.find(r=>r.kind==='注引'&&r.number==='7').match_state,'忽略');
ref=session.project(idx).rows.find(r=>r.kind==='注引'&&r.number==='7');
session.choose(idx,ref,'待核实',null);
assert.equal(session.project(idx).rows.find(r=>r.kind==='注引'&&r.number==='7').match_state,'待核实');
ref=session.project(idx).rows.find(r=>r.kind==='注引'&&r.number==='7');
session.choose(idx,ref,'待转换',ref.body_choices[0].id);
assert.equal(session.project(idx).rows.find(r=>r.kind==='注引'&&r.number==='7').match_state,'已匹配');
assert.throws(()=>session.choose(idx,ref,'忽略',null),/已经变化/);
session.configure({...session.getConfig(),referenceRules:['ref.parenthesis','ref.md-footnote']});
assert.equal(session.project(idx).index.stats.references,0);
session.reset();assert.equal(session.project(idx).index.stats.references,2);
console.log('WP26B_NOTE_REVIEW_SESSION_DIRECT_PASS');
const {planV2NoteConversion}=await import('../ui/v2-note-conversion.js');
const conversionSession=createV2NoteSession();
const plan=planV2NoteConversion(conversionSession,idx);
assert.equal(plan.converted,2);assert.equal(plan.failures.length,0);
const mapped=plan.updates.map(u=>({line:idx.resolve(u.ref).source_line,before:u.beforeText,after:u.afterText}));
assert.equal(mapped.find(x=>x.line===1).after,'An example[^7] and more[^9].');
assert(mapped.some(x=>x.after==='[^7]: Footnote body'));
assert(mapped.some(x=>x.after==='    Continuation'));
assert(mapped.some(x=>x.after==='[^9]: Another footnote'));
assert.equal(doc.toString(),composed.source);
console.log('WP26C_NOTE_CONVERSION_PLAN_PASS');
