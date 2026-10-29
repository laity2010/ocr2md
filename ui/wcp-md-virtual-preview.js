/** WP5 virtual Markdown: existing renderMarkdown owns syntax; select one
 * full-source range and remap token source-line attributes to global CM6.
 */
import {renderMarkdown} from './markdown-preview.js';
export function chapterPreviewRange(source,scope){
  if(typeof source!=='string')throw TypeError('Expected full Markdown');
  if(scope===null)return Object.freeze({source,offsetLines:0});
  if(!scope||typeof scope.id!=='string'||
     !Number.isInteger(scope.from)||!Number.isInteger(scope.to)||
     scope.from<0||scope.to>source.length||scope.from>=scope.to||
     (scope.from>0&&source[scope.from-1]!=='\n')||
     (scope.to<source.length&&source[scope.to-1]!=='\n'))
    throw Error('Invalid CMD whole-document chapter projection');
  return Object.freeze({
    source:source.slice(scope.from,scope.to),
    offsetLines:(source.slice(0,scope.from).match(/\n/g)||[]).length,
  });
}
/** A virtual chapter may cite notes whose definitions live in Notes at the
 * end of the mother CMD. Add only the cited definitions to the READ-ONLY
 * projection. Track original line coordinates for deliberate source jumps.
 * The CM6 document and chapter byte ranges are never altered. */
export function chapterFootnoteProjection(source,piece){
  const localLines=piece.source.split('\n');
  const lines=[...localLines];
  const originalLines=lines.map((_,i)=>i+1+piece.offsetLines);
  const wanted=new Set();
  for(const match of piece.source.matchAll(/\[\^([^\]\s]+)\](?!:)/g))
    wanted.add(match[1]);
  if(!wanted.size)return {source:piece.source,lineMap:originalLines};
  const localDefinitions=new Set();
  for(const match of piece.source.matchAll(/^ {0,3}\[\^([^\]\s]+)\]:/gm))
    localDefinitions.add(match[1]);
  const full=source.split('\n');
  const found=new Map();
  for(let i=0;i<full.length;i++){
    const match=/^ {0,3}\[\^([^\]\s]+)\]:/.exec(full[i]);
    if(!match||!wanted.has(match[1])||localDefinitions.has(match[1])||
      found.has(match[1]))continue;
    const body=[{text:full[i],line:i+1}];
    let next=i+1;
    while(next<full.length){
      const line=full[next];
      if(/^(?: {4}|\t)\S/.test(line)){
        body.push({text:line,line:next+1});next++;continue;
      }
      if(/^\s*$/.test(line)&&next+1<full.length&&
         /^(?: {4}|\t)\S/.test(full[next+1])){
        body.push({text:line,line:next+1});next++;continue;
      }
      break;
    }
    found.set(match[1],body);
  }
  if(!found.size)return {source:piece.source,lineMap:originalLines};
  // Keep the chapter's first N original lines byte-for-byte.
  if(lines.at(-1)!==''){lines.push('');originalLines.push(null);}
  lines.push('');originalLines.push(null);
  for(const body of found.values()){
    for(const item of body){lines.push(item.text);originalLines.push(item.line);}
    lines.push('');originalLines.push(null);
  }
  return {source:lines.join('\n'),lineMap:originalLines};
}
export function renderVirtualMarkdown(source,scope=null){
  const piece=chapterPreviewRange(source,scope);
  if(!scope)return renderMarkdown(piece.source);
  const projection=chapterFootnoteProjection(source,piece);
  const html=renderMarkdown(projection.source);
  return html.replace(/(data-source-(?:start|end)=")(\d+)(")/g,
    (_whole,leading,number,trailing)=>leading+
      String(projection.lineMap[Number(number)-1]??
        Number(number)+piece.offsetLines)+trailing);
}
