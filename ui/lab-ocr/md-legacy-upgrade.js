/** WCP: opt-in, source-evidence-checked migration of old MD block projections.
 * Pure planner. No SQL, CM6 DOM, fetch, or mutation of original MD/Block rows.
 * Only exact untouched legacy block bodies qualify: edited spans are skipped.
 */
import {validateMdRows,mdSplice,textOfRows} from './md-runtime.js';

const nonempty=value=>typeof value==='string'&&value.length>0;
const normalize=s=>s.replace(/\r\n?/g,'\n');
const formulaFence=s=>'`'.repeat(Math.max(3,...[...s.matchAll(/`+/g)].map(m=>m[0].length+1)));
const spanFragments=block=>{
  const lines=[];
  for(const line of block.lines??[]){
    const spans=[];
    for(const span of line.spans??[]){
      if(typeof span.html==='string')spans.push(span.html);
      else if(typeof span.image_path==='string')spans.push('![image](<'+span.image_path.replaceAll('>','%3E')+'>)');
      else if(typeof span.content==='string')spans.push(span.content);
    }
    if(spans.length)lines.push(spans.join(''));
  }
  return lines;
};
const originalBody=row=>{
  const data=JSON.parse(row.block_json);
  const type=row.block_type;
  const fragments=spanFragments(data);
  const text=(['table','table_body','table_caption','image','image_body','chart','chart_body']
    .includes(type)?fragments.join('\n'):fragments.join(' '));
  if(type==='title'){
    const raw=data.level??data.text_level;
    const level=Number.isInteger(raw)&&raw>=1&&raw<=6?raw:1;
    return text?'#'.repeat(level)+' '+text:'';
  }
  if(type==='interline_equation')return text?`${formulaFence(text)}math\n${text}\n${formulaFence(text)}`:'';
  return text;
};
const validLink=path=>{
  if(!nonempty(path)||/[\u0000-\u001f\u007f]/.test(path)||/^\/\//.test(path)||/^\\/.test(path))return null;
  const kind=/^[a-z][a-z0-9+.-]*:/i.exec(path)?.[0];
  if(kind&&!/^https?:$/i.test(kind))return null;
  if(kind&&!/^https?:\/\/[^/]+/i.test(path))return null;
  return encodeURI(path).replaceAll('>','%3E').replaceAll(' ','%20');
};
const displayBody=row=>{
  const data=JSON.parse(row.block_json);
  const lines=[],images=[];
  for(const line of data.lines??[]){
    const code=[];
    for(const span of line.spans??[]){
      if(typeof span.content==='string')code.push(span.content);
      if(nonempty(span.image_path)&&!images.includes(span.image_path))images.push(span.image_path);
    }
    if(code.length)lines.push(code.join(''));
  }
  const latex=lines.join('\n');
  const result=[];
  if(latex){
    result.push(/(^|\n)\$\$[ \t]*(\n|$)/.test(latex)?
      `${formulaFence(latex)}math\n${latex}\n${formulaFence(latex)}`:`$$\n${latex}\n$$`);
  }
  let ordinal=0;
  for(const path of images){
    const safe=validLink(path);
    if(safe)result.push(`[${++ordinal===1?'原始公式图':`原始公式图 ${ordinal}`}](<${safe}>)`);
  }
  return result.join('\n');
};
const splitBody=text=>text?normalize(text).split('\n'):[];
const same=(items,text)=>items.length===text.length&&items.every((item,i)=>item.text===text[i]);

/** Plan checked changes; never generate a new BlockID or erase user-authored prose.
 * `blocks` is the current reviewed CM Block state, including source block_json.
 * `makeId` creates only genuinely new MD physical LineIDs.
 */
export function planLegacyMdUpgrade(rows,blocks,makeId){
  validateMdRows(rows);
  if(typeof makeId!=='function')throw Error('缺少新 MD LineID 生成器');
  const byId=new Map(blocks.map(block=>[block.block_id,block]));
  const root=id=>{
    const seen=new Set();let current=byId.get(id);
    while(current?.parent_block_id!=null){
      if(seen.has(current.block_id))return null;
      seen.add(current.block_id);
      current=byId.get(current.parent_block_id);
    }
    return current?.block_id??null;
  };
  const groups=[];
  for(const row of rows){
    const last=groups.at(-1);
    if(last&&last.blockId===row.block_id)last.rows.push(row);
    else groups.push({blockId:row.block_id,rows:[row]});
  }
  const output=[];
  let formulas=0,separators=0,skipped=0,example=null;
  for(let index=0;index<groups.length;index++){
    const group=groups[index],block=byId.get(group.blockId),next=groups[index+1];
    if(!block||typeof block.block_json!=='string'){
      output.push(...group.rows);continue;
    }
    let legacy;
    try{legacy=splitBody(originalBody(block));}catch{output.push(...group.rows);continue;}
    // Original generator emitted exactly ONE trailing blank physical row
    // after every source Block, even parent and child. Never infer structure
    // from arbitrary blank lines or rewrite a block with edited source text.
    const generated=same(group.rows,[...legacy,'']);
    const generatedWithoutTerm=same(group.rows,legacy);
    let projected=group.rows;
    if(block.block_type==='interline_equation'){
      if((generated||generatedWithoutTerm)&&legacy.length){
        let current;
        try{current=splitBody(displayBody(block));}catch{current=null;}
        if(current?.length&&current.join('\n')!==legacy.join('\n')){
          const endsBlank=generated;
          const after=endsBlank?group.rows.at(-1):null;
          const oldBody=endsBlank?group.rows.slice(0,-1):group.rows;
          projected=current.map((text,i)=>({line_id:oldBody[i]?.line_id??makeId(),
            block_id:group.blockId,line_no:0,text}));
          if(after)projected.push(after);
          if(!example)example={block:group.blockId,old:legacy.join('\n'),new:current.join('\n')};
          formulas++;
        }
      }else if(group.rows.some(r=>r.text.startsWith('```math'))){
        skipped++; // Human text differs from the original OCR projection.
      }
    }
    const nextRoot=next?root(next.blockId):null;
    const ownRoot=root(group.blockId);
    // A known old synthetic blank between siblings inside ONE root is not
    // Markdown content. Explicit upgrade may remove it after comparison.
    // If a group was edited, or has multiple blanks, preserve every one.
    if(generated&&next&&next.blockId!==group.blockId&&ownRoot!==null&&
       ownRoot===nextRoot&&projected.at(-1)?.text===''){
      projected=projected.slice(0,-1);
      separators++;
    }
    output.push(...projected);
  }
  const revised=output.map((row,i)=>({...row,line_no:i+1}));
  validateMdRows(revised);
  return {rows:revised,formulas,separators,skipped,example,
    changed:Boolean(mdSplice(rows,revised)),before:textOfRows(rows),after:textOfRows(revised)};
}
