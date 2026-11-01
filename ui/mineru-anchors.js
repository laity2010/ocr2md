/** The text-block anchor is valid inside any level of Markdown blockquote.
 * Preserve source page/block IDs: quote markers are presentation, not identity.
 */
const quoted=/^((?: {0,3}>[ \t]?)+)/;
const anchor=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:block:v1:(\d+):(\d+) -->[ \t]*$/;
const page=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:page:v1:/;
const source=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:source:v1:/;

export function quotePrefix(line){return quoted.exec(line)?.[1]||'';}
export function unquotePrefix(line){return line.replace(quoted,'');}
export function blockAnchor(line){
  const m=anchor.exec(line);
  return m?{pageIndex:Number(m[1]),blockIndex:Number(m[2])}:null;
}
export function pageHeader(line){return page.test(line);}
export function sourceHeader(line){return source.test(line);}

/** Paths are zero-based indices in the source MinerU `blocks[]` tree.
 * Subblocks are NEVER promoted to a top-level para_block identity. */
const subblock=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:subblock:v1:(\d+):(\d+):(\d+(?:\.\d+)*) -->[ \t]*$/;
export function subblockAnchor(line){
  const m=subblock.exec(line);
  return m?{pageIndex:Number(m[1]),blockIndex:Number(m[2]),
    path:m[3].split('.').map(Number)}:null;
}
export function subblockTag(pageIndex,blockIndex,path){
  return `<!-- minerujson:subblock:v1:${pageIndex}:${blockIndex}:${path.join('.')} -->`;
}
