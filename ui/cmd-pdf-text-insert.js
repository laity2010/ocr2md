/** PDF original text is optional evidence, never an automatic OCR correction.
 * Insert at the live CM6 caret and leave every original source character
 * untouched. The CMD transaction port enforces chapter/evidence boundaries.
 */
export function planPDFTextInsertion(source,caret,rawText){
  if(typeof source!=='string'||!Number.isInteger(caret)||caret<0||caret>source.length)
    throw Error('源码光标位置无效');
  if(typeof rawText!=='string')throw Error('PDF 提取结果无效');
  const insert=rawText.trim();
  if(!insert||insert.includes('\0'))throw Error('PDF 原文字层无可插入文字');
  return {from:caret,to:caret,expected:'',insert,cursorAfter:caret+insert.length};
}
