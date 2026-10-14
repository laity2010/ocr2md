import * as assert from "node:assert/strict";
import { pdfElementAtPoint,mdElementAtOffset,mdElementsOverlappingRange,pdfElementMdTargets,sidecarMdDocuments } from "./pdfMdBidirectional";
import type { PdfMdMappingSidecarV1 } from "./mineruMappingSidecar";
const digest="a".repeat(64),root="/ocr2md/book";
const map:PdfMdMappingSidecarV1={
  kind:"ocr2md/pdf-md-map",schemaVersion:1,workspaceId:"obsidian-ocr2md",
  pdf:{path:root+"/original.pdf",sha256:digest},ocr:{path:root+"/json/source.json",sha256:digest},
  originalMd:{path:root+"/md/ocr.md",sha256:digest},chapterVersions:[{
    chapterId:"a",source:{path:root+"/chapters/a/a.md",sha256:digest},
    working:{path:root+"/chapters/a/a.working.md",sha256:digest},
  }],ocrSourceSha256:digest,ignoredDiscardedCount:0,
  summary:{"candidate-complete":2,"candidate-partial":0,ambiguous:0,unmatched:0,unavailable:0},
  relations:[0,1].map(i=>({elementId:"mineru:"+digest+":p0:para_blocks:"+i,
    type:"text",pdfRegions:[{pageIndex:0,pdfPageNumber:1,
    bbox:[10+i*40,10,40+i*40,40],pageSize:[100,100],
    normalizedBBox:[.1+i*.4,.1,.4+i*.4,.4]}],
    originalMdState:"unique",matchStatus:"candidate-complete",chapters:["a"],manuallyVerified:false,
    parts:[{partIndex:0,partKind:"paragraph",originalState:"unique",originalMdRangesUtf16:[[10+i*40,20+i*40]],
      originalMdFragmentEvidenceUtf16:[],chapterAnchors:[{
        chapterId:"a",path:root+"/chapters/a/a.md",sha256:digest,state:"unique",rangesUtf16:[[100+i*40,110+i*40]],fragmentEvidenceUtf16:[],
      }],workingAnchors:[{
        chapterId:"a",path:root+"/chapters/a/a.working.md",sha256:digest,state:"unique",rangesUtf16:[[100+i*40,110+i*40]],fragmentEvidenceUtf16:[],
      }]}],
  }))};
assert.equal(sidecarMdDocuments(map).length,3);
const first=map.relations[0].elementId;
assert.equal(pdfElementMdTargets(map,first).length,3);
assert.deepEqual(pdfElementAtPoint(map,1,.2,.2),{kind:"unique",value:map.relations[0]});
assert.deepEqual(pdfElementAtPoint(map,1,.45,.2),{kind:"unmatched"});
assert.deepEqual(pdfElementAtPoint(map,0,.2,.2),{kind:"unmatched"});
assert.deepEqual(mdElementAtOffset(map,root+"/chapters/a/a.working.md",105),{kind:"unique",value:map.relations[0]});
assert.deepEqual(mdElementAtOffset(map,root+"/md/ocr.md",70),{kind:"unmatched"});
const ambiguous=structuredClone(map) as PdfMdMappingSidecarV1;
(ambiguous.relations[1].pdfRegions[0].normalizedBBox as unknown as number[])[0]=.3;
assert.deepEqual(pdfElementAtPoint(ambiguous,1,.35,.2),{kind:"ambiguous",count:2});
(ambiguous.relations[1].parts[0].workingAnchors[0].rangesUtf16 as unknown as number[][])[0]=[105,155];
assert.deepEqual(mdElementAtOffset(ambiguous,root+"/chapters/a/a.working.md",105),{kind:"ambiguous",count:2});
assert.deepEqual(mdElementsOverlappingRange(map,root+"/chapters/a/a.working.md",99,160),{kind:"ambiguous",count:2});
const nonUnique=structuredClone(map) as PdfMdMappingSidecarV1;
(nonUnique.relations[0].parts[0].workingAnchors[0] as any).state="ambiguous";
assert.equal(pdfElementMdTargets(nonUnique,first).some(t=>t.layer==="working"),false);
console.log("WP6_BIDIRECTIONAL_INDEX_UNIT_OK unique=2 ambiguousBlocked=2 nonUniqueExcluded=1 fullHashPaths=3");
