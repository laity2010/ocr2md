/** CMD-owned reversible Markdown->sentence projection. No duplicate document.
 * The original source is retained byte-for-byte in sourcePieces; NLP sees only
 * safe prose runs, with source offsets for every character. */
import {blockAnchor} from './mineru-anchors.js';
import {formatAnnotation} from './cmd-annotations.js';
export const SENTENCE_TAG='ocr2md:sentence';
const tagPattern=/<!--(?:\s*ocr2md:[^\n]*?|\s*minerujson:[^\n]*?)-->/g;
const inlineMath=/\$[^$\n]+\$|\\\([^\n]+?\\\)/g;
// Existing Obsidian note references are metadata, not sentence text. Their
// unchanged-length blanks preserve every CMD source offset for safe marking.
const noteReference=/\[\^[^\]\n]+\](?!:)/g;
const leadingCmd=/^\s*(?:<!--\s*ocr2md:[^\n]*?-->\s*)+/u;
const leadingLatex=/^\s*<!--\s*ocr2md:latex\b[^\n]*?-->/u;
const structural=/^\s*(?:#{1,6}\s|[-*+]\s|\d+[.)]\s|>|\||!\[|\[\^|`{3,}|~{3,}|<!--|<\/?[a-z]|\$\$|\\\[)/i;
const endsSentence=/[.!?。！？]["'”’)]?\s*$/;
const hash=text=>{let v=2166136261;for(let i=0;i<text.length;i++)v=Math.imul(v^text.charCodeAt(i),16777619);return (v>>>0).toString(36);};
function safeLine(line){return Boolean(line.trim())&&!structural.test(line)&&!/\s{2}$/.test(line)&&!/^\s{4,}/.test(line);}
function lineProjection(line,from){
  const clean=line.split('');
  for(const regex of [tagPattern,inlineMath,noteReference]){
    regex.lastIndex=0;
    for(const m of line.matchAll(regex))for(let k=m.index;k<m.index+m[0].length;k++)clean[k]=' ';
  }
  // A displayable prose continuation can begin after a labeled inline
  // equation: `<!--ocr2md:latex...--> $...$, then we found ...`.
  // Keep the comma in raw source, but don't mistake it for the sentence's
  // first character when making lossless, source-offset-aware CMD anchors.
  if(leadingLatex.test(line)){
    const first=clean.findIndex(char=>char!==' '&&char!=='\t');
    if(first>=0&&clean[first]===','&&/^[ \t]*[\p{L}]/u.test(clean.slice(first+1).join('')))
      clean[first]=' ';
  }
  return {text:clean.join(''),raw:line,from,to:from+line.length};
}
export function extractTextBlocks(source,{bodyEnd=source.length}={}){
  if(typeof source!=='string'||!Number.isInteger(bodyEnd)||bodyEnd<0||bodyEnd>source.length)
    throw Error('CMD invalid source projection');
  const lines=[];let from=0;
  const anchoredDocument=source.includes('<!-- minerujson:block:v1:')||source.includes('<!-- cmd:block:v1 id=')||source.includes('<!-- cmd:block:v1 p=');
  for(const line of source.split('\n')){lines.push({text:line,from,to:from+line.length});from+=line.length+1;}
  const runs=[];let run=null,lastProse=null,lastAnchor=null,fence=null,mathBlock=false,comment=false;
  for(let i=0;i<lines.length;i++){
    const row=lines[i];if(row.from>=bodyEnd)break;
    const raw=row.text;
    if(comment){if(raw.includes('-->'))comment=false;continue;}
    if(/^\s*<!--/.test(raw)&&!raw.includes('-->')){comment=true;run=null;lastProse=null;continue;}
    if(/^\s*<!--/.test(raw)&&!blockAnchor(raw)){
      // Ignore genuine annotation-only lines, but not the human-readable
      // sentence following an inline CMD annotation at column zero.
      const prefix=leadingCmd.exec(raw)?.[0];
      if(!prefix||!raw.slice(prefix.length).trim())continue;
    }
    if(anchoredDocument&&!lastAnchor&&!blockAnchor(raw))continue;
    if(/^\s*(`{3,}|~{3,})/.test(raw)){
      const m=/^\s*(`{3,}|~{3,})/.exec(raw)[1];
      if(!fence)fence=m[0];else if(fence===m[0])fence=null;
      run=null;lastProse=null;continue;
    }
    if(fence)continue;
    if(/^\s*(?:\$\$|\\\[|\\\])\s*$/.test(raw)){
      mathBlock=!mathBlock;run=null;lastProse=null;continue;
    }
    if(mathBlock)continue;
    const anchor=blockAnchor(raw);
    if(anchor){lastAnchor=anchor;continue;}
    const seg=lineProjection(raw,row.from);
    // Structural checks see visible prose, not the spaces that replaced
    // metadata/math. Keep the source's actual indentation rule intact.
    if(/^[ \t]{4,}/.test(raw)||!safeLine(seg.text.trimStart())){
      if(seg.text.trim()){run=null;lastProse=null;}
      continue;
    }
    if(!seg.text.trim()){continue;}
    // Join only intra-paragraph soft wraps or consecutive OCR blocks on the
    // same page whose preceding fragment lacks sentence-final punctuation.
    const blank=lastProse&&lines.slice(lastProse.line+1,i).filter(x=>x.text.trim()==='');
    const contiguous=lastProse&&i===lastProse.line+1;
    // Existing reviewed CMD marks may already cover the prose before a
    // separately annotated equation. Do not retroactively fuse that marked
    // sentence with its formula tail (which would orphan old part IDs).
    const startsAfterLabeledEquation=leadingLatex.test(raw);
    const adjacent=!startsAfterLabeledEquation&&lastProse&&lastAnchor&&lastProse.anchor&&
      lastAnchor.pageIndex===lastProse.anchor.pageIndex&&
      lastAnchor.blockIndex===lastProse.anchor.blockIndex+1&&
      (!blank||blank.length<=2)&&!endsSentence.test(lastProse.text.trim());
    const join=Boolean(run&&lastProse&&(contiguous||adjacent));
    if(!join){run={clean:'',segments:[]};runs.push(run);}
    if(run.clean)run.clean+=' ';
    const start=run.clean.length;run.clean+=seg.text;
    run.segments.push({start,end:run.clean.length,sourceFrom:seg.from,sourceTo:seg.to,
      blockId:lastAnchor?`p${lastAnchor.pageIndex}b${lastAnchor.blockIndex}`:`line${i+1}`,raw:seg.raw});
    lastProse={line:i,text:seg.text,anchor:lastAnchor};
  }
  // Disjoint partition of the EXACT original Markdown, including every blank,
  // CMD tag, line break and untouched MinerU evidence byte.
  const segments=runs.flatMap(r=>r.segments).sort((a,b)=>a.sourceFrom-b.sourceFrom);
  const sourcePieces=[];let cursor=0;
  for(const seg of segments){if(cursor<seg.sourceFrom)sourcePieces.push({kind:'gap',from:cursor,to:seg.sourceFrom,text:source.slice(cursor,seg.sourceFrom)});
    sourcePieces.push({kind:'text',from:seg.sourceFrom,to:seg.sourceTo,text:source.slice(seg.sourceFrom,seg.sourceTo),blockId:seg.blockId});cursor=seg.sourceTo;}
  if(cursor<source.length)sourcePieces.push({kind:'gap',from:cursor,to:source.length,text:source.slice(cursor)});
  return {runs,sourcePieces,sourceLength:source.length};
}
export function reconstructSource(projection){return projection.sourcePieces.map(part=>part.text).join('');}
/** Engines are pluggable. Native ICU sentence segmentation is the zero-dependency baseline. */
export function segmentSentences(projection,{locale='en',engine}={}){
  const split=engine??(text=>[...new Intl.Segmenter(locale,{granularity:'sentence'}).segment(text)]
    .map(v=>({start:v.index,end:v.index+v.segment.length})));
  const result=[];
  for(const run of projection.runs){
    for(const item of split(run.clean)){
      const start=item.start??item.index,end=item.end??start+(item.segment?.length??0);
      if(!Number.isInteger(start)||!Number.isInteger(end)||start<0||end>run.clean.length||end<=start)continue;
      const fragments=[];
      for(const segment of run.segments){
        const a=Math.max(start,segment.start),b=Math.min(end,segment.end);
        if(a>=b)continue;
        const span=run.clean.slice(a,b),leading=span.match(/^\s*/)[0].length,trailing=span.match(/\s*$/)[0].length;
        const from=segment.sourceFrom+a-segment.start+leading;
        const to=segment.sourceFrom+b-segment.start-trailing;
        if(to<=from)continue;
        fragments.push({blockId:segment.blockId,from,to,text:segment.raw.slice(from-segment.sourceFrom,to-segment.sourceFrom)});
      }
      if(!fragments.length)continue;
      const joined=run.clean.slice(start,end).trim().replace(/\s+/g,' ');
      if(joined.length<3)continue;
      const lead=fragments[0],local=lead.from-run.segments.find(s=>s.blockId===lead.blockId&&s.sourceFrom<=lead.from&&s.sourceTo>=lead.from).sourceFrom;
      const id='s-'+hash(`${lead.blockId}:${local}:${joined}`);
      result.push({id,text:joined,fragments,from:fragments[0].from,to:fragments.at(-1).to,
        blocks:[...new Set(fragments.map(x=>x.blockId))],crossBlock:fragments.some(x=>x.blockId!==fragments[0].blockId),
        status:'待审阅'});
    }
  }
  return result;
}
export function planSentenceMarks(source,sentences,annotations){
  const existing=new Set(annotations.filter(a=>a.tag===SENTENCE_TAG).map(a=>a.from));
  const ops=[];let total=0;
  for(const sentence of sentences){
    if(!/^s-[a-z0-9]+$/.test(sentence.id)||!Array.isArray(sentence.fragments))throw Error('CMD sentence id invalid');
    // Do not produce half-marked logical sentences if a delimiter lands
    // inside syntax, a URL, a code span, or an existing annotation.
    const eligible=sentence.fragments.every(part=>source.slice(part.from,part.to)===part.text&&part.text.length>=2&&
      /^[\p{L}\p{N}]/u.test(part.text)&&
      (part.from===0||!/[\p{L}\p{N}]/u.test(source[part.from-1])));
    if(!eligible)continue;
    for(let n=0;n<sentence.fragments.length;n++){
      const part=sentence.fragments[n];
      if(source.slice(part.from,part.to)!==part.text||!Number.isInteger(part.from)||part.to<=part.from)
        throw Error('CMD sentence source changed, rescan first');
      if(!/^[\w-]+$/.test(part.blockId)||!/[\p{L}\p{N}]/u.test(part.text[0])||
         (part.from>0&&/[\p{L}\p{N}]/u.test(source[part.from-1])))continue;
      // HTML comments at column zero become block-level HTML, swallowing
      // paragraph layout. Put each CMD marker after the first full word.
      // This is less intrusive than splitting a word at its first letter.
      const lead=/^[\p{L}\p{N}]+(?:[-’'][\p{L}\p{N}]+)*/u.exec(part.text)?.[0].length||0;
      if(!lead||lead>part.text.length||/^https?:\/\//i.test(part.text))continue;
      const markerAt=part.from+lead;
      if(existing.has(markerAt))continue;
      ops.push({action:'insert',at:markerAt,tag:SENTENCE_TAG,attributes:{v:'1',id:sentence.id,
        part:n+1,total:sentence.fragments.length,block:part.blockId,len:part.to-part.from,lead,
        head:part.text.slice(0,18)}});total++;
    }
  }
  return ops;
}
export function readSentenceMarks(source,annotations){
  const rows=new Map();let stale=0;
  for(const annotation of annotations){
    if(annotation.tag!==SENTENCE_TAG)continue;
    const {id,part,total,block,len,head,lead}=annotation.attributes;
    const length=Number(len),partNo=Number(part),parts=Number(total);
    const prefixLength=Number(lead);
    const from=annotation.from-prefixLength,to=annotation.to+length-prefixLength;
    const rendered=source.slice(from,annotation.from)+source.slice(annotation.to,to);
    if(!/^s-[a-z0-9]+$/.test(id)||!Number.isInteger(length)||length<=0||length>25000||
       !Number.isInteger(prefixLength)||prefixLength<1||prefixLength>length||from<0||
       partNo<1||partNo>parts||parts>100||rendered.slice(0,String(head).length)!==head||to>source.length){stale++;continue;}
    const fragment={from,to,blockId:block,text:rendered,part:partNo,total:parts};
    const row=rows.get(id)||{id,fragments:[],blocks:[],from,to, status:'待审阅'};
    row.fragments.push(fragment);row.blocks.push(block);row.from=Math.min(row.from,from);row.to=Math.max(row.to,to);rows.set(id,row);
  }
  const result=[];
  for(const row of rows.values()){
    row.fragments.sort((a,b)=>a.part-b.part);
    if(row.fragments.length!==row.fragments[0].total||
      row.fragments.some((f,i)=>f.part!==i+1)){stale+=row.fragments.length;continue;}
    row.text=row.fragments.map(x=>x.text).join(' ').replace(/\s+/g,' ');
    row.blocks=[...new Set(row.blocks)];row.crossBlock=row.blocks.length>1;
    row.line=source.slice(0,row.from).split('\n').length;
    result.push(row);
  }
  result.sort((a,b)=>a.from-b.from);
  return {rows:result,stale,recordCount:result.length+stale};
}
