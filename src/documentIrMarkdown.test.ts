import * as assert from "node:assert/strict";
import {importMineruDocumentIrFromBytes,reconstructMineruJsonFromIr} from "./documentIrImport";
import {proposeIrReconstruction,explicitReplaceBlockText,explicitSplitBlockAtUtf16,explicitMergeAdjacentTextBlocks} from "./documentIrReconstruction";
import {proposeIrChapters,explicitMoveChapterBoundary,explicitClassifyOcrHeading,
  v2IrAssignSequence} from "./documentIrChapters";
import {generateIrMarkdownBundle,generateIrWholeBookMarkdown,
  isIrChapterDelimitationConfirmed,validateIrMarkdownBundle,irMarkdownSourceAtOffset} from "./documentIrMarkdown";
import {validateDocumentIrV1} from "./documentIrV1";
import {buildIrMarkdownArchive} from "./documentIrArchive";
import {applyDirSourceChange} from "./dirSourceEditing";
const source={_backend:"hybrid",pdf_info:[
  {page_idx:0,page_size:[600,800],preproc_blocks:[],discarded_blocks:[{type:"header",bbox:[0,0,100,15]}],para_blocks:[
    {type:"title",level:1,bbox:[10,20,250,60],lines:[{spans:[{type:"text",content:"Main <title>"}]}]},
    {type:"text",bbox:[10,70,440,160],lines:[{spans:[{type:"text",content:"Hello 😀 & <script>alert(1)</script>"}]}]},
    {type:"title",level:2,bbox:[20,170,440,200],lines:[{spans:[{type:"text",content:"Subsection"}]}]},
    {type:"table",bbox:[10,210,490,420],blocks:[{type:"table_body",lines:[{spans:[{type:"table",html:'<table><tr><td rowspan="2">Alpha</td><td>Beta</td></tr><tr><td>two</td></tr></table>'}]}]}]},
    {type:"image",bbox:[25,440,400,470],blocks:[{type:"image_body",lines:[{spans:[{type:"image",image_path:"https://example.org/pic.png"}]}]}]},
    {type:"interline_equation",bbox:[25,480,400,510],lines:[{spans:[{type:"interline_equation",content:"a = b + c",image_path:"https://example.org/f.png"}]}]},
  ]},
  {page_idx:1,page_size:[600,800],preproc_blocks:[],discarded_blocks:[],para_blocks:[
    {type:"title",level:2,bbox:[10,40,250,80],lines:[{spans:[{type:"text",content:"Appendix A: Details"}]}]},
    {type:"chart",bbox:[20,90,420,210],blocks:[{type:"chart_body",lines:[{spans:[{type:"image",image_path:"javascript:alert(1)"}]}]}]},
    {type:"ref_text",bbox:[20,220,400,245],lines:[{spans:[{type:"text",content:"A. Author (2026)."}]}]}
  ]}
]};
const original=new TextEncoder().encode(JSON.stringify(source));
const doc=proposeIrChapters(proposeIrReconstruction(importMineruDocumentIrFromBytes("ocr2md","/ocr2md/Test/original.pdf",new Uint8Array([1,2,3]),"/ocr2md/Test/json/original.json",original)));
const bundle=generateIrMarkdownBundle(doc);validateIrMarkdownBundle(doc,bundle);
assert.equal(bundle.files.length,2);
assert.equal(bundle.files[0].ranges.length,6);assert.equal(bundle.files[1].ranges.length,3);
assert.equal(bundle.files.reduce((sum,f)=>sum+f.ranges.length,0),doc.blocks.length);
assert.equal(bundle.generatedFrom,"document-ir");assert.equal(bundle.audit,"unreviewed");
assert.ok(bundle.files[0].content.includes("# Main &lt;title&gt;"));
assert.ok(bundle.files[0].content.includes("## Subsection"));
assert.ok(bundle.files[0].content.includes("<table><tr><td rowspan="));
assert.ok(bundle.files[0].content.includes("```html"));
assert.ok(bundle.files[0].content.includes("```math\na = b + c\n```"));
assert.ok(bundle.files[0].content.includes("[图片来源 1（仅链接，不自动载入）](https://example.org/pic.png)"));
assert.ok(bundle.files[1].content.includes("[媒体来源路径不可安全显示"));
assert.ok(!bundle.files.join().includes("javascript:"));
assert.ok(bundle.files[0].content.includes("&lt;script&gt;alert(1)&lt;/script&gt;"));
assert.ok(bundle.warnings.some(w=>w.includes("表格")));
const first=bundle.files[0].ranges[0],second=bundle.files[0].ranges[1];
assert.equal(irMarkdownSourceAtOffset(bundle.files[0],first.contentFrom)?.blockId,first.blockId);
assert.equal(irMarkdownSourceAtOffset(bundle.files[0],first.from),null,"Provenance comment is not a visible text hit");
assert.equal(irMarkdownSourceAtOffset(bundle.files[0],second.contentTo),null,"End-exclusive range");
assert.ok(second.pdfPages.includes(1));
assert.equal(second.evidence[0].jsonPointer,'/pdf_info/0/para_blocks/1');
assert.equal(second.evidence[0].elementId,doc.blocks[1].sources[0].elementId);
assert.deepEqual(reconstructMineruJsonFromIr(doc),source);
assert.deepEqual(generateIrMarkdownBundle(doc),bundle,"determinism, including sha and offsets");
// Chapter delimitations are PROPOSALS, never a license to fragment review source.
const whole=generateIrWholeBookMarkdown(doc,bundle);
assert.equal(whole.ranges.length,doc.blocks.length);
assert.ok(whole.content.includes('# Main &lt;title&gt;'));
assert.ok(whole.content.includes('## Subsection'));
assert.ok(whole.content.includes('# Appendix A: Details'));
assert.deepEqual(whole.ranges.map(x=>x.blockId),[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!).map(x=>x.blockId));
assert.equal(whole.ranges[0].from,0);
assert.equal(irMarkdownSourceAtOffset(whole,whole.ranges.at(-1)!.contentFrom)?.blockId,
  doc.blocks.at(-1)!.blockId);
