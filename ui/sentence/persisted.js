/** WP04E: the persisted plans, not a second browser engine run, drive review. */
const ids=['intl','sentence-splitter','wink-nlp'];
const require=(ok,message)=>{if(!ok)throw Error(message);};
export function persistedReview(snapshot,rows){
 require(Array.isArray(rows),'句表记录无效');
 const results=[];let i=0;
 for(const line of snapshot.lines){
  const group=[];
  while(i<rows.length&&rows[i].source_line===line.sourceLine)group.push(rows[i++]);
  require(group.length>0,'句表缺少 MDLine '+line.sourceLine);
  let offset=0,raw='';
  for(const [index,r] of group.entries()){
   require(r.source_document_hash===snapshot.documentVersion&&r.source_line_hash===line.sha256&&
    r.sentence_index===index&&r.from_utf16===offset&&typeof r.sentence_text==='string'&&
    r.to_utf16===offset+r.sentence_text.length&&r.line_eol===(index===group.length-1?line.eol:''),'句表来源或范围不符');
   raw+=r.sentence_text+r.line_eol;offset=r.to_utf16;
  }
  require(raw===line.text+line.eol,'句表不能无损还原 MDLine');
  const first=group[0],c=JSON.parse(first.candidates_json);
  const candidates=ids.map(engine=>{
   const item=c[engine];
   require(item&&['ok','error'].includes(item.status)&&Array.isArray(item.boundaries),'缺少引擎方案');
   require(item.boundaries.every((v,j)=>Number.isInteger(v)&&v>0&&v<line.text.length&&(!j||v>item.boundaries[j-1])),'句界无效');
   return {engine,boundaries:item.boundaries,...(item.status==='error'?{error:'引擎失败'}:{})};
  });
  results.push({sourceLine:line.sourceLine,sourceSha256:line.sha256,candidates,
   reviewState:first.review_state,adoptedEngine:first.adopted_engine});
 }
 require(i===rows.length,'句表存在额外记录');
 return {documentVersion:snapshot.documentVersion,lines:results};
}
export async function requestSentence(workspace,snapshot,{reinitialize=false,fetcher=fetch}={}){
 const response=await fetcher('/labs/lab-sentence/api/sentence/'+(reinitialize?'reinitialize':'open'),{
  method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({workspace,source_document_hash:snapshot.documentVersion,
   ...(reinitialize?{confirm:'reinitialize-sentence-table'}:{})})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(result?.error||'句表 HTTP '+response.status);
 require(result?.source_document_hash===snapshot.documentVersion&&['ready','stale'].includes(result.state)&&Array.isArray(result.rows),'句表回执无效');
 require(result.state!=='stale'||result.rows.length===0,'过期句表不得显示为当前数据');
 return {...result,review:result.state==='ready'?persistedReview(snapshot,result.rows):null};
}

/** Only replace the acknowledged source line; validate exact text, candidate
 * identity and selected cut sequence before displaying it. */
export function applyArbitrationRows(snapshot,rows,change,changed){
 const line=snapshot.lines[change.sourceLine-1];
 require(line&&line.sourceLine===change.sourceLine,'仲裁行不存在');
 const old=rows.filter(r=>r.source_line===change.sourceLine);
 require(old.length&&old[0].adopted_engine===change.previousEngine,'原仲裁状态不一致');
 require(Array.isArray(changed)&&changed.length>0&&changed.every(r=>r.source_line===change.sourceLine),'仲裁回执行不符');
 const first=changed[0],metadata=old[0].candidates_json;
 require(first.candidates_json===metadata&&first.adopted_engine===change.adoptedEngine&&
 first.review_state===(change.adoptedEngine===null?'disputed':'adopted'),'仲裁回执状态不符');
 const cuts=change.adoptedEngine===null?[]:JSON.parse(metadata)[change.adoptedEngine].boundaries;
 require(changed.length===cuts.length+1&&cuts.every((pos,i)=>changed[i].to_utf16===pos),'仲裁回执句界不符');
 require(changed.slice(1).every(r=>r.candidates_json===null&&r.review_state===null&&r.adopted_engine===null),'仲裁回执元数据不符');
 const reviewLine=persistedReview({...snapshot,lines:[line]},changed).lines[0];
 const next=rows.filter(r=>r.source_line!==change.sourceLine).concat(changed).sort((a,b)=>a.source_line-b.source_line||a.sentence_index-b.sentence_index);
 return {rows:next,reviewLine};
}
export async function requestArbitration(workspace,snapshot,rows,change,{fetcher=fetch}={}){
 const first=rows.find(r=>r.source_line===change.sourceLine&&r.sentence_index===0);
 require(first&&first.adopted_engine===change.previousEngine,'仲裁原状态不一致');
 const {sha256}=await import('./snapshot.js');
 const response=await fetcher('/labs/lab-sentence/api/sentence/arbitrate',{
  method:'POST',credentials:'same-origin',cache:'no-store',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({workspace,source_document_hash:snapshot.documentVersion,source_line:change.sourceLine,
   source_line_hash:first.source_line_hash,candidates_hash:await sha256(first.candidates_json),
   previous_engine:change.previousEngine,adopted_engine:change.adoptedEngine})
 });
 const result=await response.json().catch(()=>null);
 if(!response.ok)throw Error(result?.error||'仲裁 HTTP '+response.status);
 require(result?.state==='ready'&&result.source_document_hash===snapshot.documentVersion,'仲裁回执来源无效');
 return applyArbitrationRows(snapshot,rows,change,result.rows);
}
