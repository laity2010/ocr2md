/** IR-WP4: OCR-only chapter outline, navigable tree and explicit chapter edits.
 * Chapter proposals are NEVER human-approved. No official Markdown dependency.
 */
import { createHash } from "crypto";
import {assignChapterFiles, chapterFileParts} from "./chapterFileAssign";
import { validateDocumentIrV1, validIrChapterFileName, type DocumentIrV1, type IrChapter,
  type IrChapterBoundaryCandidate, type IrChapterEditOperation,
  type IrLogicalBlock } from "./documentIrV1";

function hash(value:string):string {return createHash("sha256").update(value).digest("hex");}
export function chapterIdForAnchor(blockId:string):string{
  return "ch_"+hash("ocr2md-ir-wp4-chapter\0"+blockId).slice(0,24);
}
const majorHeading=/^(?:appendix\s+[a-z](?=\b|\s|[:：])|references\s*$|bibliography\s*$|参考文献\s*$|附录\s*[a-zＡ-Ｚ甲乙丙丁一二三四五六七八九十])/iu;
function stableText(text:string):string {return text.replace(/\s+/gu," ").trim();}
function titleIsLikelyAuthor(text:string):boolean{
  // Conservative cover/byline discriminator, only weak evidence; not a definitive classification.
  // Plain "and" is common in chapter titles (e.g. "Conclusion and Practical
  // Implications"), so it can NEVER by itself imply an author byline.
  return /\b(?:CFA|PhD|MBA|et al\.?)\b/iu.test(text) ||
    (text.includes("&") && text.includes(",")) ||
    (text.split(/,\s*/u).length>=3 && !/^(?:appendix|chapter|table)/iu.test(text));
}
function firstPagesHeading(sourceTitle:{block:IrLogicalBlock;page:number;level:number|undefined},pages:number):boolean{
  return sourceTitle.level===1 && sourceTitle.page<=Math.max(2,Math.ceil(pages*0.12)) &&
    !titleIsLikelyAuthor(sourceTitle.block.text);
}
function checkReady(doc:DocumentIrV1):void{
  validateDocumentIrV1(doc);
  if(doc.importState!=="logical-review"||!doc.reconstruction)
    throw Error("IR-WP4 needs a validated WP3 logical-review IR");
  if(doc.outputMarkdown.length!==0)throw Error("IR-WP4 never modifies published Markdown");
}
function numberedBlocks(doc:DocumentIrV1):IrLogicalBlock[]{
  return [...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
}
/** Given explicit chapter anchors, compute logical membership on the block order.
 * This deliberately does not change reading order or the underlying OCR evidence.
 */
function applyOutline(doc:DocumentIrV1,chapters:readonly IrChapter[]):DocumentIrV1{
  const blocks=numberedBlocks(doc);
  const byId=new Map(blocks.map((b,i)=>[b.blockId,i]));
  const sorted=[...chapters].sort((a,b)=>byId.get(a.anchorBlockId!)!-byId.get(b.anchorBlockId!)!);
  const active=new Map<number,IrChapter>();let k=0;
  const nextBlocks=blocks.map((b,i)=>{
    while(k<sorted.length&&byId.get(sorted[k].anchorBlockId!)===i){
      const current=sorted[k];
      for(const key of [...active.keys()])if(key>=current.depth!)active.delete(key);
      active.set(current.depth!,current);k++;
    }
    const section=active.get(Math.max(...active.keys()));
    if(!section)throw Error("Missing root boundary before block "+i);
    return {...b,chapterId:section.chapterId};
  });
  return {...doc,chapters:[...chapters],blocks:nextBlocks};
}
function proposedTitles(doc:DocumentIrV1){
  const sources=new Map(doc.sourceElements.map(s=>[s.id,s]));
  const blocks=numberedBlocks(doc);
  return blocks.filter(b=>b.type==="title").map(block=>{
    const source=block.sources.map(ref=>sources.get(ref.elementId)!).find(s=>s?.type==="title");
    return {block,page:source?.pdfPageNumber??0,level:typeof source?.rawBlock.level==="number"?source.rawBlock.level:undefined};
  });
}
export function proposeIrChapters(doc:DocumentIrV1):DocumentIrV1{
  checkReady(doc);
  if(doc.chapterStructure||doc.chapters.length||doc.blocks.some(b=>b.chapterId!==null))
    throw Error("Cannot re-infer an existing outline; use explicit chapter operations");
  const blocks=numberedBlocks(doc),headingInfo=proposedTitles(doc);
  const rootCandidates=headingInfo.filter(h=>majorHeading.test(stableText(h.block.text)));
  const firstMain=headingInfo.find(h=>firstPagesHeading(h,doc.pages.length));
  if(firstMain&&!rootCandidates.some(h=>h.block.blockId===firstMain.block.blockId))
    rootCandidates.unshift(firstMain);
  const roots=new Set(rootCandidates.map(x=>x.block.blockId));
  // Cover material preceding first primary heading belongs to its own *provisional*
  // container. Do not label it as a chapter title detected from original OCR.
  const firstRootIndex=blocks.findIndex(b=>roots.has(b.blockId));
  const needsFrontMatter=firstRootIndex!==0;
  const frontBlock=blocks[0];
  if(needsFrontMatter||roots.size===0)roots.add(frontBlock.blockId);
  const titlesByBlock=new Map(headingInfo.map(h=>[h.block.blockId,h]));
  const candidates:IrChapterBoundaryCandidate[]=[];
  const sourceMap=new Map(doc.sourceElements.map(s=>[s.id,s]));
  for(const h of headingInfo){
    const text=stableText(h.block.text);
    const author=titleIsLikelyAuthor(text);
    const isRoot=roots.has(h.block.blockId);
    const isIntro=firstMain?.block.blockId===h.block.blockId;
    const coverByline=needsFrontMatter && firstMain &&
      blocks.indexOf(h.block)<blocks.indexOf(firstMain.block);
    const proposedRole=isRoot?"root":author||coverByline||h.level===1?"uncertain":"section";
    const reason=isRoot?
      (isIntro?"MinerU 页面前段 level=1 的文档主标题；是否为真正章节起点仍待核对。":
        majorHeading.test(text)?"正文标题与附录/参考文献模式吻合；章节边界待审核。":
          "文档首块作为前置内容的暂定容器；不代表 OCR 已识别本章节名称。"):
        proposedRole==="section"?"OCR title 元素，暂设为当前主章节下的小节；需核对 PDF 排版。":
          "标题类型可能是作者署名、封面或特殊内容；不自动作为章节。";
    candidates.push({candidateId:"ir4:"+hash("chapter-candidate\0"+h.block.blockId).slice(0,24),
      headingBlockId:h.block.blockId,sourceElementIds:h.block.sources.map(r=>r.elementId),
      pageNumber:h.page,proposedRole,reason,status:"needs-review"});
  }
  if(!titlesByBlock.has(frontBlock.blockId) && roots.has(frontBlock.blockId)){
    candidates.unshift({candidateId:"ir4:"+hash("frontmatter\0"+frontBlock.blockId).slice(0,24),
      headingBlockId:frontBlock.blockId,sourceElementIds:frontBlock.sources.map(r=>r.elementId),
      pageNumber:sourceMap.get(frontBlock.sources[0].elementId)!.pdfPageNumber,
      proposedRole:"root",reason:"无页首主标题，创建涵盖原文前置部分的暂定容器。",status:"needs-review"});
  }
  const chapters:IrChapter[]=[];
  let activeRootId:string|null=null;
  for(const block of blocks){
    const info=titlesByBlock.get(block.blockId);
    const proposedRole=candidates.find(c=>c.headingBlockId===block.blockId)?.proposedRole;
    const isRoot=roots.has(block.blockId);
    if(!isRoot&&(!info||proposedRole!=="section"))continue;
    const chapterId=chapterIdForAnchor(block.blockId);
    const name=needsFrontMatter&&block.blockId===frontBlock.blockId?
      "前置内容（待审核）":stableText(block.text)||"未命名标题（待审核）";
    chapters.push({chapterId,parentChapterId:isRoot?null:activeRootId,
      name,order:chapters.length,anchorBlockId:block.blockId,
      depth:isRoot?1:2,status:"provisional"});
    if(isRoot)activeRootId=chapterId;
    if(!activeRootId)throw Error("Cannot create subsection before a root");
  }
  const base:DocumentIrV1={...doc,chapterStructure:{schemaVersion:1,
    method:"ocr-title-provisional",candidates,operations:[]}};
  const output=applyOutline(base,chapters);
  validateDocumentIrV1(output);
  return output;
}

export interface IrChapterTreeNode {
  readonly chapterId:string;
  readonly label:string;
  readonly depth:number;
  readonly status:IrChapter["status"];
  readonly anchorBlockId:string;
  readonly directBlocks:number;
  readonly subtreeBlocks:number;
  readonly pdfPages:readonly number[];
  readonly children:readonly IrChapterTreeNode[];
}
export function listIrChapterTree(doc:DocumentIrV1):readonly IrChapterTreeNode[]{
  validateDocumentIrV1(doc);
  if(!doc.chapterStructure)return [];
  const children=new Map<string,IrChapter[]>();
  for(const ch of doc.chapters){
    const key=ch.parentChapterId??"__root__";
    children.set(key,[...(children.get(key)??[]),ch]);
  }
  const source=new Map(doc.sourceElements.map(e=>[e.id,e]));
  const manualPages=new Map((doc.manualHeadings??[]).map(h=>[h.blockId,h.pdfPageNumber]));
  const direct=new Map<string,IrLogicalBlock[]>();
  for(const block of doc.blocks){
    if(block.chapterId)direct.set(block.chapterId,[...(direct.get(block.chapterId)??[]),block]);
  }
  const traverse=(ch:IrChapter):IrChapterTreeNode=>{
    const nested=[...(children.get(ch.chapterId)??[])].sort((a,b)=>a.order-b.order).map(traverse);
    const own=direct.get(ch.chapterId)??[];
    const pages=[...new Set([...own.flatMap(b=>[
       ...b.sources.map(r=>source.get(r.elementId)!.pdfPageNumber),
       ...(manualPages.has(b.blockId)?[manualPages.get(b.blockId)!]:[])]),
      ...nested.flatMap(x=>x.pdfPages)])].sort((a,b)=>a-b);
    return {chapterId:ch.chapterId,label:ch.name,depth:ch.depth!,status:ch.status,
      anchorBlockId:ch.anchorBlockId!,directBlocks:own.length,
      subtreeBlocks:own.length+nested.reduce((n,c)=>n+c.subtreeBlocks,0),
      pdfPages:pages,children:nested};
  };
  return [...(children.get("__root__")??[])].sort((a,b)=>a.order-b.order).map(traverse);
}
function appendChapterEdit(doc:DocumentIrV1,chapters:readonly IrChapter[],kind:IrChapterEditOperation["kind"],
  affectedIds:readonly string[],detail:string):DocumentIrV1{
  if(!detail.trim()||!doc.chapterStructure)throw Error("Explicit chapter operation requires reason and existing outline");
  const operations=doc.chapterStructure.operations;
  const operation:IrChapterEditOperation={operationId:"op4:"+hash(kind+"\0"+affectedIds.join("\0")+
    "\0"+operations.length).slice(0,24),kind,chapterIds:affectedIds,detail,mode:"explicit"};
  const positions=new Map(doc.blocks.map(b=>[b.blockId,b.readingOrder!]));
  const renumbered=[...chapters].sort((a,b)=>positions.get(a.anchorBlockId!)!-positions.get(b.anchorBlockId!)!)
    .map((c,order)=>({...c,order}));
  const next=applyOutline({...doc,chapterStructure:{...doc.chapterStructure,operations:[...operations,operation]}},renumbered);
  validateDocumentIrV1(next);return next;
}
export function explicitMoveChapterBoundary(doc:DocumentIrV1,chapterId:string,newAnchorBlockId:string,
  detail:string):DocumentIrV1{
  checkReady(doc);
  if(!doc.chapterStructure||!detail.trim())throw Error("Reason and WP4 outline required");
  const index=doc.chapters.findIndex(ch=>ch.chapterId===chapterId);
  if(index<0||!doc.blocks.some(b=>b.blockId===newAnchorBlockId)||
    doc.chapters.some(ch=>ch.anchorBlockId===newAnchorBlockId))
    throw Error("Unknown chapter/boundary or duplicate heading anchor");
  const chapters=doc.chapters.map(ch=>ch.chapterId===chapterId?
    {...ch,anchorBlockId:newAnchorBlockId,status:"provisional" as const}:ch);
  return appendChapterEdit(doc,chapters,"move-boundary",[chapterId],detail);
}
export function explicitPromoteTitleToSection(doc:DocumentIrV1,blockId:string,parentChapterId:string,
  detail:string):DocumentIrV1{
  checkReady(doc);
  const block=doc.blocks.find(b=>b.blockId===blockId),parent=doc.chapters.find(c=>c.chapterId===parentChapterId);
  if(!doc.chapterStructure||!detail.trim()||block?.type!=="title"||!parent||parent.depth!==1||
    doc.chapters.some(c=>c.anchorBlockId===blockId))throw Error("Requires unassigned OCR title and root parent");
  const sourceText=stableText(block.text);
  const chapter:IrChapter={chapterId:chapterIdForAnchor(blockId),parentChapterId:parentChapterId,
    name:sourceText||"未命名标题（待审核）",order:doc.chapters.length,anchorBlockId:blockId,
    depth:2,status:"provisional"};
  return appendChapterEdit(doc,[...doc.chapters,chapter],"promote-heading",[chapter.chapterId],detail);
}
export function explicitDemoteLeafSection(doc:DocumentIrV1,chapterId:string,detail:string):DocumentIrV1{
  checkReady(doc);
  const chapter=doc.chapters.find(ch=>ch.chapterId===chapterId);
  if(!doc.chapterStructure||!detail.trim()||chapter?.depth!==2||
    doc.chapters.some(c=>c.parentChapterId===chapterId))throw Error("Only a leaf subsection can be demoted");
  return appendChapterEdit(doc,doc.chapters.filter(ch=>ch.chapterId!==chapterId),
    "demote-section",[chapterId],detail);
}
export function explicitRenameChapter(doc:DocumentIrV1,chapterId:string,name:string,detail:string):DocumentIrV1{
  checkReady(doc);
  if(!doc.chapterStructure||!name.trim()||!detail.trim()||
    !doc.chapters.some(ch=>ch.chapterId===chapterId))throw Error("Unknown chapter or invalid name/reason");
  return appendChapterEdit(doc,doc.chapters.map(ch=>ch.chapterId===chapterId?
    {...ch,name:name.trim(),status:"provisional" as const}:ch),"rename",[chapterId],detail);
}

/** Chapter delimitation workflow: one explicit decision per original OCR heading.
 * A confirmed boundary says nothing about OCR text correctness. Whole-book downstream
 * outline is conservatively returned to "needs-review" when ancestry changes.
 */
export function explicitClassifyOcrHeading(doc:DocumentIrV1,headingBlockId:string,
  role:"root"|"section"|"exclude",fileName:string|undefined,detail:string):DocumentIrV1{
  checkReady(doc);
  if(!doc.chapterStructure||!detail.trim())throw Error("请填写章节审核依据");
  const candidate=doc.chapterStructure.candidates.find(c=>c.headingBlockId===headingBlockId);
  const block=doc.blocks.find(b=>b.blockId===headingBlockId);
  if(!candidate||!block||block.type!=="title")throw Error("必须选择真实 OCR 标题候选");
  const positions=new Map(doc.blocks.map(b=>[b.blockId,b.readingOrder!]));
  const before=doc.chapters.find(c=>c.anchorBlockId===headingBlockId);
  const nextId=chapterIdForAnchor(headingBlockId);
  const names=role==="root"?fileName?.trim():undefined;
  if(role==="root"&&names!==undefined&&!validIrChapterFileName(names))
    throw Error("文件名须为安全的 .md 文件名，不得包含目录或特殊路径字符");
  const changedRole=(!before&&role!=="exclude")||
    (before&&role==="exclude")||
    (before&&role!=="exclude"&&(before.depth==1)!==(role==="root"));
  if(before?.anchorBlockId===doc.blocks.find(b=>b.readingOrder===0)?.blockId&&role==="exclude")
    throw Error("文档第一个章节容器不可删除");
  let chapters=[...doc.chapters].filter(c=>c.anchorBlockId!==headingBlockId);
  if(role!=="exclude"){
    chapters.push({chapterId:before?.chapterId??nextId,anchorBlockId:headingBlockId,
      name:before?.name??block.text.trim()??"OCR 标题",order:0,
      parentChapterId:null,depth:role==="root"?1:2,status:"provisional",
      ...(role==="root"&&names?{fileName:names}:role==="root"&&before?.fileName?{fileName:before.fileName}:{})});
  }
  chapters.sort((a,b)=>positions.get(a.anchorBlockId!)!-positions.get(b.anchorBlockId!)!);
  let lastRoot:string|null=null;
  chapters=chapters.map((c,index)=>{
    if(c.depth===1){lastRoot=c.chapterId;return {...c,parentChapterId:null,order:index};}
    if(!lastRoot)throw Error("小节不能位于第一个主章节之前");
    return {...c,parentChapterId:lastRoot,order:index};
  });
  const candidates=doc.chapterStructure.candidates.map(c=>{
    if(c.headingBlockId===headingBlockId)return {...c,
      proposedRole:role==="exclude"?"uncertain" as const:role,
      status:"confirmed" as const,reviewReason:detail};
    if(changedRole&&c.status==="confirmed"){
      // Ancestor shift may change previously reviewed later boundaries.
      return {...c,status:"needs-review" as const,reviewReason:undefined};
    }
    return c;
  });
  const operations=[...doc.chapterStructure.operations,{
    operationId:"op4:"+hash("classify-heading\0"+headingBlockId+"\0"+role+"\0"+
      doc.chapterStructure.operations.length).slice(0,24),kind:"classify-heading" as const,
    chapterIds:[before?.chapterId??nextId],detail,mode:"explicit" as const}];
  // The advanced chapter-file name editor and AG's file-boundary metadata
  // must agree; neither editor is permitted to silently restore a stale name.
  const layout=names&&doc.chapterFileLayout?
    doc.chapterFileLayout.map(c=>c.blockId===headingBlockId?{...c,fileName:names}:c):
    doc.chapterFileLayout;
  const next=applyOutline({...doc,...(layout?{chapterFileLayout:layout}:{}),
    chapterStructure:{...doc.chapterStructure,candidates,operations}},chapters);
  validateDocumentIrV1(next);
  return next;
}


/** An OCR "title" may be an author/byline or ordinary body. A reviewer can
 * correct that *logical* type without changing the immutable MinerU element.
 * Remove the obsolete chapter proposal so the text appears in the body/AG,
 * and retain an explicit audit operation for the OCR misclassification. */
export function explicitDemoteOcrHeadingToText(doc:DocumentIrV1,blockId:string,
  detail:string):DocumentIrV1{
  checkReady(doc);
  const block=doc.blocks.find(b=>b.blockId===blockId);
  if(!block||block.type!=="title"||!block.sources.length||!detail.trim()||
    doc.manualHeadings?.some(h=>h.blockId===blockId))
    throw Error("仅可将 OCR 错分标题改为正文，人工补录标题使用专门操作");
  const excluded=explicitClassifyOcrHeading(doc,blockId,"exclude",undefined,
    "将 OCR 错分标题取消章节身份："+detail);
  const next:DocumentIrV1={...excluded,
    ...(excluded.chapterFileLayout?{
      chapterFileLayout:excluded.chapterFileLayout.filter(c=>c.blockId!==blockId)
    }:{}),
    blocks:excluded.blocks.map(b=>b.blockId===blockId?{...b,type:"text"}:b),
    chapterStructure:{...excluded.chapterStructure!,
      candidates:excluded.chapterStructure!.candidates.filter(c=>c.headingBlockId!==blockId),
      operations:[...excluded.chapterStructure!.operations,{
        operationId:"op4:"+hash("demote-ocr-title\0"+blockId+"\0"+
          excluded.chapterStructure!.operations.length).slice(0,24),
        kind:"demote-ocr-title",chapterIds:[chapterIdForAnchor(blockId)],
        detail,mode:"explicit" as const
      }]
    }
  };
  validateDocumentIrV1(next);
  return next;
}

/** Insert a title that MinerU completely missed, at the boundary AFTER an
 * existing (OCR or manual) logical block. Evidence is the explicitly reviewed
 * PDF PAGE, never a fabricated MinerU element or bbox. Atomic on validation.
 */
export function insertManualPdfHeading(doc:DocumentIrV1,afterBlockId:string,
  text:string,depth:1|2,pdfPageNumber:number,detail:string):DocumentIrV1{
  checkReady(doc);
  if(!doc.chapterStructure||!detail.trim()||!text.trim()||text.trim().length>350||
    /[\r\n\u0000-\u001f]/u.test(text)||![1,2].includes(depth)||
    !Number.isSafeInteger(pdfPageNumber)||pdfPageNumber<1||pdfPageNumber>doc.pages.length)
    throw Error("请填写单行标题、PDF 真实页码和补录依据");
  const sorted=numberedBlocks(doc),index=sorted.findIndex(b=>b.blockId===afterBlockId);
  if(index<0)throw Error("插入位置必须对应现有 DIRjson 来源块");
  const blockId="blk_"+hash("manual-pdf-heading\0"+doc.pdf.sha256+"\0"+
    afterBlockId+"\0"+(doc.manualHeadings?.length??0)+"\0"+
    doc.chapterStructure.operations.length).slice(0,24);
  if(doc.blocks.some(b=>b.blockId===blockId))throw Error("人工补录 ID 冲突，请刷新");
  const after=sorted[index],position=after.readingOrder!+1;
  const manual={blockId,afterBlockId,pdfPageNumber,method:"manual-pdf-page" as const,
    detail:detail.trim()};
  const inserted={blockId,type:"title",text:text.trim(),chapterId:after.chapterId,
    readingOrder:position,status:"structured" as const,audit:"unreviewed" as const,
    sources:[] as const};
  const blocks=doc.blocks.map(b=>({...b,
    readingOrder:b.readingOrder!>=position?b.readingOrder!+1:b.readingOrder!}));
  blocks.push(inserted);
  const candidate={candidateId:"ir4:"+hash("manual-pdf-candidate\0"+blockId).slice(0,24),
    headingBlockId:blockId,sourceElementIds:[],pageNumber:pdfPageNumber,
    proposedRole:depth===1?"root" as const:"section" as const,
    reason:"人工对照 PDF 补录：OCR 未识别此标题；只有人工页码证据，没有 OCR bbox。",
    status:"needs-review" as const};
  const intermediate:DocumentIrV1={...doc,blocks,manualHeadings:[...(doc.manualHeadings??[]),manual],
    chapterStructure:{...doc.chapterStructure,candidates:[...doc.chapterStructure.candidates,candidate]}};
  validateDocumentIrV1(intermediate);
  const assigned=explicitClassifyOcrHeading(intermediate,blockId,
    depth===1?"root":"section",undefined,detail);
  const operation={operationId:"op4:"+hash("insert-manual-title\0"+blockId).slice(0,24),
    kind:"insert-manual-title" as const,chapterIds:[chapterIdForAnchor(blockId)],
    detail:"人工 PDF 第 "+pdfPageNumber+" 页补录："+detail.trim(),mode:"explicit" as const};
  const result={...assigned,chapterStructure:{...assigned.chapterStructure!,
    operations:[...assigned.chapterStructure!.operations,operation]}};
  validateDocumentIrV1(result);
  return result;
}

/** Remove an explicitly inserted PDF heading, never a MinerU source block.
 * Manually transcribed body text survives, retaining its own PDF page evidence.
 * Reassign downstream sections to the preceding root and repair all manual
 * afterBlockId references before dropping the synthetic title block. */
export function deleteManualPdfHeading(doc:DocumentIrV1,blockId:string,detail:string):DocumentIrV1{
  checkReady(doc);
  const manual=doc.manualHeadings?.find(h=>h.blockId===blockId);
  const sorted=numberedBlocks(doc);
  const index=sorted.findIndex(b=>b.blockId===blockId);
  if(!manual||index<=0||!detail.trim())
    throw Error("只能删除人工补录标题，原始 OCR 标题与首个章节不允许删除");
  // Excluding the boundary first recalculates ownership for all following
  // blocks, including manual text and nested headings, without losing them.
  // Detach any file-cut state BEFORE recalculating outline membership.
  // It points to an about-to-be-deleted title and must not become a ghost cut.
  const withoutFileCut:DocumentIrV1=doc.chapterFileLayout?
    {...doc,chapterFileLayout:doc.chapterFileLayout.filter(c=>c.blockId!==blockId)}:doc;
  const excluded=explicitClassifyOcrHeading(withoutFileCut,blockId,"exclude",undefined,
    "删除人工补录标题前解除章节定界："+detail);
  const prior=sorted[index-1].blockId;
  const removedOrder=sorted[index].readingOrder!;
  const affected=doc.chapters.find(ch=>ch.anchorBlockId===blockId)?.chapterId??
    chapterIdForAnchor(blockId);
  const next:DocumentIrV1={...excluded,
    ...(excluded.chapterFileLayout?{
      chapterFileLayout:excluded.chapterFileLayout.filter(c=>c.blockId!==blockId)
    }:{}),
    blocks:excluded.blocks.filter(b=>b.blockId!==blockId).map(b=>({
      ...b,readingOrder:b.readingOrder!>removedOrder?b.readingOrder!-1:b.readingOrder
    })),
    manualHeadings:(excluded.manualHeadings??[]).filter(h=>h.blockId!==blockId).map(h=>
      h.afterBlockId===blockId?{...h,afterBlockId:prior}:h),
    manualTexts:(excluded.manualTexts??[]).map(t=>
      t.afterBlockId===blockId?{...t,afterBlockId:prior}:t),
    chapterStructure:{...excluded.chapterStructure!,
      candidates:excluded.chapterStructure!.candidates.filter(c=>c.headingBlockId!==blockId),
      operations:[...excluded.chapterStructure!.operations,{
        operationId:"op4:"+hash("delete-manual-title\0"+blockId+"\0"+
          excluded.chapterStructure!.operations.length).slice(0,24),
        kind:"delete-manual-title",chapterIds:[affected],detail,mode:"explicit"
      }]
    }
  };
  validateDocumentIrV1(next);
  return next;
}

/** File-cut choices, independent of logical heading levels.
 * Every surviving title candidate can start its own output file; unticked
 * headings inherit the last ticked title's file without changing '#'.
 */
export interface V2IrChapterHeading {
  readonly blockId:string;
  readonly raw:string;
  readonly standalone:boolean;
  readonly fileName:string;
  readonly first:boolean;
}
export function v2IrChapterHeadings(doc:DocumentIrV1):readonly V2IrChapterHeading[]{
  checkReady(doc);
  const chapters=new Map(doc.chapters.map(c=>[c.anchorBlockId,c]));
  const overrides=new Map((doc.chapterFileLayout??[]).map(e=>[e.blockId,e]));
  return numberedBlocks(doc).filter(b=>b.type==="title")
    .reduce<{rows:V2IrChapterHeading[];ownerFile:string}>((acc,block)=>{
    const ch=chapters.get(block.blockId);
    const override=overrides.get(block.blockId);
    const standalone=acc.rows.length===0?true:
      override?.standalone??(ch?.depth===1);
    if(standalone)acc.ownerFile=override?.fileName??ch?.fileName??"";
    acc.rows.push({blockId:block.blockId,raw:block.text,
      standalone,fileName:acc.ownerFile,first:acc.rows.length===0});
    return acc;
  },{rows:[],ownerFile:""}).rows;
}
/** Sequential numbering assigns filenames to checked boundaries only.
 * It never changes a chapter's parent, depth or Markdown heading markers.
 */
export function v2IrAssignSequence(doc:DocumentIrV1,start:string):DocumentIrV1{
  checkReady(doc);
  const heads=v2IrChapterHeadings(doc);
  if(!heads.length)throw Error("没有可分配的 OCR 一级标题");
  const updated=heads.filter(h=>h.standalone);
  const assigned=assignChapterFiles({mode:"sequence",value:start,rows:updated.map(h=>({
    id:h.blockId,raw:h.raw,chapterFile:h.fileName,
  }))});
  if(!assigned.ok)throw Error(assigned.error);
  const names=new Set<string>();
  for(const filename of Object.values(assigned.files)){
    if(!validIrChapterFileName(filename))throw Error("V2 编号生成了不安全的 MD 文件名："+filename);
    if(names.has(filename.toLowerCase()))throw Error("自动章节文件名发生重复："+filename);
    names.add(filename.toLowerCase());
  }
  const layout=heads.map(h=>({blockId:h.blockId,standalone:h.standalone,
    ...(h.standalone?{fileName:assigned.files[h.blockId]}:{})}));
  // File boundaries and filenames are *not* chapter hierarchy decisions.
  const next=doc.chapters.map(ch=>ch.depth===1&&ch.anchorBlockId&&assigned.files[ch.anchorBlockId]
    ?{...ch,fileName:assigned.files[ch.anchorBlockId]}:ch);
  return appendChapterEdit({...doc,chapterFileLayout:layout},next,"assign-sequence",
    updated.map(h=>chapterIdForAnchor(h.blockId)),
    "独立章节文件顺序编号：起始序号 "+start);
}
/** File-only checkbox: unticked joins the previous checked output file.
 * It never changes chapter depth, parent, title type, or OCR evidence.
 */
export function v2IrSetStandalone(doc:DocumentIrV1,id:string,standalone:boolean):DocumentIrV1{
  const rows=v2IrChapterHeadings(doc),target=rows.find(r=>r.blockId===id);
  if(!target)throw Error("必须选择章节标题");
  if(target.first&&!standalone)throw Error("第一个标题是文件起点，没有前一个章节文件可以合并");
  if(target.standalone===standalone)return doc;
  const layout=rows.map(row=>({blockId:row.blockId,
    standalone:row.blockId===id?standalone:row.standalone,
    ...((row.blockId!==id||standalone)&&row.fileName?{fileName:row.fileName}:{})}));
  const first=rows.find(r=>r.standalone&&chapterFileParts(r.fileName));
  const original=first&&chapterFileParts(first.fileName);
  return v2IrAssignSequence({...doc,chapterFileLayout:layout},original?
    String(original.number).padStart(original.width,"0"):"01");
}
/** Rename the output filename owned by a checked boundary only.
 * No title hierarchy or OCR/PDF evidence changes.
 */
export function v2IrSetChapterFile(doc:DocumentIrV1,id:string,filename:string):DocumentIrV1{
  checkReady(doc);
  const heading=v2IrChapterHeadings(doc).find(r=>r.blockId===id);
  if(!heading?.standalone)throw Error("只有勾选独立成章的标题才能修改章节文件名");
  const normalized=filename.trim();
  if(!validIrChapterFileName(normalized))throw Error("请输入安全、合法的 .md 文件名");
  if(heading.fileName===normalized)return doc;
  if(v2IrChapterHeadings(doc).some(h=>h.standalone&&h.blockId!==id&&h.fileName.toLowerCase()===normalized.toLowerCase()))
    throw Error("章节文件名不可重复");
  const layout=v2IrChapterHeadings(doc).map(h=>({blockId:h.blockId,
    standalone:h.standalone,...(h.standalone&&(h.blockId===id||h.fileName)?
      {fileName:h.blockId===id?normalized:h.fileName}:{})}));
  const chapter=doc.chapters.find(c=>c.anchorBlockId===id);
  return appendChapterEdit({...doc,chapterFileLayout:layout},doc.chapters.map(c=>c.chapterId===chapter?.chapterId?
    {...c,fileName:normalized}:c),"assign-file",[chapterIdForAnchor(id)],
    "AG 独立章节文件重命名："+normalized);
}

/** Restore a missed OCR title from an existing, real PDF-anchored text block.
 * No new synthetic OCR source is ever created or duplicated. */
export function explicitPromoteOcrTextToHeading(doc:DocumentIrV1,blockId:string,
  level:1|2,detail:string):DocumentIrV1{
  checkReady(doc);
  const block=doc.blocks.find(b=>b.blockId===blockId);
  if(!block||block.type!=="text"||!detail.trim()||!doc.chapterStructure)
    throw Error("新增标题只能提升已有来源锚点的 OCR 正文块");
  const sourceMap=new Map(doc.sourceElements.map(s=>[s.id,s]));
  const first=sourceMap.get(block.sources[0].elementId)!;
  const candidate:IrChapterBoundaryCandidate={candidateId:"ir4:"+hash("manual-heading\0"+blockId).slice(0,24),
    headingBlockId:blockId,sourceElementIds:block.sources.map(r=>r.elementId),
    pageNumber:first.pdfPageNumber,proposedRole:level===1?"root":"section",
    reason:"原 OCR 正文经人工对照 PDF 提升为标题；OCR 来源始终保留。",status:"needs-review"};
  const intermediate={...doc,blocks:doc.blocks.map(b=>b.blockId===blockId?
    {...b,type:"title"}:b),
    chapterStructure:{...doc.chapterStructure,candidates:[...doc.chapterStructure.candidates,candidate]}};
  validateDocumentIrV1(intermediate);
  return explicitClassifyOcrHeading(intermediate,blockId,level===1?"root":"section",undefined,detail);
}
