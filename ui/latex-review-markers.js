/** LaTeX module owns formula-to-annotation association, not HTML serialization.
 * CMD reads, writes and transactionally changes generic HTML comment records.
 */
import {scanAnnotations} from './cmd-annotations.js';
export const REVIEW_CHOICES=Object.freeze(['待复核','latex','忽略']);
const validId=id=>/^[a-f0-9]{16}$/.test(id||'');
const textEdit=(from,to,expected,insert)=>({action:'text',from,to,expected,insert});
const isUndelimitedInline=item=>item.kind==='行内'&&item.syntax==='未定界';
function fencedDisplay(item){
  if(item.kind!=='独立'||typeof item.raw!=='string')return null;
  const first=item.raw.indexOf('\n'),last=item.raw.lastIndexOf('\n');
  if(first<0||last===first)return null;
  const opening=item.raw.slice(0,first),closing=item.raw.slice(last+1);
  const match=/^ {0,3}(`{3,}|~{3,})(math|latex|tex)[ \t]*$/i.exec(opening);
  if(!match||!new RegExp(`^ {0,3}${match[1][0]}{${match[1].length},}[ \\t]*$`).test(closing))return null;
  return {
    open:textEdit(item.from,item.from+first,opening,'$$'),
    close:textEdit(item.from+last+1,item.to,closing,'$$'),
    opening,closing,
  };
}
function normalizeFencedDisplay(item,old=null,id=null){
  const fence=fencedDisplay(item);
  if(!fence)return [];
  const attrs={...(old?.opening.attributes||{id,review:'latex'}),
    review:'latex',delimited:'auto-display',fenceOpen:fence.opening,fenceClose:fence.closing};
  return [
    ...(old?[{action:'update',target:old.opening,tag:'ocr2md:latex',attributes:attrs}]:
      [{action:'insert',at:item.from,tag:'ocr2md:latex',attributes:attrs,suffix:'\n'}]),
    fence.open,fence.close,
    ...(!old?[{action:'insert',at:item.to,tag:'/ocr2md:latex',
      attributes:{id},prefix:'\n'}]:[]),
  ];
}

/** Keep HTML comments OUTSIDE native Obsidian $...$ math, without changing
 * the OCR formula bytes. Surrounding prose gets spaces only when missing.
 * The padding/delimited attributes make this change reversible on re-review.
 */
function wrapInline(source,item,opening=null,closing=null,id=null,review='latex'){
  const left=/[\p{L}\p{N}]/u.test(source[(opening?.from??item.from)-1]||'');
  const right=/[\p{L}\p{N}]/u.test(source[closing?.to??item.to]||'');
  const attrs={...(opening?.attributes||{id,review}),review,delimited:'auto-inline',
    ...(left?{padBefore:'1'}:{}),...(right?{padAfter:'1'}:{})};
  return {attrs,lead:[
    ...(left?[textEdit(opening?.from??item.from,opening?.from??item.from,'',' ')]:[]),
    ...(opening?[{action:'update',target:opening,tag:'ocr2md:latex',attributes:attrs}]
      :[{action:'insert',at:item.from,tag:'ocr2md:latex',attributes:attrs}]),
    textEdit(item.from,item.from,'','$'),
  ],tail:[
    textEdit(item.to,item.to,'','$'),
  ],right};
}

/** Explicit one-shot upgrade for old confirmed inline and standalone comments. Never edits
 * a file implicitly while loading; the owner must dispatch and Save via CMD.
 */
export function planNormalizeReviewedInline(source,formulas){
  const operations=[];
  for(const item of formulas){
    const old=item.reviewMarker;
    if(item.status!=='latex'||!old)continue;
    if(fencedDisplay(item)){
      operations.push(...normalizeFencedDisplay(item,old));
      continue;
    }
    if(!isUndelimitedInline(item))continue;
    const wrap=wrapInline(source,item,old.opening,old.closing,null,'latex');
    operations.push(...wrap.lead,...wrap.tail,
      {action:'update',target:old.closing,tag:'/ocr2md:latex',attributes:{id:old.id}},
      ...(wrap.right?[textEdit(old.closeTo,old.closeTo,'',' ')]:[]));
  }
  return operations;
}

export function findReviewMarkers(source,formulas,annotations=scanAnnotations(source)){
  const starts=annotations.filter(item=>item.tag==='ocr2md:latex'&&
    validId(item.attributes.id)&&['latex','忽略'].includes(item.attributes.review));
  const ends=annotations.filter(item=>item.tag==='/ocr2md:latex'&&validId(item.attributes.id));
  const byId=new Map();
  for(const item of ends){
    if(!byId.has(item.attributes.id))byId.set(item.attributes.id,[]);
    byId.get(item.attributes.id).push(item);
  }
  const assigned=new Set();
  for(const item of formulas){
    item.status='待复核';
    item.reviewMarker=null;
    for(const opening of starts){
      const openFrom=opening.from,openTo=opening.to;
      if(openTo>item.from||assigned.has(openFrom)||
         source.slice(openTo,item.from).trim()!=='')continue;
      const closing=byId.get(opening.attributes.id)?.find(m=>{
        if(m.from<item.to||source.slice(item.to,m.from).trim()!=='')return false;
        return !starts.some(s=>s.from>openFrom&&s.from<item.to);
      });
      if(!closing)continue;
      const closeFrom=closing.from,closeTo=closing.to;
      const isBlock=source.slice(openTo,item.from).includes('\n') ||
        source.slice(item.to,closeFrom).includes('\n');
      item.status=opening.attributes.review;
      item.reviewMarker={id:opening.attributes.id,openFrom,openTo,closeFrom,closeTo,
        isBlock,opening,closing};
      assigned.add(openFrom);
      break;
    }
  }
  return formulas;
}

/** Business-only plan: CMD serializes the comments, validates the live source
 * and applies the two edits in one undo transaction. No hand-built HTML.
 */
export function planReviewAnnotations(source,item,review,id){
  if(!REVIEW_CHOICES.includes(review))throw Error('Invalid LaTeX review choice');
  if(!item||!Number.isInteger(item.from)||!Number.isInteger(item.to)||
     source.slice(item.from,item.to)!==item.raw)
    throw Error('Source changed; rescan LaTeX before review');
  const old=item.reviewMarker;
  if(old){
    const auto=old.opening.attributes.delimited==='auto-inline';
    const display=old.opening.attributes.delimited==='auto-display'&&item.syntax==='$$';
    const removeMath=display&&review!=='latex'?[
      textEdit(item.from,item.from+2,'$$',old.opening.attributes.fenceOpen||'```math'),
      textEdit(item.to-2,item.to,'$$',old.opening.attributes.fenceClose||'```'),
    ]:auto&&review!=='latex' ? [
      textEdit(item.from,item.from+1,'$',''),
      textEdit(item.to-1,item.to,'$',''),
      ...(old.opening.attributes.padBefore==='1'?[textEdit(old.openFrom-1,old.openFrom,' ','')]:[]),
      ...(old.opening.attributes.padAfter==='1'?[textEdit(old.closeTo,old.closeTo+1,' ','')]:[]),
    ]:[];
    if(review==='待复核')return [
      {action:'remove',target:old.opening,
        removeAfter:old.isBlock&&source[old.openTo]==='\n'},
      {action:'remove',target:old.closing,
        removeBefore:old.isBlock&&source[old.closeFrom-1]==='\n'},
      ...removeMath,
    ];
    if(review==='latex'&&isUndelimitedInline(item)){
      const wrap=wrapInline(source,item,old.opening,old.closing,null,review);
      return [...wrap.lead,...wrap.tail,
        ...(wrap.right?[textEdit(old.closeTo,old.closeTo,'',' ')]:[])];
    }
    if(review==='latex'&&fencedDisplay(item))
      return normalizeFencedDisplay(item,old);
    return [{action:'update',target:old.opening,tag:'ocr2md:latex',
      attributes:{...old.opening.attributes,review,
        ...((auto||display)&&review!=='latex'?{delimited:'manual',padBefore:'0',padAfter:'0'}:{})}},
      ...removeMath];
  }
  if(review==='待复核')return [];
  if(!validId(id))throw Error('Invalid new annotation ID');
  const block=item.syntax.startsWith('```')||item.syntax.startsWith('~~~');
  if(review==='latex'&&fencedDisplay(item))
    return normalizeFencedDisplay(item,null,id);
  if(review==='latex'&&isUndelimitedInline(item)){
    const wrap=wrapInline(source,item,null,null,id,review);
    return [...wrap.lead,...wrap.tail,
      {action:'insert',at:item.to,tag:'/ocr2md:latex',attributes:{id}},
      ...(wrap.right?[textEdit(item.to,item.to,'',' ')]:[])];
  }
  return [
    {action:'insert',at:item.from,tag:'ocr2md:latex',
      attributes:{id,review},suffix:block?'\n':''},
    {action:'insert',at:item.to,tag:'/ocr2md:latex',
      attributes:{id},prefix:block?'\n':''},
  ];
}

