/** WP1–WP2: a pure, read-only CMD projection of ONE Markdown source.
 * No files, network calls, editor state or business module writes here.
 * Source offsets are JS/CM6 UTF-16 offsets, [from,to) throughout.
 * Stable persisted facts remain only the existing HTML comments.
 */
import {buildOutline} from '../../../ui/outline-index.js';
import {decodeMarker} from '../../../ui/chapter-markers.js';
import {chapterAssignments,chapterStartFormat} from '../../../ui/chapter-files.js';
import {blockAnchor,pageHeader,sourceHeader} from '../../../ui/mineru-anchors.js';
import {scanAnnotations} from '../../../ui/cmd-annotations.js';
import {findLatex} from '../../../ui/latex-scan.js';
import {findReviewMarkers} from '../../../ui/latex-review-markers.js';
import {findMedia} from '../../../ui/media-module.js';

const TYPES=new Set(['heading','media','latex']);
const assertString=(value,name)=>{if(typeof value!=='string')throw TypeError(`${name} must be text`);};
const freezeList=items=>Object.freeze(items.map(item=>Object.freeze(item)));
function lineOffsets(source){
  const offsets=[0];
  for(let i=0;i<source.length;i++)if(source.charCodeAt(i)===10)offsets.push(i+1);
  return offsets;
}
function indexAt(offsets,position){
  let lo=0,hi=offsets.length-1;
  while(lo<=hi){const mid=(lo+hi)>>1;
    if(offsets[mid]<=position)lo=mid+1;else hi=mid-1;
  }
  return hi;
}
function blockIdentity(sourceLines,headingLine){
  for(let i=headingLine-2;i>=0;i--){
    if(pageHeader(sourceLines[i]))break;
    const block=blockAnchor(sourceLines[i]);
    if(block)return {atLine:i+1,id:`mineru:${block.pageIndex}:${block.blockIndex}:0`};
  }
  return null;
}
/** Chapter scope begins at the owning block anchor when available. It may
 * include pre-heading provenance, unlike a naive heading-position-only slice.
 * Original OCR source archive after minerujson:source stays in the sole MD,
 * outside all editable chapter scopes and is NEVER truncated or rewritten.
 */
