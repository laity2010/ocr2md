import assert from 'node:assert/strict';
import {emptyLogicalIds,projectV2PDFEvidence} from '../ui/v2-pdf-evidence-adapter.js';
const rows=[
 {logicalId:1,p:4,b:0,s:0,markdownText:'',blockType:'table'},
 {logicalId:2,p:4,b:0,s:1,markdownText:'',blockType:'table_caption'},
 {logicalId:3,p:4,b:0,s:2,markdownText:'',blockType:'table_body'},
 {logicalId:4,p:4,b:0,s:3,markdownText:'',blockType:'table_footnote'},
 {logicalId:5,p:4,b:1,s:0,markdownText:'chart image',blockType:'chart'},
];
assert.deepEqual(emptyLogicalIds(rows),[1,2,3,4]);
const recovered=rows.map(r=>r.logicalId===2?{...r,markdownText:'Table 1 continued'}:
 r.logicalId===3?{...r,markdownText:'<table><tr><td>Data</td></tr></table>'}:
 r.logicalId===4?{...r,markdownText:'Notes: original source'}:r);
assert.deepEqual(emptyLogicalIds(recovered),[],
 'parent table wrapper becomes solid when typed children own text');
assert.deepEqual(emptyLogicalIds(recovered.map(r=>r.logicalId===3?{...r,markdownText:'  '}:r)),[3]);
assert.deepEqual(emptyLogicalIds(rows),[1,2,3,4],
 'undo to original empty MD restores dashed state');
assert.throws(()=>emptyLogicalIds([{...rows[0],logicalId:0}]),/logicalId/);
assert.throws(()=>emptyLogicalIds([rows[0],rows[0]]),/logicalId/);
assert.throws(()=>emptyLogicalIds([{...rows[0],markdownText:null}]),/MD/);
const map={schema:'v2-pdf-projection/v1',pageCount:1,pageSizes:[[600,900]],mappedCount:1,
 covers:[{logicalId:3,pbs:'p4b0s2',physicalPageIndex:0,bbox:[15,24,300,90],empty:true}]};
const visual=projectV2PDFEvidence(map);
assert.equal(visual.page(1).boxes[0].sourceEmpty,true,'OCR provenance remains immutable');
assert.deepEqual(visual.page(1).boxes[0].bbox,[15,24,300,90]);
console.log('WP16_PDF_CURRENT_MD_EMPTY_STATE_PASS');
