import assert from 'node:assert/strict';
import {projectLatexOutlineRows} from '../ui/lab-ocr/latex-outline.js';

const blocks=[1,2,3,4,5,6,7,8,9].map(n=>({block_id:n,
  block_type:n===7?'title':'text',pbs:`p${n}b0`,global_page:n-1}));
const lines=[
  {line_no:1,line_id:'h1',block_id:1,text:'# Book'},
  {line_no:2,line_id:'note',block_id:2,text:'not a formula'},
  {line_no:3,line_id:'h2a',block_id:3,text:'## Empty section'},
  {line_no:4,line_id:'h2b',block_id:4,text:'## Section with math'},
  {line_no:5,line_id:'m1',block_id:5,text:'First $x$ and $y$'},
  {line_no:6,line_id:'h3',block_id:6,text:'### Deeper'},
  {line_no:7,line_id:'m2',block_id:6,text:'second $z$'},
  {line_no:8,line_id:'h1b',block_id:7,text:'# New chapter'},
  {line_no:9,line_id:'m3',block_id:8,text:'third $v$'},
  {line_no:10,line_id:'h2c',block_id:9,text:'## No more math'},
];
const formulas=[
 {formula_id:'f2',block_id:5,line_no:5,source_from:20,kind:'行内',formula:'y'},
 {formula_id:'f1',block_id:5,line_no:5,source_from:15,kind:'行内',formula:'x'},
 {formula_id:'f3',block_id:6,line_no:7,source_from:70,kind:'行内',formula:'z'},
 {formula_id:'f4',block_id:8,line_no:9,source_from:90,kind:'行内',formula:'v'},
];
const before=JSON.stringify({blocks,lines,formulas});
const result=projectLatexOutlineRows(lines,blocks,formulas);
assert.deepEqual(result.map(r=>r.latex_heading_id??r.formula_id),[
 'heading:h1','heading:h2b','f1','f2','heading:h3','f3','heading:h1b','f4']);
const headers=result.filter(r=>r.latex_heading_id);
assert.deepEqual(headers.map(r=>r.heading_level),[1,2,3,1]);
assert.deepEqual(headers.map(r=>r.heading_source),
 ['# Book','## Section with math','### Deeper','# New chapter']);
assert(headers.every(r=>r.formula_id==null&&r.formula==null&&r.kind==null&&
  r.render_status==null&&r.pdf_bbox==null));
assert(headers.every(r=>r.line_id&&r.block_id&&r.line_no));
assert(result.filter(r=>r.formula_id).every(r=>r.heading_source===''));
assert.deepEqual(result.filter(r=>r.formula_id).map(r=>r.formula_id),['f1','f2','f3','f4']);
// Live edits change the outline at once. Removing # must never retain the
// immutable OCR title metadata, and adding # to an OCR text block is valid.
const edited=lines.map(r=>r.line_id==='h2b'?{...r,text:'Plain text'}:r);
const revision=projectLatexOutlineRows(edited,blocks,formulas);
assert(!revision.some(r=>r.latex_heading_id==='heading:h2b'));
assert(revision.some(r=>r.latex_heading_id==='heading:h3'));
const promoted=lines.map(r=>r.line_id==='note'?{...r,text:'#### New MD heading'}:
  ['h2a','h2b'].includes(r.line_id)?{...r,text:'Body, not a heading'}:r);
assert(projectLatexOutlineRows(promoted,blocks,formulas)
 .some(r=>r.latex_heading_id==='heading:note'));
// Formula with no precise MD location but known BlockID uses the first MD
// line of its own Block, retaining its OCR-only provenance and bbox.
const orphan={formula_id:'ocr-only',block_id:5,line_no:null,source_from:null,
  match_status:'仅 OCR',kind:'行内',pdf_bbox:[1,2,4,5]};
const anchored=projectLatexOutlineRows(lines,blocks,[orphan]);
assert.deepEqual(anchored.map(r=>r.latex_heading_id??r.formula_id),
 ['heading:h1','heading:h2b','ocr-only']);
assert.equal(anchored.at(-1).line_no,null);
assert.deepEqual(anchored.at(-1).pdf_bbox,orphan.pdf_bbox);
assert.equal(JSON.stringify({blocks,lines,formulas}),before,
 'Projection must never mutate source, original OCR blocks or formulas');
console.log('LAB_OCR_LATEX_OUTLINE_PASS',result.length,'rows',headers.length,'headings');
