/** Logical PBS page, not the immutable physical global_page of an OCR atom.
 * A block continued onto PDF page 2 can still belong to logical p1.
 */
export function pbsPageKey(pbs){
  // Only the p-prefix matters. Do not reject additional reviewed Block
  // suffixes (e.g. an older p13b3d); filtering is not PBS validation.
  const match=/^p(\d+)b\d+/.exec(String(pbs??''));
  return match?'p'+Number(match[1]):'';
}
