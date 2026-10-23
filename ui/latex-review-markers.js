/** LaTeX review metadata is written ONLY as comments in CM6's Markdown.
 * This module plans optimistic source edits. It performs no storage I/O.
 */
export const REVIEW_CHOICES=Object.freeze(['待复核','latex','忽略']);
const OPEN=/<!--ocr2md:latex id=([a-f0-9]{16}) review=(latex|忽略)-->/g;
const CLOSE=/<!--\/ocr2md:latex id=([a-f0-9]{16})-->/g;

export function findReviewMarkers(source,formulas){
  const starts=[...source.matchAll(OPEN)];
  const ends=[...source.matchAll(CLOSE)];
  const byId=new Map();
  for(const m of ends){
    if(!byId.has(m[1]))byId.set(m[1],[]);
    byId.get(m[1]).push(m);
  }
  const assigned=new Set();
  for(const item of formulas){
    item.status='待复核';
    item.reviewMarker=null;
    for(const opening of starts){
      const openFrom=opening.index,openTo=openFrom+opening[0].length;
      if(openTo>item.from||assigned.has(openFrom)||
         source.slice(openTo,item.from).trim()!=='')continue;
      const closing=byId.get(opening[1])?.find(m=>{
        if(m.index<item.to || source.slice(item.to,m.index).trim()!=='')return false;
        // No other review-marker pairs may intrude between this pair.
        return !starts.some(s=>s.index>openFrom&&s.index<item.to);
      });
      if(!closing)continue;
      const closeFrom=closing.index,closeTo=closeFrom+closing[0].length;
      const isBlock=source.slice(openTo,item.from).includes('\n') ||
        source.slice(item.to,closeFrom).includes('\n');
      item.status=opening[2];
      item.reviewMarker={id:opening[1],openFrom,openTo,closeFrom,closeTo,isBlock};
      assigned.add(openFrom);
      break;
    }
  }
  return formulas;
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
