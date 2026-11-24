/** WP29 adapter: V1 Media controller, current V2 common line index and
 * one native CM6 replaceMdLines transaction. No second document or table. */
import {findLabMedia} from './lab-ocr/media-view.js';
export const MEDIA_API='/labs/lab-ocr-v2/api/mineru-base/';
export function mediaFileUrl(workspace,path){
 if(!workspace||!/^media\/[0-9a-f]{24}\.(?:jpg|jpeg|png|gif|webp)$/.test(path??''))return null;
 return MEDIA_API+'media-file?'+new URLSearchParams({workspace,path});
}
/** Read-only preview lookup; the existing authorized status API decides whether
 * the exact remote URL already has a complete local file. Never downloads. */
export async function resolveMediaPreviewUrl(workspace,remote){
 if(!workspace||typeof remote!=='string'||remote.length>2048||remote.includes('\\'))return null;
 let parsed;try{parsed=new URL(remote);}catch{return null;}
 if(parsed.protocol!=='https:'||parsed.hostname!=='cdn-mineru.openxlab.org.cn'||
    parsed.port||parsed.username||parsed.password||parsed.hash||
    !/\.(?:jpe?g|png|gif|webp)$/i.test(parsed.pathname))return null;
 try{
  const response=await fetch(MEDIA_API+'media-status?'+new URLSearchParams({workspace,url:remote}),
    {credentials:'same-origin',cache:'no-store'});
  if(!response.ok)return null;
  const status=await response.json();
  return status.state==='complete'?mediaFileUrl(workspace,status.path):null;
 }catch{return null;}
}
export function mediaContext(workspace,source,index){
 if(!index)return {workspace,source:'',mdRows:null,blocks:[]};
 const blocks=new Map();
 const mdRows=index.rows.map(r=>{
  if(!blocks.has(r.logical_id))blocks.set(r.logical_id,{block_id:r.logical_id,pbs:r.pbs});
  return {line_no:r.source_line,line_id:r.logical_id+'/'+r.line_offset,block_id:r.logical_id,text:r.md_line};
 });
 // EOF is not a physical MD Line and cannot contain a media reference.
 return {workspace,source,mdRows,blocks:[...blocks.values()]};
}
export function planMediaEdits(index,source,edits){
 if(!index||!Array.isArray(edits))throw Error('媒体链接修订无效');
 const current=findLabMedia(source),groups=new Map(),used=new Set();
 for(const e of edits){
  if(!e||!Number.isInteger(e.from)||!Number.isInteger(e.to)||used.has(e.from)||
    !/^media\/[0-9a-f]{24}\.(?:jpg|jpeg|png|gif|webp)$/.test(e.insert??'')||
    !current.some(r=>!r.local&&r.from===e.from&&r.to===e.to&&r.url===e.expected))
   throw Error('媒体链接位置或原始证据已变化');
  const line=index.atOffset(e.from);
  if(!line||e.to>line.textTo||source.slice(e.from,e.to)!==e.expected)
   throw Error('媒体链接不在当前物理行');
  used.add(e.from);
  const list=groups.get(line.source_line)??[];list.push(e);groups.set(line.source_line,list);
 }
 return [...groups].map(([lineNo,list])=>{
  const line=index.atSourceLine(lineNo);
  let after=line.md_line;
  for(const e of list.sort((a,b)=>b.from-a.from))
   after=after.slice(0,e.from-line.from)+e.insert+after.slice(e.to-line.from);
  return {ref:index.makeRef(lineNo),beforeText:line.md_line,afterText:after};
 });
}
export function resolveMediaRow(index,source,row){
 if(!index||!row?.line_id||!Number.isInteger(row.source_from))return null;
 const line=index.atOffset(row.source_from);
 return line&&line.logical_id===row.block_id&&line.source_line===row.line_no&&
  row.source_to<=line.textTo&&source.slice(row.source_from,row.source_to)===row.url&&
  findLabMedia(source).some(r=>r.from===row.source_from&&r.to===row.source_to&&r.url===row.url)?line:null;
}
const cmp=(a,b)=>String(a??'').localeCompare(String(b??''),'en',{numeric:true});
export function mediaColumns(controller){
 return [
 {field:'preview_path',headerName:'预览',width:104,sortable:false,cellRenderer:controller.previewCell},
 {field:'line_no',headerName:'源码行',width:88,sortable:true,sort:'asc',pinned:'left',lockPinned:true,lockPosition:'left'},
 {field:'pbs',headerName:'PBS',width:110,sortable:true,comparator:cmp,pinned:'left',lockPinned:true,lockPosition:'left'},
 {field:'source_kind',headerName:'来源',width:86,sortable:true},
 {field:'status',headerName:'状态',width:102,sortable:true},
 {field:'progress',headerName:'进度',width:102,sortable:false},
 {field:'adopted',headerName:'引用',width:84,sortable:true},
 {field:'url',headerName:'媒体链接',flex:2,minWidth:245,sortable:false},
 {field:'action',headerName:'操作',width:99,sortable:false,pinned:'right',lockPinned:true,lockPosition:'right',cellRenderer:controller.actionCell},
 {field:'media_row_id',headerName:'媒体行 ID',hide:true,sortable:false}
 ].map(c=>({pinned:null,sort:null,...c}));
}
