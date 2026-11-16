/** Pure OCR source text extraction (never from user-editable Markdown).
 * Block VIEW `block_json` contains the immutable MinerU node without `blocks`.
 * `content` / `html` are text; an image_path alone is not extractable text.
 */
export function originalBlockText(row){
  if(typeof row?.block_json!=='string')return '';
  let block;
  try{block=JSON.parse(row.block_json);}catch{return '';}
  if(!block||typeof block!=='object'||!Array.isArray(block.lines))return '';
  const lines=[];
  for(const line of block.lines){
    if(!Array.isArray(line?.spans))continue;
    const text=line.spans.map(span=>{
      if(typeof span?.html==='string'&&span.html.trim())return span.html;
      if(typeof span?.content==='string')return span.content;
      return '';
    }).join('');
    lines.push(text);
  }
  const result=lines.join('\n');
  return result.trim()?result:'';
}
