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
