/** Sentence Lab: fold-only presentation of non-sentence source spans.
 *
 * Reuse Main's mineruCommentFolding for MinerU evidence comments, and add a
 * view-only CM6 fold service for the other source lines omitted from the
 * sentence extraction projection. CMD bytes, block tags and sentence offsets
 * are never mutated, projected into a different document or persisted.
 */
import {StateEffect,StateField} from '@codemirror/state';
import {foldEffect,unfoldEffect,foldedRanges,foldService,
  codeFolding,foldGutter} from '@codemirror/language';
import {extractTextBlocks} from './cmd-sentences.js';
import {parseCMDBlockTag} from './cmd-block-chains.js';
import {mineruCommentFolding,mineruCommentRange,
  foldInitialMineruComments} from './mineru-comment-folding.js';

const changeFoldRanges=StateEffect.define();
const foldableIgnoredRanges=StateField.define({
  create:()=>[],
  update(previous,transaction){
    for(const effect of transaction.effects)
      if(effect.is(changeFoldRanges))return effect.value;
    return transaction.docChanged?[]:previous;
  }
});
const ignoredFoldService=foldService.of((state,lineStart)=>
  state.field(foldableIgnoredRanges).find(range=>range.from===lineStart)??null);

export const sentenceSourceFolding=[
  foldableIgnoredRanges,
  codeFolding(),
  foldGutter(),
  mineruCommentFolding,
  ignoredFoldService
];

function sourceAt(projection,offset){
  for(const range of projection.ranges){
    if(offset>=range.viewFrom&&offset<range.viewTo)
      return range.sourceFrom+(offset-range.viewFrom);
  }
  return null;
}

/** Returns foldable non-sentence ranges in the currently visible CM6 source.
 * Public CMD PBS tag lines are intentionally kept visible, so block labels
 * and source navigation survive when every other unprocessed line is hidden.
 */
export function nonSentenceFolds(view,source,projection){
  const doc=view.state.doc;
  const text=extractTextBlocks(source).sourcePieces
    .filter(piece=>piece.kind==='text');
  const hidden=new Uint8Array(doc.lines+1);
  let textIndex=0;
  for(let n=1;n<=doc.lines;n++){
    const line=doc.line(n);
    if(parseCMDBlockTag(line.text))continue;
    // Preserve the whole comment: Main's own mineruCommentFolding handles it.
    const comment=mineruCommentRange(doc,n);
    if(comment){
      n=doc.lineAt(comment.to).number;
      continue;
    }
    const start=sourceAt(projection,line.from);
    const end=line.to>line.from?sourceAt(projection,line.to-1):start;
    if(start===null||end===null)continue; // display-only separator
    while(textIndex<text.length&&text[textIndex].to<=start)textIndex++;
    const participates=textIndex<text.length&&
      text[textIndex].from<=end&&text[textIndex].to>start;
    if(!participates)hidden[n]=1;
  }
  const ranges=[];
  for(let n=1;n<=doc.lines;){
    if(!hidden[n]){n++;continue;}
    const first=n;
    while(n<=doc.lines&&hidden[n])n++;
    const from=doc.line(first).from,to=doc.line(n-1).to;
    if(to>from&&Array.from({length:n-first},(_,i)=>doc.line(first+i).text)
      .some(line=>line.trim().length)){
      ranges.push({from,to});
    }
  }
  return ranges;
}

/** Called only after the source sample or visible block filter changes.
 * Manual unfolds persist during click, scrolling and Gold review.
 */
export function foldSourceInitially(view,source,projection){
  const previous=foldedRanges(view.state),effects=[];
  previous.between(0,view.state.doc.length,(from,to)=>
    effects.push(unfoldEffect.of({from,to})));
  const ignored=nonSentenceFolds(view,source,projection);
  effects.push(changeFoldRanges.of(ignored));
  view.dispatch({effects});
  const comments=foldInitialMineruComments(view);
  if(ignored.length)view.dispatch({effects:ignored.map(r=>foldEffect.of(r))});
  return {ignored:ignored.length,comments};
}

/** When selecting a PBS group or a sentence that lies inside a folded line,
 * reveal the target only. The other ignored regions remain collapsed.
 */
export function revealFoldedSource(view,pos){
  const unfolds=[];
  foldedRanges(view.state).between(Math.max(0,pos-1),
    Math.min(view.state.doc.length,pos+1),(from,to)=>{
      if(from<=pos&&pos<=to)unfolds.push(unfoldEffect.of({from,to}));
    });
  if(unfolds.length)view.dispatch({effects:unfolds});
  return unfolds.length;
}
