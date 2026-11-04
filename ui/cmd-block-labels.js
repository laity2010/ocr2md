import {blockAnchor,subblockAnchor,subblockId} from './mineru-anchors.js';
import {projectCMDLogicalTextBlocks} from './cmd-block-joins.js';
import {readCMDBlockChains} from './cmd-block-chains.js';

/** A MinerU block or subblock tag owns the interval starting at its own line
 * and ending immediately before the NEXT native block/subblock tag. This is a
 * flat, lexical ownership rule: a parent does not also own its children's
 * content. All ranges are 1-based inclusive and are recomputed from the live
 * CM6 document, including user text inserted between any two tags.
 * Original OCR geometry and sealed JSON remain entirely read-only. */
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

export function sourceBlockScopes(source){
  const lines=source.split('\n');
  const firstEvidence=lines.findIndex(line=>line.includes('<!-- minerujson:source:v1:'));
  const limit=firstEvidence<0?lines.length:firstEvidence;
  const tags=[];
  for(let i=0;i<limit;i++){
    const parent=blockAnchor(lines[i]);
    if(parent){tags.push({...parent,kind:'parent',sourceLine:i+1});continue;}
    const child=subblockAnchor(lines[i]);
    if(child)tags.push({...child,kind:'child',sourceLine:i+1});
  }
  return tags.map((tag,i)=>{
    const end=tags[i+1]?.sourceLine-1??limit;
    // End is inclusive. Source tag owns its own line and its following lines,
    // including blanks, until the next original parent or child tag.
    return {...tag,scopeEndLine:end,
      ...sourceBodyRange(lines,tag.sourceLine,end)};
  });
}
export function sourceBlocks(source){
  return sourceBlockScopes(source).filter(tag=>tag.kind==='parent');
}
export function sourceSubblocks(source){
  return sourceBlockScopes(source).filter(tag=>tag.kind==='child');
}

/** Single CMD projection for source and PDF labels. Original MinerU IDs are
 * stable evidence identities; logical parent IDs match CMD's joined/moved
 * block projection. Missing body gives the same dashed status in both panes.
 * A child without a CMD anchor is deliberately NOT fabricated in source.
 */
export function projectCMDSourceBlockLabels(source){
  const scopes=sourceBlockScopes(source);
  // Logical label and immutable OCR location are different namespaces once
  // the user reorders parents on the fixed PDF page.
  const inventory=readCMDBlockChains(source).atoms;
  const visibleByOrigin=new Map(inventory.filter(a=>a.role!=='body')
    .map(a=>[a.origin,a.id]));
  // Current source tag line, not immutable OCR origin, identifies the new
  // PBS label after insert-before/after, parent absorption and promotion.
  // Different tags may share an OCR-root namespace after renumbering, so
  // resolving solely by p/b index or by origin can select the NEXT block.
  const visibleBySourceLine=new Map(inventory.map(a=>[a.sourceLine,a.id]));
  const bodyByOrigin=new Map(inventory.filter(a=>a.role==='body')
    .map(a=>[a.origin,a.id]));
  const parents=scopes.filter(scope=>scope.kind==='parent');
  const offsets=[];let at=0;
  for(const line of source.split('\n')){offsets.push(at);at+=line.length+1;}
  const counts=new Map();
  for(const item of parents){
    const id=`p${item.pageIndex}b${item.blockIndex}`;
    counts.set(id,(counts.get(id)||0)+1);
  }
  const rows=parents.map(item=>({
    id:`p${item.pageIndex}b${item.blockIndex}`,
    pageIndex:item.pageIndex,blockIndex:item.blockIndex,
    from:offsets[item.sourceLine-1],anchorCount:counts.get(`p${item.pageIndex}b${item.blockIndex}`),
  }));
  const projection=projectCMDLogicalTextBlocks(source,rows);
  return scopes.map(scope=>{
    const isParent=scope.kind==='parent';
    const originalId=isParent?`p${scope.pageIndex}b${scope.blockIndex}`:
      subblockId(scope.pageIndex,scope.blockIndex,scope.path);
    const label=visibleBySourceLine.get(scope.sourceLine)||
      (scope.bodyAlias?bodyByOrigin.get('p'+scope.pageIndex+'b'+scope.blockIndex):null)||
      visibleByOrigin.get(originalId)||
      (isParent?projection.assignments.get(originalId)||originalId:originalId);
    return {...scope,id:originalId,label,
      sourceKind:scope.contentLine?'content':'structure',
      elementId:isParent?`mineru:${scope.pageIndex}:${scope.blockIndex}:parent`:
        `mineru:${scope.pageIndex}:${scope.blockIndex}:${scope.path.join('.')}`};
  });
}

/** The PDF badge uses the current visible PBS ID, whereas the PDF rectangle
 * uses its immutable OCR origin. Resolve each badge to the ACTUAL current CMD
 * tag line; this remains correct after renumbering or parent/child promotion.
 * A missing tag is not silently replaced with the old physical tag's body.
 */
export function mapCMDVisibleLabelSources(source){
  const labels=projectCMDSourceBlockLabels(source);
  return new Map(labels.map(({label,...location})=>[label,{...location,label}]));
}
