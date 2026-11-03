/** CMD p/b/s marking baseline (06b2901): recognition and navigation only.
 * Normal CM6 editing outside the text-block review module is unaffected.
 */
export const TEXT_BLOCKS_READ_ONLY = true;
export const TEXT_BLOCK_READ_ONLY_MESSAGE =
  '允许同页父块归入其他父块；子块拆分、排序、PDF 覆盖框编辑仍只读';
export function rejectTextBlockEdit(){
  return Promise.reject(new Error(TEXT_BLOCK_READ_ONLY_MESSAGE));
}
