/** LaTeX module owns formula-to-annotation association, not HTML serialization.
 * CMD reads, writes and transactionally changes generic HTML comment records.
 */
import {scanAnnotations} from './cmd-annotations.js';
export const REVIEW_CHOICES=Object.freeze(['待复核','latex','忽略']);
const validId=id=>/^[a-f0-9]{16}$/.test(id||'');

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
    if(review==='待复核')return [
      {action:'remove',target:old.opening,
        removeAfter:old.isBlock&&source[old.openTo]==='\n'},
      {action:'remove',target:old.closing,
        removeBefore:old.isBlock&&source[old.closeFrom-1]==='\n'},
    ];
    return [{action:'update',target:old.opening,tag:'ocr2md:latex',
      attributes:{...old.opening.attributes,review}}];
  }
  if(review==='待复核')return [];
  if(!validId(id))throw Error('Invalid new annotation ID');
  const block=item.syntax.startsWith('```')||item.syntax.startsWith('~~~');
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