assert.equal(isIrChapterDelimitationConfirmed(doc),false);
const draft=buildIrMarkdownArchive(doc,bundle);
// Strict unreviewed snapshot: exactly one continuous MD + canonical DIR.
assert.equal(draft.count,3);
const before=whole.content;
const secondHeading=whole.ranges.find(r=>r.blockId===doc.blocks[2].blockId)!;
const edited=before.slice(0,secondHeading.contentFrom)+'# Subsection'+before.slice(secondHeading.contentTo);
const reclassified=applyDirSourceChange(doc,whole,edited);
assert.equal(reclassified.chapters.find(c=>c.anchorBlockId===doc.blocks[2].blockId)?.depth,1);
assert.equal(generateIrWholeBookMarkdown(reclassified).ranges.length,doc.blocks.length);
assert.deepEqual(reconstructMineruJsonFromIr(reclassified),source);
assert.equal(buildIrMarkdownArchive(reclassified,generateIrMarkdownBundle(reclassified)).count,3,
  'even after one title changes, unreviewed OCR boundaries never publish split files');
// Publication transitions only after ALL candidate titles have explicit human
// decisions and every root has an explicit output filename.
let complete=doc;
for(const candidate of doc.chapterStructure!.candidates){
  const ch=complete.chapters.find(c=>c.anchorBlockId===candidate.headingBlockId);
  complete=explicitClassifyOcrHeading(complete,candidate.headingBlockId,
    !ch?'exclude':ch.depth===1?'root':'section',undefined,'PDF 人工逐标题核查');
}
assert.equal(isIrChapterDelimitationConfirmed(complete),false,'names still unassigned');
complete=v2IrAssignSequence(complete,'01');
assert.equal(isIrChapterDelimitationConfirmed(complete),true);
// Obsidian compatibility is a publication/export projection, never a DIRjson
// rewrite. Keep OCR intact for the AG/PDF evidence and the cleaning modules.
const canonical=generateIrMarkdownBundle(complete,{obCompatible:true});
validateIrMarkdownBundle(complete,canonical);
assert.ok(canonical.files[0].content.includes('$$\na = b + c\n$$'));
assert.ok(!canonical.files[0].content.includes('```math'));
assert.ok(canonical.files[0].content.includes('<table><tr><td rowspan="2">'));
assert.ok(!canonical.files[0].content.includes('```html'));
assert.ok(canonical.files[0].content.includes('[图片来源 1（仅链接，不自动载入）]'));
assert.deepEqual(reconstructMineruJsonFromIr(complete),source,
  'publication conversion never mutates original MinerU evidence');
