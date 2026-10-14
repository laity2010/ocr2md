import * as assert from "node:assert/strict";
import {importMineruDocumentIrFromBytes,reconstructMineruJsonFromIr} from "./documentIrImport";
import {validateDocumentIrV1,encodeDocumentIrV1,DocumentIrValidationError} from "./documentIrV1";
import {proposeIrReconstruction,explicitMergeAdjacentTextBlocks,explicitSplitBlockAtUtf16,
  explicitReorderBlocks,explicitReplaceBlockText} from "./documentIrReconstruction";

const text=(content:string,bbox:number[],merge_prev?:boolean)=>({type:"text",bbox,index:0,
  ...(merge_prev===undefined?{}:{merge_prev}),lines:[{spans:[{type:"text",content}]}]});
const formatted=(a:string,b:string)=>({type:"text",index:2,bbox:[10,20,90,70],
  lines:[{spans:[{type:"text",content:a},{type:"text",content:b}]}]});
const table={type:"table",bbox:[100,100,340,210],blocks:[{type:"table_body",bbox:[100,110,340,210],
  lines:[{spans:[{type:"table",html:"<table><tr><td>A</td></tr></table>"}]}]}]};
const original={_backend:"hybrid",_version_name:"3.4.4",pdf_info:[
  {page_idx:0,page_size:[600,800],preproc_blocks:[],discarded_blocks:[{type:"header",bbox:[0,0,10,10]}],
   para_blocks:[formatted("first 😀", " rest"),text("A long sentence continues into",[65,690,350,760],false)]},
  {page_idx:1,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],
   para_blocks:[text("next page and ends with more words.",[60,80,280,150],false),text("short additional sentence.",[60,160,280,230],true),table]},
  {page_idx:2,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],
   para_blocks:[text("a left paragraph",[50,80,280,130]),text("a left second paragraph",[50,160,280,210]),
     text("a right paragraph",[310,80,550,130]),text("a right second paragraph",[310,160,550,210])]},
]};
const bytes=new TextEncoder().encode(JSON.stringify(original));
const pdf=new TextEncoder().encode("%PDF fake example");
const provisional=importMineruDocumentIrFromBytes("ocr2md","/book/source.pdf",pdf,"/book/ocr.json",bytes);
assert.equal(provisional.importState,"page-import-provisional");
const reconstructed=proposeIrReconstruction(provisional);validateDocumentIrV1(reconstructed);
assert.equal(reconstructed.importState,"logical-review");
assert.equal(reconstructed.reconstruction?.orderBasis,"mineru-array-provisional");
assert.deepEqual(reconstructed.blocks.map(b=>b.readingOrder),reconstructed.blocks.map((_,i)=>i));
assert.deepEqual(reconstructed.reconstruction?.appliedOperations,[]);
assert.equal(reconstructed.blocks.length,9);
assert.ok(reconstructed.blocks.every(b=>b.audit==="unreviewed"&&b.chapterId===null));
assert.equal(reconstructed.reconstruction?.candidates.filter(c=>c.kind==="cross-page-continuation").length,1);
assert.equal(reconstructed.reconstruction?.candidates.filter(c=>c.kind==="merge-prev-hint").length,1);
assert.equal(reconstructed.reconstruction?.candidates.filter(c=>c.kind==="multi-column-order").length,1);
assert.ok(reconstructed.reconstruction?.candidates.every(c=>c.status==="needs-review"));
assert.equal(reconstructed.reconstruction?.candidates.find(c=>c.kind==="cross-page-continuation")?.evidence.mineruMergePrev,false,
  "MinerU false hint must be kept visible; no silent override");
assert.deepEqual(reconstructMineruJsonFromIr(reconstructed),original);
assert.deepEqual(proposeIrReconstruction(provisional).reconstruction,reconstructed.reconstruction,
  "proposals and IDs must be deterministic");
const [first,second,third,fourth,fifth]=reconstructed.blocks;
// Pure merge: keeps first stable block ID, concatenates exact OCR text, retains both sources.
const merged=explicitMergeAdjacentTextBlocks(reconstructed,second.blockId,third.blockId,
  "人工核对 PDF，两个 OCR 元素属于同一自然段");
assert.equal(merged.blocks.length,8);
assert.equal(merged.blocks[1].blockId,second.blockId);
assert.equal(merged.blocks[1].text,second.text+third.text);
assert.deepEqual(merged.blocks[1].sources,[...second.sources,...third.sources]);
assert.equal(merged.blocks[1].status,"structured");
assert.equal(merged.blocks[1].audit,"unreviewed","operation must not impersonate human verified audit");
assert.equal(merged.reconstruction?.appliedOperations.length,1);
assert.deepEqual(reconstructMineruJsonFromIr(merged),original);
assert.deepEqual(reconstructed.blocks[1].sources,second.sources,"input IR must remain immutable");
// Split across nested content segment boundary and within surrogate-safe UTF-16.
const offset="first 😀".length+2;
const split=explicitSplitBlockAtUtf16(reconstructed,first.blockId,offset,
  "人工核对，原 OCR 元素实际包含两个逻辑段落");
