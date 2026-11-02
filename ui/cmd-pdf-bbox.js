/** CMD-owned PDF overlay override footer, not a change to sealed OCR.
 * One canonical HTML comment immediately before minerujson:source:v1.
 * The sealed source always remains the final immutable archive. */
import {parseCMDPBSId,readCMDBlockChains} from './cmd-block-chains.js';
const marker='<!-- cmd:pdf-bbox:v1 ';
const footer=/<!-- cmd:pdf-bbox:v1 ([^\n]*?) -->\n/g;
const evidence='<!-- minerujson:source:v1:';
const sorted=boxes=>Object.fromEntries(Object.entries(boxes).sort(([a],[b])=>a.localeCompare(b)));
function bounds(pageSize,bbox){
  if(!Array.isArray(pageSize)||pageSize.length!==2||
    !Array.isArray(bbox)||bbox.length!==4||!bbox.every(n=>typeof n==='number'&&Number.isFinite(n))||
    bbox.some(n=>Math.abs(n)>1e7)||bbox[0]<0||bbox[1]<0||bbox[2]<=bbox[0]||
    bbox[3]<=bbox[1]||bbox[2]>pageSize[0]||bbox[3]>pageSize[1])
    throw Error('Invalid corrected PDF bbox or page bounds');
  return [...bbox];
}
function known(layout,id){
  const parsed=parseCMDPBSId(id);
  if(!parsed)throw Error('Unknown PDF PBS identity');
  const page=layout?.pages?.[parsed.p];
  const parent=page?.regions?.find(r=>r.blockIndex===parsed.b);
  if(!parent)throw Error('PDF PBS not in original sealed geometry');
  if(parsed.s.length>1||parsed.s.length===1&&
    !parent.nativeChildren?.some(c=>c.index===parsed.s[0]))
    throw Error('PDF child identity not present in sealed native OCR');
  return {page,parent,parsed};
}
/** Validate whole footer. Any malformed/duplicate/orphan footer fails closed. */
export function readCMDPDFBBoxOverrides(source,layout){
  if(typeof source!=='string')throw TypeError('CMD source expected');
  const tail=source.indexOf(evidence);if(tail<0)throw Error('Missing sealed OCR evidence');
  const matches=[...source.matchAll(footer)];
  const mentions=source.slice(0,tail).split(marker).length-1;
  if(matches.length!==mentions||matches.length>1||matches.some(m=>m.index>=tail))
    throw Error('Invalid or duplicate CMD PDF bbox footer');
  if(!matches.length)return {boxes:{},range:null};
  const m=matches[0];
  if(!/^\n*$/.test(source.slice(m.index+m[0].length,tail)))
    throw Error('PDF bbox footer must immediately precede sealed OCR archive');
  let parsed;try{parsed=JSON.parse(m[1]);}catch{throw Error('Invalid PDF bbox footer JSON');}
  if(!parsed||parsed.schema!==1||!parsed.boxes||Array.isArray(parsed.boxes)||
     Object.keys(parsed).join(',')!=='schema,boxes'||
     typeof parsed.boxes!=='object'||Object.getPrototypeOf(parsed.boxes)!==Object.prototype)
    throw Error('Unexpected PDF bbox footer schema');
  const atoms=new Set(readCMDBlockChains(source).atoms.map(a=>a.id));
  const boxes={};
  for(const [id,bbox] of Object.entries(parsed.boxes)){
    if(!atoms.has(id))throw Error('PDF bbox override references an unmarked PBS');
    const {page}=known(layout,id);
    boxes[id]=bounds(page.pageSize,bbox);
  }
  return {boxes,range:{from:m.index,to:m.index+m[0].length,expected:m[0]}};
}
export function planCMDPDFBBoxEdit(source,layout,id,bbox){
  const {boxes,range}=readCMDPDFBBoxOverrides(source,layout);
  if(!readCMDBlockChains(source).atoms.some(a=>a.id===id&&a.format==='cmd-v1'))
    throw Error('PDF bbox requires a canonical CMD PBS marker');
  const {page}=known(layout,id);
  const newBox=bbox===null?null:bounds(page.pageSize,bbox);
  if(newBox===null){if(!Object.hasOwn(boxes,id))return {changed:0,edits:[]};delete boxes[id];}
  else if(JSON.stringify(boxes[id])===JSON.stringify(newBox))return {changed:0,edits:[]};
  else boxes[id]=newBox;
  const tail=source.indexOf(evidence);
  const value=Object.keys(boxes).length?marker+JSON.stringify({schema:1,boxes:sorted(boxes)})+' -->\n':'';
  // Insert before the source header's preceding newline. Inserting at the
  // first byte of a sealed metadata comment is forbidden by CMD's read-only
  // evidence guard even for a zero-length edit at that exact position.
  if(!range&&(tail<1||source[tail-1]!=='\n'))
    throw Error('No safe document footer boundary before sealed OCR');
  const edit=range?{...range,insert:value}:{from:tail-1,to:tail-1,expected:'',insert:value};
  return {changed:1,edits:[edit],id,box:newBox,overrides:Object.keys(boxes).length};
}
/** Effective PDF overlay; never mutates the cached original frozen layout. */
export function applyCMDPDFBBoxOverrides(layout,source){
  const {boxes}=readCMDPDFBBoxOverrides(source,layout);
  if(!Object.keys(boxes).length)return layout;
  const pages=layout.pages.map(page=>{
    const regions=page.regions.map(region=>{
      const id=`p${page.pageIndex}b${region.blockIndex}`;
      const subRegions=region.subRegions.map(sub=>{
        const key=`${id}s${sub.path.join('.')}`;
        return Object.freeze({...sub,bbox:Object.freeze([...(boxes[key]||sub.bbox)]),
          ...(boxes[key]?{corrected:true}: {})});
      });
      // Valid manual correction may restore a native child whose original
      // MinerU bbox failed geometry/conflict checks. Never invent the path:
      // only children explicitly recorded in the sealed OCR block are valid.
      for(const child of region.nativeChildren||[]){
        const key=`${id}s${child.index}`;
        if(boxes[key]&&!subRegions.some(s=>s.path[0]===child.index))
          subRegions.push(Object.freeze({path:Object.freeze([child.index]),
            type:child.type,role:child.type.endsWith('_caption')?'caption':
              child.type.endsWith('_footnote')?'note':'body',
            bbox:Object.freeze([...boxes[key]]),corrected:true,recovered:true}));
      }
      subRegions.sort((a,b)=>a.path[0]-b.path[0]);
      return Object.freeze({...region,subRegions:Object.freeze(subRegions),
        bbox:Object.freeze([...(boxes[id]||region.bbox)]),
        ...(boxes[id]?{corrected:true}: {})});
    });
    return Object.freeze({...page,regions:Object.freeze(regions)});
  });
  return Object.freeze({...layout,pages:Object.freeze(pages),overrides:Object.freeze(sorted(boxes))});
}
