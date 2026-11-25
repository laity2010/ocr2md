import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import {createSnapshotSession} from './snapshot.js';
import {focusLogical} from '../v2-pane-focus.js';
export const tableValue='sql:logical_block';
const pbs=b=>[b.p,b.b,b.s].every(Number.isInteger)?'p'+b.p+'b'+b.b+'s'+b.s:'';
export function logicalRows(snapshot){
 return snapshot.blocks.map(b=>({pbs:pbs(b),block_type:b.blockType,md_block:b.text,
  logical_id:b.logicalId,base_blockid:b.baseBlockId,parent_id:b.parentId,
  logical_order:b.logicalOrder,p:b.p,b:b.b,s:b.s}));
}
export function logicalColumns(rows){
 const fit=(field,header,min,max)=>Math.max(min,Math.min(max,Math.max(header.length*9+54,...rows.map(r=>String(r[field]??'').length*9+30))));
 return ['pbs','block_type','md_block','logical_id','base_blockid','parent_id','logical_order','p','b','s'].map(field=>({
  field,headerName:{pbs:'PBS',block_type:'Type',md_block:'MD Block'}[field]??field,
  headerTooltip:field,tooltipField:field,resizable:true,editable:false,
  filter:EnumCheckboxFilter,filterValueGetter:p=>String(p.data?.[field]??''),
  suppressHeaderMenuButton:true,suppressHeaderFilterButton:false,
  sortable:!['pbs','block_type'].includes(field),pinned:field==='pbs'?'left':null,
  minWidth:field==='md_block'?290:field==='pbs'||field==='block_type'?72:85,
  width:field==='pbs'?fit(field,'PBS',80,180):field==='block_type'?fit(field,'Type',82,240):field==='md_block'?420:105
 }));
}
export function validatePDFMap(snapshot,map){
 const ids=new Map(snapshot.blocks.map(b=>[b.logicalId,b]));
 if(map?.logicalCount!==ids.size||!Array.isArray(map.covers)||!Array.isArray(map.unmappedLogicalIds)||
  map.covers.length+map.unmappedLogicalIds.length!==ids.size)throw Error('PDF 映射与逻辑快照数量不一致');
 const seen=new Set();
 for(const c of map.covers){const b=ids.get(c.logicalId);
  if(!b||seen.has(c.logicalId)||c.pbs!==pbs(b)||c.baseBlockId!==b.baseBlockId||c.logicalOrder!==b.logicalOrder)throw Error('PDF 映射已过期，请重新加载');
  seen.add(c.logicalId);
 }
 for(const id of map.unmappedLogicalIds){if(!ids.has(id)||seen.has(id))throw Error('PDF 未映射身份无效');seen.add(id);}
 return map;
}
export function createSentenceReview({report,showFrame}){
 const q=s=>document.querySelector(s),source=()=>q('#workspace #editor')?.v2SourcePort;
 const grid=()=>q('#workspace .ocr-outline-grid')?.sentenceGridPort;
 const pdf=()=>q('#workspace .ocr-preview-pdf-host')?.v2PDFPort;
 const session=createSnapshotSession({report});
 let snapshot=null,path='',serial=0,loadedPDFVersion='',pdfLoadingVersion='',wiredGrid=null;
 function navs(){return [...document.querySelectorAll('#workspace .ocr-source-file-select,#settings-workspace .ocr-source-file-select')];}
 function syncNav(){
  for(const nav of navs()){
   if(!nav.dataset.sentenceWired){
    nav.dataset.sentenceWired='yes';nav.addEventListener('change',()=>{if(nav.value===tableValue&&snapshot)open();});
   }
   let group=[...nav.querySelectorAll('optgroup')].find(g=>g.label==='SQL');
   if(snapshot){
    if(!group){group=document.createElement('optgroup');group.label='SQL';nav.append(group);}
    if(!group.querySelector('option'))group.append(new Option('逻辑表 · logical_block',tableValue));
   }else group?.remove();
  }
 }
 async function loadPDF(){
  const token=serial,version=snapshot?.documentVersion,book=path;
  if(!snapshot||loadedPDFVersion===version||pdfLoadingVersion===version||!pdf())return;
  pdfLoadingVersion=version;
  try{
   const response=await fetch('/labs/lab-ocr-v2/api/mineru-base/pdf-map?'+new URLSearchParams({workspace:book}),{method:'GET',credentials:'same-origin',cache:'no-store'});
   if(!response.ok)throw Error('HTTP '+response.status);
   const map=validatePDFMap(snapshot,await response.json());
   if(token!==serial)return;
   const ok=await pdf().load(book,map);
   if(token!==serial)return;
   if(!ok)throw Error('PDF 加载未完成');
   loadedPDFVersion=version;
  }catch(e){if(token===serial)report('逻辑表已加载 · PDF 不可用：'+e.message,'warning');}
  finally{if(token===serial)pdfLoadingVersion='';}
 }
 function open(){
  if(!snapshot)return;
  const work=q('#workspace');
  if(work.hidden)showFrame();
  const nav=q('#workspace .ocr-source-file-select');
  nav.value=tableValue;nav.ocrNavigationSelect?.tom.setValue(tableValue,true);
  // Native navigation select is authoritative; avoid recursive change events.
  report('V2 已保存逻辑表 · '+snapshot.blocks.length+' 块 · 只读','ok');
  void loadPDF();
 }
 function clear(){
  serial++;session.invalidate();snapshot=null;path='';loadedPDFVersion='';pdfLoadingVersion='';
  source()?.clear();grid()?.setRows([]);pdf()?.clear();syncNav();
 }
 async function load(book){
  const token=++serial,auto=!snapshot||path!==book;
  // Do not expose a previous book while the verified new book is loading.
  if(path&&path!==book){snapshot=null;path='';source()?.clear();grid()?.setRows([]);pdf()?.clear();syncNav();}
  const next=await session.load(book);
  if(token!==serial)return;
  if(!next){clear();return;}
  const changed=!snapshot||snapshot.documentVersion!==next.documentVersion||path!==book;
  snapshot=next;path=book;
  syncNav();
  const g=grid();
  if(!g||!source())throw Error('Frame 工作台接口未就绪');
  if(wiredGrid!==g){
   wiredGrid=g;g.onRowClicked(e=>{const row=snapshot?.blocks.find(b=>b.logicalId===e.data?.logical_id);if(row)focusLogical(row,'outline');});
  }
  if(changed){
   loadedPDFVersion='';pdfLoadingVersion='';pdf()?.clear();
   source().load(next,book);
   const rows=logicalRows(next);g.setColumns(logicalColumns(rows));g.setRows(rows);
  }
  const picker=q('#workspace .ocr-ag-module-select');
  picker.replaceChildren(new Option('逻辑块审阅','frame'));picker.value='frame';
  if(auto)open();else if(!q('#workspace').hidden)open();
 }
 document.addEventListener('v2-sync-focus',e=>grid()?.focusRow(e.detail?.logicalId));
 document.addEventListener('v2-pdf-status',e=>report(e.detail.text,e.detail.kind));
 return Object.freeze({load,clear,getSnapshot:()=>snapshot});
}
