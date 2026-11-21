import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {projectV2PDFEvidence} from '../ui/v2-pdf-evidence-adapter.js';
import {composeBlockSource} from '../ui/v2-block-source.js';
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
    print(json.dumps({'projection':v.existing_pdf_map(p),'markdown':v.existing_markdown(p)},ensure_ascii=False))
`;
const {projection,markdown}=JSON.parse(execFileSync('python3',['-c',py],{encoding:'utf8'}));
const evidence=projectV2PDFEvidence(projection);
const {source,blocks}=composeBlockSource(markdown);
assert.equal(evidence.layout.pages.length,22);
assert.equal(evidence.coverage.length,224);
assert.equal(evidence.coverage.filter(c=>c.isChildCover).length,0);
assert.equal(evidence.layout.pages.flatMap(p=>p.regions).length,224);
assert.equal(evidence.coverage[0].id,'p0b0');
assert.equal(evidence.coverage[0].origin,'p0b0');
assert.equal(evidence.logicalIdForPBS('p0b0'),23);
const port={getState:()=>({loaded:true}),getIntervals:()=>blocks,
  getLineAtOffset:x=>source.slice(0,x).split('\n').length};
const locs=evidence.getLabelSources(port);
assert.equal(locs.size,224);
assert.equal(locs.get('p0b0').sourceLine,1);
assert.equal(locs.get('p0b0').pageIndex,0);
assert.equal(locs.get('p0b0').kind,'parent');
assert.equal(evidence.getLabelSources(null).size,0);
const last=projection.covers.at(-1),first=projection.covers[0];
const altered=structuredClone(projection);
altered.covers.at(-1).parentId=first.logicalId;
altered.covers.at(-1).pbs='p0b0s1';
const child=projectV2PDFEvidence(altered);
const view=child.coverage.at(-1);
assert.equal(view.id,'p0b0s1');
assert.equal(view.origin,'p21b20');
assert.equal(view.pageIndex,21);
assert.equal(view.isChildCover,true);
assert.equal(child.getLabelSources(port).get('p0b0s1').pageIndex,21);
const duplicate=structuredClone(projection);
duplicate.covers[1].pbs=duplicate.covers[0].pbs;
assert.throws(()=>projectV2PDFEvidence(duplicate),/duplicate/);
const duplicateSource=structuredClone(projection);
duplicateSource.covers[1].physicalBlockIndex=duplicateSource.covers[0].physicalBlockIndex;
duplicateSource.covers[1].physicalPageIndex=duplicateSource.covers[0].physicalPageIndex;
assert.throws(()=>projectV2PDFEvidence(duplicateSource),/multiple logical blocks/);
console.log('V2_TO_REAL_V1_PDF_EVIDENCE_PASS',evidence.coverage.length,'identity+crosspage+empty+refuse duplicates');
