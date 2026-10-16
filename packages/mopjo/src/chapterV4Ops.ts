/** WP4 explicit chapter mutations: all changes are part of replayable delta operations.
 * Never rewrite OCR source elements or invent page coordinates. */
import type {ChapterOriginal,ChapterOperation,WorkingBlock} from './chapters';
import {sha256} from './core';
export const idrx=/^blk_[a-f0-9]{24}$/u;
export type V4Request=
 | {kind:'split-text';blockId:string;offset:number}
 | {kind:'merge-text';blockId:string;otherBlockId:string;separator:''|' '|'\n'}
 | {kind:'move-text';blockId:string;direction:'up'|'down'}
 | {kind:'join-soft-break';blockId:string;offset:number}
 | {kind:'insert-manual-heading';blockId:string;text:string;page:number;level:2}
 | {kind:'insert-manual-rich';blockId:string;page:number;mode:'table-html'|'equation'|'image-link';content:string}
 | {kind:'replace-inline-formula';blockId:string;elementId:string;segmentPointer:string;
    from:number;before:string;after:string}
 | {kind:'heading-level';blockId:string;level:2|3}
 | {kind:'replace-rich';blockId:string;elementId:string;segmentPointer:string;
    from:number;before:string;after:string}
 | {kind:'review-note';blockId:string;noteElementId:string;decision:'confirmed'|'ocr-error'|'unmatched';
    noteNumber:number|null;detail:string};
export interface NoteReview {readonly noteElementId:string;readonly decision:'confirmed'|'ocr-error'|'unmatched';
  readonly noteNumber:number|null;readonly detail:string;readonly reviewerBlockId:string;}
