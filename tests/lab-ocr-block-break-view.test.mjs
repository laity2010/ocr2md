/** WP1: no SQL/CMD mutation, only split boundaries of ONE logical parent. */
import assert from 'node:assert/strict';
import {projectBlockBreakRows,resolveBlockBreakFocus,renderBlockBreakJoinCell} from '../ui/lab-ocr/block-break-view.js';
const block=(block_id,pbs,parent_block_id,sibling_order,block_type='text',page=15)=>({
  block_id,pbs,parent_block_id,sibling_order,block_type,global_page:page,
  block_group:'para_blocks',absorbed_into_block_id:null,
});
const blocks=[
  block(435,'p16b3',null,3),block(436,'p16b4',null,4),
  block(437,'p16b4s0',436,0),block(438,'p16b4s1',436,1),
  block(439,'p16b5',null,5),
];
const md=[
  [308,'a',435,'Completed paragraph.'],[309,'b',435,''],
  [310,'c',436,'We then asked why this structure provides a steady'],
  [311,'d',437,'source of financing that allows him to leverage his ability.'],
  [312,'e',437,''],[313,'f',438,'Another complete paragraph.'],
  [314,'g',439,'Other material starts here'],
].map(([line_no,line_id,block_id,text])=>({line_no,line_id,block_id,text}));
const originalBlocks=structuredClone(blocks),originalMd=structuredClone(md);
const rows=projectBlockBreakRows(md,blocks);
assert.equal(rows.length,1,'Only logical p16b4→p16b4s0, not all neighbors');
assert.deepEqual(rows.map(x=>[x.issue_id,x.pbs,x.before_pbs,x.after_pbs,x.line_id,x.line_no]),
  [['block-break:436:437','p16b4','p16b4','p16b4s0','d',311]]);
assert.match(rows[0].join_preview,/steady source of financing/);
assert.equal(rows[0].before_line_id,'c');
assert.equal(rows[0].before_line_no,310);
assert.equal(rows[0].block_id,437,'Locates AFTER block through existing four-pane port');
assert.equal(rows[0].kind,'跨块续接');
const pair=resolveBlockBreakFocus({issueId:rows[0].issue_id,
  lineId:rows[0].line_id,blockId:rows[0].block_id},md,blocks);
assert.deepEqual(pair,{before:{lineNo:310,blockId:436,page:16,
  token:'steady',text:rows[0].before_text},
  after:{lineNo:311,blockId:437,page:16,
    token:'source',text:rows[0].after_text},hyphenated:false});
assert(Object.isFrozen(pair)&&Object.isFrozen(pair.before));
assert.equal(resolveBlockBreakFocus({issueId:rows[0].issue_id,
  lineId:'stale',blockId:437},md,blocks),null);
assert.equal(resolveBlockBreakFocus({issueId:rows[0].issue_id,
  lineId:rows[0].line_id,blockId:999},md,blocks),null);
assert.equal(resolveBlockBreakFocus({issueId:rows[0].issue_id,
  lineId:rows[0].line_id,blockId:437},md.map(r=>r.line_id==='c'?
  {...r,text:'Sentence ends.'}:r),blocks),null);

assert.deepEqual(blocks,originalBlocks);
assert.deepEqual(md,originalMd);
// The exact same logical edge survives PBS renumbering and row shifts.
const renamed=blocks.map(b=>b.block_id===437?{...b,pbs:'p16b9s0'}:b);
const shifted=md.map(r=>({...r,line_no:r.line_no+20}));
const updated=projectBlockBreakRows(shifted,renamed);
assert.equal(updated[0].issue_id,rows[0].issue_id);
assert.equal(updated[0].line_id,rows[0].line_id);
assert.equal(updated[0].after_pbs,'p16b9s0');
// A user completing the sentence removes only the affected candidate.
assert.equal(projectBlockBreakRows(md.map(r=>r.line_id==='c'?
  {...r,text:r.text+'.'}:r),blocks).length,0);
assert.equal(projectBlockBreakRows(md.map(r=>r.line_id==='d'?
  {...r,text:'Source of financing...'}:r),blocks).length,0);
