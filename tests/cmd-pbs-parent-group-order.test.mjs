/** PDF parent-group before/after sorting: CMD atomic scope, provenance, OCR.
 * Verify source parent and ALL of its children move as one contiguous group.
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
  assert.equal(plan.changed,1,c.name);
  assert.equal(plan.edits.length,1,c.name+' one CMD/CM6 undo');
  const after=apply(c.src,plan);
  const next=readCMDBlockChains(after);
  assert.equal(next.invalid.length,0,c.name);
  const id=plan.renamed[c.source]||c.source;
  const newRoot=next.atoms.find(a=>a.id===id);
  assert.equal(newRoot?.origin,sourceRoot.origin,c.name+' unchanged source provenance');
  assert.deepEqual(next.atoms.filter(a=>a.id.startsWith(id+'s')).map(a=>a.origin),
    children,c.name+' children move in original relative order');
  assert.deepEqual(before.atoms.map(a=>a.origin).sort(),
    next.atoms.map(a=>a.origin).sort(),c.name+' all original atoms');
  assert.equal(toMineruJSON(after),json,c.name+' original sealed MinerU byte exact');
  console.log('CMD_PDF_PARENT_GROUP_SORT_PASS',c.name,id,children.length);
}
for(const [a,b,placement] of [
  ['p1b3','p2b0','before'],
  ['p1b3s0','p1b5','after'],
  ['p1b3','p1b5s0','before']
])assert.throws(()=>planCMDReorderPBSParents(base,a,b,placement),/same-page independent parents/);
assert.equal(planCMDReorderPBSParents(base,'p1b3','p1b3','after').changed,0);
console.log('CMD_PARENT_GROUP_SORT_ALL_PASS');
