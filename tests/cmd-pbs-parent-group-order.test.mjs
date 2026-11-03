/** PDF parent-group before/after: only PBS IDs change.
 * Physical text, original CMD-line locations, parent/child origins and bbox
 * stay untouched. One multi-edit CM6 transaction = one Undo.
 */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {planCMDReorderPBSParents,planCMDReparentPBS,
  planCMDPromotePBSChild,readCMDBlockChains} from '../ui/cmd-block-chains.js';
const json=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const base=toMarkdown(json);
const apply=(source,plan)=>[...plan.edits].sort((a,b)=>b.from-a.from).reduce((text,edit)=>{
  assert.equal(text.slice(edit.from,edit.to),edit.expected);
  return text.slice(0,edit.from)+edit.insert+text.slice(edit.to);
},source);
const nonTag=src=>src.replace(/^((?: {0,3}>[ \t]?)* {0,3})<!-- cmd:block:v1[^\n]* -->[ \t]*$/gm,'$1<!-- PBS TAG -->');
const absorbed=apply(base,planCMDReparentPBS(base,'p1b3','p1b5'));
const promoted=apply(absorbed,planCMDPromotePBSChild(absorbed,'p1b5s1'));
const cases=[
  {name:'native parent after',src:base,source:'p1b3',target:'p1b5',zone:'after',children:['p1b3s0']},
  {name:'native parent before',src:base,source:'p1b3',target:'p1b5',zone:'before',children:['p1b3s0']},
  {name:'absorbed group after',src:absorbed,source:'p1b5',target:'p1b7',zone:'after',
    children:['p1b5s0','p1b5s1']},
  {name:'absorbed group before',src:absorbed,source:'p1b5',target:'p1b7',zone:'before',
    children:['p1b5s0','p1b5s1']},
  {name:'promoted parent before',src:promoted,source:'p1b14',target:'p1b5',zone:'before',children:[]},
  {name:'promoted parent after',src:promoted,source:'p1b14',target:'p1b5',zone:'after',children:[]},
  {name:'nested group before',src:promoted,source:'p1b5',target:'p1b7',zone:'before',
    children:['p1b5s0']}
];
for(const c of cases){
  const before=readCMDBlockChains(c.src);
  const sourceRoot=before.atoms.find(a=>a.id===c.source);
  assert(sourceRoot,c.name+' root exists');
  const children=before.atoms.filter(a=>a.id.startsWith(c.source+'s')).map(a=>a.origin);
  assert.deepEqual(before.atoms.filter(a=>c.children.includes(a.id)).map(a=>a.id),
    c.children,c.name+' native children');
  const plan=planCMDReorderPBSParents(c.src,c.source,c.target,c.zone);
  assert(plan.changed>0,c.name);
  assert.equal(plan.changed,plan.edits.length,c.name+' annotations only');
  assert.equal(plan.annotationOnly,true,c.name);
  assert.equal(plan.relocatedSourceText,false,c.name);
  assert(plan.edits.every(e=>e.expected.includes('<!-- cmd:block:v1')&&
    e.insert.includes('<!-- cmd:block:v1')),c.name+' no text-scope edits');
  const after=apply(c.src,plan);
  assert.equal(nonTag(after),nonTag(c.src),c.name+' unchanged Markdown and tag positions');
  const next=readCMDBlockChains(after);
  assert.equal(next.invalid.length,0,c.name);
  const id=plan.renamed[c.source]||c.source;
  const newRoot=next.atoms.find(a=>a.id===id);
  assert.equal(newRoot?.origin,sourceRoot.origin,c.name+' unchanged source provenance');
  assert.deepEqual(next.atoms.filter(a=>a.id.startsWith(id+'s')).map(a=>a.origin),
    children,c.name+' same child origins and relative order');
  assert.deepEqual(before.atoms.map(a=>a.origin).sort(),
    next.atoms.map(a=>a.origin).sort(),c.name+' all original atoms');
  assert.equal(toMineruJSON(after),json,c.name+' original sealed MinerU byte exact');
  console.log('CMD_PBS_RENUMBER_ONLY_PASS',c.name,id,children.length,plan.edits.length);
}
for(const [a,b,placement] of [
  ['p1b3','p2b0','before'],
  ['p1b3s0','p1b5','after'],
  ['p1b3','p1b5s0','before']
])assert.throws(()=>planCMDReorderPBSParents(base,a,b,placement),/same-page independent parents/);
assert.equal(planCMDReorderPBSParents(base,'p1b3','p1b3','after').changed,0);
// A SECOND reorder must use logical PBS b-numbers, not old source offsets.
let repeated=apply(base,planCMDReorderPBSParents(base,'p1b3','p1b5','after'));
const first=readCMDBlockChains(repeated);
const moved=first.atoms.find(a=>a.origin==='p1b3'&&a.kind==='parent');
assert.equal(moved.id,'p1b5');
repeated=apply(repeated,planCMDReorderPBSParents(repeated,'p1b5','p1b3','before'));
const second=readCMDBlockChains(repeated);
assert.equal(second.atoms.find(a=>a.origin==='p1b3'&&a.kind==='parent').id,'p1b3');
assert.equal(nonTag(repeated),nonTag(base));
assert.equal(toMineruJSON(repeated),json);
console.log('CMD_PBS_RENUMBER_ONLY_ALL_PASS');
