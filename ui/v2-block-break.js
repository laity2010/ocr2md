/** V1 candidate/merge logic, adapted to the common owned-LF snapshot.
 * Session-only review metadata. No new table, no writes outside CM6. */
import {projectBlockBreakRows,renderBlockBreakJoinCell} from './lab-ocr/block-break-view.js';
import {planBlockBreakMerge} from './lab-ocr/block-break-merge.js';

function adapt(index){
 const blockRows=[],mdRows=[],seen=new Map(),roots=new Map();
 for(const r of index.rows){
  if(!seen.has(r.logical_id)){
   const key=r.p+'/'+r.b;
   if(r.s===0)roots.set(key,r.logical_id);
   const b={block_id:r.logical_id,parent_block_id:r.s===0?null:roots.get(key),
     sibling_order:r.s,block_group:'para_blocks',block_type:r.block_type,pbs:r.pbs,global_page:r.p};
   seen.set(r.logical_id,b);blockRows.push(b);
  }
  mdRows.push({line_id:r.logical_id+'/'+r.line_offset,line_no:r.source_line,block_id:r.logical_id,text:r.md_line});
 }
 return {blockRows,mdRows};
}
export function createBreakSession(){
 let revision=null,rows=null,model=null;
 const decisions=new Map();
 const project=index=>{
  if(revision===index&&rows)return rows;
  model=adapt(index);revision=index;
  const candidates=projectBlockBreakRows(model.mdRows,model.blockRows);
  const projected=candidates.map(r=>{
   const a=index.atSourceLine(r.before_line_no),b=index.atSourceLine(r.line_no),saved=decisions.get(r.issue_id);
   return Object.freeze({...r,p:b.p,before_ref:index.makeRef(a.source_line),after_ref:index.makeRef(b.source_line),
    aText:a.md_line,bText:b.md_line,review:saved?.decision==='忽略'&&saved.aText===a.md_line&&saved.bText===b.md_line?'忽略':'待定'});
  });
  const byId=new Set(projected.map(r=>r.issue_id));
  for(const [id,saved] of decisions){
   if(saved.decision!=='断块合并'||byId.has(id))continue;
   const a=index.atBlockLine(saved.row.before_block_id,saved.aOffset);
   const b=index.atBlockLine(saved.row.after_block_id,saved.bOffset);
   const ba=model.blockRows.find(r=>r.block_id===a?.logical_id),bb=model.blockRows.find(r=>r.block_id===b?.logical_id);
   if(!a||!b||a.md_line!==saved.joinedText||b.md_line!==''||!ba||!bb||
     (ba.parent_block_id??ba.block_id)!==bb.parent_block_id||
     index.forBlock(b.logical_id).some(r=>r.md_line.trim()))continue;
   projected.push(Object.freeze({...saved.row,p:b.p,pbs:model.blockRows.find(r=>r.block_id===bb.parent_block_id)?.pbs??ba.pbs,
    before_pbs:a.pbs,after_pbs:b.pbs,before_line_no:a.source_line,line_no:b.source_line,
    before_ref:index.makeRef(a.source_line),after_ref:index.makeRef(b.source_line),review:'断块合并',merged:true}));
  }
  rows=Object.freeze(projected.sort((a,b)=>a.before_line_no-b.before_line_no||a.line_no-b.line_no));
  return rows;
 };
 const choose=(index,row,decision)=>{
  if(!project(index).includes(row)||row.merged||!['待定','忽略','断块合并'].includes(decision))throw Error('断块候选已过期');
  const a=index.resolve(row.before_ref),b=index.resolve(row.after_ref);
  if(!a||!b||a.md_line!==row.aText||b.md_line!==row.bText)throw Error('断块正文已变化');
  if(decision==='断块合并'){
   const plan=planBlockBreakMerge(row,model.mdRows,model.blockRows);
   return {updates:[{ref:row.before_ref,beforeText:a.md_line,afterText:plan.joinedText},
    {ref:row.after_ref,beforeText:b.md_line,afterText:''}],
    receipt:{decision,row,joinedText:plan.joinedText,aOffset:a.line_offset,bOffset:b.line_offset}};
  }
  if(decision==='待定')decisions.delete(row.issue_id);
  else decisions.set(row.issue_id,{decision,aText:a.md_line,bText:b.md_line});
  rows=null;return {updates:[]};
 };
 const accept=receipt=>{decisions.set(receipt.row.issue_id,receipt);rows=null;};
 return Object.freeze({project,choose,accept,reset(){decisions.clear();revision=null;rows=null;model=null;}});
}
export function resolveBreakPair(index,row){
 const a=index?.resolve(row?.before_ref),b=index?.resolve(row?.after_ref);
 if(!a||!b||a.logical_id!==row.before_block_id||b.logical_id!==row.after_block_id)return null;
 if(row.merged)return [{side:'before',blockId:a.logical_id,lineNo:a.source_line},{side:'after',blockId:b.logical_id,lineNo:b.source_line}];
 if(a.md_line!==row.aText||b.md_line!==row.bText)return null;
 const left=a.md_line.trimEnd(),start=b.md_line.length-b.md_line.trimStart().length;
 if(!left.endsWith(row.before_token)||!b.md_line.trimStart().startsWith(row.after_token))return null;
 return [{side:'before',blockId:a.logical_id,lineNo:a.source_line,from:a.from+left.length-row.before_token.length,to:a.from+left.length},
  {side:'after',blockId:b.logical_id,lineNo:b.source_line,from:b.from+start,to:b.from+start+row.after_token.length}];
}
const cmp=(a,b)=>String(a??'').localeCompare(String(b??''),'en',{numeric:true});
export function breakColumns(renderer){
 return [
 {field:'pbs',headerName:'逻辑块 PBS',width:105,sortable:true,comparator:cmp,pinned:'left',lockPinned:true,lockPosition:'left'},
 {field:'join_preview',headerName:'接续预览 A / B',width:310,minWidth:205,cellRenderer:renderBlockBreakJoinCell,cellClass:'ocr-ag-block-break-preview',sortable:false},
 {field:'review',headerName:'审阅',width:121,minWidth:112,sortable:true,pinned:'right',lockPinned:true,lockPosition:'right',cellRenderer:renderer},
 {field:'before_pbs',headerName:'前块',width:120,sortable:true,comparator:cmp},
 {field:'after_pbs',headerName:'后块',width:120,sortable:true,comparator:cmp},
 {field:'before_line_no',headerName:'前行',width:78,sortable:true},
 {field:'line_no',headerName:'后行',width:78,sortable:true},
 {field:'kind',headerName:'类型',width:105,sortable:true},
 {field:'before_text',headerName:'前文末尾',minWidth:185,flex:1,sortable:false},
 {field:'after_text',headerName:'后文开头',minWidth:185,flex:1,sortable:false},
 {field:'reason',headerName:'检测依据',minWidth:210,flex:1,sortable:false},
 {field:'issue_id',headerName:'断块 ID',hide:true,sortable:false}
 ].map(c=>({pinned:null,sort:null,...c}));
}
