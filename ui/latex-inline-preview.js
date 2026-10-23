/** Read-only inline LaTeX projection. HTML is introduced only AFTER
 * markdown-it has parsed the prose, otherwise it can truncate paragraphs.
 * Recognizes old unquoted and new canonical CMD-serialized annotation tags.
 */
import katex from 'katex';
import {scanAnnotations} from './cmd-annotations.js';

function escapeHtml(text){
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function projectReviewedInlineLatex(source){
  let prefix='OCR2MDREVIEWEDINLINEKATEX';
  while(source.includes(prefix))prefix+='Z';
  const fragments=[],replacements=[];
  const annotations=scanAnnotations(source);
  const starts=annotations.filter(x=>x.tag==='ocr2md:latex'&&
    /^[a-f0-9]{16}$/.test(x.attributes.id||'')&&x.attributes.review==='latex');
  const ends=annotations.filter(x=>x.tag==='/ocr2md:latex'&&
    /^[a-f0-9]{16}$/.test(x.attributes.id||''));
  const used=new Set();
  for(const start of starts){
    const end=ends.find(item=>item.attributes.id===start.attributes.id&&
      item.from>=start.to&&!used.has(item.from)&&
      !source.slice(start.to,item.from).includes('\n')&&
      !annotations.some(other=>other.from>start.to&&other.from<item.from));
    if(!end)continue;
    const formula=source.slice(start.to,end.from);
    const token=`${prefix}${fragments.length}END`;
    let html;
    try{
      html=`<span class="ocr-reviewed-inline-latex">${katex.renderToString(formula,{
        displayMode:false,throwOnError:true,trust:false,maxExpand:1000,strict:'warn',
      })}</span>`;
    }catch{
      html=`<span class="ocr-reviewed-inline-error">${escapeHtml(formula)}</span>`;
    }
    fragments.push({token,html});
    replacements.push({from:start.to,to:end.from,insert:token});
    used.add(end.from);
  }
  // Remove all control annotations from the *projection*, including ignored
  // annotations and both ends of old/new pairs. No line break is removed.
  for(const marker of annotations){
    if(['/ocr2md:latex','ocr2md:latex'].includes(marker.tag)&&
       /^[a-f0-9]{16}$/.test(marker.attributes.id||''))
      replacements.push({from:marker.from,to:marker.to,insert:''});
  }
  let projected=source;
  for(const edit of replacements.sort((a,b)=>b.from-a.from))
    projected=projected.slice(0,edit.from)+edit.insert+projected.slice(edit.to);
  return {projected,fragments};
}
