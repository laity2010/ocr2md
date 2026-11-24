/** V1 conservative reconciliation policy, adapted to V2 current MD Line.
 * Only full original-source paragraphs prove repeated-span positions.
 * No guessing in edited paragraphs; all updates use the same revision.
 */
export function inlineMath(text){
  if(!text||/[\r\n]/.test(text))return text;
  if(text.startsWith('$')&&text.endsWith('$')&&!text.startsWith('$$'))return text;
  if([...text].length&&Array.from({length:text.length},(_,i)=>i).some(i=>text[i]==='$'&&(i===0||text[i-1]!=='\\')))return text;
  return '$'+text+'$';
}
const single=text=>text.replace(/[ \t]*[\r\n]+[ \t]*/g,' ').trim();
function texts(element){
  const old=[],next=[];let count=0,added=0;
  for(const line of element.lines??[]){
    let a='',b='';
    for(const span of line.spans??[]){
      const key=['content','html','image_path'].find(k=>typeof span[k]==='string'&&span[k]);
      if(!key)continue;
      const v=span[key],isMath=key==='content'&&span.type==='inline_equation';
      const wrapped=isMath?inlineMath(v):v;
      if(isMath){count++;if(wrapped!==v)added++;}
      a+=v;b+=wrapped;
    }
    old.push(a);next.push(b);
  }
  return {before:single(old.join('\n')),after:single(next.join('\n')),count,added};
}
export function planV2InlineMath(index,evidence){
  const updates=[],skipped=[],already=[];let formulaCount=0;
  for(const raw of evidence){
    const {before,after,count,added}=texts(raw.block_json);
    if(!count)continue;
    const lines=index.forBlock(raw.block_id).filter(r=>r.md_line.trim());
    const row=lines[0],detail={logicalId:raw.block_id,pbs:row?.pbs??'',formulaCount:count};
    if(lines.length!==1||!row||row.base_blockid!==raw.base_blockid||
       !['text','ref_text'].includes(raw.block_type)||!after||!added){
      if(row?.md_line===after&&before===after)already.push(detail);
      else skipped.push({...detail,reason:'原始段落结构或定界不明确'});
      continue;
    }
    if(row.md_line===after){already.push(detail);continue;}
    if(row.md_line!==before){skipped.push({...detail,reason:'人工编辑或段落已变化，不覆盖'});continue;}
    updates.push(Object.freeze({ref:index.makeRef(row.source_line),beforeText:before,afterText:after}));
    formulaCount+=added;
  }
  return Object.freeze({updates:Object.freeze(updates),skipped:Object.freeze(skipped),already:Object.freeze(already),formulaCount});
}
