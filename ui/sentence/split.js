import {engineAdapter,engineCatalog} from './engines.js';

// Project only prose into the engines, with block-local UTF-16 coordinates.
// Protected material and whitespace remain in the exact source pieces.
const structural=new Set(['interline_equation','table_body','image_body','chart_body']);
const protectedPattern=/<!--[\s\S]*?-->|(?:^|\n)[ \t>]*(?:\x60{3,}|~{3,})[^\n]*\n[\s\S]*?(?:(?:\n[ \t>]*(?:\x60{3,}|~{3,})[^\n]*)(?=\n|$)|$)|<table\b[\s\S]*?<\/table\s*>|\$\$[\s\S]*?\$\$|\\\[[\s\S]*?\\\]|!\[[^\]\n]*\]\((?:<[^>\n]*>|[^)\n]*)\)|!\[\[[^\]\n]*\]\]|\x60+[^\n\x60]+\x60+|\$[^$\n]+\$|\\\([^\n]*?\\\)|\[\^[^\]\n]+\](?::[ \t]*)?|<[^>\n]+>|https?:\/\/[^\s<>()]+/giu;
function project(block){
 const text=block.text,mask=new Uint8Array(text.length);
 if(structural.has(block.blockType))mask.fill(1);
 else{
  for(const m of text.matchAll(protectedPattern))mask.fill(1,m.index,m.index+m[0].length);
  for(const m of text.matchAll(/^[ \t]*(?:>[ \t]*)*(?:\[![^\]\n]+\][+-]?[^\n]*|#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/gm))mask.fill(1,m.index,m.index+m[0].length);
 }
 let prose='',space=false;const offsets=[];
 for(let i=0;i<text.length;i++){
  if(mask[i]||/\s/u.test(text[i])){space=!!prose;continue;}
  if(space){prose+=' ';offsets.push(null);space=false;}
  prose+=text[i];offsets.push(i);
 }
 return {prose,offsets};
}

// Splitter may emit punctuation-only gaps. Attach those to a neighboring
// sentence without fabricating boundaries or silently losing letters.
function completeRanges(prose,ranges,engine){
 const complete=[];let cursor=0;
 const gapOK=s=>/^[.\s…]*$/u.test(s);
 for(const {start,end} of ranges){
  if(!Number.isInteger(start)||!Number.isInteger(end)||start<cursor||end<=start||end>prose.length||!gapOK(prose.slice(cursor,start)))
   throw Error('Invalid or missing source range: '+engine);
  if(complete.length)complete.at(-1).end=start;
  complete.push({start:complete.length?start:0,end});
  cursor=end;
 }
 if(!gapOK(prose.slice(cursor)))throw Error('Missing trailing source range: '+engine);
 if(complete.length)complete.at(-1).end=prose.length;
 else if(prose)complete.push({start:0,end:prose.length});
 return complete;
}

export function splitBlock(block,engine){
 const {prose,offsets}=project(block),units=[],pieces=[];
 const ranges=prose?completeRanges(prose,engineAdapter(engine).segment(prose),engine):[];
 let cursor=0;
 const append=(kind,from,to,unit)=>{
  if(to>from)pieces.push({kind,from,to,text:block.text.slice(from,to),...(kind==='sentence'?{unit}:{})});
 };
 for(const {start,end} of ranges){
  const original=prose.slice(start,end).trim();
  if(!original)continue;
  const sourceRanges=[];
  for(let i=start;i<end;i++){
   const pos=offsets[i];if(pos===null)continue;
   const last=sourceRanges.at(-1);
   if(last?.to===pos)last.to++;
   else sourceRanges.push({from:pos,to:pos+1});
  }
  for(const {from,to} of sourceRanges){
   if(from<cursor)throw Error('Overlapping source range');
   append('raw',cursor,from);append('sentence',from,to,units.length);cursor=to;
  }
  units.push({original,sourceRanges});
 }
 append('raw',cursor,block.text.length);
 const result={engine,logicalId:block.logicalId,sourceSha256:block.sha256,units,pieces,sourceLength:block.text.length};
 if(rebuildBlock(result)!==block.text)throw Error('Source reconstruction mismatch');
 // Every eligible UTF-16 unit must be assigned exactly once, including dots.
 const expected=offsets.filter(x=>x!==null),actual=units.flatMap(u=>u.sourceRanges.flatMap(r=>Array.from({length:r.to-r.from},(_,i)=>r.from+i)));
 if(actual.length!==expected.length||actual.some((x,i)=>x!==expected[i]))throw Error('Prose coverage mismatch');
 return result;
}

export function rebuildBlock(result){
 let cursor=0;
 for(const p of result.pieces){
  if(p.from!==cursor||p.to<=p.from||p.to-p.from!==p.text.length)throw Error('Invalid source pieces');
  cursor=p.to;
 }
 if(cursor!==result.sourceLength)throw Error('Incomplete source pieces');
 return result.pieces.map(p=>p.text).join('');
}

export function splitSnapshot(snapshot){
 return {documentVersion:snapshot.documentVersion,blocks:snapshot.blocks.map(block=>({
  logicalId:block.logicalId,sourceSha256:block.sha256,
  candidates:engineCatalog.map(({id})=>{
   try{return splitBlock(block,id);}
   catch(error){return {engine:id,logicalId:block.logicalId,error:error.message};}
  })
 }))};
}
