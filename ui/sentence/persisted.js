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
