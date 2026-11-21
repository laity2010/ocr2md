/** Real SQL MinerU fixture to ACTUAL Lab-OCR V1 PDF public setOverlays API. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {projectV2PDFEvidence} from '../ui/v2-pdf-evidence-adapter.js';
import {layoutPbsLabels} from '../ui/lab-ocr/pbs-label-layout.js';
const py=String.raw`
import json,sys,shutil,tempfile
from pathlib import Path
sys.path.insert(0,'scripts')
import v2_mineru_base as v
fixture=Path('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json')
with tempfile.TemporaryDirectory() as td:
    p=Path(td);(p/'minerujson').mkdir()
    shutil.copyfile(fixture,p/'minerujson'/fixture.name)
    v.new_book(p)
    print(json.dumps(v.existing_pdf_map(p),ensure_ascii=False))
`;
const projection=JSON.parse(execFileSync('python3',['-c',py],{encoding:'utf8'}));
const evidence=projectV2PDFEvidence(projection);
assert.equal(projection.pageCount,22);
assert.equal(projection.mappedCount,224);
assert.equal(evidence.byId.size,224);
assert.equal(Array.from({length:22},(_,i)=>evidence.page(i+1).boxes.length).reduce((a,b)=>a+b,0),224);
assert.equal(evidence.page(1).level,'block');
assert.equal(evidence.page(1).boxes[0].pbs,'p0b0');
assert.equal(evidence.page(1).boxes[0].blockId,'23');
assert.equal(evidence.page(1).boxes[0].parentBlockId,null);
assert.equal(evidence.page(1).boxes[0].blockGroup,'para_blocks');
assert.equal(evidence.page(1).boxes[0].bbox[0],95);
assert.throws(()=>evidence.page(1,'span'),/Block/);
assert.throws(()=>evidence.page(0),/Block/);
const last=projection.covers.at(-1),first=projection.covers[0];
const moved=structuredClone(projection);
moved.covers.at(-1).parentId=first.logicalId;
moved.covers.at(-1).pbs='p0b0s1';
const child=projectV2PDFEvidence(moved);
assert.equal(child.page(22).boxes.at(-1).pbs,'p0b0s1');
assert.equal(child.page(22).boxes.at(-1).parentBlockId,String(first.logicalId));
assert.deepEqual(child.page(22).boxes.at(-1).bbox,last.bbox,'cross-page child keeps physical bbox');
const same=structuredClone(projection);
same.covers[1].bbox=[...same.covers[0].bbox];
same.covers[1].physicalPageIndex=same.covers[0].physicalPageIndex;
assert.equal(projectV2PDFEvidence(same).page(1).boxes.length,
 evidence.page(1).boxes.length,'two distinct logical PBS keep independent records even at identical bbox');
assert.deepEqual(projectV2PDFEvidence(same).page(1).boxes[0].bbox,
 projectV2PDFEvidence(same).page(1).boxes[1].bbox);
const duplicate=structuredClone(projection);
duplicate.covers[1].pbs=duplicate.covers[0].pbs;
assert.throws(()=>projectV2PDFEvidence(duplicate),/重复/);
// This layout assertion tests the ACTUAL, unchanged V1 lane engine, including
// a collision's outward tracks and immediate return to the nearest lane.
const labels=[
  {pbs:'p0b0',blockId:'1',bbox:[80,100,180,120]},
  {pbs:'p0b1',blockId:'2',bbox:[80,101,180,121]},
  {pbs:'p0b2',blockId:'3',bbox:[80,102,180,122]},
  {pbs:'p0b3',blockId:'4',bbox:[80,380,180,400]},
  {pbs:'p0b4',blockId:'5',bbox:[500,100,590,120]},
  {pbs:'p0b5',blockId:'6',bbox:[500,101,590,121]},
];
const lanes=layoutPbsLabels(labels,650,800);
assert.deepEqual(lanes.filter(x=>x.side==='left').map(x=>x.lane),[0,1,2,0]);
assert.deepEqual(lanes.filter(x=>x.side==='right').map(x=>x.lane),[0,1]);
console.log('V2_TO_LABOCR_V1_MULTILANE_DATA_AND_LAYOUT_PASS 22 pages 224 blocks 3 outward lanes and nearest-lane reuse');
