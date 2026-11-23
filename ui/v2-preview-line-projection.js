/** WP14: Markdown preview derives from the LIVE CM6 block inventory.
 * A visible CM6 block separator is exactly one LF; Markdown-it still needs
 * virtual blank lines to render independent block HTML/paragraphs safely.
 * The preview-only LF and line coordinates never enter SQL or CM6 history.
 */
export function previewLineProjection(rows,getLine){
  if(!Array.isArray(rows)||typeof getLine!=='function')throw Error('预览块清单无效');
  const lines=[],lineMap=[null];
  for(const [i,row] of rows.entries()){
    if(typeof row?.markdownText!=='string')throw Error('预览块正文无效');
    const first=getLine(row.logicalId);
    const parts=row.markdownText.split('\n');
    for(const [j,part] of parts.entries()){
      lines.push(part);lineMap.push(first+j);
    }
    if(i<rows.length-1){lines.push('');lineMap.push(first+parts.length-1);}
  }
  const source=lines.join('\n');
  const map=(first,last)=>{
    const clamp=n=>Math.min(lineMap.length-1,Math.max(1,Number(n)||1));
    const start=lineMap[clamp(first)]??1;
    const end=lineMap[clamp(Math.max((Number(last)||2)-1,Number(first)||1))]??start;
    return {start,end:Math.max(start,end)+1};
  };
  return {source,map};
}
