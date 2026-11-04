/** PDF compatibility projection. CMD alone parses source tag scopes and IDs;
 * these two PDF-specific selectors never interpret Markdown or own identities.
 */
import {sourceBlockScopes,mapCMDVisibleLabelSources} from './cmd-block-labels.js';
export {sourceBlockScopes};
export function sourceBlocks(source){return sourceBlockScopes(source).filter(tag=>tag.kind==='parent');}
export function sourceSubblocks(source){return sourceBlockScopes(source).filter(tag=>tag.kind==='child');}

/** Public read-only CMD label location projection for the PDF adapter. */
export function sourceLabelLocations(source){
  // PdfPreview can be constructed before CM6 binds its initial document.
  // Empty bootstrap snapshots are NOT an invalid CMD document; defer lookup
  // until the real editor source becomes available after first PDF paint.
  if(typeof source!=='string'||!source.includes('<!-- minerujson:source:v1:'))return new Map();
  return mapCMDVisibleLabelSources(source);
}

/** Resolve a SOURCE-initiated position to the immutable PDF geometry of the
 * current CMD atom, not a p/b parsed from its now-renumbered visible tag.
 * The CMD-owned projection already provides exact lexical source scopes.
 */
export function sourcePDFLocationAtLine(locations,line){
  if(!(locations instanceof Map)||!Number.isInteger(line)||line<1)return null;
  let match=null;
  for(const entry of locations.values()){
    if(line>=entry.sourceLine&&line<=entry.scopeEndLine&&
      (!match||entry.sourceLine>match.sourceLine))match=entry;
  }
  if(!match)return null;
  // Do not reparse a PBS-looking origin into OCR geometry inside PDF.
  // The CMD source projection has already resolved footer remappings and
  // returns the authoritative immutable physical page, block and path.
  if(!Number.isInteger(match.pageIndex)||!Number.isInteger(match.blockIndex))return null;
  return match;
}
