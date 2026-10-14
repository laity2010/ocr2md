import * as assert from "node:assert/strict";
import {importMineruDocumentIrFromBytes,reconstructMineruJsonFromIr} from "./documentIrImport";
import {proposeIrReconstruction} from "./documentIrReconstruction";
import {encodeDocumentIrV1,validateDocumentIrV1,DocumentIrValidationError,
  validIrChapterFileName,type DocumentIrV1} from "./documentIrV1";
import {generateIrMarkdownBundle,generateIrWholeBookMarkdown} from "./documentIrMarkdown";
import {applyDirSourceChange} from "./dirSourceEditing";
import {proposeIrChapters,listIrChapterTree,explicitMoveChapterBoundary,
  explicitPromoteTitleToSection,explicitDemoteLeafSection,explicitRenameChapter,
  explicitClassifyOcrHeading,insertManualPdfHeading,deleteManualPdfHeading,v2IrChapterHeadings,v2IrAssignSequence,
  v2IrSetStandalone,v2IrSetChapterFile} from "./documentIrChapters";

const block=(type:string,content:string,level?:number)=>({type,bbox:[20,30,270,100],index:1,
  ...(level===undefined?{}:{level}),lines:[{spans:[{type:"text",content}]}]});
const source={_version_name:"mineru-fixture",pdf_info:[
  {page_idx:0,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],para_blocks:[
    block("title","My Book",2),block("title","A. Writer & B. Scientist",2),block("text","Cover copyright")
  ]},
  {page_idx:1,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],para_blocks:[
    block("title","My Book",1),block("text","Summary body"),block("text","Main chapter introduction"),
    block("title","Methods",2),block("text","Methods evidence"),
    block("title","Findings",2),block("text","Findings observations")
  ]},
  {page_idx:2,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],para_blocks:[
    block("title","Appendix A: Data",2),block("text","Appendix narrative"),
    block("title","Inputs",2),block("text","Input values"),
    block("title","References",2),block("ref_text","Source citation")
  ]}
]};
const bytes=new TextEncoder().encode(JSON.stringify(source));
const initial=importMineruDocumentIrFromBytes("ocr2md","/book/file.pdf",new Uint8Array([1,2]),"/book/ocr.json",bytes);
const reviewed=proposeIrReconstruction(initial);
const outlined=proposeIrChapters(reviewed);
validateDocumentIrV1(outlined);
assert.equal(outlined.chapters.filter(c=>c.depth===1).length,4,"cover, main, appendix, references");
assert.equal(outlined.chapters.filter(c=>c.depth===2).length,3,"methods, findings, appendix inputs");
assert.equal(outlined.chapters.length,7);
assert.equal(outlined.chapterStructure?.candidates.filter(c=>c.proposedRole==="uncertain").length,1,"byline not section");
assert.equal(outlined.chapterStructure?.operations.length,0);
assert.ok(outlined.chapters.every(c=>c.status==="provisional"));
assert.equal(outlined.blocks.length,reviewed.blocks.length);
assert.ok(outlined.blocks.every(b=>b.chapterId&&b.audit==="unreviewed"&&b.readingOrder!==null));
assert.equal(outlined.chapters[0].name,"前置内容（待审核）");
assert.deepEqual(reconstructMineruJsonFromIr(outlined),source);
const tree=listIrChapterTree(outlined);
assert.equal(tree.length,4);
assert.equal(tree.reduce((total,n)=>total+n.subtreeBlocks,0),outlined.blocks.length);
assert.deepEqual(tree.map(n=>n.children.length),[0,2,1,0]);
assert.deepEqual(tree.map(n=>n.pdfPages),[[1],[2],[3],[3]]);
const serial=JSON.parse(new TextDecoder().decode(encodeDocumentIrV1(outlined)));
validateDocumentIrV1(serial);
assert.deepEqual(listIrChapterTree(serial),tree);
// Move main boundary forward one block (previous title becomes part of cover).
const main=outlined.chapters[1],cover=outlined.chapters[0];
const moved=explicitMoveChapterBoundary(outlined,main.chapterId,outlined.blocks[4].blockId,
  "核对 PDF 后将正文起点后移一块");
