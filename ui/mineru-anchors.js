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
