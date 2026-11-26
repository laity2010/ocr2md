/** WP04D: pure conversion of verified WP04B candidates to WP04C plans.
 * No SQLite, UI, or source mutation. Only interior cuts separate sentences.
 */
import {rebuildLine} from './split.js';
import {engineCatalog} from './engines.js';
const ids=engineCatalog.map(e=>e.id);
const require=(ok,message)=>{if(!ok)throw Error(message);};
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
function validPos(text,p){
 return Number.isInteger(p)&&p>=0&&p<=text.length&&
 !(p>0&&p<text.length&&/[\uD800-\uDBFF]/u.test(text[p-1])&&/[\uDC00-\uDFFF]/u.test(text[p]));
}
function protection(line,c){
 require(Array.isArray(c.protectedRanges),'missing protected ranges');
 let last=0;
 return c.protectedRanges.map(r=>{
  require(Array.isArray(r)&&r.length===2&&r.every(p=>validPos(line.text,p))&&last<=r[0]&&r[0]<r[1],'invalid protected range');
  last=r[1];return [...r];
 });
}
function candidatePlan(line,c,version){
 require(c.sourceLine===line.sourceLine&&c.sourceSha256===line.sha256,'candidate source mismatch');
 const ranges=protection(line,c);
 const failed=typeof c.error==='string'&&c.error.length>0;
 if(failed)return {version,status:'error',boundaries:[],protected_ranges:ranges};
 require(Array.isArray(c.units)&&rebuildLine(c)===line.text,'candidate reconstruction mismatch');
 const cuts=[];let previous=0;
 for(const [index,u] of c.units.entries()){
  require(Array.isArray(u.sourceRanges)&&u.sourceRanges.length>0,'missing sentence source ranges');
  for(const r of u.sourceRanges){
   require(validPos(line.text,r.from)&&validPos(line.text,r.to)&&previous<=r.from&&r.from<r.to,'invalid sentence source range');
   require(!ranges.some(([a,b])=>r.from<b&&r.to>a),'sentence overlaps protected range');
   previous=r.to;
  }
  if(index<c.units.length-1){
   require(previous<line.text.length&&!ranges.some(([a,b])=>a<previous&&previous<b),'invalid interior sentence cut');
   cuts.push(previous);
  }
 }
 return {version,status:'ok',boundaries:cuts,protected_ranges:ranges};
}
export function initializationPlans(snapshot,results,versions){
 require(snapshot.documentVersion===results.documentVersion&&results.lines.length===snapshot.lines.length,'source revision mismatch');
 require(ids.every(id=>typeof versions[id]==='string'&&versions[id].trim()),'missing engine version');
 return snapshot.lines.map((line,i)=>{
  const row=results.lines[i];
  require(row.sourceLine===line.sourceLine&&row.sourceSha256===line.sha256,'line source mismatch');
  require(row.candidates.length===ids.length&&ids.every(id=>row.candidates.filter(c=>c.engine===id).length===1),'candidate engine mismatch');
  const candidates=Object.fromEntries(ids.map(id=>[id,candidatePlan(line,row.candidates.find(c=>c.engine===id),versions[id])]));
  const values=Object.values(candidates);
  require(values.every(c=>same(c.protected_ranges,values[0].protected_ranges)),'inconsistent protection');
  let review_state,boundaries=[];
  if(values.some(c=>c.status==='error'))review_state='engine_error';
  else if(!values.every(c=>same(c.boundaries,values[0].boundaries)))review_state='disputed';
  else{boundaries=[...values[0].boundaries];review_state=boundaries.length?'agreed':'no_split';}
  return {boundaries,candidates,review_state,adopted_engine:null};
 });
}
