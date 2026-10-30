/** Spell review's pure CMD annotation semantics. Only CMD writes source bytes.
 * An inline HTML comment immediately BEFORE a word is the stable anchor.
 * No duplicate shadow document or separate JSON sidecar is required.
 */
export const SPELL_TAG='ocr2md:spellcheck';
const MAX_WORD=80;
export function readSpellcheckMarks(source,annotations){
  const rows=[];let stale=0;
  for(const item of annotations){
    if(item.tag!==SPELL_TAG)continue;
    const {word='',suggestions=''}=item.attributes||{};
    if(!/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(word)||word.length>MAX_WORD||
      source.slice(item.to,item.to+word.length)!==word){stale++;continue;}
    const from=item.to,to=from+word.length;
    const line=Number.isInteger(item.line)?item.line:
      source.slice(0,from).split('\n').length;
    const start=source.lastIndexOf('\n',from-1)+1;
    const end=source.indexOf('\n',to);
    const text=source.slice(start,end<0?source.length:end)
      .replace(/<!--ocr2md:spellcheck(?:\s+[^\n]*?)?-->/g,'').trim().slice(0,150);
    rows.push({word,from,to,line,suggestions:suggestions?suggestions.split(' | ').slice(0,3):[],
      suggestion:suggestions?suggestions.replaceAll(' | ',' / '):'—',context:text,marked:true});
  }
  rows.sort((a,b)=>a.from-b.from);
  return {rows,stale,recordCount:rows.length+stale};
}
export function planSpellcheckMarks(source,candidates,annotations){
  if(typeof source!=='string'||!Array.isArray(candidates)||!Array.isArray(annotations))
    throw Error('Invalid spelling annotation planning input');
  const positions=new Set(annotations.filter(item=>item.tag===SPELL_TAG)
    .filter(item=>source.slice(item.to,item.to+String(item.attributes?.word||'').length)===item.attributes?.word)
    .map(item=>item.to));
  const ops=[];const added=new Set();
  for(const row of candidates){
    const {from,word}=row||{};
    if(!Number.isInteger(from)||typeof word!=='string'||
      !/^[A-Za-z]+(?:['’][A-Za-z]+)*$/.test(word)||word.length>MAX_WORD||
      source.slice(from,from+word.length)!==word)
      throw Error('Spelling source changed; rescan before marking');
    if(positions.has(from)||added.has(from))continue;
    added.add(from);
    ops.push({action:'insert',at:from,tag:SPELL_TAG,attributes:{v:'1',word,
      suggestions:(row.suggestions||[]).slice(0,3).map(v=>String(v).slice(0,60)).join(' | ')}});
  }
  return ops;
}