assert.equal(moved.blocks[3].chapterId,cover.chapterId);
assert.equal(moved.blocks[4].chapterId,main.chapterId);
assert.deepEqual(moved.chapters.map(c=>c.chapterId),outlined.chapters.map(c=>c.chapterId));
assert.equal(moved.chapterStructure?.operations[0].kind,"move-boundary");
assert.deepEqual(reconstructMineruJsonFromIr(moved),source);
// Rename is explicit and anchored to the same title, no change to OCR.
const renamed=explicitRenameChapter(outlined,main.chapterId,"Main topic (corrected)","人工校正 OCR 主章节名称");
assert.equal(renamed.chapters[1].name,"Main topic (corrected)");
assert.equal(renamed.chapters[1].anchorBlockId,main.anchorBlockId);
assert.deepEqual(reconstructMineruJsonFromIr(renamed),source);
// Promote title back into section after demotion.
const methods=outlined.chapters.find(c=>c.name==="Methods")!;
const demoted=explicitDemoteLeafSection(outlined,methods.chapterId,"将 Methods 退回父章节");
assert.ok(!demoted.chapters.some(c=>c.chapterId===methods.chapterId));
assert.equal(demoted.blocks[6].chapterId,main.chapterId);
const promoted=explicitPromoteTitleToSection(demoted,methods.anchorBlockId!,main.chapterId,
  "PDF 表明 Methods 是真正小节");
assert.ok(promoted.chapters.some(c=>c.chapterId===methods.chapterId));
assert.equal(promoted.blocks[6].chapterId,methods.chapterId);
assert.deepEqual(reconstructMineruJsonFromIr(promoted),source);
// Manual chapter boundary workflow: one first-level heading + human MD filename.
const titled=explicitClassifyOcrHeading(outlined,main.anchorBlockId!,"root",
  "01-Main Article.md","PDF 主标题核实：作为正文主章节");
assert.equal(titled.chapters.find(ch=>ch.chapterId===main.chapterId)?.fileName,"01-Main Article.md");
assert.equal(titled.chapterStructure?.candidates.find(c=>c.headingBlockId===main.anchorBlockId)?.status,"confirmed");
assert.equal(generateIrMarkdownBundle(titled).files[1].path,"/book/ir-generated/01-Main Article.md");
assert.ok(titled.blocks.every(b=>b.audit==="unreviewed"),"chapter review never confirms OCR text");
assert.deepEqual(reconstructMineruJsonFromIr(titled),source);
const corrected=explicitClassifyOcrHeading(titled,methods.anchorBlockId!,"exclude",undefined,
  "PDF 核对：该行不是小节标题");
assert.ok(!corrected.chapters.some(ch=>ch.chapterId===methods.chapterId));
assert.equal(corrected.chapterStructure?.candidates.find(c=>c.headingBlockId===methods.anchorBlockId)?.status,"confirmed");
const excludedMd=generateIrMarkdownBundle(corrected);
assert.ok(excludedMd.files.some(f=>f.content.includes("\nMethods\n")));
assert.ok(excludedMd.files.every(f=>!f.content.includes("### Methods")),
  "explicit non-chapter title must render as plain OCR text without dropping source");
assert.ok(corrected.chapterStructure?.operations.some(op=>op.kind==="classify-heading"));
assert.equal(generateIrMarkdownBundle(corrected).files.flatMap(f=>f.ranges).length,source.pdf_info.reduce((n,p)=>n+p.para_blocks.length,0));
const again=explicitClassifyOcrHeading(corrected,methods.anchorBlockId!,"section",undefined,
  "PDF 核对：恢复小节");
assert.ok(again.chapters.some(ch=>ch.chapterId===methods.chapterId));
assert.equal(again.chapters.find(ch=>ch.chapterId===main.chapterId)?.fileName,"01-Main Article.md");
assert.deepEqual(reconstructMineruJsonFromIr(again),source);
for(const bad of ["../bad.md","sub/bad.md","note.txt",".md",".hidden.md","what?.md","bad\\name.md"]){
  assert.equal(validIrChapterFileName(bad),false,bad);
  assert.throws(()=>explicitClassifyOcrHeading(outlined,main.anchorBlockId!,"root",bad,"不安全路径"),Error);
}
assert.equal(validIrChapterFileName("01-伯克希尔的 Alpha.md"),true);
assert.throws(()=>explicitClassifyOcrHeading(outlined,main.anchorBlockId!,"root","01-Main.md",""),Error);
// V2 exact chapter-file workflow: checkbox, inherited file, consecutive
// renumbering, owner inline rename, and source/OCR immutability.
// All OCR title candidates are actionable. These four root cuts are the
// original default; intermediate H2/H3 candidates must also be toggleable.
const rootBlockIds=new Set(outlined.chapters.filter(c=>c.depth===1).map(c=>c.anchorBlockId));
const rootFileRows=(doc:DocumentIrV1)=>v2IrChapterHeadings(doc)
  .filter(row=>rootBlockIds.has(row.blockId));
