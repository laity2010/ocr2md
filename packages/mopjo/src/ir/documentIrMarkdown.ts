/** IR-WP6 source-preserving Markdown projection, never MinerU official MD.
 * Pure: no FS writes, browser access, rendering DOM, network or human approval.
 */
import {createHash} from "crypto";
import {safeObsidianHtmlTable} from "./obsidianTableSanitize";
import {v2IrChapterHeadings,chapterIdForAnchor} from "./documentIrChapters";
import {encodeDocumentIrV1,validateDocumentIrV1,type DocumentIrV1,
  type IrSourceSlice,type IrSourceElement,type IrLogicalBlock,type IrChapter} from "./documentIrV1";

const hash=(value:string|Uint8Array):string=>createHash("sha256").update(value).digest("hex");
const encoder=new TextEncoder();
export type IrMarkdownRenderKind="heading"|"text"|"reference"|"equation"|"table-html"|"image-link"|"chart-link"|"evidence-only";
export interface IrMarkdownEvidence {
  readonly elementId:string;
  readonly pdfPageNumber:number;
  readonly jsonPointer:string;
  readonly bbox:readonly number[];
  readonly normalizedBBox:readonly number[];
  readonly segmentPointer?:string;
  readonly utf16Range?:readonly [number,number];
}
export interface IrMarkdownSourceRange {
  readonly blockId:string;
  readonly chapterId:string;
  readonly pdfPages:readonly number[];
  /** UTF-16 offsets of a WHOLE rendered block, including the provenance marker and EOL. */
  readonly from:number;
  readonly to:number;
  /** UTF-16 offsets of visible content, excluding the HTML provenance comment. */
  readonly contentFrom:number;
  readonly contentTo:number;
  readonly mode:IrMarkdownRenderKind;
  readonly audit:"unreviewed";
  readonly evidence:readonly IrMarkdownEvidence[];
  /** PDF page anchor for manual transcription, deliberately without OCR bbox. */
  readonly manualPdfPage?:number;
}
export interface IrMarkdownChapterFile {
  readonly chapterId:string;
  readonly path:string;
  readonly label:string;
  readonly content:string;
  readonly sha256:string;
  readonly ranges:readonly IrMarkdownSourceRange[];
  readonly status:"provisional";
}
export interface IrMarkdownBundleV1 {
  readonly kind:"ocr2md/ir-markdown-bundle";
  readonly schemaVersion:1;
  readonly sourcePdf:DocumentIrV1["pdf"];
  readonly sourceOcr:DocumentIrV1["ocr"];
  readonly irSha256:string;
  readonly generatedFrom:"document-ir";
  readonly audit:"unreviewed";
  readonly warnings:readonly string[];
  readonly files:readonly IrMarkdownChapterFile[];
}
function oneLine(value:string):string {return value.replace(/\r?\n/gu," ").trim();}
function safeMarkdownText(value:string):string {
  // Avoid live HTML from untrusted OCR and invisible delimiter injection.
  return value.replace(/\r\n?/gu,"\n")
    .replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;")
    .replace(/^(?=[#>|])([#>|])/gmu,"\\$1");
}
function safeHeading(value:string):string {
  return safeMarkdownText(oneLine(value)).replace(/(^|\s)([#`*_[\]\\])/gu,"$1\\$2");
}
function fence(payload:string,kind:string):string {
  // Choose a delimiter longer than any backtick run in untrusted content.
  const longest=Math.max(2,...(payload.match(/`+/gu)??[]).map(x=>x.length));
  const ticks="`".repeat(longest+1);
  return `${ticks}${kind}\n${payload}\n${ticks}`;
}
function safeMediaLink(raw:string,description:string):string | null {
  try{
    const url=new URL(raw);
    if(url.protocol!=="https:"&&url.protocol!=="http:")return null;
    if(url.username||url.password)return null;
    // Encode parentheses to keep link target parseable. This is a pointer, NOT an embed.
    return `[${description}（仅链接，不自动载入）](${url.href.replace(/\(/gu,"%28").replace(/\)/gu,"%29")})`;
  }catch{return null;}
}
const sanitizedPath=(label:string):string=>label.normalize("NFKD").toLowerCase()
  .replace(/[^a-z0-9\u4e00-\u9fff]+/gu,"-").replace(/^-+|-+$/gu,"").slice(0,48)||"chapter";
function mimeParts(s:IrSourceElement):{html:string[];links:string[];formula:string[]} {
  return {html:s.segments.flatMap(x=>x.html?[x.html]:[]),
    links:s.segments.flatMap(x=>x.imagePath?[x.imagePath]:[]),
    formula:s.segments.flatMap(x=>x.type==="interline_equation"&&x.content?[x.content]:[])};
}
function renderBlock(block:IrLogicalBlock,sources:readonly IrSourceElement[],chapter?:IrChapter,
  asOrdinaryText=false,obCompatible=false):
  {mode:IrMarkdownRenderKind;content:string;warning?:string}{
  const segments=sources.flatMap(s=>s.segments);
  const html=segments.flatMap(s=>s.html?[s.html]:[]);
  const media=[...new Set(segments.flatMap(s=>s.imagePath?[s.imagePath]:[]))];
  const name=safeHeading(block.text);
  if(block.type==="title"){
    if(asOrdinaryText)return {mode:"text",content:safeMarkdownText(block.text)||"[原 OCR 标题被判为非章节，但文本为空]"};
    const depth=chapter?.anchorBlockId===block.blockId?chapter.depth===1?1:2:3;
    return {mode:"heading",content:"#".repeat(depth)+" "+(name||"[空标题：请核对 PDF]")};
  }
  if(block.type==="interline_equation"){
    const formulas=sources.flatMap(x=>mimeParts(x).formula);
    const payload=block.text||formulas.join("\n");
    return {mode:"equation",content:payload?(obCompatible?`$$\n${payload}\n$$`:fence(payload,"math")):"[空公式：请对照 PDF]",
      ...(!payload?{warning:"OCR 空公式"}:{})};
  }
  if(block.type==="table"){
    // Markdown tables cannot preserve rowspan/colspan; only show exact OCR HTML as inert code.
    const normalized=html.map(h=>obCompatible?safeObsidianHtmlTable(h):null);
    const chunks=html.map((h,i)=>normalized[i]??fence(h,"html"));
    if(block.text)chunks.unshift(safeMarkdownText(block.text));
    if(media.length)chunks.push(...media.map((src,i)=>safeMediaLink(src,`表格图片来源 ${i+1}`)??
      `[表格图片路径未能安全链接：${i+1}，请核对 JSON]`));
    return {mode:"table-html",content:chunks.length?chunks.join("\n\n"):"[OCR 表格无可提取内容：请核对 PDF]",
      ...(obCompatible&&normalized.every(Boolean)&&!html.some(x=>/<eq(?:\s|>)/i.test(x))?{}:{warning:
        normalized.every(Boolean)?"表格包含待审核 LaTeX 单元格，公式原文已保留":
          "复杂或不安全表格仍保留为代码，需媒体模块人工审核"})};
  }
  if(block.type==="image"||block.type==="chart"){
    const links=media.map((src,i)=>safeMediaLink(src,`${block.type==="image"?"图片":"图表"}来源 ${i+1}`)??
      `[媒体来源路径不可安全显示：${i+1}，参见 IR 原始 JSON]`);
    const content=[block.text?safeMarkdownText(block.text):"",...links].filter(Boolean).join("\n\n");
    return {mode:block.type==="image"?"image-link":"chart-link",
      content:content||`[${block.type==="image"?"图片":"图表"}暂无 OCR 文本/链接：核对 PDF]`,
      warning:"媒体暂以来源链接或证据占位表示，未复制二进制附件"};
  }
  if(block.type==="ref_text")return {mode:"reference",content:safeMarkdownText(block.text)||"[空参考文献：请核对 PDF]"};
  if(block.type==="text")return {mode:"text",content:safeMarkdownText(block.text)||"[空正文：请核对 PDF]",
    ...(!block.text?{warning:"OCR 正文为空"}:{})};
  // Any new or unknown OCR type must remain traceable and visible, never silently dropped.
  return {mode:"evidence-only",content:(block.text?safeMarkdownText(block.text)+"\n\n":"")+
    `[未支持 OCR 元素类型：${safeMarkdownText(block.type)}；请核对 IR/PDF]`,
    warning:"存在未实现的 OCR 元素类型"};
}
interface FileOwner {
  readonly blockId:string;
  readonly chapterId:string;
  readonly name:string;
  readonly fileName?:string;
}
/** File cuts are a projection concern, NOT a mutation of logical chapter depth.
 * Preserve synthetic first-page containers even when their anchor is text. */
function irFileOwners(doc:DocumentIrV1):FileOwner[]{
  const blocks=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const headings=v2IrChapterHeadings(doc);
  const roots=doc.chapters.filter(ch=>ch.parentChapterId===null);
  const candidates=new Map<string,FileOwner>();
  const selectable=new Set(headings.map(h=>h.blockId));
  for(const ch of roots){
    if(ch.anchorBlockId&&!selectable.has(ch.anchorBlockId))
      candidates.set(ch.anchorBlockId,{blockId:ch.anchorBlockId,chapterId:ch.chapterId,
        name:ch.name,fileName:ch.fileName});
  }
  for(const h of headings.filter(h=>h.standalone)){
    const ch=doc.chapters.find(c=>c.anchorBlockId===h.blockId);
    candidates.set(h.blockId,{blockId:h.blockId,chapterId:chapterIdForAnchor(h.blockId),
      name:ch?.name??h.raw,...(h.fileName?{fileName:h.fileName}:{})});
  }
  const owners=blocks.flatMap(b=>{const owner=candidates.get(b.blockId);return owner?[owner]:[];});
  if(!owners.length||owners[0].blockId!==blocks[0]?.blockId)
    throw Error("章节文件缺少书籍首块的输出归属");
  return owners;
}
/** Root-per-file logical MD: child sections are headings in their root document.
 * Every logical block is rendered exactly once. All ranges are UTF-16 and exact.
 */
export function generateIrMarkdownBundle(doc:DocumentIrV1,
  options:{obCompatible?:boolean}={}):IrMarkdownBundleV1 {
  validateDocumentIrV1(doc);
  if(doc.importState!=="logical-review"||!doc.chapterStructure||!doc.chapters.length||
     doc.outputMarkdown.length!==0)throw Error("WP6 requires a provisional WP4 IR without prior published MD");
  const irSha256=hash(encodeDocumentIrV1(doc));
  const sortedBlocks=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const chapters=new Map(doc.chapters.map(ch=>[ch.chapterId,ch]));
  const source=new Map(doc.sourceElements.map(el=>[el.id,el]));
  const manual=new Map([...(doc.manualHeadings??[]),...(doc.manualTexts??[])].map(h=>[h.blockId,h]));
  const owners=irFileOwners(doc);
  const sections=new Map(owners.map(o=>[o.blockId,[] as IrLogicalBlock[]]));
  const boundary=new Set(owners.map(o=>o.blockId));
  let currentOwner=owners[0].blockId;
  for(const b of sortedBlocks){
    if(boundary.has(b.blockId))currentOwner=b.blockId;
    sections.get(currentOwner)!.push(b);
  }
  const warnings=new Set<string>();
  const excludedHeadingIds=new Set(doc.chapterStructure.candidates.filter(c=>
    c.status==="confirmed"&&c.proposedRole==="uncertain").map(c=>c.headingBlockId));
  const bookRoot=doc.pdf.path.slice(0,doc.pdf.path.lastIndexOf("/"));
  const files:IrMarkdownChapterFile[]=owners.map((owner,index)=>{
    const path=`${bookRoot}/ir-generated/${owner.fileName??`${String(index+1).padStart(2,"0")}-${sanitizedPath(owner.name)}-${owner.chapterId.slice(-8)}.md`}`;
    let content="",ranges:IrMarkdownSourceRange[]=[];
    const push=(value:string)=>{content+=value;};
    // Synthetic front-matter container is explicitly labelled, not confused with OCR text.
    if(owner.name==="前置内容（待审核）")push("# 前置内容（待审核，结构容器）\n\n");
    const own=sections.get(owner.blockId)!;
    for(const block of own){
      const chapter=chapters.get(block.chapterId!)!;
      const sources=block.sources.map(r=>source.get(r.elementId)!);
      const evidence:IrMarkdownEvidence[]=block.sources.map((ref:IrSourceSlice,i)=>{
        const el=sources[i];return {elementId:el.id,pdfPageNumber:el.pdfPageNumber,
          jsonPointer:el.jsonPointer,bbox:el.bbox,normalizedBBox:el.normalizedBBox,
          ...(ref.segmentPointer?{segmentPointer:ref.segmentPointer}:{}),
          ...(ref.utf16Range?{utf16Range:ref.utf16Range}:{})};
      });
      const heading=chapters.get(block.chapterId!)?.anchorBlockId===block.blockId?chapter:undefined;
      const output=renderBlock(block,sources,heading,excludedHeadingIds.has(block.blockId),
        options.obCompatible===true);
      if(output.warning)warnings.add(`${block.blockId}: ${output.warning}`);
      const manualRef=manual.get(block.blockId);
      const pages=[...new Set([...sources.map(x=>x.pdfPageNumber),
        ...(manualRef?[manualRef.pdfPageNumber]:[])])].sort((a,b)=>a-b);
      const from=content.length;
      // HTML comments are inert trace markers and never contain OCR text.
      const marker=`<!-- ocr2md-ir:block=${block.blockId} -->\n`;
      push(marker);
      const contentFrom=content.length;
      push(output.content);
      const contentTo=content.length;
      push("\n\n");
      ranges.push({blockId:block.blockId,chapterId:block.chapterId!,pdfPages:pages,
        from,to:content.length,contentFrom,contentTo,mode:output.mode,audit:"unreviewed",evidence,
        ...(manualRef?{manualPdfPage:manualRef.pdfPageNumber}:{})});
    }
    if(!ranges.length)throw Error("Empty independent file: "+owner.chapterId);
    return {chapterId:owner.chapterId,path,label:owner.name,content,
      sha256:hash(encoder.encode(content)),ranges,status:"provisional"};
  });
  const allRanges=files.flatMap(f=>f.ranges);
  if(allRanges.length!==doc.blocks.length||
     new Set(allRanges.map(r=>r.blockId)).size!==doc.blocks.length||
     allRanges.some(r=>!doc.blocks.find(b=>b.blockId===r.blockId)))
    throw Error("Markdown projection lost or duplicated one or more IR blocks");
  const bundle:IrMarkdownBundleV1={kind:"ocr2md/ir-markdown-bundle",schemaVersion:1,
    sourcePdf:doc.pdf,sourceOcr:doc.ocr,irSha256,generatedFrom:"document-ir",
    audit:"unreviewed",warnings:[...warnings],files};
  validateIrMarkdownBundle(doc,bundle);
  return bundle;
}
/** Unsplit, book-wide source during chapter delimitation.
 * The inferred outline is only a tentative rendering hint; no chapter boundary
 * can hide an OCR block from the review editor. This is never an approved chapter file.
 * We re-use the exact safe block renderings/source ranges from the WP6 bundle,
 * rather than reparsing Markdown or losing PDF origin evidence.
 */
export const DIR_WHOLE_BOOK_ID="dir:whole-book-draft";
export function generateIrWholeBookMarkdown(doc:DocumentIrV1,
  projected:IrMarkdownBundleV1=generateIrMarkdownBundle(doc)):IrMarkdownChapterFile{
  validateIrMarkdownBundle(doc,projected);
  const expected=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
  const parts=new Map(projected.files.flatMap(f=>f.ranges.map(r=>[r.blockId,{
    file:f,range:r
  }] as const)));
  let content="";
  const ranges:IrMarkdownSourceRange[]=[];
  for(const block of expected){
    const item=parts.get(block.blockId);
    if(!item)throw Error("全书源码缺少一个原始 OCR 块："+block.blockId);
    const {file,range}=item;
    const from=content.length;
    content+=file.content.slice(range.from,range.to);
    const shift=from-range.from;
    ranges.push({...range,from, to:content.length,
      contentFrom:range.contentFrom+shift,contentTo:range.contentTo+shift});
  }
  if(ranges.length!==doc.blocks.length||new Set(ranges.map(r=>r.blockId)).size!==ranges.length)
    throw Error("全书源码来源范围不唯一");
  return {chapterId:DIR_WHOLE_BOOK_ID,
    path:doc.pdf.path.slice(0,doc.pdf.path.lastIndexOf("/"))+"/ir-generated/whole-book-draft.md",
    label:"全书连续 MD · OCR 章界待审核",content,sha256:hash(encoder.encode(content)),
    ranges,status:"provisional"};
}
/** A chapter *file* cut may be published for cleaning before OCR headings,
 * annotation pairs and images are individually approved. This never changes
 * an OCR candidate's audit state or certifies the book as fully cleaned. */
export function isIrChapterFileLayoutReady(doc:DocumentIrV1):boolean{
  validateDocumentIrV1(doc);
  const owners=irFileOwners(doc);
  // Importers can propose filenames from OCR without any human interaction.
  // Require a concrete file boundary/filename assignment operation (or
  // explicit file-cut layout) before publishing editable working chapters.
  const assigned=Boolean(doc.chapterFileLayout?.length)||Boolean(
    doc.chapterStructure?.operations.some(op=>
      op.mode==="explicit"&&["assign-sequence","assign-file","classify-heading"].includes(op.kind)));
  return assigned&&owners.length>0&&owners.every(o=>typeof o.fileName==="string"&&
    o.fileName.length>0)&&doc.blocks.every(b=>b.chapterId!==null);
}
/** Stricter audit status is independent from file-cut readiness. */
export function isIrChapterDelimitationConfirmed(doc:DocumentIrV1):boolean{
  if(!isIrChapterFileLayoutReady(doc))return false;
  return Boolean(doc.chapterStructure?.candidates.length)&&
    doc.chapterStructure!.candidates.every(c=>c.status==="confirmed");
}

/** Strict post-build readback of every index and content digest. */
export function validateIrMarkdownBundle(doc:DocumentIrV1,bundle:IrMarkdownBundleV1):void {
  validateDocumentIrV1(doc);
  if(bundle.kind!=="ocr2md/ir-markdown-bundle"||bundle.schemaVersion!==1||
     bundle.audit!=="unreviewed"||bundle.generatedFrom!=="document-ir"||
     bundle.sourcePdf.sha256!==doc.pdf.sha256||bundle.sourceOcr.sha256!==doc.ocr.sha256||
     bundle.irSha256!==hash(encodeDocumentIrV1(doc)))throw Error("Markdown bundle source mismatch");
  const allIds=new Set<string>();
  const sources=new Map(doc.sourceElements.map(s=>[s.id,s]));
  const manual=new Map([...(doc.manualHeadings??[]),...(doc.manualTexts??[])].map(h=>[h.blockId,h]));
  const refs=new Map(doc.blocks.map(b=>[b.blockId,b]));
  const owners=irFileOwners(doc);
  if(bundle.files.length!==owners.length||new Set(bundle.files.map(f=>f.path)).size!==bundle.files.length)
    throw Error("Missing/duplicate generated independent file");
  for(const file of bundle.files){
    if(!owners.some(o=>o.chapterId===file.chapterId)||file.status!=="provisional"||
       !file.path.startsWith(doc.pdf.path.slice(0,doc.pdf.path.lastIndexOf("/"))+"/ir-generated/")||
       !/^\/[^\u0000-\u001f]+\.md$/u.test(file.path)||
       file.sha256!==hash(encoder.encode(file.content)))throw Error("Generated file invalid or SHA mismatch");
    let cursor=file.content.startsWith("# 前置内容（待审核，结构容器）\n\n")?
      "# 前置内容（待审核，结构容器）\n\n".length:0;
    for(const r of file.ranges){
      if(r.from!==cursor||r.to>file.content.length||r.to<=r.from||
         r.contentFrom<r.from||r.contentTo>r.to||r.contentTo<=r.contentFrom||
         !file.content.slice(r.from,r.contentFrom).includes(`<!-- ocr2md-ir:block=${r.blockId} -->`))
        throw Error("Broken Markdown UTF-16 range or block marker");
      const block=refs.get(r.blockId);
      if(!block||allIds.has(r.blockId)||block.chapterId!==r.chapterId||r.audit!=="unreviewed"||
         r.evidence.length!==block.sources.length||
         r.manualPdfPage!==manual.get(r.blockId)?.pdfPageNumber||
         (manual.has(r.blockId)&&(
           r.mode!==(block.type==="title"?"heading":"text")||r.pdfPages.length!==1||
           r.pdfPages[0]!==manual.get(r.blockId)!.pdfPageNumber))||
         r.evidence.some((v,i)=>{
           const expected=block.sources[i],physical=sources.get(expected.elementId);
           return !physical||physical.pdfPageNumber!==v.pdfPageNumber||
             physical.jsonPointer!==v.jsonPointer||v.elementId!==expected.elementId||
             JSON.stringify(physical.bbox)!==JSON.stringify(v.bbox)||
             JSON.stringify(physical.normalizedBBox)!==JSON.stringify(v.normalizedBBox)||
             v.segmentPointer!==expected.segmentPointer||
             JSON.stringify(v.utf16Range)!==JSON.stringify(expected.utf16Range);
         }))throw Error("Markdown range lacks correct immutable OCR provenance");
      allIds.add(r.blockId);cursor=r.to;
    }
    if(cursor!==file.content.length)throw Error("Unindexed material at end of generated Markdown");
  }
  if(allIds.size!==doc.blocks.length)throw Error("Missing generated block or stale record");
}

/** Return the unique Markdown element at one UTF-16 offset, or null in a synthetic header. */
export function irMarkdownSourceAtOffset(file:IrMarkdownChapterFile,offset:number):IrMarkdownSourceRange|null {
  if(!Number.isSafeInteger(offset)||offset<0||offset>=file.content.length)return null;
  return file.ranges.find(x=>offset>=x.contentFrom&&offset<x.contentTo)??null;
}
