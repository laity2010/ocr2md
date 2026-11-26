import {engineAdapter,engineCatalog} from './engines.js';

// Project only prose into the engines, with line-local UTF-16 coordinates.
// Protected material and whitespace remain in the exact source pieces.
const protectedPattern=/<!--[\s\S]*?(?:-->|$)|<table\b[\s\S]*?(?:<\/table\s*>|$)|\$\$[\s\S]*?(?:\$\$|$)|\\\[[\s\S]*?(?:\\\]|$)|!\[[^\]\n]*\]\((?:<[^>\n]*>|[^)\n]*)\)|!\[\[[^\]\n]*\]\]|\x60+[^\n\x60]+\x60+|\$[^$\n]+\$|\\\([^\n]*?\\\)|\[\^[^\]\n]+\](?::[ \t]*)?|<[^>\n]+>|https?:\/\/[^\s<>()]+/giu;
// Mark fenced regions using real LF and the opening fence's kind/length.
// Then mark the existing protected Markdown syntax over the whole document,
// so multiline comments, equations and tables survive the line projection.
function documentMask(text){
 const mask=new Uint8Array(text.length);
 let fence=null;
 for(let from=0;from<text.length;){
  const lf=text.indexOf('\n',from),to=lf<0?text.length:lf+1;
  const line=text.slice(from,lf<0?to:lf);
  const m=line.match(/^[ \t>]*(\x60{3,}|~{3,})(.*)$/);
  if(fence){
   mask.fill(1,from,to);
   if(m&&m[1][0]===fence[0]&&m[1].length>=fence.length&&!m[2].trim())fence=null;
  }else if(m){fence=m[1];mask.fill(1,from,to);}
  else if(/^[ \t>]*\|/.test(line))mask.fill(1,from,to);
  from=to;
 }
 // Avoid treating delimiters inside a fenced region as document-level openers.
 const scan=text.replace(/[^\n]/g,(ch,i)=>mask[i]?' ':ch);
 for(const m of scan.matchAll(protectedPattern))mask.fill(1,m.index,m.index+m[0].length);
 // Pipe tables without a leading pipe: recognise separator row and adjacent rows.
 const rows=[];let from=0;
 for(const line of text.split('\n')){rows.push({line,from,to:from+line.length});from+=line.length+1;}
 for(let i=1;i<rows.length;i++){
  if(!/^[ \t>]*\|?[ \t]*:?-{3,}:?[ \t]*(?:\|[ \t]*:?-{3,}:?[ \t]*)+\|?[ \t]*$/.test(rows[i].line)||!rows[i-1].line.includes('|'))continue;
  for(let j=i-1;j<rows.length&&(j<=i||rows[j].line.includes('|'));j++)mask.fill(1,rows[j].from,rows[j].to);
 }
 return mask;
}
function project(line,protectedMask){
 const text=line.text,mask=protectedMask?protectedMask.slice():documentMask(text);
 for(const m of text.matchAll(/^[ \t]*(?:>[ \t]*)*(?:\[![^\]\n]+\][+-]?[^\n]*|#{1,6}[ \t]+|[-*+][ \t]+|\d+[.)][ \t]+)/gm))mask.fill(1,m.index,m.index+m[0].length);
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

export function splitLine(line,engine,protectedMask){
 const {prose,offsets}=project(line,protectedMask),units=[],pieces=[];
 const ranges=prose?completeRanges(prose,engineAdapter(engine).segment(prose),engine):[];
 let cursor=0;
 const append=(kind,from,to,unit)=>{
  if(to>from)pieces.push({kind,from,to,text:line.text.slice(from,to),...(kind==='sentence'?{unit}:{})});
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
   const cutsPair=pos=>pos>0&&pos<line.text.length&&/[\uD800-\uDBFF]/u.test(line.text[pos-1])&&/[\uDC00-\uDFFF]/u.test(line.text[pos]);
   if(cutsPair(from)||cutsPair(to))throw Error('Surrogate pair boundary');
   append('raw',cursor,from);append('sentence',from,to,units.length);cursor=to;
  }
  units.push({original,sourceRanges});
 }
 append('raw',cursor,line.text.length);
 const result={engine,sourceLine:line.sourceLine,sourceSha256:line.sha256,units,pieces,sourceLength:line.text.length};
 if(rebuildLine(result)!==line.text)throw Error('Source reconstruction mismatch');
 // Every eligible UTF-16 unit must be assigned exactly once, including dots.
 const expected=offsets.filter(x=>x!==null),actual=units.flatMap(u=>u.sourceRanges.flatMap(r=>Array.from({length:r.to-r.from},(_,i)=>r.from+i)));
 if(actual.length!==expected.length||actual.some((x,i)=>x!==expected[i]))throw Error('Prose coverage mismatch');
 return result;
}

export function rebuildLine(result){
 let cursor=0;
 for(const p of result.pieces){
  if(p.from!==cursor||p.to<=p.from||p.to-p.from!==p.text.length)throw Error('Invalid source pieces');
  cursor=p.to;
 }
 if(cursor!==result.sourceLength)throw Error('Incomplete source pieces');
 return result.pieces.map(p=>p.text).join('');
}

export function splitSnapshot(snapshot){
 const mask=documentMask(snapshot.markdown);
 return {documentVersion:snapshot.documentVersion,lines:snapshot.lines.map(line=>({
  sourceLine:line.sourceLine,sourceSha256:line.sha256,
  candidates:engineCatalog.map(({id})=>{
   try{return splitLine(line,id,mask.subarray(line.from,line.textTo));}
   catch(error){return {engine:id,sourceLine:line.sourceLine,error:error.message};}
  })
 }))};
}