assert.equal(split.blocks.length,10);
assert.equal(split.blocks[0].blockId,first.blockId);
assert.notEqual(split.blocks[1].blockId,first.blockId);
assert.equal(split.blocks[0].text+split.blocks[1].text,first.text);
assert.ok(split.blocks[0].sources.length>=2,"split retains original segment provenance");
assert.ok(split.blocks[1].sources[0].segmentPointer?.includes("/spans/1"));
assert.equal(split.reconstruction?.appliedOperations[0].kind,"split");
assert.deepEqual(reconstructMineruJsonFromIr(split),original);
const splitRoundtrip=JSON.parse(new TextDecoder().decode(encodeDocumentIrV1(split)));
validateDocumentIrV1(splitRoundtrip);assert.deepEqual(reconstructMineruJsonFromIr(splitRoundtrip),original);
// Splits across source boundaries after an explicit merge are also lossless.
const midpoint=second.text.length+6;
const resplit=explicitSplitBlockAtUtf16(merged,second.blockId,midpoint,"合并后再次人工分段");
assert.equal(resplit.blocks.length,9);
assert.equal(resplit.blocks[1].text+resplit.blocks[2].text,merged.blocks[1].text);
validateDocumentIrV1(resplit);
assert.deepEqual(reconstructMineruJsonFromIr(resplit),original);
// A second reorder must be a complete block-ID permutation, cannot omit or duplicate.
const ids=reconstructed.blocks.map(b=>b.blockId);
const reordered=explicitReorderBlocks(reconstructed,[...ids].reverse(),"人工确认双栏内容次序");
assert.deepEqual(reordered.blocks.map(b=>b.blockId),[...ids].reverse());
assert.equal(reordered.reconstruction?.orderBasis,"explicit-reordered");
assert.deepEqual(reconstructMineruJsonFromIr(reordered),original);
assert.deepEqual(reordered.blocks.map(b=>b.readingOrder),ids.map((_,i)=>i));

const changed=explicitReplaceBlockText(reconstructed,first.blockId,"修订 OCR 文本（草稿）","依据 PDF 逐字核对");
assert.equal(changed.blocks[0].text,"修订 OCR 文本（草稿）");
assert.equal(changed.blocks[0].audit,"unreviewed");
assert.equal(changed.reconstruction?.appliedOperations[0].kind,"edit-text");
assert.deepEqual(reconstructMineruJsonFromIr(changed),original,
  "new canonical text must never overwrite original OCR source evidence");
assert.equal(explicitReplaceBlockText(changed,first.blockId,"修订 OCR 文本（草稿）","无变化"),changed);
// Programmatic errors and source coverage tampering never pass validation.
let refused=0;
function rejects(fn:()=>unknown,msg:string){assert.throws(fn,Error,msg);refused++;}
rejects(()=>explicitSplitBlockAtUtf16(reconstructed,fifth.blockId,1,"rich table"),"Cannot split rich HTML table");
rejects(()=>explicitSplitBlockAtUtf16(reconstructed,first.blockId,0,"bad offset"),"Zero offset");
rejects(()=>explicitSplitBlockAtUtf16(reconstructed,first.blockId,"first ".length+1,"bad surrogate"),"Emoji mid-codepoint");
rejects(()=>explicitMergeAdjacentTextBlocks(reconstructed,first.blockId,third.blockId,"not adjacent"),"Nonadjacent merge");
rejects(()=>explicitMergeAdjacentTextBlocks(reconstructed,fourth.blockId,fifth.blockId,"table"),"text/table merge");
rejects(()=>explicitReorderBlocks(reconstructed,[...ids.slice(1)],"drop"),"Cannot drop block");
rejects(()=>explicitReorderBlocks(reconstructed,[ids[0],...ids.slice(0,-1)],"duplicate"),"Cannot repeat block");
rejects(()=>proposeIrReconstruction(reconstructed),"Cannot reinitialize already structured IR");
const clone:any=JSON.parse(JSON.stringify(split));
clone.blocks[1].sources[0].utf16Range=[0,1];
assert.throws(()=>validateDocumentIrV1(clone),DocumentIrValidationError,
  "Tampered segment coverage must not validate");refused++;
console.log("IR_WP3_RECONSTRUCTION_UNIT_PASS",JSON.stringify({
  initial:reconstructed.blocks.length,crossPageProposals:1,mergeHints:1,multicolumn:1,
  split:true,merge:true,reorder:true,sourceCoverage:true,semanticRoundtrip:true,
  noHumanAutoApproval:true,rejections:refused}));
