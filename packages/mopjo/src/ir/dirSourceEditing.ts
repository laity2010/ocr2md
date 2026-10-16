/** DIRjson: source-anchored Markdown editing without ever editing the raw OCR/PDF.
 * A generated Markdown view is editable only inside its immutable block markers.
 * Reject changes to markers, new unanchored paragraphs and rich OCR regions.
 */
import {validateDocumentIrV1,type DocumentIrV1} from './documentIrV1';
import {createHash} from 'crypto';
import {explicitReplaceBlockText} from './documentIrReconstruction';
import {explicitClassifyOcrHeading,explicitPromoteOcrTextToHeading,deleteManualPdfHeading,explicitDemoteOcrHeadingToText} from './documentIrChapters';
import {generateIrMarkdownBundle,type IrMarkdownChapterFile} from './documentIrMarkdown';

export class DirSourceEditError extends Error {constructor(message:string){super(message);this.name='DirSourceEditError';}}

export function parseDirSourceChange(file:IrMarkdownChapterFile,changed:string):ReadonlyArray<{
  blockId:string;source:string;headingLevel:number|null;
}> {
  if(typeof changed!=='string'||changed.length>8*1024*1024)throw new DirSourceEditError('源码超出安全编辑范围');
  const marker=/^<!-- ocr2md-ir:block=(blk_[0-9a-f]{24}) -->\n/gm;
  const matches=[...changed.matchAll(marker)];
  if(matches.length!==file.ranges.length)throw new DirSourceEditError('不得删除或新增来源锚点；新增 OCR 缺失标题应从已有文本块提升');
  const first=file.ranges[0];
  if(changed.slice(0,matches[0].index)!==file.content.slice(0,first.from))
    throw new DirSourceEditError('章节起始结构不是可编辑的 OCR 元素');
  return file.ranges.map((range,i)=>{
    const m=matches[i];
    if(m[1]!==range.blockId)throw new DirSourceEditError('来源锚点不得更名、删除或重新排序');
    const from=m.index!+m[0].length;
    const to=i+1<matches.length?matches[i+1].index!:changed.length;
    const segment=changed.slice(from,to);
    if(!segment.endsWith('\n\n'))throw new DirSourceEditError('请保留元素之间的空行分隔符');
    const source=segment.slice(0,-2);
    const heading=/^(#{1,6})[ \t]+([^\n]*)$/u.exec(source);
    return {blockId:range.blockId,source,headingLevel:heading?heading[1].length:null};
  });
}
const unescapeMd=(value:string)=>value.replace(/\\([#>|`*_[\]\\])/gu,'$1')
  .replace(/&lt;/gu,'<').replace(/&gt;/gu,'>').replace(/&amp;/gu,'&');

/** Missing body text below a user-restored PDF title is a NEW IR text block,
 * with a real PDF page and NO fabricated OCR provenance. */
export function insertManualPdfText(doc:DocumentIrV1,afterBlockId:string,text:string):DocumentIrV1 {
  validateDocumentIrV1(doc);
  const heading=doc.manualHeadings?.find(h=>h.blockId===afterBlockId);
  const anchor=doc.blocks.find(b=>b.blockId===afterBlockId);
  if(!heading||!anchor||!text.trim()||text.length>250000||text.includes('\u0000'))
    throw new DirSourceEditError('只能在人工补录标题下新增正文，并保留该标题的 PDF 页码来源');
  const order=anchor.readingOrder!+1;
  const blockId='blk_'+createHash('sha256').update('manual-pdf-text\0'+doc.pdf.sha256+'\0'+
    afterBlockId+'\0'+(doc.manualTexts?.length??0)+'\0'+text).digest('hex').slice(0,24);
  if(doc.blocks.some(b=>b.blockId===blockId))throw new DirSourceEditError('人工正文 ID 已存在');
  const updated:DocumentIrV1={...doc,
    manualTexts:[...(doc.manualTexts??[]),{blockId,afterBlockId,
      pdfPageNumber:heading.pdfPageNumber,method:'manual-pdf-page',
      detail:'人工补录标题下对照 PDF 的正文录入'}],
    blocks:[...doc.blocks.map(b=>b.readingOrder!>=order?{...b,readingOrder:b.readingOrder!+1}:b),
      {blockId,type:'text',text,chapterId:anchor.chapterId,readingOrder:order,
        status:'structured',audit:'unreviewed',sources:[]}]
  };
  validateDocumentIrV1(updated);
  return updated;
}
/** Atomic: either every changed block maps back to DIR or none do. */
export function applyDirSourceChange(doc:DocumentIrV1,file:IrMarkdownChapterFile,changed:string):DocumentIrV1 {
  validateDocumentIrV1(doc);
  // Deleting an ENTIRE synthetic heading line together with its provenance
  // marker is safe only when the rest of the projection is byte-for-byte
  // unchanged. OCR-backed markers are never removable through source edits.
  const missing=(doc.manualHeadings??[]).filter(h=>
    file.ranges.some(r=>r.blockId===h.blockId)&&
    !changed.includes(`<!-- ocr2md-ir:block=${h.blockId} -->`));
  if(missing.length===1){
    const range=file.ranges.find(r=>r.blockId===missing[0].blockId)!;
    const prefix=file.content.slice(0,range.from);
    const tail=file.content.slice(range.to);
    if(changed===prefix+tail||changed===prefix+'\n'+tail||changed===prefix+'\n\n'+tail)
      return deleteManualPdfHeading(doc,missing[0].blockId,'源码删除完整人工标题与其标记');
  }
  const parsed=parseDirSourceChange(file,changed);
  const positions=new Map(doc.blocks.map(b=>[b.blockId,b]));
  let current=doc;
  const edits=parsed.filter((item,i)=>{
    const original=file.content.slice(file.ranges[i].contentFrom,file.ranges[i].contentTo);
    if(item.source===original)return false;
    // The user may pause after pressing Enter below a manually restored title.
    // Blank-line padding is transient editor state, not a reason to reject input.
    if(doc.manualHeadings?.some(h=>h.blockId===item.blockId)&&
       /^#{1,2}[ \t]+[^\n]+\n+$/u.test(item.source)&&
       item.source.trimEnd()===original)return false;
    return true;
  });
  if(!edits.length)return doc;
  if(edits.length>20)throw new DirSourceEditError('每次最多修改 20 个锚定块，防止误粘贴破坏章节结构');
  const deletedManual=edits.filter(item=>doc.manualHeadings?.some(h=>h.blockId===item.blockId)&&
    (!item.source.trim()||/^#{1,2}[ \t]*$/u.test(item.source)));
  if(deletedManual.length){
    if(deletedManual.length!==1||edits.length!==1)
      throw new DirSourceEditError('请逐个删除人工补录标题；其他编辑可随后继续');
    return deleteManualPdfHeading(doc,deletedManual[0].blockId,'源码窗清空人工补录标题');
  }

  const appended=new Map<string,{title:string;bodyId:string}>();
  for(const item of edits){
    const block=positions.get(item.blockId)!;
    // A freshly transcribed title may grow a real body under the same source
    // marker. On commit this becomes a distinct, page-anchored text block.
    const manual=doc.manualHeadings?.find(h=>h.blockId===item.blockId);
    const append=manual && /^(#{1,2}[ \t]+[^\n]+)\n+([\s\S]*\S[\s\S]*)$/u.exec(item.source);
    const editable=append?append[1]:item.source;
    const level=append?append[1].match(/^#+/u)![0].length:item.headingLevel;
    const plain=level?editable.replace(/^#{1,6}[ \t]+/u,''):editable;
    if(/\n#{1,6}[ \t]+/u.test(item.source))
      throw new DirSourceEditError('新增标题必须提升已有 OCR 文本块，不能插入无 PDF 锚点的新标题行');
    if(plain.includes('\n')&&block.type==='title')
      throw new DirSourceEditError('标题必须保持单行；拆分段落请使用结构清洗模块');
    if(!['title','text','ref_text'].includes(block.type))
      throw new DirSourceEditError('表格、公式、图片等富媒体块暂不支持源码直改');
    if(level&&level>2&&level!==3)
      throw new DirSourceEditError('章节定界源码仅支持 H1/H2；H3 可保留但暂不支持改成 H4–H6');
    if(block.type==='text'&&level){
      if(level===3)throw new DirSourceEditError('正文提升标题请使用 # 或 ##，不支持直接创建 H3');
      current=explicitPromoteOcrTextToHeading(current,item.blockId,level as 1|2,
        '源码窗把 OCR 正文提升为缺失标题');
    }
    if(block.type==='ref_text'&&level)
      throw new DirSourceEditError('参考文献类型暂不允许在源码中改为标题');
    // H3 is an OCR title without an explicit chapter anchor. Preserve this
    // tentative status until the user promotes it to root or subsection.
    if(block.type==='title'&&level===3){
      const currentChapter=current.chapters.find(c=>c.anchorBlockId===item.blockId);
      if(currentChapter)throw new DirSourceEditError('已有定界的标题不能直接改成 H3；先调整章界');
    }
    if(block.type==='title'&&level===null){
      const chapter=current.chapters.find(c=>c.anchorBlockId===item.blockId);
      if(chapter?.anchorBlockId===current.blocks.find(b=>b.readingOrder===0)?.blockId)
        throw new DirSourceEditError('首个章节容器不可删除；请改文字或改章节层级');
      current=explicitDemoteOcrHeadingToText(current,item.blockId,'源码窗将 OCR 标题改为普通正文');
    }else if(block.type==='title'&&level!==3&&level!==null){
      const chapter=current.chapters.find(c=>c.anchorBlockId===item.blockId);
      const wanted=level===1?'root':'section';
      if(!chapter||(chapter.depth===1)!==(wanted==='root'))
        current=explicitClassifyOcrHeading(current,item.blockId,wanted,undefined,'源码窗调整标题层级');
    }
    // Removing the final Markdown heading # leaves its required separator
    // space behind. That space is syntax, not part of the OCR body text.
    const corrected=unescapeMd(block.type==='title'&&level===null?
      plain.replace(/^ /u,''):plain);
    if(current.blocks.find(b=>b.blockId===item.blockId)!.text!==corrected)
      current=explicitReplaceBlockText(current,item.blockId,corrected,'源码窗校正 OCR 文本');
    if(append){
      const body=unescapeMd(append[2]);
      current=insertManualPdfText(current,item.blockId,body);
      const bodyId=current.manualTexts!.at(-1)!.blockId;
      appended.set(item.blockId,{title:editable,bodyId});
    }
    if(current.chapters.some(ch=>ch.anchorBlockId===item.blockId)){
      const chapter=current.chapters.find(ch=>ch.anchorBlockId===item.blockId)!;
      if(chapter.name===block.text&&corrected!==block.text){
        const chapters=current.chapters.map(ch=>ch.chapterId===chapter.chapterId?{...ch,name:corrected}:ch);
        current={...current,chapters};
      }
    }
  }
  // A full regenerated projection is the definitive reversible encoding check.
  const regenerated=generateIrMarkdownBundle(current);
  // Heading reclassification can move the entire block to a different output
  // file; validate semantic source content, never demand the old file survive.
  for(const item of edits){
    const actual=regenerated.files.flatMap(f=>f.ranges.map(r=>({file:f,range:r})))
      .find(entry=>entry.range.blockId===item.blockId);
    const wanted=appended.get(item.blockId)?.title??
      (positions.get(item.blockId)?.type==='title'&&item.headingLevel===null?
        item.source.replace(/^ /u,''):item.source);
    const actualSource=actual?.file.content.slice(actual.range.contentFrom,actual.range.contentTo);
    // For plain text the projection escapes HTML/Markdown delimiters safely.
    // Syntax-derived headings and immutable marker validation remain strict.
    const textBlock=current.blocks.find(b=>b.blockId===item.blockId);
    if(!actual||(actualSource!==wanted &&
      (textBlock?.type!=='text'||textBlock.text!==unescapeMd(wanted))))
      throw new DirSourceEditError('编辑内容与 DIRjson 生成语法不一致；请保留块标记、标题语法和转义字符');
    const extra=appended.get(item.blockId);
    if(extra && !regenerated.files.some(f=>f.ranges.some(r=>r.blockId===extra.bodyId)))
      throw new DirSourceEditError('人工补录正文未进入 DIRjson');
  }
  return current;
}