export function buildDocumentIndex(source,{startNumber='000'}={}){
  assertString(source,'Markdown');
  chapterStartFormat(startNumber);
  const lines=source.split('\n'),offsets=lineOffsets(source);
  const bodyEndLine=lines.findIndex(sourceHeader);
  const bodyEnd=bodyEndLine<0?source.length:offsets[bodyEndLine];
  const headings=buildOutline(source);
  const warnings=[];
  for(const heading of headings){
    const prior=lines[heading.sourceLine-2];
    const marker=prior===undefined?null:decodeMarker(prior);
    heading.independent=marker?.id===heading.id?marker.independent:true;
    if(marker&&marker.id!==heading.id)
      warnings.push({kind:'detached-chapter-marker',line:heading.sourceLine-1,id:marker.id});
  }
  const chapterDrafts=chapterAssignments(headings,startNumber);
  const chapters=[];
  for(let i=0;i<chapterDrafts.length;i++){
    const {firstHeadingIndex,id,title,file}=chapterDrafts[i];
    const heading=headings[firstHeadingIndex];
    const anchor=blockIdentity(lines,heading.sourceLine);
    // Foreign/manual headings without MinerU anchors still work, but the
    // absence of durable provenance is observable, never silently asserted.
    const startLine=i===0?1:(anchor?.id===heading.id?anchor.atLine:
      (decodeMarker(lines[heading.sourceLine-2]||'')?.id===heading.id?
        heading.sourceLine-1:heading.sourceLine));
    const from=i===0?0:offsets[startLine-1];
    if(from>=bodyEnd||from<(chapters.at(-1)?.from??0)||
       (i>0&&from<=chapters.at(-1).from))
      throw Error(`Overlapping or out-of-body chapter boundary: ${heading.id}`);
    if(!anchor||anchor.id!==heading.id)
      warnings.push({kind:'non-provenance-boundary',id:heading.id,line:heading.sourceLine});
    if(heading.id.startsWith('line:'))
      warnings.push({kind:'unstable-chapter-id',id:heading.id,line:heading.sourceLine});
    chapters.push({id,title,ordinal:i,number:String(Number(startNumber)+i).padStart(startNumber.length,'0'),
      from,to:bodyEnd,startLine,firstHeadingId:heading.id,
      legacyExportName:file});
  }
  for(let i=0;i<chapters.length;i++){
    chapters[i].to=i+1<chapters.length?chapters[i+1].from:bodyEnd;
    chapters[i].endLine=chapters[i].to>=source.length?lines.length:indexAt(offsets,chapters[i].to)+1;
  }
  if(chapters.length&&chapters[0].from!==0)throw Error('First chapter must include document preamble');
  if(!chapters.length&&bodyEnd>0)
    warnings.push({kind:'no-chapter-boundaries',length:bodyEnd});
  const ownerOf=position=>{
    if(!Number.isInteger(position)||position<0||position>=bodyEnd)return null;
    let lo=0,hi=chapters.length-1;
    while(lo<=hi){const mid=(lo+hi)>>1,c=chapters[mid];
      if(c.from<=position)lo=mid+1;else hi=mid-1;
    }
    return chapters[hi]||null;
  };
  const annotations=scanAnnotations(source);
  const media=findMedia(source);
  const latex=findReviewMarkers(source,findLatex(source).map(row=>({...row,raw:source.slice(row.from,row.to)})),annotations);
  const occurrences=new Map(),seenIds=new Set(),elements=[];
  const append=(type,entry,sourceId,persistedId=null)=>{
    const {from,to}=entry;
    if(!Number.isInteger(from)||!Number.isInteger(to)||to<=from||to>source.length)
      throw Error(`Invalid ${type} position`);
    const chapter=ownerOf(from);
    if(!chapter){warnings.push({kind:'element-outside-chapters',type,from});return;}
    if(to>chapter.to)warnings.push({kind:'cross-boundary-element',type,from,to,chapterId:chapter.id});
    const key=`${type}:${sourceId}`;
    const count=occurrences.get(key)||0;occurrences.set(key,count+1);
    const id=persistedId?`${type}:${persistedId}`:`${key}:${count}`;
    if(seenIds.has(id))throw Error('Duplicate element identity: '+id);
    seenIds.add(id);
    elements.push({id,type,chapterId:chapter.id,from,to,
      line:entry.line??entry.sourceLine??indexAt(offsets,from)+1,
      identity:persistedId?'persisted':'derived',
      ...(type==='heading'?{title:entry.title,level:entry.level,pdfPage:entry.pdfPage,
        independent:entry.independent}:{}),
      ...(type==='media'?{url:entry.url,local:entry.local}:{}),
      ...(type==='latex'?{kind:entry.kind,syntax:entry.syntax,status:entry.status,
        reviewId:entry.reviewMarker?.id??null}:{}),
    });
  };
  // A surviving OCR block id prevents unrelated text insertions from
  // renumbering provisional (non-persisted) formulas and images.
  const blockSource=position=>{
    const currentLine=indexAt(offsets,position)+1;
    for(let line=currentLine-1;line>=1;line--){
      const value=blockAnchor(lines[line-1]);
      if(value)return `${value.pageIndex}:${value.blockIndex}`;
    }
    return 'unanchored';
  };
  for(const row of headings){
    const from=offsets[row.sourceLine-1];
    const to=offsets[row.sourceEnd-1]??source.length;
    append('heading',{...row,from,to},row.id);
  }
  for(const row of media)append('media',row,blockSource(row.from));
  for(const row of latex)append('latex',row,blockSource(row.from),row.reviewMarker?.id);
  // Sorting is part of the CMD query contract; AG need not rescan or guess
  // which chapter owns an element. Within a chapter source order is stable.
  elements.sort((a,b)=>a.from-b.from||a.to-b.to||a.type.localeCompare(b.type));
  const frozenChapters=freezeList(chapters);
  const frozenElements=freezeList(elements);
  const chapterById=new Map(frozenChapters.map(item=>[item.id,item]));
  const elementById=new Map(frozenElements.map(item=>[item.id,item]));
  const filtered=({chapter='all',type='all'}={})=>{
    if(chapter!=='all'&&!chapterById.has(chapter))throw Error('Unknown chapter ID');
    if(type!=='all'&&!TYPES.has(type))throw Error('Unknown element type');
    return frozenElements.filter(x=>(chapter==='all'||x.chapterId===chapter)&&
      (type==='all'||x.type===type));
  };
  return Object.freeze({
    length:source.length,bodyEnd,evidenceRange:Object.freeze({from:bodyEnd,to:source.length}),
    chapters:frozenChapters,elements:frozenElements,warnings:freezeList(warnings),
    getChapter:id=>chapterById.get(id)||null,getElement:id=>elementById.get(id)||null,
    chapterAt:ownerOf,queryElements:filtered,
    // Read-only substring of the original CM6 source; no chapter files.
    chapterText:id=>{const c=chapterById.get(id);if(!c)throw Error('Unknown chapter ID');
      return source.slice(c.from,c.to);},
  });
}

/** Snapshot-based CMD projection cache. Rebuilds lazily after CM6 changes;
 * stores no separate editable document or external data file. */
export function createIndexProjector(getMarkdown,options={}){
  if(typeof getMarkdown!=='function')throw TypeError('Expected CMD Markdown reader');
  let prior=null,index=null;
  return Object.freeze({
    get(){const source=getMarkdown();assertString(source,'CMD Markdown');
      if(!index||source!==prior){index=buildDocumentIndex(source,options);prior=source;}
      return index;
    },
    clear(){prior=null;index=null;},
  });
}