// A root with no MD text can still have a split between adjacent children.
const siblingBlocks=[block(50,'p2b0',null,0),block(51,'p2b0s0',50,0),
  block(52,'p2b0s1',50,1)];
const siblingMd=[{line_id:'x',line_no:1,block_id:51,text:'The phrase is still'},
  {line_id:'y',line_no:2,block_id:52,text:'unfinished until this line.'}];
assert.deepEqual(projectBlockBreakRows(siblingMd,siblingBlocks).map(r=>r.issue_id),
  ['block-break:51:52']);
// A semantic edge can cross one physical page while retaining logical PBS.
assert.equal(projectBlockBreakRows(siblingMd,
  siblingBlocks.map(b=>b.block_id===52?{...b,global_page:2}:b)).length,1);
// Unlinked top-level siblings, structure/latex, non-text blocks, and missing
// or reversed MD lineage cannot make a speculative broken-block candidate.
assert.deepEqual(projectBlockBreakRows([
  {line_id:'x',line_no:1,block_id:1,text:'still'},
  {line_id:'y',line_no:2,block_id:2,text:'lowercase'},
],[block(1,'p1b0',null,0),block(2,'p1b1',null,1)]),[]);
assert.equal(projectBlockBreakRows(siblingMd,siblingBlocks.map(b=>
  b.block_id===52?{...b,block_type:'table'}:b)).length,0);
const barrier=[...siblingBlocks,block(53,'p2b0s1',50,1,'table')].map(b=>
  b.block_id===52?{...b,pbs:'p2b0s2',sibling_order:2}:b);
assert.equal(projectBlockBreakRows(siblingMd,barrier).length,0,
  'A table sibling between two text children must block inferred continuation');
assert.equal(projectBlockBreakRows(siblingMd,siblingBlocks.map(b=>
  b.block_id===52?{...b,absorbed_into_block_id:50}:b)).length,0);
assert.equal(projectBlockBreakRows(siblingMd.slice().reverse().map((r,i)=>
  ({...r,line_no:i+1})),siblingBlocks).length,0);
for(const a of ['The conclusion.', '# Headline', '$$','| Col |','[Link](https://site.test)']){
  const result=projectBlockBreakRows([
    {line_id:'x',line_no:1,block_id:51,text:a},
    {line_id:'y',line_no:2,block_id:52,text:'the continuation'},
  ],siblingBlocks);
  assert.equal(result.length,0,'No speculative split after '+a);
}
console.log('LAB_OCR_BLOCK_BREAK_VIEW_PASS');

// Direct public cell API: colored tokens, real joined data, and safe text-only
// DOM construction. A narrow AG viewport doesn't need a second preview pane.
const originalDocument=globalThis.document;
class CellNode {
  constructor(){this.children=[];this._text='';this.className='';this.title='';}
  get textContent(){return this._text+this.children.map(x=>x.textContent).join('');}
  set textContent(value){this._text=String(value);this.children=[];}
  append(...items){this.children.push(...items);}
}
try{
  globalThis.document={createElement:()=>new CellNode()};
  const cell=renderBlockBreakJoinCell({data:rows[0]});
  assert.equal(cell.className,'ocr-block-break-ag-join');
  assert.equal(cell.children.find(x=>x.className==='ocr-block-break-ag-before-token')?.textContent,'steady');
  assert.equal(cell.children.find(x=>x.className==='ocr-block-break-ag-after-token')?.textContent,'source');
  assert.match(cell.textContent,/steady source of financing/);
  assert.equal(cell.title,rows[0].join_preview);
  const attack=renderBlockBreakJoinCell({data:{...rows[0],before_text:'<img src=x onerror=alert(1)>steady'}});
  assert(attack.textContent.includes('<img src=x onerror=alert(1)>'));
  assert(attack.children.every(node=>node.innerHTML===undefined),
    'AG renderer must not parse untrusted Markdown/HTML as markup');
}finally{globalThis.document=originalDocument;}
console.log('LAB_OCR_BLOCK_BREAK_AG_JOIN_CELL_PASS');
