/** Lab-only DOM reconciliation for the existing Markdown projection.
 * Source rendering, sanitizing and source-line mapping still belong to WCP/
 * Markdown; this handles just a visual DOM update. Reuse existing nodes where
 * practical instead of discarding a full chapter when a review comment moves.
 */
import morphdom from 'morphdom';
export function patchLabMarkdown(body,html){
  if(body.innerHTML===html)return;
  const next=body.cloneNode(false);
  next.innerHTML=html;
  morphdom(body,next,{
    childrenOnly:true,
    onBeforeElUpdated(from,to){
      if(from.isEqualNode(to))return false;
      return true;
    },
  });
}