export function planReviewEdit(source,item,review,id){
  if(!REVIEW_CHOICES.includes(review))throw Error('Invalid LaTeX review choice');
  if(!item||!Number.isInteger(item.from)||!Number.isInteger(item.to)||
      source.slice(item.from,item.to)!==item.raw)
    throw Error('Source changed; rescan LaTeX before review');
  const edits=[];
  const add=(from,to,insert)=>edits.push({from,to,expected:source.slice(from,to),insert});
  const old=item.reviewMarker;
  if(old){
    const {openFrom,openTo,closeFrom,closeTo,isBlock}=old;
    if(review==='待复核'){
      const removeOpenEnd=isBlock&&source[openTo]==='\n'?openTo+1:openTo;
      const removeCloseStart=isBlock&&source[closeFrom-1]==='\n'?closeFrom-1:closeFrom;
      add(openFrom,removeOpenEnd,'');
      add(removeCloseStart,closeTo,'');
    }else{
      const open=`<!--ocr2md:latex id=${old.id} review=${review}-->`;
      add(openFrom,openTo,open);
    }
  }else if(review!=='待复核'){
    if(!/^[a-f0-9]{16}$/.test(id||''))throw Error('Invalid new annotation ID');
    const open=`<!--ocr2md:latex id=${id} review=${review}-->`;
    const close=`<!--/ocr2md:latex id=${id}-->`;
    // A fenced formula needs comment lines OUTSIDE the fence. Inline formula
    // markers stay on the SAME line, adding no Markdown hard-return.
    const block=item.syntax.startsWith('```')||item.syntax.startsWith('~~~');
    add(item.from,item.from,open+(block?'\n':''));
    add(item.to,item.to,(block?'\n':'')+close);
  }
  return edits;
}
