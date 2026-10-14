import * as assert from "node:assert/strict";
import { createHash } from "crypto";
import { extractMineruElements } from "./mineruElementExtractor";
import { importMineruDocumentIrFromBytes,reconstructMineruJsonFromIr } from "./documentIrImport";
import { encodeDocumentIrV1,initialBlockId,validateDocumentIrV1,DocumentIrValidationError } from "./documentIrV1";

const pageSize=[594,783];
const bodyA={type:"text",index:7,bbox:[10,20,90,60],lines:[{bbox:[10,20,90,60],spans:[
  {type:"text",bbox:[10,20,90,40],content:"跨页前半 😀"},
  {type:"text",bbox:[10,40,90,60],content:" 接续"}]}],merge_prev:false};
const table={type:"table",index:7,bbox:[90,125,310,235],blocks:[
  {type:"table_caption",bbox:[90,125,310,140],lines:[{spans:[{type:"text",content:"表 1"}]}]},
  {type:"table_body",bbox:[90,145,310,235],lines:[{spans:[{type:"table",html:"<table><tr><td>q</td></tr></table>"}]}]},
]};
const formula={type:"interline_equation",bbox:[0,0,100,150],lines:[{spans:[
  {type:"interline_equation",content:"\\frac{a}{b}",image_path:"images/eq1.png"}
]}]};
const source={_backend:"hybrid",_version_name:"3.4.4",_ocr_enable:false,_extra:{verified:false},
  pdf_info:[
    {preproc_blocks:[bodyA,table],discarded_blocks:[{type:"header",index:2,bbox:[0,0,200,20],
      lines:[{spans:[{type:"text",content:"Page header"}]}]}],page_size:pageSize,page_idx:0,
      para_blocks:[bodyA,table],extra_page_metadata:{rotationInference:0}},
    {preproc_blocks:[formula],discarded_blocks:[{type:"footer",bbox:[0,550,70,560]}],
      page_size:[783,594],page_idx:1,para_blocks:[formula]},
  ]};
const bytes=new TextEncoder().encode(JSON.stringify(source)),unchanged=Buffer.from(bytes);
const pdf=new TextEncoder().encode("pdf fixture not copied to IR");
const logical="/ocr2md/Book";
function create(){return importMineruDocumentIrFromBytes("obsidian-ocr2md",logical+"/original.pdf",pdf,
  logical+"/json/original.json",bytes);}
const doc=create();validateDocumentIrV1(doc);
assert.deepEqual(Buffer.from(bytes),unchanged,"import may not mutate OCR bytes");
assert.equal(doc.kind,"ocr2md/document-ir");assert.equal(doc.schemaVersion,1);
assert.equal(doc.ocr.sha256,createHash("sha256").update(bytes).digest("hex"));
assert.equal(doc.pdf.sha256,createHash("sha256").update(pdf).digest("hex"));
assert.equal(doc.importState,"page-import-provisional");
assert.deepEqual(doc.summary,{pages:2,bodyElements:3,discardedElements:2,provisionalBlocks:3});
assert.equal(doc.pages[0].preprocBlocks.length,2);
assert.equal(doc.pages[0].pageMetadata.extra_page_metadata!==undefined,true);
assert.equal(doc.pages[1].pageSize[0],783);
assert.equal(doc.sourceElements.length,5);
assert.equal(doc.blocks.length,3);
assert.equal(doc.chapters.length,0);
assert.equal(doc.outputMarkdown.length,0,"No official MD, no generated MD files during importer");
assert.ok(doc.blocks.every(x=>x.audit==="unreviewed"&&x.status==="provisional"&&x.chapterId===null&&
  x.readingOrder===null&&x.sources.length===1));
