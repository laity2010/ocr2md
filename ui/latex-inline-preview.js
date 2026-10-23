/** Read-only inline LaTeX projection owned by the LaTeX module.
 * KaTeX HTML must NEVER be fed back into markdown-it's inline parser: mixing
 * its MathML/HTML tags with surrounding source can truncate the paragraph.
 */
import katex from 'katex';
const INLINE=/<!--ocr2md:latex id=([a-f0-9]{16}) review=latex-->([^\n]*?)<!--\/ocr2md:latex id=\1-->/g;
const COMMENT=/<!--(?:\/)?ocr2md:latex id=[a-f0-9]{16}(?: review=(?:latex|忽略))?-->/g;

function escapeHtml(text){
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** All placeholders are plain text with no newline and never collide with
 * the original source. Only matching IDs with review=latex get replaced.
 */
export function projectReviewedInlineLatex(source){
  let prefix='OCR2MDREVIEWEDINLINEKATEX';
  while(source.includes(prefix))prefix+='Z';
  const fragments=[];
  const projected=source.replace(INLINE,(_full,_id,formula)=>{
    const token=`${prefix}${fragments.length}END`;
    let html;
    try{
      const rendered=katex.renderToString(formula,{
        displayMode:false,throwOnError:true,trust:false,maxExpand:1000,strict:'warn',
      });
      html=`<span class="ocr-reviewed-inline-latex">${rendered}</span>`;
    }catch{
      html=`<span class="ocr-reviewed-inline-error">${escapeHtml(formula)}</span>`;
    }
    fragments.push({token,html});
    return token;
  }).replace(COMMENT,'');
  return {projected,fragments};
}
