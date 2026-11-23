/** WP14: one physical CM6 line per SQL logical block.
 * MinerU's visual line wrapping is not an MD block boundary. Keep every
 * original OCR byte in mineru_base; this transforms only an editable MD Block.
 */
export function singleLineMD(text){
  if(typeof text!=='string')throw Error('逻辑文本无效');
  return text.replace(/[ \t]*[\r\n]+[ \t]*/g,' ').trim();
}