const v2Rows=rootFileRows(outlined);
assert.ok(v2IrChapterHeadings(outlined).length>v2Rows.length,
  'non-root titles can also request an independent file');
assert.equal(v2Rows.length,4);
assert.deepEqual(v2Rows.map(x=>x.raw),["My Book","My Book","Appendix A: Data","References"]);
assert.ok(v2Rows.every(x=>x.standalone));
const numbered=v2IrAssignSequence(outlined,"09");
assert.deepEqual(rootFileRows(numbered).map(x=>x.fileName),[
  "09 My Book.md","10 My Book.md","11 Appendix A Data.md","12 References.md"]);
assert.deepEqual(reconstructMineruJsonFromIr(numbered),source);
const methodRow=v2IrChapterHeadings(numbered).find(h=>h.raw==="Methods")!;
assert.ok(methodRow && !methodRow.standalone,"H2 candidate should be initially grouped");
const fileForH2=v2IrSetStandalone(numbered,methodRow.blockId,true);
assert.equal(v2IrChapterHeadings(fileForH2).find(h=>h.blockId===methodRow.blockId)?.standalone,true);
assert.equal(generateIrMarkdownBundle(fileForH2).files.length,
  generateIrMarkdownBundle(numbered).files.length+1);
assert.equal(fileForH2.chapters.find(ch=>ch.anchorBlockId===methodRow.blockId)?.depth,2);
assert.equal(generateIrWholeBookMarkdown(fileForH2).content,generateIrWholeBookMarkdown(numbered).content);
const rejoinH2=v2IrSetStandalone(fileForH2,methodRow.blockId,false);
assert.equal(generateIrMarkdownBundle(rejoinH2).files.length,
  generateIrMarkdownBundle(numbered).files.length);
const joined=v2IrSetStandalone(numbered,main.anchorBlockId!,false);
const joinedRows=rootFileRows(joined);
assert.deepEqual(joinedRows.map(x=>x.fileName),[
  "09 My Book.md","09 My Book.md","10 Appendix A Data.md","11 References.md"]);
assert.deepEqual(joinedRows.map(x=>x.standalone),[true,false,true,true]);
assert.equal(joined.chapters.find(c=>c.chapterId===main.chapterId)?.depth,1,
  'unchecking standalone must not demote the H1 chapter to H2');
assert.deepEqual(joined.chapters.map(ch=>({anchor:ch.anchorBlockId,depth:ch.depth,parent:ch.parentChapterId})),
  numbered.chapters.map(ch=>({anchor:ch.anchorBlockId,depth:ch.depth,parent:ch.parentChapterId})),
  'checkbox changes file output grouping only, never chapter hierarchy');
assert.equal(joined.blocks.find(b=>b.blockId===main.anchorBlockId)?.type,'title');
assert.equal(generateIrWholeBookMarkdown(joined).content,generateIrWholeBookMarkdown(numbered).content,
  'the full-book Markdown and all H1 hashes stay byte-for-byte unchanged');
