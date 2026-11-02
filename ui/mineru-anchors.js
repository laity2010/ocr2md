/** The text-block anchor is valid inside any level of Markdown blockquote.
 * Preserve source page/block IDs: quote markers are presentation, not identity.
 */
const quoted=/^((?: {0,3}>[ \t]?)+)/;
const anchor=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:block:v1:(\d+):(\d+) -->[ \t]*$/;
const cmdAnchor=/^(?: {0,3}>[ \t]?)* {0,3}<!-- cmd:block:v1 (?:id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"|p="(\d+)" b="(\d+)")((?: [a-z]+="[^"]*")*) -->[ \t]*$/;
const page=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:page:v1:/;
const source=/^(?: {0,3}>[ \t]?)* {0,3}<!-- minerujson:source:v1:/;

export function quotePrefix(line){return quoted.exec(line)?.[1]||'';}
export function unquotePrefix(line){return line.replace(quoted,'');}
export function blockAnchor(line){
  const m=anchor.exec(line);
  if(m)return {pageIndex:Number(m[1]),blockIndex:Number(m[2])};
  const cmd=cmdAnchor.exec(line);
  if(cmd){
    // The visible ID may have been reassigned by a user. Preserve the
    // original sealed OCR parent identity for bbox/source verification.
    const old=/ origin="p(\d+)b(\d+)"/.exec(cmd[4]);
    if(old)return {pageIndex:Number(old[1]),blockIndex:Number(old[2])};
    // Promoted direct child appears as a new logical PBS parent, but its
    // original OCR evidence remains in the child collection, not a phantom
    // top-level MinerU para_block beyond the sealed page's parent count.
    if(/ origin="p\d+b\d+s\d+"/.test(cmd[4]))return null;
    const id=cmd[1],path=id?/(?:s(\d+(?:\.\d+)*))$/.exec(id):null;
    if(!path&&!/ s="/.test(cmd[4])){
      const root=id? /^p(\d+)b(\d+)$/.exec(id):null;
      return {pageIndex:Number(root?.[1]??cmd[2]),blockIndex:Number(root?.[2]??cmd[3])};
    }
  }
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
    // A corrected child with origin= is not a native MinerU blocks[] child.
    // It is drawn on its original parent's PDF rectangle instead.
    if(cmd&&/ origin="p\d+b\d+"/.test(cmd[4]))return null;
    const promoted=cmd&&/ origin="p(\d+)b(\d+)s(\d+)"/.exec(cmd[4]);
    if(promoted)return {pageIndex:Number(promoted[1]),
      blockIndex:Number(promoted[2]),path:[Number(promoted[3])]};
    const child=cmd&&(cmd[1]?/^p(\d+)b(\d+)s(\d+(?:\.\d+)*)$/.exec(cmd[1]):null);
    const legacy=cmd&&!cmd[1]?/ s="(\d+(?:\.\d+)*)"/.exec(cmd[4]):null;
    if(!child&&!legacy)return null;
    return {pageIndex:Number(child?.[1]??cmd[2]),blockIndex:Number(child?.[2]??cmd[3]),
      path:(child?.[3]??legacy[1]).split('.').map(Number)};
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
