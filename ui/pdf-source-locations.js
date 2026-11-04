/** PDF compatibility projection. CMD alone parses source tag scopes and IDs;
 * these two PDF-specific selectors never interpret Markdown or own identities.
 */
import {sourceBlockScopes,mapCMDVisibleLabelSources} from './cmd-block-labels.js';
export {sourceBlockScopes};
export function sourceBlocks(source){return sourceBlockScopes(source).filter(tag=>tag.kind==='parent');}
export function sourceSubblocks(source){return sourceBlockScopes(source).filter(tag=>tag.kind==='child');}

/** Public read-only CMD label location projection for the PDF adapter. */
export function sourceLabelLocations(source){return mapCMDVisibleLabelSources(source);}