assert.equal(buildIrMarkdownArchive(complete,canonical).count,
  complete.chapters.filter(ch=>ch.depth===1).length+2);

assert.equal(buildIrMarkdownArchive(complete,generateIrMarkdownBundle(complete)).count,
  complete.chapters.filter(c=>c.depth===1).length+2,
  'confirmed outline is finally eligible for separate chapter MD publishing');
// Future edits do not change raw OCR, only derived content and bound IR digest.
const changed=explicitReplaceBlockText(doc,doc.blocks[1].blockId,"Corrected content 😀", "对照 PDF 审核草稿");
const editedBundle=generateIrMarkdownBundle(changed);
assert.notEqual(editedBundle.irSha256,bundle.irSha256);
assert.ok(editedBundle.files[0].content.includes("Corrected content 😀"));
assert.equal(editedBundle.files[0].ranges[1].blockId,bundle.files[0].ranges[1].blockId);
assert.deepEqual(reconstructMineruJsonFromIr(changed),source);
// Split + merge never breaks the exact MD block-range provenance.
const split=explicitSplitBlockAtUtf16(doc,doc.blocks[1].blockId,5,"显式分段");
const splitMd=generateIrMarkdownBundle(split);
assert.equal(splitMd.files.reduce((n,f)=>n+f.ranges.length,0),10);
const merged=explicitMergeAdjacentTextBlocks(split,split.blocks[1].blockId,split.blocks[2].blockId,"显式恢复");
const mergedMd=generateIrMarkdownBundle(merged);
assert.equal(mergedMd.files.reduce((n,f)=>n+f.ranges.length,0),9);
assert.deepEqual(reconstructMineruJsonFromIr(merged),source);
// Changing chapter boundary changes file memberships but never loses a block.
const appendix=doc.chapters.find(c=>c.name.startsWith("Appendix A"))!;
const moved=explicitMoveChapterBoundary(doc,appendix.chapterId,doc.blocks[7].blockId,"附录起点后移一块");
const movedMd=generateIrMarkdownBundle(moved);
assert.equal(movedMd.files[0].ranges.length,7);
assert.equal(movedMd.files[1].ranges.length,2);
// Corrupt the bundle and verify tamper detection.
const mutable:any=JSON.parse(JSON.stringify(bundle));
mutable.files[0].ranges[0].evidence[0].bbox=[1,1,2,2];
assert.throws(()=>validateIrMarkdownBundle(doc,mutable),Error);
mutable.files[0].ranges[0].evidence[0].bbox=[10,20,250,60];
mutable.files[0].content+="INJECTED";
assert.throws(()=>validateIrMarkdownBundle(doc,mutable),Error);
validateDocumentIrV1(doc);
console.log("IR_WP6_MARKDOWN_UNIT_PASS",JSON.stringify({files:2,blocks:9,htmlTableSafe:true,
  formulaPreserved:true,imagesNoExternalEmbed:true,offsets:true,provenance:true,
  correctedText:true,splitMerge:true,chapterBoundary:true,wholeBookReview:true,
  unreviewedNotSplit:true,tamperRejection:true}));
