/** MinerU fenced LaTeX in V3 chapter-cleaning previews only.
 * This must never change saved MD, DIRjson, source lines, or V2's renderer.
 * The resulting KaTeX HTML still passes through V2 DOMPurify sanitization.
 */
import katex from "../../../v2/node_modules/katex";

function escapeText(text:string):string{
  return text.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}

/** Preserve one HTML block on the first *content* line and the exact original
 * number of newlines. MarkdownIt's data-source-line still points to the real
 * CodeMirror line, even when an equation spans multiple source lines.
 */
export function renderFencedMathInPreview(source:string):string{
  if(!/^ {0,3}(?:`{3,}|~{3,})(?:math|latex|tex)[ \t]*$/im.test(source))return source;
  const lines=source.split("\n");
  let output:string[]|undefined;
  for(let i=0;i<lines.length;i++){
    const opening=/^ {0,3}(`{3,}|~{3,})(?:math|latex|tex)[ \t]*$/i.exec(lines[i]);
    if(!opening)continue;
    const fence=opening[1];
    const close=new RegExp(`^ {0,3}${fence[0]}{${fence.length},}[ \\t]*$`);
    let end=i+1;
    for(;end<lines.length&&!close.test(lines[end]);end++){}
    if(end>=lines.length||end<=i+1)continue;
    const equation=lines.slice(i+1,end).join("\n").trim();
    if(!equation||equation.length>20_000){i=end;continue;}
    let html:string;
    try{
      html=katex.renderToString(equation,{
        displayMode:true,throwOnError:true,trust:false,
        strict:"ignore",maxExpand:1000,maxSize:20,
        output:"htmlAndMathml",
      });
      html=`<div class="ocr2md-fenced-math">${html}</div>`;
    }catch{
      // Invalid OCR cannot be silently treated as a valid formula. Keep its
      // exact text visible and prompt comparison with the original PDF.
      html=`<div class="ocr2md-fenced-math-error"><strong>公式解析失败，请核对 PDF 原文</strong><pre><code>${escapeText(equation)}</code></pre></div>`;
    }
    output??=[...lines];
    output[i]="";
    output[i+1]=html;
    for(let line=i+2;line<=end;line++)output[line]="";
    i=end;
  }
  return output?output.join("\n"):source;
}
