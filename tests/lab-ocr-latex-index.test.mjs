import assert from 'node:assert/strict';
import {projectLatexIndex,latexIndexSummary} from '../ui/lab-ocr/latex-index.js';
const base=(block_id,pbs,global_page,spans,type='text')=>({
  block_id,pbs,global_page,block_type:type,absorbed_into_block_id:null,
  block_json:JSON.stringify({type,lines:[{spans}]})});
const span=(type,content,bbox,image_path)=>({type,content,bbox,...(image_path?{image_path}:{})});
const md=(line_no,block_id,text)=>({line_no,block_id,text,line_id:'line-'+line_no});
const original=[
 base(1,'p1b0',0,[span('interline_equation',String.raw`E=mc^2`,[10,20,90,50],
    'https://example.test/math.jpg')],'interline_equation'),
 base(2,'p1b1',0,[span('inline_equation',String.raw`x_{1}`,[23,35,43,48])]),
 base(3,'p2b0',1,[span('inline_equation',String.raw`y^2`,[10,20,30,40])]),
 base(4,'p2b1',1,[span('inline_equation',String.raw`r_t`,[10,20,30,40]),
                         span('inline_equation',String.raw`r_t`,[50,20,70,40])]),
 base(5,'p3b0',2,[span('text','start '),span('inline_equation','z',[10,20,20,30]),
   span('text',' between '),span('inline_equation','z',[40,20,50,30]),span('text',' end')]),
];
const lines=[md(1,1,'$$'),md(2,1,'E=mc^2'),md(3,1,'$$'),
 md(4,2,'before x_{1} after'),md(5,3,'no matching text'),
 md(6,4,'r_t followed by r_t'),md(7,4,String.raw`and \(a+b\)`),
 md(8,5,'start z between z end'),
];
const snap=JSON.stringify({original,lines});
const rows=projectLatexIndex(lines,original);const summary=latexIndexSummary(rows);
assert.deepEqual(summary,{total:8,original:7,independent:1,inline:7,
 matched:4,ocrOnly:1,mdOnly:1,ambiguous:2,images:1});
const display=rows.find(r=>r.formula_id==='ocr:1:0:0');
assert.equal(display.match_status,'已匹配');
assert.equal(display.line_no,2);assert.equal(display.column,0);
assert.deepEqual(display.pdf_bbox,[10,20,90,50]);
assert.equal(display.original_image,'https://example.test/math.jpg');
const inline=rows.find(r=>r.formula_id==='ocr:2:0:0');
assert.equal(inline.match_status,'已匹配');assert.equal(inline.line_no,4);
assert.equal(inline.column,7);assert.equal(inline.syntax,'OCR 原文');
assert.equal(rows.find(r=>r.formula_id==='ocr:3:0:0').line_no,null);
assert.equal(rows.filter(r=>r.match_status==='有歧义').length,2);
assert.equal(rows.find(r=>r.match_status==='仅 MD').formula,'a+b');
const a=rows.find(r=>r.formula_id==='ocr:5:0:1');
const b=rows.find(r=>r.formula_id==='ocr:5:0:3');
assert.equal(a.match_status,'已匹配');
assert.equal(b.match_status,'已匹配');
assert.equal(a.line_no,8);assert.equal(b.line_no,8);
assert.equal(a.column,6);assert.equal(b.column,16);
// If a reviewer changes the paragraph, source sequence alone is NOT proof.
const edited=lines.map(row=>row.line_no===8?{...row,text:'edited '+row.text}:row);
const unsafe=projectLatexIndex(edited,original).filter(r=>r.block_id===5);
assert(unsafe.some(r=>r.match_status==='有歧义')||
  unsafe.some(r=>r.match_status==='仅 OCR'),
  'Never force positional identity after paragraph edits');
assert.equal(JSON.stringify({original,lines}),snap,'Pure projection must not mutate CM6 / SQL data');
console.log('LAB_OCR_LATEX_INDEX_DIRECT_PASS',summary);
