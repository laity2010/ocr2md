/** The text-block anchor is valid inside any level of Markdown blockquote.
 * Preserve source page/block IDs: quote markers are presentation, not identity.
 */
const quoted=/^((?: {0,3}>[ \t]?)+)/;
const anchor=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:block:v1:(\d+):(\d+) -->[ \t]*$/;
const cmdAnchor=/^(?: {0,3}>[ \t]?)* {0,3}<!-- cmd:block:v1 p="(\d+)" b="(\d+)"((?: [a-z]+="[^"]*")*) -->[ \t]*$/;
const page=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:page:v1:/;
const source=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:source:v1:/;

export function quotePrefix(line){return quoted.exec(line)?.[1]||'';}
export function unquotePrefix(line){return line.replace(quoted,'');}
export function blockAnchor(line){
  const m=anchor.exec(line);
  if(m)return {pageIndex:Number(m[1]),blockIndex:Number(m[2])};
  const cmd=cmdAnchor.exec(line);
  if(cmd&&!/ s="/.test(cmd[3]))return {pageIndex:Number(cmd[1]),blockIndex:Number(cmd[2])};
  return null;
}
export function pageHeader(line){return page.test(line);}
export function sourceHeader(line){return source.test(line);}

/** Paths are zero-based indices in the source MinerU `blocks[]` tree.
 * Subblocks are NEVER promoted to a top-level para_block identity. */
export function subblockId(pageIndex,blockIndex,path){
  if(!Number.isInteger(pageIndex)||pageIndex<0||!Number.isInteger(blockIndex)||blockIndex<0||
     !Array.isArray(path)||!path.length||!path.every(i=>Number.isInteger(i)&&i>=0))
    throw Error('Invalid MinerU child path');
  return `p${pageIndex}b${blockIndex}s${path.join('.')}`;
}
const subblock=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:subblock:v1:(\d+):(\d+):(\d+(?:\.\d+)*)(?: type="([a-zA-Z_][a-zA-Z0-9_-]*)")?(?: id="(p\d+b\d+s\d+(?:\.\d+)*)")? -->[ \t]*$/;
export function subblockAnchor(line){
  const m=subblock.exec(line);
  if(!m){
    const cmd=cmdAnchor.exec(line);
    const child=cmd&&/ s="(\d+(?:\.\d+)*)"/.exec(cmd[3]);
    if(!child)return null;
    return {pageIndex:Number(cmd[1]),blockIndex:Number(cmd[2]),
      path:child[1].split('.').map(Number)};
  }
  const pageIndex=Number(m[1]),blockIndex=Number(m[2]);
  const path=m[3].split('.').map(Number);
  if(m[5]&&m[5]!==subblockId(pageIndex,blockIndex,path))return null;
  return {pageIndex,blockIndex,path};
}
export function subblockTag(pageIndex,blockIndex,path,type){
  const id=subblockId(pageIndex,blockIndex,path);
  return `<!-- minerujson:subblock:v1:${pageIndex}:${blockIndex}:${path.join('.')}${type?` type="${type}"`: ''} id="${id}" -->`;
}
