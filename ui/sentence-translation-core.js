/** Pure, independent sentence-language exchange. CM6/CMD own the only source;
 * the detachable JSON task is NOT another Markdown document. Media's compact
 * public-contract rule applies: two functions, both with direct tests.
 */
const VERSION='ocr2md.sentence-translation.v1';
const protectedSyntax=/(?:<!--[\s\S]*?-->|\$[^$\n]+\$|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\]|!\[[^\]\n]*\]\([^\n)]*\)|!\[\[[^\]\n]*\]\]|\[\^[^\]\n]+\]|<\/?[a-z][^>\n]*>)/gi;
// This is a deterministic revision token, NOT a cryptographic SHA256 proof.
// Exact current source equality, not this short fingerprint, is the write gate.
const sourceVersion=source=>{
  let hash=2166136261;
  for(let i=0;i<source.length;i++)hash=Math.imul(hash^source.charCodeAt(i),16777619);
  return `${source.length}-${(hash>>>0).toString(36)}`;
};
function proseOnly(text){
  const protectedParts=[];
  const cleaned=text.replace(protectedSyntax,(part,index)=>{
    protectedParts.push({offset:index,source:part});return ' ';
  })
    .replace(/\[([^\]\n]+)\]\((?:https?:\/\/|#)[^\s)]+\)/g,'$1')
    .replace(/(?:\*\*|__|\*|_)(?=[\p{L}\p{N}])/gu,'')
    .replace(/(?<=[\p{L}\p{N}])(?:\*\*|__|\*|_)/gu,'')
    .replace(/[\u0000-\u001f]/g,'') // OCR control bytes never enter an AI sentence
    .replace(/\s+/g,' ').trim();
  return {text:cleaned,protectedParts};
}
const isPlainSentence=text=>typeof text==='string'&&text.length>0&&text.length<=12000&&
  text===text.trim()&&!/[\r\n\u0000-\u001f]/.test(text)&&
  !/(?:<!--|<\/?[a-z][^>]*>|!\[|\[\^|\$[^$\n]+\$|\\\([^\n]+?\\\)|\\\[[^\n]+?\\\]|```|^#{1,6}\s|^>\s)/i.test(text);
/** Public ST01: produce a pure sentence-only AI payload + PRIVATE source map.
 * Sentence marks are read from CMD. No auto segmentation and no source writes.
 */
export function prepareSentenceTranslationTask(source,rows){
  if(typeof source!=='string'||!Array.isArray(rows))throw Error('分句翻译需要 CMD 源文和句表');
  if(rows.length>100000)throw Error('句表过大，请按章节处理');
  const ids=new Set(),sentences=[],mapping=[];
  for(const row of rows){
    if(!row||!/^s-[a-z0-9]+$/.test(row.id)||ids.has(row.id)||
      !Array.isArray(row.fragments)||!row.fragments.length||typeof row.text!=='string')
      throw Error('分句翻译的句子 ID 或来源不合法');
    ids.add(row.id);
    let previous=-1;
    for(const f of row.fragments){
      if(!Number.isInteger(f.from)||!Number.isInteger(f.to)||f.from<0||f.to>source.length||
        f.to<=f.from||f.from<previous||typeof f.text!=='string')
        throw Error(`句子 ${row.id} 的 CMD 来源区间失效`);
      // Existing CMD sentence annotations can reside inside a fragment. Only
      // known inline CMD metadata may be removed for this read-only witness.
      const actual=source.slice(f.from,f.to).replace(/<!--\s*ocr2md:sentence\b[^\n]*?-->/g,'');
      if(actual!==f.text)throw Error(`句子 ${row.id} 的源文已变化，请重新分句`);
      previous=f.to;
    }
    if(row.fragments.map(f=>f.text).join(' ').replace(/\s+/g,' ').trim()!==row.text.trim())
      throw Error(`句子 ${row.id} 的片段和原句不一致`);
    const result=proseOnly(row.text);
    if(!isPlainSentence(result.text))throw Error(`句子 ${row.id} 含未处理的结构语法`);
    sentences.push(Object.freeze({sid:row.id,source:result.text}));
    mapping.push(Object.freeze({sid:row.id,fragments:row.fragments.map(f=>({from:f.from,to:f.to,blockId:f.blockId})),
      protectedCount:result.protectedParts.length,original:row.text}));
  }
  const task=Object.freeze({schema:VERSION,sourceVersion:sourceVersion(source),
    sentences});
  return Object.freeze({task,mapping,sourceSnapshot:source});
}
/** Public ST02: strict AI return checker. Deliberately returns only detached
 * review rows; the UI cannot write, save, or silently adopt corrected prose.
 */
export function validateSentenceTranslationReply(prepared,reply,currentSource){
  if(!prepared?.task||typeof currentSource!=='string'||currentSource!==prepared.sourceSnapshot)
    throw Error('原文已变化，翻译结果不能回填，请重新生成句表');
  if(!reply||reply.schema!==VERSION||reply.sourceVersion!==prepared.task.sourceVersion||
    !Array.isArray(reply.sentences))throw Error('AI 回包版本与原句任务不匹配');
  const targets=new Map(prepared.task.sentences.map(item=>[item.sid,item]));
  if(reply.sentences.length!==targets.size)throw Error('AI 回包句数不一致');
  const seen=new Set(),results=[];
  for(const item of reply.sentences){
    if(!item||!targets.has(item.sid)||seen.has(item.sid))throw Error('AI 回包存在未知或重复句子 ID');
    seen.add(item.sid);
    if(!isPlainSentence(item.checked)||!isPlainSentence(item.translation))
      throw Error(`句子 ${item.sid} 的 AI 回包含结构语法或无效正文`);
    if(item.source!==undefined&&item.source!==targets.get(item.sid).source)
      throw Error(`句子 ${item.sid} 的原文回显不一致`);
    const map=prepared.mapping.find(x=>x.sid===item.sid);
    results.push(Object.freeze({sid:item.sid,source:targets.get(item.sid).source,
      checked:item.checked,translation:item.translation,
      edited:item.checked!==targets.get(item.sid).source,
      placementReview:map.protectedCount>0,status:'待审阅'}));
  }
  return Object.freeze({rows:results,accepted:0,sourceVersion:prepared.task.sourceVersion});
}