assert.ok(doc.sourceElements.some(e=>e.type==="header"&&e.collection==="discarded_blocks"));
assert.equal(doc.sourceElements[1].segments[1].html,"<table><tr><td>q</td></tr></table>");
assert.equal(doc.sourceElements[2].segments[0].imagePath,"images/eq1.png");
assert.ok(doc.blocks[0].text.includes("😀"));
assert.equal(doc.blocks[1].text,"表 1","html must remain in raw source; no fake MD table conversion");
assert.equal(doc.blocks[0].blockId,initialBlockId(doc.blocks[0].sources[0].elementId));
assert.deepEqual(doc.blocks.map(b=>b.blockId),create().blocks.map(b=>b.blockId),"repeatable initial IDs");
const serialized=encodeDocumentIrV1(doc);
assert.deepEqual(encodeDocumentIrV1(JSON.parse(new TextDecoder().decode(serialized))),serialized,"deterministic JSON");
assert.deepEqual(reconstructMineruJsonFromIr(doc),source,"every source key and raw block must survive reconstruction");
assert.deepEqual(reconstructMineruJsonFromIr(JSON.parse(new TextDecoder().decode(serialized))),source,
  "on-disk IR can reconstruct original semantic JSON");
// Source ID tied to OCR exact bytes; semantic equivalent formatting has new source identity.
const spaced=new TextEncoder().encode(JSON.stringify(source,null,2));
const reimport=importMineruDocumentIrFromBytes("obsidian-ocr2md",logical+"/original.pdf",pdf,
  logical+"/json/original.json",spaced);
assert.notEqual(reimport.blocks[0].blockId,doc.blocks[0].blockId,"new source revision needs explicit migration");
assert.deepEqual(reconstructMineruJsonFromIr(reimport),source);
let rejected=0;
function bad(change:(doc:any)=>void,message:string){
  const clone=JSON.parse(JSON.stringify(doc));change(clone);
  assert.throws(()=>validateDocumentIrV1(clone),DocumentIrValidationError,message);rejected++;
}
bad(x=>x.pages[0].pageIndex=4,"wrong PDF index");
bad(x=>x.sourceElements[0].jsonPointer="/pdf_info/20/para_blocks/0","stale source pointer");
bad(x=>x.sourceElements[0].bbox=[-10,1,1,2],"invalid bbox");
bad(x=>x.sourceElements[0].normalizedBBox=[0,0,0,0],"bad normalized bbox");
bad(x=>x.sourceElements[0].id=x.sourceElements[1].id,"duplicate raw ID");
bad(x=>x.pages[0].bodyElementIds.pop(),"dropped body evidence");
bad(x=>x.pages[0].bodyElementIds.push(x.pages[0].discardedElementIds[0]),"wrong element collection");
bad(x=>x.blocks[0].sources=[{elementId:"invented"}],"unknown source");
bad(x=>x.blocks[0].sources=[{elementId:x.pages[0].discardedElementIds[0]}],"discarded not body");
bad(x=>x.blocks[0].sources=[{elementId:x.blocks[0].sources[0].elementId,utf16Range:[1,2]}],"orphan span range");
bad(x=>x.blocks[0].sources=[{elementId:x.blocks[0].sources[0].elementId,
  segmentPointer:"/pdf_info/0/para_blocks/0/lines/0/spans/0",utf16Range:[0,100]}],"range out of bounds");
bad(x=>x.blocks[0].readingOrder=0,"premature reading order");
bad(x=>x.blocks[0].chapterId="ch-missing","false chapter");
bad(x=>x.blocks[0].audit="verified","false human audit");
bad(x=>x.summary.bodyElements=1,"summary mismatch");
bad(x=>x.outputMarkdown=[{chapterId:"ch",path:"fake.md",sha256:"0".repeat(64)}],"no fake output");
bad(x=>x.sourceMetadata.pdf_info=[],"illegal duplicate original data");
// Existing extractor remains the only source-ID authority.
const extracted=extractMineruElements(bytes);
assert.deepEqual(doc.sourceElements.map(e=>e.id),[...extracted.bodyElements,...extracted.discardedElements].map(e=>e.id));
console.log("IR_WP1_SCHEMA_UNIT_PASS",JSON.stringify({pages:doc.pages.length,body:doc.summary.bodyElements,
  discarded:doc.summary.discardedElements,initialBlocks:doc.blocks.length,semanticRoundtrip:true,
  noOfficialMd:true,invalidCases:rejected}));
