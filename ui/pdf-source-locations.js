import {blockAnchor,subblockAnchor} from './mineru-anchors.js';
// A CMD tag is a provenance anchor, not automatically a text location.
// Map to actual content when it exists; MinerU metadata-only placeholders
// and comment tags must NEVER masquerade as an OCR text/body/notes match.
function sourceBodyRange(lines,start,end){
  let first=null,last=null;
  for(let i=start;i<end;i++){
    const line=lines[i].trim();
    if(!line||/^<!--/.test(line)||
      /^\\?\[MinerU [^\n]*source metadata only\]$/i.test(line))continue;
    if(first===null)first=i+1;
    last=i+1;
  }
  return {contentLine:first,contentEndLine:last};
}
export function sourceBlocks(text){
  const lines=text.split('\n'),anchors=[];
  const evidenceLine=lines.findIndex(line=>line.includes('<!-- minerujson:source:v1:'));
  for(const [index,line] of lines.entries()){
    const anchor=blockAnchor(line);
    if(anchor)anchors.push({...anchor,sourceLine:index+1});
  }
  return anchors.map((a,i)=>{
    const end=Math.min(anchors[i+1]?.sourceLine-1??lines.length,
      evidenceLine<0?lines.length:evidenceLine);
    return {...a,...sourceBodyRange(lines,a.sourceLine,end)};
  });
}
/** Read-only map of REAL CMD text and structure-only MinerU child tags. */
export function sourceSubblocks(source){
  const lines=source.split('\n'),found=[];
  const evidenceLine=lines.findIndex(line=>line.includes('<!-- minerujson:source:v1:'));
  for(const [i,line] of lines.entries()){
    const anchor=subblockAnchor(line);
    if(anchor)found.push({...anchor,sourceLine:i+1});
  }
  return found.map((a,i)=>{
    const nextChild=found[i+1]?.sourceLine-1??lines.length;
    let nextParent=lines.length;
    for(let j=a.sourceLine;j<nextChild;j++){
      if(blockAnchor(lines[j])){nextParent=j;break;}
    }
    const end=Math.min(nextChild,nextParent,evidenceLine<0?lines.length:evidenceLine);
    return {...a,...sourceBodyRange(lines,a.sourceLine,end)};
  });
}
