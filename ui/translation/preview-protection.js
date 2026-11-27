/** Decorate only existing rendered DOM. No Markdown mutation, no second parser.
 * Exact text matches are scoped to the renderer's physical source-line map.
 * Invisible syntax is skipped; opaque renderer outputs use source-span order.
 */
const hiddenKinds=new Set(['html_tag','html_comment','markdown_prefix','quote','callout','markdown_marker','link_target','link_definition','table_separator','markdown_rule']);
const opaqueSelector='.ocr-reviewed-inline-latex,.ocr-reviewed-inline-error,.ocr-math,pre,code,img,sup.footnote-ref,eq,math,svg,a.footnote-backref';
function compatible(el,span){
  if(el.matches('.ocr-reviewed-inline-latex,.ocr-reviewed-inline-error,.ocr-math,math,eq'))return ['latex','latex_unclosed','html_literal'].includes(span.kind);
  if(el.matches('pre,code'))return ['code','code_unclosed','html_literal'].includes(span.kind);
  if(el.matches('img'))return ['media','url'].includes(span.kind)||(span.kind==='html_tag'&&/^<img(?:\s|>)/i.test(span.text));
  if(el.matches('svg'))return span.kind==='html_literal';
  if(el.matches('sup.footnote-ref'))return span.kind==='footnote';
  return false;
}
function intersect(ranges,from,to){
  let lo=0,hi=ranges.length;
  while(lo<hi){const mid=(lo+hi)>>1;if(ranges[mid].to<=from)lo=mid+1;else hi=mid;}
  const result=[];
  for(let i=lo;i<ranges.length&&ranges[i].from<to;i++)result.push(ranges[i]);
  return result;
}
const mark=(el,from,to,dim)=>{
  if(dim)el.classList.add('translation-protected-preview');
  el.dataset.translationFrom=String(from);el.dataset.translationTo=String(to);
};
export function applyPreviewProtection(article,model){
  const {text,ranges}=model,locations=new WeakMap();
  const anchors=[...article.querySelectorAll('[data-source-start]')].filter(el=>Number.isInteger(Number(el.dataset.sourceStart))&&Number(el.dataset.sourceStart)>0);
  const blocks=anchors.map(el=>{
    const start=Number(el.dataset.sourceStart),end=Number(el.dataset.sourceEnd)||start+1;
    return {el,from:model.lineOffset(start),to:Math.max(model.lineOffset(end),model.lineOffset(start)),start,end};
  });
  for(const block of blocks){
    const {el,from,to}=block;
    if(to<=from)continue;
    const local=intersect(ranges,from,to);
    let cursor=from,spanCursor=0;
    const visible=[],positions=[];
    // Build a per-block source projection without invisible markup. Keep
    // coordinates for actual characters (including surrogate pairs).
    let at=from;
    for(const p of local){
      const a=Math.max(from,p.from),b=Math.min(to,p.to);
      if(!hiddenKinds.has(p.kind))continue;
      for(let i=at;i<a;i++){visible.push(text[i]);positions.push(i);}
      at=b;
    }
    for(let i=at;i<to;i++){visible.push(text[i]);positions.push(i);}
    const projection=visible.join('');
    let projectedCursor=0;
    function advance(offset){
      cursor=Math.max(cursor,offset);
      while(projectedCursor<positions.length&&positions[projectedCursor]<cursor)projectedCursor++;
      while(spanCursor<local.length&&local[spanCursor].to<=cursor)spanCursor++;
    }
    function own(node){
      const parent=node.nodeType===1?node:node.parentElement;
      return parent?.closest('[data-source-start]')===el;
    }
    function opaque(node){
      if(node.matches('a.footnote-backref')){if(local.some(p=>p.kind==='footnote'))node.classList.add('translation-protected-preview');return;}
      // Several sentence-local pieces may make one opaque rendered token.
      const p=local.slice(spanCursor).find(p=>p.to>cursor&&compatible(node,p));
      if(!p)return;
      let end=p.to;
      for(const q of local){if(q.from===end&&q.kind===p.kind)end=q.to;}
      mark(node,p.from,end,true);advance(end);
    }
    function mapText(node){
      const value=node.nodeValue;
      if(!value||!value.trim())return;
      // Exact rendered text first; normalized whitespace/escaped entities
      // are intentionally not assigned guessed source offsets.
      const found=projection.indexOf(value,projectedCursor);
      if(found<0)return;
      const offsets=positions.slice(found,found+value.length);
      if(!offsets.length)return;
      const flags=offsets.map(pos=>intersect(local,pos,pos+1).length>0);
      if(!flags.some(Boolean)){locations.set(node,offsets);advance(offsets.at(-1)+1);return;}
      const fragment=document.createDocumentFragment();
      for(let a=0;a<value.length;){
        let b=a+1;
        while(b<value.length&&flags[b]===flags[a])b++;
        const child=document.createTextNode(value.slice(a,b));locations.set(child,offsets.slice(a,b));
        if(flags[a]){
          const wrapper=document.createElement('span');mark(wrapper,offsets[a],offsets[b-1]+1,true);wrapper.append(child);fragment.append(wrapper);
        }else fragment.append(child);
        a=b;
      }
      node.replaceWith(fragment);advance(offsets.at(-1)+1);
    }
    function walk(node){
      if(!own(node))return;
      if(node.nodeType===3){mapText(node);return;}
      if(node.nodeType!==1)return;
      if(node.matches(opaqueSelector)){opaque(node);return;}
      for(const child of [...node.childNodes])walk(child);
    }
    walk(el);
    // Fully protected rendered blocks, e.g. standalone equations or fenced
    // code. Do not dim any mixed paragraph merely because it contains math.
    let p=from;
    for(const span of local){if(span.from>p&&text.slice(p,span.from).trim())break;p=Math.max(p,span.to);}
    if(local.length&&p>=from&&!text.slice(p,to).trim()){
      el.classList.add('translation-protected-preview');
      mark(el,from,to,true);
    }
  }
  function offsetAt(event){
    const target=event.target;
    if(!(target instanceof Element))return null;
    const explicit=target.closest('[data-translation-from]');
    const doc=article.ownerDocument;
    const caret=doc.caretPositionFromPoint?.(event.clientX,event.clientY)??doc.caretRangeFromPoint?.(event.clientX,event.clientY);
    const node=caret?.offsetNode??caret?.startContainer,offset=caret?.offset??caret?.startOffset;
    const mapped=node&&locations.get(node);
    if(mapped?.length&&article.contains(node))return mapped[Math.min(offset,mapped.length-1)];
    if(explicit&&article.contains(explicit))return Number(explicit.dataset.translationFrom);
    const el=target.closest('[data-source-start]');
    return el&&article.contains(el)?model.lineOffset(Number(el.dataset.sourceStart)):null;
  }
  function elementFor(row){
    const exact=[...article.querySelectorAll('[data-translation-from][data-translation-to]')].find(el=>Number(el.dataset.translationFrom)<=row.from&&Number(el.dataset.translationTo)>row.from);
    if(exact)return exact.closest('[data-source-start]')??exact;
    const candidates=blocks.filter(b=>b.from<row.to&&b.to>row.from);
    // Prefer innermost mapped block over containing list/callout.
    return candidates.sort((a,b)=>(a.to-a.from)-(b.to-b.from))[0]?.el??blocks.find(b=>b.from>=row.from)?.el??blocks.at(-1)?.el??null;
  }
  return Object.freeze({offsetAt,elementFor});
}
