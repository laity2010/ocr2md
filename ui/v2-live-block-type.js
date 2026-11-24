/** Current logical Type for the common AG row, not an independent View.
 * Keep the stored original type as provenance; use the V1 source ATX rule
 * for reversible title/text semantics. Never write OCR metadata on edits.
 */
import {titleSourceParts} from './lab-ocr/title-view.js';

export function effectiveBlockType(storedType,markdownText){
  if(titleSourceParts(markdownText).level!==null)return 'title';
  return storedType==='title'?'text':storedType;
}
