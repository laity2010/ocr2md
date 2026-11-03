/** CMD p/b/s marking baseline (06b2901): recognition and navigation only.
 * Normal CM6 editing outside the text-block review module is unaffected.
 */
export const TEXT_BLOCKS_READ_ONLY = true;
export const TEXT_BLOCK_READ_ONLY_MESSAGE =
  '文本块其他结构编辑仍关闭：仅 PDF 子块落点可归入，不支持排序、拆分、AG 合并、覆盖框修改或提取写入';
export function rejectTextBlockEdit(){
  return Promise.reject(new Error(TEXT_BLOCK_READ_ONLY_MESSAGE));
}
