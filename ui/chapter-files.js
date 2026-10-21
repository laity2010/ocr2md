/** Pure chapter projection from the current CM6 document and the V6 heading index.
 * No state, I/O, or copies of editable Markdown live here.
 * Full MinerU raw source remains ONLY in the original mother document.
 */
import {decodeMarker} from './chapter-markers.js';

const openBlock=/^<!-- minerujson:block:v1:(\d+):(\d+) -->$/;
const endBlock=/^<!-- minerujson:end:v1:(\d+):(\d+) -->$/;
const sourceHeader=/^<!-- minerujson:source:v1:/;

// A typed start such as "00", "0000", or "007" defines both the numeric
// starting point and the exact minimum width of the exported filenames.
// Numeric callers retain the historical 3-digit default.
export function chapterStartFormat(value=0){
  const text=typeof value==='number'?String(value).padStart(3,'0'):value;
  if(typeof text!=='string'||!/^\d{1,5}$/.test(text))
    throw Error('Invalid starting chapter number');
  const number=Number(text);
  if(!Number.isSafeInteger(number)||number<0||number>99999)
    throw Error('Invalid starting chapter number');
  return {text,number,width:text.length};
}
function fileName(title,number,width){
  const slug=title.normalize('NFKD').replace(/\p{Mark}/gu,'')
    .replace(/[^\p{Letter}\p{Number}]+/gu,'-')
    .replace(/^-+|-+$/g,'').slice(0,72).replace(/-+$/,'')||'chapter';
  return `${String(number).padStart(width,'0')}-${slug}.md`;
}

/** Calculate only chapter association; safe to use every time AG refreshes. */
export function chapterAssignments(rows,startNumber=0){
  const {number,width}=chapterStartFormat(startNumber);
  const chapters=[];
  for(const [index,row] of rows.entries()){
    if(index===0||row.independent){
      chapters.push({id:row.id,title:row.title,file:fileName(row.title,number+chapters.length,width),
        firstHeadingIndex:index});
    }
    row.chapterFile=chapters.at(-1).file;
  }
  return chapters;
}

/** Strict export: split at MinerU block-open boundaries, never inside a block.
 * Filter only OCR2MD control markers; retain existing per-block provenance.
 * Text before first title remains with chapter 1. The long raw JSON source
 * comment remains in the mother document and is never duplicated.
 */
export function buildChapterFiles(markdown,rows,startNumber=0){
  if(!rows.length)throw Error('文档没有章节标题');
  const chapters=chapterAssignments(rows,startNumber);
  const lines=markdown.split('\n');
  const sourceAt=lines.findIndex(line=>sourceHeader.test(line));
  const bodyEnd=sourceAt===-1?lines.length:sourceAt;
  const spans=[];
  for(let i=0;i<chapters.length;i++){
    const chapter=chapters[i];
    const row=rows[chapter.firstHeadingIndex];
    const id=/^mineru:(\d+):(\d+):0$/.exec(row.id);
    if(!id)throw Error(`章节「${row.title}」缺少可安全切分的 MinerU 块锚点`);
    if(row.sourceLine<1||row.sourceLine>bodyEnd)
      throw Error(`章节「${row.title}」超出母文档正文边界`);
    let opener=-1;
    for(let j=row.sourceLine-2;j>=0;j--){
      if(endBlock.test(lines[j]))break;
      const match=openBlock.exec(lines[j]);
      if(match){
        if(match[1]!==id[1]||match[2]!==id[2])
          throw Error(`章节「${row.title}」的证据块编号不匹配`);
        opener=j;break;
      }
    }
    if(opener<0)throw Error(`章节「${row.title}」未找到完整 MinerU 块起点`);
    if(spans.length&&opener<=spans.at(-1))
      throw Error(`章节「${row.title}」与前一章节处于同一证据块，暂不能无损切分`);
    spans.push(opener);
  }
  const result=[];
  for(let i=0;i<chapters.length;i++){
    const from=i===0?0:spans[i];
    const to=i+1<chapters.length?spans[i+1]:bodyEnd;
    if(to<=from)throw Error('章节切分边界无效');
    // split/join of line arrays drops the separator immediately before the
    // next block (or raw JSON tail). Put back exactly that original newline.
    const content=lines.slice(from,to).filter(line=>!decodeMarker(line.trim())).join('\n')+
      (to<lines.length?'\n':'');
    if(!content.trim())throw Error(`章节「${chapters[i].title}」内容为空`);
    result.push({name:chapters[i].file,content,
      firstId:chapters[i].id});
  }
  return result;
}
