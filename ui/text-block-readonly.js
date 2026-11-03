/** CMD p/b/s marking baseline (06b2901): recognition and navigation only.
 * Normal CM6 editing outside the text-block review module is unaffected.
 */
export const TEXT_BLOCKS_READ_ONLY = true;
export const TEXT_BLOCK_READ_ONLY_MESSAGE =
  '仅开放 p1b3 归入 p1b4；其他文本块结构操作保持只读';
export function rejectTextBlockEdit(){
  return Promise.reject(new Error(TEXT_BLOCK_READ_ONLY_MESSAGE));
}
