/** Read-only sentence emphasis in the Markdown reader. The browser Highlight
 * API paints DOM Ranges without changing Markdown, CM6 state, or preview DOM.
 * Scope each fragment to its CMD source-line block, not a global text search:
 * identical sentences elsewhere in the document must not light up. */
import './sentence-preview-highlight.css';

const sentenceName='ocr-selected-sentence';
const punctuationName='ocr-selected-sentence-stop';
const coverageName='ocr-covered-sentences';
const coverageStopName='ocr-covered-sentence-stops';
const endStop=/[.!?。！？](?=["'”’）)\]]*$)/u;

export function clearSentencePreviewHighlight(){
  if(globalThis.CSS?.highlights){
    CSS.highlights.delete(sentenceName);
    CSS.highlights.delete(punctuationName);
  }
  document.querySelectorAll('.ocr-sentence-overlay').forEach(node=>node.remove());
}

export function clearSentenceCoverageHighlight(){
  if(globalThis.CSS?.highlights){
    CSS.highlights.delete(coverageName);
    CSS.highlights.delete(coverageStopName);
  }
  document.querySelectorAll('.ocr-sentence-cover-overlay').forEach(node=>node.remove());
}

function textIndex(container){
  const walker=document.createTreeWalker(container,NodeFilter.SHOW_TEXT);
  const nodes=[];let text='',node;
  while((node=walker.nextNode())){
    if(node.parentElement?.closest('script,style,[aria-hidden="true"],.ocr-source-block pre'))continue;
    const from=text.length;
    text+=node.textContent;
    nodes.push({node,from,to:text.length});
  }
  const at=(position,after=false)=>{
    for(const entry of nodes){
      if(entry.from<=position&&(position<entry.to||(after&&position===entry.to)))
        return {node:entry.node,offset:position-entry.from};
    }
    return null;
  };
  return {text,at};
}
function markRange(index,from,to){
  if(from<0||to<=from)return null;
  const a=index.at(from),b=index.at(to,true);
  if(!a||!b)return null;
  const range=document.createRange();
  range.setStart(a.node,a.offset);range.setEnd(b.node,b.offset);
  return range;
}
function findFragment(index,fragment,occurrence){
  const text=fragment.text;
  if(!text)return null;
  let at=-1,begin=0;
  // Count identical phrases before the original source position in the SAME
  // Markdown block, when the user selected the later repeated sentence.
  for(let i=0;i<=occurrence;i++){
    at=index.text.indexOf(text,begin);
    if(at<0)break;
    begin=at+text.length;
  }
  if(at>=0)return {from:at,to:at+text.length};
  // Inline math, code or emphasis can change the rendered text. Find visible
  // prose on both sides and include the intervening formatted DOM in one Range.
  const pieces=text.split(/\$[^$\n]+\$|\\\([^\n]+\\\)|`[^`]+`|<[^>]+>/g)
    .map(s=>s.replace(/\*\*|__|(?<!\w)[*_]|[*_](?!\w)/g,''))
    .map(s=>s.trim()).filter(s=>s.length>=4);
  if(!pieces.length)return null;
  let first=-1,end=-1;
  for(const piece of pieces){
    const pos=index.text.indexOf(piece,end<0?0:end);
    if(pos<0)return null;
    if(first<0)first=pos;
    end=pos+piece.length;
  }
  return first>=0&&end>first?{from:first,to:end}:null;
}
function occurrencesBefore(source,fragment){
  const start=source.lastIndexOf('\n',fragment.from-1)+1;
  const prefix=source.slice(start,fragment.from).replace(/<!--ocr2md:[^\n]*?-->/g,'');
  const needle=fragment.text;
  let pos=0,count=0;
  while((pos=prefix.indexOf(needle,pos))>=0){count++;pos+=needle.length;}
  return count;
}
// Playwright WebKit (and some Safari renderers) expose CSS.highlights but
// paint no custom ::highlight pixels. Use a positioned, pointer-transparent
// overlay there: only Range rectangles, never wrapping or rewriting text.
function paintWebKitOverlay(body,ranges,stop){
  const rootRect=body.getBoundingClientRect();
  const overlay=document.createElement('div');
  overlay.className='ocr-sentence-overlay';
  overlay.setAttribute('aria-hidden','true');
  ranges.forEach((range,i)=>{
    for(const rect of range.getClientRects()){
      if(rect.width<0.7||rect.height<0.7)continue;
      const underline=document.createElement('span');
      underline.className='ocr-sentence-overlay-underline';
      underline.dataset.fragment=String(i);
      underline.dataset.text=range.toString();
      underline.style.left=(rect.left-rootRect.left)+'px';
      underline.style.top=(rect.bottom-rootRect.top-2)+'px';
      underline.style.width=rect.width+'px';
      overlay.append(underline);
    }
  });
  if(stop){
    for(const rect of stop.getClientRects()){
      if(rect.width<0.7||rect.height<0.7)continue;
      const mark=document.createElement('span');
      mark.className='ocr-sentence-overlay-stop';
      mark.dataset.text=stop.toString();
      mark.style.left=(rect.left-rootRect.left-1)+'px';
      mark.style.top=(rect.top-rootRect.top)+'px';
      mark.style.width=(rect.width+2)+'px';
      mark.style.height=rect.height+'px';
      overlay.append(mark);
    }
  }
  if(overlay.childElementCount)body.append(overlay);
}
function resolveSentenceRanges(body,sentences,source,lineAtOffset){
  const ranges=[],stops=[];let unmappedCount=0;
  const indexes=new WeakMap();
  const mapped=[...body.querySelectorAll('[data-source-start][data-source-end]')];
  for(const sentence of sentences){
  const startLength=ranges.length;
  for(const fragment of sentence.fragments){
    const line=lineAtOffset(fragment.from);
    const eligible=mapped.filter(element=>Number(element.dataset.sourceStart)<=line&&
      line<Number(element.dataset.sourceEnd)&&!element.closest('details.ocr-callout:not([open])'))
      .sort((a,b)=>{
        const aSpan=Number(a.dataset.sourceEnd)-Number(a.dataset.sourceStart);
        const bSpan=Number(b.dataset.sourceEnd)-Number(b.dataset.sourceStart);
        return aSpan-bSpan;
      });
    for(const element of eligible){
      let index=indexes.get(element);
      if(!index){index=textIndex(element);indexes.set(element,index);}
      const bounds=findFragment(index,fragment,occurrencesBefore(source,fragment));
      if(!bounds)continue;
      const range=markRange(index,bounds.from,bounds.to);
      if(!range)continue;
      ranges.push(range);
      // The last fragment owns the sentence terminator. Do not mistake
      // decimal 1.72 or a neighbouring sentence's period for the stop.
      if(fragment===sentence.fragments.at(-1)){
        const m=endStop.exec(fragment.text);
        if(m){
          const position=index.text.lastIndexOf(m[0],bounds.to-1);
          if(position>=bounds.from){
            const stop=markRange(index,position,position+m[0].length);
            if(stop)stops.push(stop);
          }
        }
      }
      break;
    }
  }
  if(ranges.length===startLength)unmappedCount++;
  }
  return {ranges,stops,unmappedCount};
}

/** @returns {{fragmentCount:number,stopCount:number}} for diagnostics/testing. */
export function paintSentencePreviewHighlight(body,sentence,source,lineAtOffset){
  clearSentencePreviewHighlight();
  const safari=/AppleWebKit/i.test(navigator.userAgent)&&!/(?:Chrome|Chromium|Edg)\//i.test(navigator.userAgent);
  if(!body?.isConnected||!sentence?.fragments?.length||
     (!safari&&(!globalThis.CSS?.highlights||typeof Highlight!=='function')))
    return {fragmentCount:0,stopCount:0};
  const {ranges,stops}=resolveSentenceRanges(body,[sentence],source,lineAtOffset);
  const stop=stops[0]||null;
  if(safari)paintWebKitOverlay(body,ranges,stop);
  else{
    if(ranges.length){
      const mark=new Highlight(...ranges);mark.priority=10;
      CSS.highlights.set(sentenceName,mark);
    }
    if(stop){
      const mark=new Highlight(stop);mark.priority=20;
      CSS.highlights.set(punctuationName,mark);
    }
  }
  return {fragmentCount:ranges.length,stopCount:stop?1:0};
}

/** Coverage lens for every *filtered AG row*, across non-visible AG grid rows.
 * Never resegment or annotate source. Draw only current rendered Markdown.
 * Uncovered text is left unpainted so missing sentence mappings are visible.
 * The user's individually selected sentence keeps its stronger highlight. */
export function paintSentenceCoverageHighlight(body,sentences,source,lineAtOffset){
  clearSentenceCoverageHighlight();
  const safari=/AppleWebKit/i.test(navigator.userAgent)&&!/(?:Chrome|Chromium|Edg)\//i.test(navigator.userAgent);
  if(!body?.isConnected||!Array.isArray(sentences)||!sentences.length||
    (!safari&&(!globalThis.CSS?.highlights||typeof Highlight!=='function')))
    return {sentenceCount:0,fragmentCount:0,stopCount:0};
  const {ranges,stops,unmappedCount}=resolveSentenceRanges(body,sentences,source,lineAtOffset);
  if(safari){
    const rootRect=body.getBoundingClientRect();
    const overlay=document.createElement('div');
    overlay.className='ocr-sentence-cover-overlay';
    overlay.setAttribute('aria-hidden','true');
    for(const range of ranges){
      for(const rect of range.getClientRects()){
        if(rect.width<0.7||rect.height<0.7)continue;
        const mark=document.createElement('span');
        mark.className='ocr-sentence-cover-span';
        mark.dataset.text=range.toString();
        mark.style.left=(rect.left-rootRect.left)+'px';
        mark.style.top=(rect.top-rootRect.top)+'px';
        mark.style.width=rect.width+'px';
        mark.style.height=rect.height+'px';
        overlay.append(mark);
      }
    }
    for(const range of stops){
      for(const rect of range.getClientRects()){
        if(rect.width<0.7||rect.height<0.7)continue;
        const mark=document.createElement('span');
        mark.className='ocr-sentence-cover-stop';
        mark.dataset.text=range.toString();
        mark.style.left=(rect.left-rootRect.left)+'px';
        mark.style.top=(rect.top-rootRect.top)+'px';
        mark.style.width=rect.width+'px';
        mark.style.height=rect.height+'px';
        overlay.append(mark);
      }
    }
    if(overlay.childElementCount)body.append(overlay);
  }else{
    if(ranges.length)CSS.highlights.set(coverageName,new Highlight(...ranges));
    if(stops.length)CSS.highlights.set(coverageStopName,new Highlight(...stops));
  }
  return {sentenceCount:sentences.length,coveredCount:sentences.length-unmappedCount,
    unmappedCount,fragmentCount:ranges.length,stopCount:stops.length};
}

/** Map a real preview text click back to a CMD sentence without inspecting
 * AG internals. Restrict candidates to this markdown-it mapped source block
 * and test the exact painted Range rectangles. Adjacent sentences on one
 * source line therefore resolve independently, even across MinerU blocks. */
export function hitSentencePreview(body,element,sourceLine,clientX,clientY,rows,source,lineAtOffset){
  if(!Number.isInteger(sourceLine)||sourceLine<1||!Number.isFinite(clientX)||!Number.isFinite(clientY))return null;
  if(!body.contains(element))return null;
  const mapped=[...body.querySelectorAll('[data-source-start][data-source-end]')]
    .filter(node=>node.contains(element)&&
      Number(node.dataset.sourceStart)<=sourceLine&&sourceLine<Number(node.dataset.sourceEnd))
    .sort((a,b)=>(Number(a.dataset.sourceEnd)-Number(a.dataset.sourceStart))-
      (Number(b.dataset.sourceEnd)-Number(b.dataset.sourceStart)));
  for(const node of mapped){
    const index=textIndex(node);
    for(const row of rows){
      for(const fragment of row.fragments){
        const line=lineAtOffset(fragment.from);
        if(line<Number(node.dataset.sourceStart)||line>=Number(node.dataset.sourceEnd))continue;
        const bounds=findFragment(index,fragment,occurrencesBefore(source,fragment));
        const range=bounds&&markRange(index,bounds.from,bounds.to);
        if(!range)continue;
        for(const rect of range.getClientRects()){
          if(rect.width>0&&rect.height>0&&clientX>=rect.left-1&&clientX<=rect.right+1&&
             clientY>=rect.top-2&&clientY<=rect.bottom+2)return row;
        }
      }
    }
  }
  return null;
}
