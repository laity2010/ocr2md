/** View-only MinerU evidence folding. Never edits the Markdown document.
 * Keep the first metadata line and the closing '-->' visible. Single-line
 * block/end/chapter markers remain untouched; the CM6 gutter owns toggling.
 */
import {foldEffect,foldService} from '@codemirror/language';

const header=/^\s*<!-- minerujson:[a-z][\w-]*:v\d+(?::[^\s]+)*\s*$/;

export function mineruCommentRange(doc,lineNumber){
  const first=doc.line(lineNumber);
  if(!header.test(first.text))return null;
  for(let n=lineNumber+1;n<=doc.lines;n++){
    const line=doc.line(n);
    if(line.text.trim()==='-->')return {from:first.to,to:line.from};
    // An incomplete comment must never swallow the next evidence record.
    if(line.text.trimStart().startsWith('<!-- minerujson:'))break;
  }
  return null;
}

// CM6 uses this both for fold-gutter clicks and keyboard fold/unfold commands.
export const mineruCommentFolding=foldService.of((state,lineStart)=>
  mineruCommentRange(state.doc,state.doc.lineAt(lineStart).number));

/** Called once per loaded document, not after arbitrary edits or rendering.
 * Manually expanded comments stay expanded, even across saves and undo/redo.
 */
export function foldInitialMineruComments(view){
  const doc=view.state.doc;
  const effects=[];
  for(let n=1;n<=doc.lines;n++){
    const range=mineruCommentRange(doc,n);
    if(!range)continue;
    effects.push(foldEffect.of(range));
    n=doc.lineAt(range.to).number; // Skip the closed comment's interior.
  }
  if(effects.length)view.dispatch({effects});
  return effects.length;
}
