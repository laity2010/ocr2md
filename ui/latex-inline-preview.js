/** Read-only presentation of reviewed inline LaTeX.
 * No mutation of CM6 Markdown and no persistence of rendered HTML.
 */
import katex from 'katex';

const INLINE=/<!--ocr2md:latex id=([a-f0-9]{16}) review=latex-->([^\n]*?)<!--\/ocr2md:latex id=\1-->/g;
const COMMENT=/<!--(?:\/)?ocr2md:latex id=[a-f0-9]{16}(?: review=(?:latex|忽略))?-->/g;

function escapeHtml(text){
  return text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

/** Project confirmed inline formulas to KaTeX HTML before markdown-it parse.
 * The regex rejects multiline matches, so all source line anchors are stable.
 * Only matching ID pairs with review=latex render; ignored/unreviewed remain text.
 */
export function projectReviewedInlineLatex(source){
  return source.replace(INLINE,(_full,_id,formula)=>{
    try{
      const rendered=katex.renderToString(formula,{
        displayMode:false,throwOnError:true,trust:false,maxExpand:1000,strict:'warn',
      });
      return `<span class="ocr-reviewed-inline-latex">${rendered}</span>`;
    }catch{
      // Failed KaTeX remains legible and reviewable in AG; never drop text.
      return `<span class="ocr-reviewed-inline-error">${escapeHtml(formula)}</span>`;
    }
  }).replace(COMMENT,'');
}
