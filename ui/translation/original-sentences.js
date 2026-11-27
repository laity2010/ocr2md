/** Public read-only Sentence snapshot consumer. No SQL writer or local persistence. */
const fields=['source_document_hash','source_line','source_line_hash','sentence_index','from_utf16','to_utf16','raw','type','level','candidates_json','review_state','adopted_engine'].sort();
const digestPattern=/^[0-9a-f]{64}$/;
const check=(condition,message)=>{if(!condition)throw Error(message);};
const validDigest=value=>typeof value==='string'&&digestPattern.test(value);
export async function sha256(text){
  const data=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
  return [...new Uint8Array(data)].map(n=>n.toString(16).padStart(2,'0')).join('');
}
export function canonicalRows(rows){
  return JSON.stringify(rows.map(r=>Object.fromEntries(fields.map(k=>[k,r[k]]))));
}
export async function validateOriginalSnapshot(snapshot){
  check(snapshot?.schema==='ocr2md-sentence-snapshot/v1'&&validDigest(snapshot.source_document_hash)&&validDigest(snapshot.sentence_sha256)&&Array.isArray(snapshot.rows),'原句快照契约无效');
  let last=null;
  for(const row of snapshot.rows){
    check(row&&typeof row==='object'&&Object.keys(row).sort().join(',')===fields.join(','),'原句记录字段无效');
    check(row.source_document_hash===snapshot.source_document_hash&&validDigest(row.source_line_hash)&&Number.isSafeInteger(row.source_line)&&row.source_line>0&&Number.isSafeInteger(row.sentence_index)&&row.sentence_index>=0&&Number.isSafeInteger(row.from_utf16)&&Number.isSafeInteger(row.to_utf16)&&row.from_utf16>=0&&row.to_utf16>=row.from_utf16&&typeof row.raw==='string'&&typeof row.type==='string'&&row.type.length>0&&typeof row.level==='string'&&/^>*$/.test(row.level),'原句记录身份或属性无效');
    const same=last&&last.source_line===row.source_line;
    check(same?(row.sentence_index===last.sentence_index+1&&row.from_utf16===last.to_utf16&&row.type===last.type&&row.level===last.level&&row.source_line_hash===last.source_line_hash&&!last.raw.includes('\n')):((!last||row.source_line>last.source_line)&&row.sentence_index===0&&row.from_utf16===0),'原句顺序或范围无效');
    const length=row.to_utf16-row.from_utf16;
    check(row.raw.length>=length&&!row.raw.slice(0,length).includes('\n')&&(!row.raw.slice(length)||row.raw.slice(length).startsWith('\n')),'原句 RAW 范围无效');
    check(row.sentence_index===0?(typeof row.candidates_json==='string'&&typeof row.review_state==='string'&&(row.adopted_engine===null||typeof row.adopted_engine==='string')):([row.candidates_json,row.review_state,row.adopted_engine].every(v=>v===null)),'原句仲裁元数据无效');
    last=row;
  }
  check(await sha256(canonicalRows(snapshot.rows))===snapshot.sentence_sha256,'原句记录摘要不一致');
  check(await sha256(snapshot.rows.map(row=>row.raw).join(''))===snapshot.source_document_hash,'原句原文摘要不一致');
  return Object.freeze({schema:snapshot.schema,source_document_hash:snapshot.source_document_hash,sentence_sha256:snapshot.sentence_sha256,rows:Object.freeze(snapshot.rows.map(r=>Object.freeze({...r})))});
}
export async function readOriginalSnapshot(workspace,{fetcher=fetch,signal}={}){
  check(typeof workspace==='string'&&workspace.startsWith('/'),'请先绑定资料目录');
  const response=await fetcher('/labs/lab-sentence/api/sentence/snapshot?'+new URLSearchParams({workspace}),{method:'GET',cache:'no-store',credentials:'same-origin',signal});
  const result=await response.json().catch(()=>null);
  if(!response.ok)throw Error(typeof result?.error==='string'?result.error:'HTTP '+response.status);
  return validateOriginalSnapshot(result);
}
/** Generation-checked, single in-memory reference. Old replies cannot replace a new book. */
export function createOriginalSession({reader=readOriginalSnapshot,onChange=()=>{}}={}){
  let generation=0,controller=null,current=null;
  function invalidate(){generation++;controller?.abort();controller=null;current=null;onChange(null);}
  async function initialize(workspace){
    if(current?.workspace!==workspace)invalidate();
    const token=++generation;controller?.abort();const request=new AbortController();controller=request;
    try{
      const snapshot=await reader(workspace,{signal:request.signal});
      if(token!==generation)return null;
      current=Object.freeze({workspace,snapshot});onChange(current);return current;
    }catch(error){if(token!==generation)return null;current=null;onChange(null);throw error;}
    finally{if(token===generation)controller=null;}
  }
  return Object.freeze({initialize,invalidate,get current(){return current;}});
}
