/** Read-only markdown projection. One HTML comment preceding $...$ or
 * $$...$$ carries the review status; old closing comments are hidden too.
 */
import katex from 'katex';
import {scanAnnotations} from './cmd-annotations.js';
import {findLatex} from './latex-scan.js';
import {findReviewMarkers} from './latex-review-markers.js';
function escapeHtml(text){
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
export function projectReviewedInlineLatex(source){
  let prefix='OCR2MDREVIEWEDINLINEKATEX';
  while(source.includes(prefix))prefix+='Z';
  const fragments=[],replacements=[];
  const annotations=scanAnnotations(source);
  const formulas=findLatex(source);
  findReviewMarkers(source,formulas,annotations);
  for(const formula of formulas){
    if(formula.kind!=='行内'||formula.status!=='latex')continue;
    const token=prefix+fragments.length+'END';
    const latex=formula.content;
    let html;
    try{
      html='<span class="ocr-reviewed-inline-latex">'+katex.renderToString(latex,{
        displayMode:false,throwOnError:true,trust:false,maxExpand:1000,strict:'warn',
      })+'</span>';
    }catch{
      html='<span class="ocr-reviewed-inline-error">'+escapeHtml(latex)+'</span>';
    }
    fragments.push({token,html});
    replacements.push({from:formula.from,to:formula.to,insert:token});
  }
  for(const marker of annotations){
    if(['ocr2md:latex','/ocr2md:latex'].includes(marker.tag)&&
       /^[a-f0-9]{16}$/.test(marker.attributes.id||''))
      replacements.push({from:marker.from,to:marker.to,insert:''});
  }
  let projected=source;
  for(const edit of replacements.sort((a,b)=>b.from-a.from))
    projected=projected.slice(0,edit.from)+edit.insert+projected.slice(edit.to);
  return {projected,fragments};
}