const combined=generateIrMarkdownBundle(joined);
const firstRootText=combined.files[0].content;
assert.equal((firstRootText.match(/^# My Book$/gm)||[]).length,2,
  'two H1 titles belong to the same Markdown file, neither becomes H2');
assert.equal(combined.files[0].ranges.length,
  generateIrMarkdownBundle(numbered).files[0].ranges.length+
  generateIrMarkdownBundle(numbered).files[1].ranges.length);
assert.ok(joined.blocks.every(b=>b.audit==="unreviewed"));
assert.equal(generateIrMarkdownBundle(joined).files.length,3);
assert.ok(joined.chapterFileLayout?.some(x=>x.blockId===main.anchorBlockId&&x.standalone===false),
  'independent output-file grouping survives serialization');
const serializedJoined=JSON.parse(new TextDecoder().decode(encodeDocumentIrV1(joined)));
assert.deepEqual(rootFileRows(serializedJoined).map(x=>x.standalone),[true,false,true,true]);
assert.deepEqual(reconstructMineruJsonFromIr(joined),source);
const restored=v2IrSetStandalone(joined,main.anchorBlockId!,true);
assert.deepEqual(rootFileRows(restored).map(x=>x.fileName),[
  "09 My Book.md","10 My Book.md","11 Appendix A Data.md","12 References.md"]);
const v2Named=v2IrSetChapterFile(restored,main.anchorBlockId!,"10 正文和策略.md");
assert.equal(rootFileRows(v2Named)[1].fileName,"10 正文和策略.md");
assert.ok(generateIrMarkdownBundle(v2Named).files.some(f=>f.path.endsWith("/10 正文和策略.md")));
assert.deepEqual(reconstructMineruJsonFromIr(v2Named),source);
// Two adjacent roots joined to a previous checked root retain all three H1.
const joinedTwice=v2IrSetStandalone(joined, v2Rows[2].blockId,false);
assert.deepEqual(rootFileRows(joinedTwice).map(x=>x.standalone),[true,false,false,true]);
const joinedTwiceBundle=generateIrMarkdownBundle(joinedTwice);
assert.equal(joinedTwiceBundle.files.length,2);
assert.equal(joinedTwiceBundle.files[0].content.match(/^# (My Book|Appendix A: Data)$/gm)?.length,3,
  'three real H1 headings stay independent of file cuts; synthetic cover heading is separate');
assert.equal(joinedTwiceBundle.files[1].content.match(/^# /gm)?.length,1);
assert.equal(generateIrWholeBookMarkdown(joinedTwice).content,
  generateIrWholeBookMarkdown(numbered).content);
assert.ok(joinedTwice.chapters.every((ch,i)=>ch.depth===numbered.chapters[i].depth));
const reSplit=v2IrSetStandalone(joinedTwice,main.anchorBlockId!,true);
assert.deepEqual(rootFileRows(reSplit).map(x=>x.standalone),[true,true,false,true]);
assert.equal(generateIrMarkdownBundle(reSplit).files.length,3);
assert.equal(generateIrWholeBookMarkdown(reSplit).content,generateIrWholeBookMarkdown(numbered).content);
assert.throws(()=>v2IrSetStandalone(numbered,v2Rows[0].blockId,false),/第一个标题/);
assert.throws(()=>v2IrSetChapterFile(joined,main.anchorBlockId!,"10-other.md"),/独立成章/);
assert.throws(()=>v2IrAssignSequence(outlined,"x"),/数字/);
assert.throws(()=>v2IrSetChapterFile(numbered,main.anchorBlockId!,"../escape.md"),/合法/);
assert.throws(()=>v2IrSetChapterFile(numbered,main.anchorBlockId!,"09 My Book.md"),/不可重复/);
// True OCR-missing heading: insert a new DIR block with explicit PDF page-only
// human provenance. Never create a MinerU source element, fake bbox or change raw OCR.
const manual=insertManualPdfHeading(outlined,outlined.blocks[1].blockId,
  "Missing Chapter From PDF",1,1,"Reviewer saw this title in original PDF");
const added=manual.manualHeadings?.at(-1);
assert.ok(added);
assert.equal(added.pdfPageNumber,1);
assert.equal(added.afterBlockId,outlined.blocks[1].blockId);
assert.equal(manual.blocks.length,outlined.blocks.length+1);
assert.equal(manual.sourceElements.length,outlined.sourceElements.length);
assert.ok(manual.chapterStructure?.candidates.some(c=>c.headingBlockId===added.blockId &&
  c.sourceElementIds.length===0 && c.status==='confirmed'));
const manualFile=generateIrMarkdownBundle(manual).files.find(f=>f.ranges.some(r=>r.blockId===added.blockId))!;
const manualRange=manualFile.ranges.find(r=>r.blockId===added.blockId)!;
assert.deepEqual(manualRange.pdfPages,[1]);
assert.equal(manualRange.manualPdfPage,1);
assert.deepEqual(manualRange.evidence,[]);
assert.ok(manualFile.content.includes('# Missing Chapter From PDF'));
assert.deepEqual(reconstructMineruJsonFromIr(manual),source);
const manualRows=v2IrChapterHeadings(manual);
const manualRow=manualRows.find(h=>h.blockId===added.blockId)!;
assert.equal(manualRow.standalone,true);
const combinedManual=v2IrSetStandalone(manual,added.blockId,false);
assert.equal(v2IrChapterHeadings(combinedManual).find(h=>h.blockId===added.blockId)?.standalone,false);
assert.equal(generateIrWholeBookMarkdown(combinedManual).content,generateIrWholeBookMarkdown(manual).content);
const splitManual=v2IrSetStandalone(combinedManual,added.blockId,true);
const deletedManual=deleteManualPdfHeading(splitManual,added.blockId,'用户删除人工标题');
assert.ok(!deletedManual.blocks.some(b=>b.blockId===added.blockId));
assert.ok(!deletedManual.chapterFileLayout?.some(c=>c.blockId===added.blockId));
validateDocumentIrV1(deletedManual);
generateIrMarkdownBundle(deletedManual);
const fullWithManual=generateIrWholeBookMarkdown(manual);
const manualSourceRange=fullWithManual.ranges.find(r=>r.blockId===added.blockId)!;
const editedManual=applyDirSourceChange(manual,fullWithManual,
  fullWithManual.content.slice(0,manualSourceRange.contentFrom)+
  '# Missing Chapter – Corrected Against PDF'+
  fullWithManual.content.slice(manualSourceRange.contentTo));
assert.equal(editedManual.blocks.find(b=>b.blockId===added.blockId)?.text,
  'Missing Chapter – Corrected Against PDF');
assert.deepEqual(editedManual.manualHeadings,manual.manualHeadings);
assert.deepEqual(reconstructMineruJsonFromIr(editedManual),source);
assert.throws(()=>insertManualPdfHeading(outlined,outlined.blocks[1].blockId,
  'Fictitious Page',1,99,'fabricated'),/页码/);
assert.throws(()=>insertManualPdfHeading(outlined,outlined.blocks[1].blockId,
  'X\n# Unanchored',1,1,'invalid multiline'),/单行/);
assert.throws(()=>insertManualPdfHeading(outlined,'blk_000000000000000000000000',
  'Fictitious Anchor',1,1,'invalid source'),/插入位置/);
// Reject malformed ancestry, gaps and false human verification.
function cloned(){return JSON.parse(JSON.stringify(outlined));}
let rejected=0;
function invalid(change:(c:any)=>void,reason:string){
  const c=cloned();change(c);assert.throws(()=>validateDocumentIrV1(c),DocumentIrValidationError,reason);rejected++;
}
invalid(c=>c.blocks[3].chapterId=c.chapters[0].chapterId,"wrong chapter assignment");
invalid(c=>c.chapters[1].anchorBlockId=c.chapters[0].anchorBlockId,"duplicate anchor");
invalid(c=>c.chapters[1].parentChapterId=c.chapters[2].chapterId,"cycle or wrong root");
invalid(c=>c.chapters[2].depth=1,"subheading level mismatch");
invalid(c=>delete c.chapterStructure,"missing tree metadata");
invalid(c=>c.chapterStructure.candidates[0].sourceElementIds=["invented"],"broken source evidence");
invalid(c=>c.chapterStructure.candidates[0].status="verified","false candidate audit");
invalid(c=>c.chapters[0].status="reviewed","false human chapter approval");
invalid(c=>c.chapters[2].order=100,"chapter order disagrees with location");
invalid(c=>c.chapterStructure.candidates[0].pageNumber=3,"candidate claims wrong page");
invalid(c=>c.blocks.pop(),"lost source block after outlining");
assert.throws(()=>explicitDemoteLeafSection(outlined,main.chapterId,"wrong root"),Error);rejected++;
assert.throws(()=>explicitMoveChapterBoundary(outlined,main.chapterId,outlined.blocks[0].blockId,"invalid"),Error);
console.log("IR_WP4_CHAPTER_UNIT_PASS",JSON.stringify({pages:3,roots:tree.length,sections:3,allBlocks:outlined.blocks.length,
  coverSeparated:true,authorExcluded:true,nestedTree:true,move:true,rename:true,promote:true,demote:true,
  originalJsonRoundtrip:true,invalidCases:rejected}));
