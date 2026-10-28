/** One CMD-owned HTML comment per LaTeX formula. The math delimiters
 * own the formula range. Historical closing comments are read only.
 */
import {scanAnnotations} from './cmd-annotations.js';
export const REVIEW_CHOICES=Object.freeze(['待复核','latex','忽略']);
const validId=id=>/^[a-f0-9]{16}$/.test(id||'');
const textEdit=(from,to,expected,insert)=>({action:'text',from,to,expected,insert});
function canonical(item){
  // Obsidian display math uses standalone, column-zero $$ fences.
  // Preserve the inner TeX line structure (notably aligned/array bodies).
  if(item.kind==='独立'&&['$$','```math','```latex','```tex','\\['].includes(item.syntax))
    return '$$\n'+item.content.replace(/\r\n?/g,'\n').replace(/^\n+|\n+$/g,'')+'\n$$';
  if(item.kind==='行内'&&item.syntax==='未定界')return '$'+item.raw+'$';
  return item.raw;
}
function cleanedAttributes(attrs,review){
  const {id,delimited,padBefore,padAfter,fenceOpen,fenceClose}=attrs;
  return {id,review,...(delimited?{delimited}:{}),
    ...(padBefore?{padBefore}:{}),...(padAfter?{padAfter}:{}),
    ...(fenceOpen?{fenceOpen}:{}),...(fenceClose?{fenceClose}:{})};
}
export function findReviewMarkers(source,formulas,annotations=scanAnnotations(source)){
  const starts=annotations.filter(a=>a.tag==='ocr2md:latex'&&
    validId(a.attributes.id)&&['latex','忽略'].includes(a.attributes.review));
  const ends=annotations.filter(a=>a.tag==='/ocr2md:latex'&&validId(a.attributes.id));
  const consumed=new Set();
  for(const item of formulas){
    item.status='待复核';item.reviewMarker=null;
    for(const opening of starts){
      if(consumed.has(opening.from)||opening.to>item.from||
        source.slice(opening.to,item.from).trim()!==''||
        starts.some(s=>s.from>opening.from&&s.from<item.from))continue;
      const closing=ends.find(e=>e.attributes.id===opening.attributes.id&&
        e.from>=item.to&&source.slice(item.to,e.from).trim()==='');
      item.status=opening.attributes.review;
      item.reviewMarker={id:opening.attributes.id,opening,closing,
        openFrom:opening.from,openTo:opening.to,
        closeFrom:closing?.from??item.to,closeTo:closing?.to??item.to,
        isBlock:source.slice(opening.to,item.from).includes('\n')||
          Boolean(closing&&source.slice(item.to,closing.from).includes('\n'))};
      consumed.add(opening.from);break;
    }
  }
  return formulas;
}
function oldClose(source,old){
  if(!old?.closing)return [];
  return [{action:'remove',target:old.closing,
    removeBefore:source[old.closing.from-1]==='\n'}];
}
function extraInfo(item,old){
  const result={...(old?.opening.attributes||{})};
  if(item.kind==='独立'&&/^```(?:math|latex|tex)$/.test(item.syntax)){
    const parts=item.raw.split('\n');
    result.fenceOpen=parts[0];result.fenceClose=parts.at(-1);
  }
  if(item.kind==='独立')result.delimited='auto-display';
  if(item.kind==='行内'&&item.syntax==='未定界')result.delimited='auto-inline';
  return result;
}
function chooseOutput(item,review,attrs){
  if(review==='latex')return canonical(item);
  if(attrs.delimited==='auto-display'&&item.kind==='独立'&&item.syntax==='$$')
    return (attrs.fenceOpen||'```math')+'\n'+item.content+'\n'+(attrs.fenceClose||'```');
  if(attrs.delimited==='auto-inline'&&item.kind==='行内'&&item.syntax==='$')
    return item.content;
  return item.raw;
}
export function planReviewAnnotations(source,item,review,id){
  if(!REVIEW_CHOICES.includes(review))throw Error('Invalid LaTeX review choice');
  if(!item||!Number.isInteger(item.from)||!Number.isInteger(item.to)||
     source.slice(item.from,item.to)!==item.raw)
    throw Error('Source changed; rescan LaTeX before review');
  const old=item.reviewMarker;
  if(!old&&review==='待复核')return [];
  if(!old&&!validId(id))throw Error('Invalid new annotation ID');
  const attrs=extraInfo(item,old);
  attrs.id=old?.id??id;
  const output=chooseOutput(item,review,attrs);
  const result=[];
  if(old){
    if(review==='待复核')result.push({action:'remove',target:old.opening});
    else result.push({action:'update',target:old.opening,tag:'ocr2md:latex',
      attributes:cleanedAttributes({...attrs,
        delimited:review==='latex'?attrs.delimited:'manual'},review)});
    const gap=source.slice(old.openTo,item.from);
    const wanted=item.kind==='独立'?'\n':review==='latex'?'':gap;
    if(gap!==wanted)result.push(textEdit(old.openTo,item.from,gap,wanted));
    result.push(...oldClose(source,old));
  }else{
    result.push({action:'insert',at:item.from,tag:'ocr2md:latex',
      attributes:cleanedAttributes({...attrs,id,
        delimited:review==='latex'?attrs.delimited:'manual'},review),
      suffix:item.kind==='独立'?'\n':''});
  }
  if(output!==item.raw){
    const trailing=review==='latex'&&item.kind==='独立'&&item.to<source.length&&
      source[item.to]!=='\n'?'\n':'';
    result.push(textEdit(item.from,item.to,item.raw,output+trailing));
  }
  return result;
}
export function planNormalizeReviewedInline(source,formulas){
  return formulas.flatMap(item=>{
    if(item.status!=='latex'||!item.reviewMarker)return [];
    const old=item.reviewMarker;
    const wantedGap=item.kind==='独立'?'\n':'';
    const isSingle=!old.closing&&source.slice(old.openTo,item.from)===wantedGap&&
      canonical(item)===item.raw;
    return isSingle?[]:planReviewAnnotations(source,item,'latex');
  });
}
export function planReviewEdit(source,item,review,id){
  return planReviewAnnotations(source,item,review,id)
    .filter(op=>op.action==='text')
    .map(({from,to,expected,insert})=>({from,to,expected,insert}));
}
