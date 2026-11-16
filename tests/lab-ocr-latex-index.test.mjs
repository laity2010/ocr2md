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
 matched:4,revised:0,ocrOnly:1,mdOnly:1,ambiguous:2,images:1});
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
// New MinerU -> MD automatically adds $ delimiters, even when a block
// repeats identical formulas. Two OCR Span IDs must remain 1:1, with the
// caret on the math body (one character after the opening $).
const delimited=lines.map(row=>row.line_no===8?
  {...row,text:'start $z$ between $z$ end'}:row);
const native=projectLatexIndex(delimited,original);
const nativeA=native.find(r=>r.formula_id==='ocr:5:0:1');
const nativeB=native.find(r=>r.formula_id==='ocr:5:0:3');
assert.equal(nativeA.match_status,'已匹配');
assert.equal(nativeB.match_status,'已匹配');
assert.equal(nativeA.column,7);assert.equal(nativeB.column,19);
assert.equal(nativeA.syntax,'$');assert.equal(nativeB.syntax,'$');
assert.equal(native.filter(r=>r.block_id===5).length,2,
  'Native math delimiters must not create duplicate MD formula rows');
assert.equal(latexIndexSummary(native).matched,4);
// If a reviewer changes the paragraph, source sequence alone is NOT proof.
const edited=lines.map(row=>row.line_no===8?{...row,text:'edited '+row.text}:row);
const unsafe=projectLatexIndex(edited,original).filter(r=>r.block_id===5);
assert(unsafe.some(r=>r.match_status==='有歧义')||
  unsafe.some(r=>r.match_status==='仅 OCR'),
  'Never force positional identity after paragraph edits');
// Real failure mode p7b1s0: OCR supplied one malformed inline equation,
// while its *same stable block* now owns one explicitly delimited corrected
// equation. The AG row must display current CM6 TeX and re-render success,
// but retain the original Span ID/bbox for PDF comparison.
const broken=String.raw`\badcommand{Equity}`;
const fixed=String.raw`(Equity_t^{MV}+Debt_t+Float_t)/Equity_t^{MV}`;
const editedBlock=base(207,'p7b1s0',6,[span('inline_equation',broken,[53,216,226,234]),
  span('text',', then we found leverage.')]);
const prefix=Array.from({length:127},(_,i)=>md(i+1,null,''));
const current=[...prefix,md(128,207,`$${fixed}$, then we found leverage.`)];
const repaired=projectLatexIndex(current,[editedBlock]);
assert.equal(repaired.length,1,'A one-to-one reviewed correction is not two AG formulas');
assert.equal(repaired[0].formula_id,'ocr:207:0:0');
assert.equal(repaired[0].match_status,'已修订');
assert.equal(repaired[0].formula,fixed);
assert.equal(repaired[0].original_formula,broken);
assert.equal(repaired[0].line_no,128);
assert.equal(repaired[0].line_id,'line-128');
assert.equal(repaired[0].column,1);
assert.equal(repaired[0].source_to-repaired[0].source_from,fixed.length);
assert.equal(repaired[0].syntax,'$');
assert.deepEqual(repaired[0].pdf_bbox,[53,216,226,234]);
assert.deepEqual(latexIndexSummary(repaired),{total:1,original:1,independent:0,
  inline:1,matched:1,revised:1,ocrOnly:0,mdOnly:0,ambiguous:0,images:0});
// Undoing the correction recomputes AG from current MD and restores the
// original OCR formula, without any separate SQL source or stale cache.
const unedited=projectLatexIndex([...prefix,md(128,207,`$${broken}$, then we found leverage.`)],
  [editedBlock]);
assert.equal(unedited.length,1);
assert.equal(unedited[0].formula,broken);
assert.equal(unedited[0].match_status,'已匹配');
// Never pair when there are two possible Markdown formulas (or the formula
// sits in an adjacent block), even if the PDF contains only one OCR Span.
const many=projectLatexIndex([...prefix,md(128,207,`$${fixed}$ + $a+b$`)],[editedBlock]);
assert.equal(many.find(r=>r.formula_id==='ocr:207:0:0').match_status,'仅 OCR');
assert.equal(many.filter(r=>r.match_status==='仅 MD').length,2);
const wrongBlock=projectLatexIndex([...prefix,md(128,208,`$${fixed}$`)],[editedBlock]);
assert.equal(wrongBlock.find(r=>r.formula_id==='ocr:207:0:0').match_status,'仅 OCR');
assert.equal(JSON.stringify({original,lines}),snap,'Pure projection must not mutate CM6 / SQL data');
console.log('LAB_OCR_LATEX_INDEX_DIRECT_PASS',summary);
