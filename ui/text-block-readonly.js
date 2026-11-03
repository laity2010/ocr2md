/** CMD p/b/s marking baseline (06b2901): recognition and navigation only.
 * Normal CM6 editing outside the text-block review module is unaffected.
 */
export const TEXT_BLOCKS_READ_ONLY = true;
export const TEXT_BLOCK_READ_ONLY_MESSAGE =
  '文本块处于只读标定阶段，不支持拖动、排序、合并、拆分、父子归属、覆盖框修改或提取写入';
export function rejectTextBlockEdit(){
  return Promise.reject(new Error(TEXT_BLOCK_READ_ONLY_MESSAGE));
}
