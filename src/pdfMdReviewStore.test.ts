import * as assert from "node:assert/strict";
import { FixtureWorkspaceRegistry } from "./v3FixtureWorkspaceFs";
import { location,WorkspaceV3Error } from "./workspaceFsV3";
import { sha256,encodePdfMdSidecar,type PdfMdMappingSidecarV1 } from "./mineruMappingSidecar";
import { emptyReview,encodeReview,loadReview,saveReview,validateReview,reviewFilePath,type PdfMdReviewV1 } from "./pdfMdReviewStore";

async function run(){
  const id="obsidian-ocr2md",root="/ocr2md/Trial",registry=new FixtureWorkspaceRegistry([{workspaceId:id,label:"fixture"}]);
  const fs=await registry.open(id);let n=0;
  const directory=async(path:string)=>fs.commit({workspaceId:id,requestId:"dir"+(++n),operations:[{type:"create-directory",at:location(id,path),ifAbsent:true}]});
  const file=async(path:string,bytes:Uint8Array)=>fs.commit({workspaceId:id,requestId:"file"+(++n),operations:[{type:"create-file",at:location(id,path),ifAbsent:true,bytes}]});
  const data=new TextEncoder();
  await directory("/ocr2md");await directory(root);await directory(root+"/.ocr2md");await directory(root+"/json");await directory(root+"/md");
  const pdf=data.encode("fake pdf fixture"),ocr=data.encode("fake ocr fixture"),md=data.encode("# chapter\nhello\n");
  const files=[{path:root+"/book.pdf",bytes:pdf},{path:root+"/json/ocr.json",bytes:ocr},{path:root+"/md/original.md",bytes:md}];
  for(const f of files)await file(f.path,f.bytes);
  const map:PdfMdMappingSidecarV1={kind:"ocr2md/pdf-md-map",schemaVersion:1,workspaceId:id,
    pdf:{path:files[0].path,sha256:sha256(pdf)},ocr:{path:files[1].path,sha256:sha256(ocr)},
    originalMd:{path:files[2].path,sha256:sha256(md)},chapterVersions:[],
    ocrSourceSha256:sha256(ocr),ignoredDiscardedCount:0,
    relations:[{elementId:`mineru:${sha256(ocr)}:p0:para_blocks:0`,type:"text",
      pdfRegions:[{pageIndex:0,pdfPageNumber:1,bbox:[10,10,70,20],pageSize:[100,100],normalizedBBox:[.1,.1,.7,.2]}],
      originalMdState:"unique",matchStatus:"candidate-complete",chapters:[],
      parts:[{partIndex:0,partKind:"paragraph",originalState:"unique",originalMdRangesUtf16:[[10,15]],
        originalMdFragmentEvidenceUtf16:[],chapterAnchors:[],workingAnchors:[]}],manuallyVerified:false}],
    summary:{"candidate-complete":1,"candidate-partial":0,ambiguous:0,unmatched:0,unavailable:0}};
  const mb=encodePdfMdSidecar(map),hash=sha256(mb);
  await file(root+"/.ocr2md/pdf-md-map.v1.json",mb);
  const unloaded=await loadReview(fs,root,map,hash);
  assert.equal(unloaded.node,undefined);assert.equal(unloaded.review.decisions.length,0);
  const d={elementId:map.relations[0].elementId,status:"已核对" as const,note:"对照 PDF 原文，内容一致",updatedAt:"2026-10-08T10:00:00.000Z"};
  const review:PdfMdReviewV1={...emptyReview(map,hash),decisions:[d]};
  assert.equal(encodeReview(review,map,hash).length>0,true);
  const created=await saveReview(fs,root,map,hash,review,"review-create");
  assert.ok(created.node);assert.equal(created.review.decisions[0].status,"已核对");
  const reread=await loadReview(fs,root,map,hash);assert.equal(reread.review.decisions[0].note,d.note);
  const changed:PdfMdReviewV1={...review,decisions:[{...d,status:"OCR错误",note:"OCR 多识别标记"}]};
  const replaced=await saveReview(fs,root,map,hash,changed,"review-replace",created.node!.revision);
  assert.equal(replaced.review.decisions[0].status,"OCR错误");
  await assert.rejects(()=>saveReview(fs,root,map,hash,review,"review-stale",created.node!.revision),
    e=>e instanceof WorkspaceV3Error&&e.code==="ESTALE");
  await assert.rejects(()=>saveReview(fs,root,map,"a".repeat(64),review,"review-wrong-map"),
    e=>e instanceof WorkspaceV3Error&&["ESTALE","EINVAL"].includes(e.code));
  const bad:PdfMdReviewV1={...review,decisions:[{...d,status:"已校正"}]};
  assert.throws(()=>validateReview(bad,map,hash),/Corrected review/);
  const corrected:PdfMdReviewV1={...review,decisions:[{...d,status:"已校正",correctedAnchor:{path:files[2].path,sha256:sha256(md),from:5,to:15}}]};
  validateReview(corrected,map,hash);
  const outside:PdfMdReviewV1={...corrected,decisions:[{...corrected.decisions[0],correctedAnchor:{path:"/other/source.md",sha256:sha256(md),from:5,to:15}}]};
  assert.throws(()=>validateReview(outside,map,hash),/Corrected MD range/);
  assert.equal(reviewFilePath(root),root+"/.ocr2md/pdf-md-review.v1.json");
  assert.equal((await fs.stat(location(id,root+"/.ocr2md/pdf-md-map.v1.json"))).size,mb.length);
  console.log("WP7_REVIEW_CAS_UNIT_OK created=1 replaced=1 staleBlocked=1 mapImmutable=1 invalidCorrectionBlocked=1 shaBound=1");
}
run().catch(e=>{console.error(e);process.exitCode=1;});