export interface V4WorkingBlock extends WorkingBlock {
  readonly noteReviews?:readonly NoteReview[];
  readonly headingLevel?:number;
  readonly mappingPrecision?:'coarse-original-block';
}
const esc=(v:string)=>v.replace(/\r\n?/g,'\n').replace(/&/g,'&amp;').replace(/</g,'&lt;')
  .replace(/>/g,'&gt;').replace(/^(?=[#>|])([#>|])/gm,'\\$1');
const textReady=(b:WorkingBlock)=>b.block.type==='text'&&b.mode==='text'&&
   !b.hidden&&b.content===esc(b.block.text);
function textReq(b:WorkingBlock){if(!textReady(b))throw Error('MOPJO WP4 REQUIRES_CANONICAL_TEXT');}
function splitPoint(text:string,offset:number){
  if(!Number.isSafeInteger(offset)||offset<1||offset>=text.length||
    (text.charCodeAt(offset-1)>=0xD800&&text.charCodeAt(offset-1)<=0xDBFF)||
    (text.charCodeAt(offset)>=0xDC00&&text.charCodeAt(offset)<=0xDFFF))
    throw Error('MOPJO WP4 INVALID_TEXT_BOUNDARY');
}
function normalizedPdf(b:WorkingBlock){return b.pdfPages.filter(x=>Number.isSafeInteger(x)&&x>0);}
function sameChapter(a:WorkingBlock,b:WorkingBlock){return a.block.chapterId===b.block.chapterId;}
const literal=(text:string)=>text.replace(/\r\n?/g,'\n');
function htmlSkeleton(s:string){return [...s.matchAll(/<\/?[a-z][^>]*>/gi)].map(x=>x[0]).join('|');}
function validateRich(before:string,after:string,mode:string){
  if(!after.trim()||after.includes('\0')||after.length>500000||
     /<\s*(script|iframe|object|embed)\b|\bon\w+\s*=|javascript:/i.test(after))
    throw Error('MOPJO WP4 RICH_UNSAFE');
  if(mode==='table-html' && (htmlSkeleton(before)!==htmlSkeleton(after)||
     !after.includes('<table')))throw Error('MOPJO WP4 TABLE_STRUCTURE_CHANGED');
  if(mode==='equation'&&(/```/.test(after)||/\r/.test(after)))
    throw Error('MOPJO WP4 EQUATION_FENCE_CHANGED');
  if(mode==='image-link'||mode==='chart-link'){
    if(/\n/.test(after))throw Error('MOPJO WP4 IMAGE_LINK_UNSAFE');
    const oldLink=/^(.*\]\()([^\s)]+)(\))$/u.exec(before);
    const newLink=/^(.*\]\()([^\s)]+)(\))$/u.exec(after);
    if(!oldLink||!newLink||oldLink[1]!==newLink[1]||oldLink[3]!==newLink[3])
      throw Error('MOPJO WP4 IMAGE_LINK_STRUCTURE_CHANGED');
    const url=newLink[2];
    if(!/^https:\/\/[^\s/?#]+/u.test(url)&&
       !/^(?:imgs\/)[a-zA-Z0-9._-]+\.(?:png|jpg|jpeg|gif|webp)$/u.test(url))
      throw Error('MOPJO WP4 IMAGE_LINK_UNSAFE');
    if(url.includes('..')||/%2f|%5c/i.test(url))throw Error('MOPJO WP4 IMAGE_LINK_UNSAFE');
  }
}
/** Returns a new in-memory state or throws. Caller adds op hashes and persists atomically. */
export function evolveV4(ch:ChapterOriginal,blocks:readonly WorkingBlock[],op:ChapterOperation):WorkingBlock[]{
  const next=[...blocks] as V4WorkingBlock[];
  const i=next.findIndex(x=>x.block.blockId===op.blockId);
  if(i<0)throw Error('MOPJO WP4 BLOCK_NOT_FOUND');
  const b=next[i],kind=op.kind;
  if(kind==='split-text'){
    textReq(b);splitPoint(b.block.text,op.offset!);
    if(!op.insertedId||!idrx.test(op.insertedId)||next.some(x=>x.block.blockId===op.insertedId))
      throw Error('MOPJO WP4 SPLIT_ID_INVALID');
    const a=b.block.text.slice(0,op.offset!),c=b.block.text.slice(op.offset);
    next[i]={...b,content:esc(a),block:{...b.block,text:a},mappingPrecision:'coarse-original-block'};
    next.splice(i+1,0,{...b,block:{...b.block,blockId:op.insertedId,text:c},content:esc(c),
      mappingPrecision:'coarse-original-block'});
  }else if(kind==='merge-text'){
    const right=next[i+1];
    if(!right||right.block.blockId!==op.otherBlockId||!sameChapter(b,right)||
      !['',' ','\n'].includes(op.separator??'?'))throw Error('MOPJO WP4 MERGE_NOT_ADJACENT');
    textReq(b);textReq(right);
    const text=b.block.text+op.separator+right.block.text;
    next.splice(i,2,{...b,block:{...b.block,text,
      sources:[...b.block.sources,...right.block.sources]},content:esc(text),
      evidence:[...b.evidence,...right.evidence],
      pdfPages:[...new Set([...normalizedPdf(b),...normalizedPdf(right)])].sort((x,y)=>x-y),
      mappingPrecision:'coarse-original-block'});
  }else if(kind==='move-text'){
    const j=i+(op.direction==='up'?-1:op.direction==='down'?1:10000);
    const neighbor=next[j];
    if(!neighbor||!sameChapter(b,neighbor))throw Error('MOPJO WP4 MOVE_CROSSES_CHAPTER');
    textReq(b);textReq(neighbor);
    next[i]=neighbor;next[j]=b;
  }else if(kind==='join-soft-break'){
    textReq(b);
    if(!Number.isSafeInteger(op.offset)||b.block.text[op.offset!]!=='\n'||
      op.offset!<=0||op.offset!>=b.block.text.length-1)
      throw Error('MOPJO WP4 NO_LINE_BREAK');
    const text=b.block.text.slice(0,op.offset!)+b.block.text.slice(op.offset!+1);
    next[i]={...b,block:{...b.block,text},content:esc(text)};
  }else if(kind==='insert-manual-rich'||kind==='insert-manual-heading'){
    if(b.hidden||!Number.isSafeInteger(op.page)||!b.pdfPages.includes(op.page!)||
       !op.insertedId||!idrx.test(op.insertedId)||
       next.some(x=>x.block.blockId===op.insertedId))throw Error('MOPJO WP4 MANUAL_SOURCE_INVALID');
    let content:string,type:string,mode:WorkingBlock['mode'];
    if(kind==='insert-manual-heading'){
      if(!op.text?.trim()||op.text.includes('\n')||op.text.length>200||op.level!==2)
        throw Error('MOPJO WP4 MANUAL_HEADING_INVALID');
      if(!ch.chapterTree.some(c=>c.anchorBlockId===ch.startBlockId&&c.parentChapterId===null))
        throw Error('MOPJO WP4 MANUAL_HEADING_ROOT_REQUIRED');
      content='## '+op.text;type='title';mode='heading';
    }else{
      mode=op.mode!;
      content=op.content!;
      if(!['table-html','equation','image-link'].includes(mode)||!content||
         content.length>300000)throw Error('MOPJO WP4 MANUAL_RICH_INVALID');
      validateRich(content,content,mode);
      if(mode==='equation'&&!/^\$\$\n[\s\S]+\n\$\$$/.test(content))
        throw Error('MOPJO WP4 MANUAL_FORMULA_INVALID');
      if(mode==='table-html'&&!/^<table\b[\s\S]*<\/table>$/.test(content.trim()))
        throw Error('MOPJO WP4 MANUAL_TABLE_INVALID');
      type=mode==='equation'?'interline_equation':mode==='table-html'?'table':'image';
    }
    next.splice(i+1,0,{block:{...b.block,blockId:op.insertedId,type,text:kind==='insert-manual-heading'?op.text!:content,
      sources:[],audit:'unreviewed'},content,mode,pdfPages:[op.page!],
      evidence:[],manualPdfPage:op.page!});
  }else if(kind==='heading-level'){
    if(!b.block.type.startsWith('title')||b.hidden||!b.content.startsWith('#')||
      ![2,3].includes(op.level!)||i===0)
      throw Error('MOPJO WP4 HEADING_LEVEL_PROTECTED');
    const outline=ch.chapterTree.find(x=>x.anchorBlockId===b.block.blockId);
    if(!outline||outline.parentChapterId===null||
      ch.chapterTree.some(x=>x.parentChapterId===outline.chapterId)||
      op.level===3&&!next.slice(0,i).some(x=>x.block.type==='title'&&x.content.startsWith('## ')))
      throw Error('MOPJO WP4 HEADING_TREE_CONFLICT');
    const text=b.block.text,content='#'.repeat(op.level!)+' '+text;
    if(content===b.content)throw Error('MOPJO WP4 NO_CHANGE');
    next[i]={...b,content,headingLevel:op.level};
  }else if(kind==='replace-rich'){
    if(!['table-html','equation','image-link','chart-link'].includes(b.mode)||b.hidden||
      !Number.isSafeInteger(op.from)||!op.before||typeof op.after!=='string')
      throw Error('MOPJO WP4 RICH_EDIT_UNSUPPORTED');
    const source=ch.sourceElements.find(x=>x.id===op.elementId);
    if(!source||!b.block.sources.some(ref=>ref.elementId===source.id)||
       !source.segments.some(seg=>seg.jsonPointer===op.segmentPointer))
      throw Error('MOPJO WP4 RICH_SOURCE_UNBOUND');
    const segment=source.segments.find(seg=>seg.jsonPointer===op.segmentPointer)!;
    if(b.mode==='equation'&&!/equation/.test(segment.type)||
       b.mode==='table-html'&&!segment.html||
       (b.mode==='image-link'||b.mode==='chart-link')&&!segment.imagePath)
      throw Error('MOPJO WP4 RICH_SEGMENT_KIND_MISMATCH');
    const sourceSpan=b.mode==='equation'?segment.content:
      b.mode==='table-html'?segment.html:segment.imagePath;
    if(!sourceSpan?.includes(op.before))throw Error('MOPJO WP4 RICH_SPAN_NOT_IN_SOURCE');
    if(b.content.slice(op.from!,op.from!+op.before.length)!==op.before)
      throw Error('MOPJO WP4 RICH_STALE_RANGE');
    const after=b.content.slice(0,op.from!)+op.after+b.content.slice(op.from!+op.before.length);
    validateRich(b.content,after,b.mode);
    if(after===b.content)throw Error('MOPJO WP4 NO_CHANGE');
    next[i]={...b,content:after};
  }else if(kind==='replace-inline-formula'){
    if(b.hidden||b.mode!=='text'||b.block.type!=='text'||
       !Number.isSafeInteger(op.from)||typeof op.after!=='string'||!op.after.trim()||
       !op.before||/\n|<script|javascript:/.test(op.after))
      throw Error('MOPJO WP4 INLINE_FORMULA_INVALID');
    const source=ch.sourceElements.find(s=>s.id===op.elementId);
    const seg=source?.segments.find(s=>s.jsonPointer===op.segmentPointer);
    if(!source||!b.block.sources.some(s=>s.elementId===source.id)||
       seg?.type!=='inline_equation'||!seg.content?.includes(op.before)||
       b.content.slice(op.from!,op.from!+op.before.length)!==op.before)
      throw Error('MOPJO WP4 INLINE_SOURCE_MISMATCH');
    const oldIndex=b.block.text.indexOf(op.before);
    if(oldIndex<0||b.block.text.indexOf(op.before,oldIndex+1)>=0)
      throw Error('MOPJO WP4 INLINE_MULTIPLE_MATCHES');
    const raw=b.block.text.slice(0,oldIndex)+op.after+b.block.text.slice(oldIndex+op.before.length);
    const projected=esc(raw);
    if(projected!==b.content.slice(0,op.from!)+op.after+b.content.slice(op.from!+op.before.length))
      throw Error('MOPJO WP4 INLINE_MD_PROJECTION_MISMATCH');
    next[i]={...b,block:{...b.block,text:raw},content:projected};
  }else if(kind==='review-note'){
    const note=ch.supplementalEvidence?.find(x=>x.source.id===op.noteElementId);
    if(!note||note.source.type!=='page_footnote'||b.hidden||
       !b.pdfPages.includes(note.source.pdfPageNumber)||
       !['confirmed','ocr-error','unmatched'].includes(op.decision??'')||
       typeof op.detail!=='string'||!op.detail.trim()||op.detail.length>2048||
       (op.noteNumber!==null&&(!Number.isSafeInteger(op.noteNumber)||op.noteNumber!<=0)))
      throw Error('MOPJO WP4 NOTE_SOURCE_UNVERIFIED');
    const noteLead=note.source.segments.map(s=>s.content??'').join(' ').trim();
    if(op.decision==='confirmed'&&(
       op.noteNumber===null||
       !new RegExp('^(?:\\[\\^|<sup>\\s*|\\(?\\s*)'+String(op.noteNumber)+'(?:\\]|\\s*</sup>|[.、)\\s])','u')
         .test(noteLead)||
       !new RegExp('(?:<sup>\\s*|\\[\\^|[\\(])'+String(op.noteNumber)+'(?:\\s*</sup>|\\]|[\\)])','u')
         .test(b.block.text)))
      throw Error('MOPJO WP4 NOTE_REFERENCE_NOT_PROVEN');
    const review:NoteReview={noteElementId:note.source.id,decision:op.decision!,
      noteNumber:op.noteNumber??null,detail:op.detail,reviewerBlockId:b.block.blockId};
    const existing=b.noteReviews??[];
    next[i]={...b,noteReviews:[...existing.filter(x=>x.noteElementId!==review.noteElementId),review]};
  }else throw Error('MOPJO WP4 UNKNOWN_OPERATION');
  return next;
}
