/** CMD review-only edits (inline marker or incoming block lb) cannot invalidate the AG inventory. This predicate
 * is intentionally strict: substantive source edits still require a Worker
 * rescan. It also covers undo/redo of a single comment annotation. */
import {parseCMDBlockTag} from './cmd-block-chains.js';
const REVIEW=/<!--ocr2md:illegal-break-review\b[^\n]*-->\n?/g;
const MARKER='<!--ocr2md:illegal-break-review';
export function isIllegalBreakReviewOnlyChange(update){
  if(!update?.docChanged||!update.changes||!update.startState?.doc)return false;
  let sawReview=false,valid=true;
  update.changes.iterChanges((fromA,toA,fromB,toB,inserted)=>{
    const before=update.startState.doc.sliceString(fromA,toA);
    const after=inserted.toString();
    const marker=before.includes(MARKER)||after.includes(MARKER);
    const former=parseCMDBlockTag(before),latter=parseCMDBlockTag(after);
    const incomingEdge=former&&latter&&former.id===latter.id&&
      former.lb!==latter.lb&&
      Object.keys({...former,...latter}).filter(k=>k!=='lb')
        .every(k=>JSON.stringify(former[k])===JSON.stringify(latter[k]));
    const inlineMarker=marker&&before.replace(REVIEW,'')===after.replace(REVIEW,'');
    if(!incomingEdge&&!inlineMarker)valid=false;
    if(incomingEdge||inlineMarker)sawReview=true;
  });
  return valid&&sawReview;
}

/** Remap *existing* AG row objects after a metadata-only CM6 change.
 * No copy of Markdown, reclassification or new row IDs. The DOM survives.
 */
export function rebaseIllegalBreakRowsInPlace(rows,changes,beforeDoc,afterDoc){
  for(const row of rows){
    const beforeFrom=row.from,beforeTo=row.to;
    if(!Number.isInteger(beforeFrom)||!Number.isInteger(beforeTo))continue;
    const oldLine=Number.isInteger(row.line)?beforeDoc.line(row.line):null;
    const oldAfter=Number.isInteger(row.afterLine)?beforeDoc.line(row.afterLine):null;
    row.from=changes.mapPos(beforeFrom,1);
    row.to=changes.mapPos(beforeTo,-1);
    if(row.to<row.from)row.to=row.from;
    row.line=oldLine?afterDoc.lineAt(changes.mapPos(oldLine.from,1)).number:
      afterDoc.lineAt(row.from).number;
    if(oldAfter)row.afterLine=afterDoc.lineAt(changes.mapPos(oldAfter.from,1)).number;
    if(typeof row.witness==='string')row.witness=afterDoc.sliceString(row.from,row.to);
  }
  return rows;
}
