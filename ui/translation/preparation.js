import {template,refill} from './refill.js';
import {readOriginalSnapshot,sha256} from './original-sentences.js';
/** Public, source-bound translation preparation client; backend owns protection. */
const fields=['source_document_hash','sentence_sha256','source_line_hash','source_line','sentence_index','raw','type','level','policy','protected','translatable','text'].sort();
const sourceFields=['source_document_hash','source_line_hash','source_line','sentence_index','raw','type','level'];
const check=(ok,message)=>{if(!ok)throw Error(message);};
export function validatePreparation(result,original){
  check(result?.schema==='ocr2md-translation-preparation/v2'&&['created','ready','migrated'].includes(result.state)&&result.source_document_hash===original.source_document_hash&&result.sentence_sha256===original.sentence_sha256&&Array.isArray(result.rows)&&result.rows.length===original.rows.length,'译句表来源或行数不一致');
  const rows=result.rows.map((r,i)=>{
    check(r&&Object.keys(r).sort().join(',')===fields.join(',')&&sourceFields.every(k=>r[k]===original.rows[i][k])&&r.sentence_sha256===original.sentence_sha256&&r.policy==='wp02/v1'&&typeof r.translatable==='boolean'&&Array.isArray(r.protected),'译句身份或属性不一致');
    let offset=0,remaining='';
    const protectedRanges=r.protected.map(p=>{
      check(p&&Object.keys(p).sort().join(',')==='from,kind,text,to'&&Number.isSafeInteger(p.from)&&Number.isSafeInteger(p.to)&&p.from>=offset&&p.to>p.from&&p.to<=r.raw.length&&typeof p.kind==='string'&&p.kind&&p.text===r.raw.slice(p.from,p.to),'译句保护范围无效');
      // A Unicode surrogate pair must not be split by a UTF-16 boundary.
      for(const pos of [p.from,p.to])check(!(pos>0&&pos<r.raw.length&&/[\uD800-\uDBFF]/.test(r.raw[pos-1])&&/[\uDC00-\uDFFF]/.test(r.raw[pos])),'保护范围截断字符');
      remaining+=r.raw.slice(offset,p.from);offset=p.to;
      return Object.freeze({...p});
    });
    remaining+=r.raw.slice(offset);
    check(r.translatable?/\p{L}/u.test(remaining):remaining==='','译句可译状态与保护范围不一致');
    check(typeof r.text==='string'&&template(r.raw,protectedRanges)===r.text&&refill(r.text,r.raw,protectedRanges)===r.raw,'RAW → text → 回填 无损校验失败');
    return Object.freeze({...r,protected:Object.freeze(protectedRanges)});
  });
  return Object.freeze({...result,rows:Object.freeze(rows)});
}
export async function initializePreparation(workspace,original,{fetcher=fetch,signal}={}){
  const response=await fetcher('/labs/lab-translation/api/translation/initialize',{method:'POST',cache:'no-store',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({workspace,source_document_hash:original.source_document_hash,sentence_sha256:original.sentence_sha256}),signal});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Error(typeof value?.error==='string'?value.error:'HTTP '+response.status);
  return validatePreparation(value,original);
}

/** One logical initialization: upstream snapshot is transient, never a UI state. */
export async function initializeTable(workspace,{fetcher=fetch,signal}={}){
  const original=await readOriginalSnapshot(workspace,{fetcher,signal});
  if(signal?.aborted)throw Error('初始化已取消');
  return initializePreparation(workspace,original,{fetcher,signal});
}


/** Ordinary discovery/load: no POST, scan, initialization or migration. The
 * server validates persisted rows against the current public Sentence snapshot. */
export async function loadTable(workspace,{fetcher=fetch,signal}={}){
  const response=await fetcher('/labs/lab-translation/api/translation/load?'+new URLSearchParams({workspace}),{method:'GET',cache:'no-store',credentials:'same-origin',signal});
  const value=await response.json().catch(()=>null);
  if(!response.ok)throw Error(typeof value?.error==='string'?value.error:'HTTP '+response.status);
  check(value?.schema==='ocr2md-translation-preparation/v2'&&['missing','legacy','ready'].includes(value.state),'译句表加载状态无效');
  if(value.state!=='ready')return Object.freeze({state:value.state});
  check(/^[0-9a-f]{64}$/.test(value.source_document_hash)&&/^[0-9a-f]{64}$/.test(value.sentence_sha256)&&Array.isArray(value.rows),'译句表摘要或数据无效');
  const result=validatePreparation(value,{source_document_hash:value.source_document_hash,sentence_sha256:value.sentence_sha256,rows:value.rows});
  check(await sha256(result.rows.map(r=>r.raw).join(''))===result.source_document_hash,'译句表原文摘要不一致');
  return result;
}
