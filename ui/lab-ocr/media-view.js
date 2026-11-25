/** Lab OCR Media view: Main's image-reference scanner and resumable Media service,
 * but ONLY Lab book-scoped API and the resident CM6 document are writable.
 * No independent AG grid, SQL media table, or raw Markdown copy exists here.
 */
import {findMedia} from '../media-module.js';
import {findBareMedia} from '../v2-bare-media.js';
import {mediaFileUrl,retryLocalImage} from '../v2-media-url.js';

const LOCAL=/^media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp)$/;
const approvedPath=value=>typeof value==='string'&&LOCAL.test(value);
const percent=(bytes,total)=>Number.isFinite(total)&&total>0?
  `${Math.floor(bytes/total*100)}%`:`${bytes||0} B`;

// Lab-only MinerU image adapter. Main's Media scanner deliberately remains
// unchanged after the confirmed-good d813e4c rollback. Markdown images in
// this book use ![image](<https://...jpg>); the angle characters belong to
// Markdown syntax, not the URL replacement span.
const MINERU_IMAGE=/!\[[^\]\n]*\]\(<(https?:\/\/[^<>\s)]+|media\/[0-9a-f]{24}\.(?:jpe?g|png|gif|webp))>\)/g;
/** Public M00: shared Main scan plus Lab MinerU angle destinations, read-only. */
export function findLabMedia(source){
  if(typeof source!=='string')throw Error('媒体扫描需要 Markdown 字符串');
  const refs=findMedia(source);
  const evidence=[...source.matchAll(/<!--\s*minerujson:(?!block:v1:)[\s\S]*?-->/g)]
    .map(item=>[item.index,item.index+item[0].length]);
  const additional=[...source.matchAll(MINERU_IMAGE)].map(match=>{
    const url=match[1];
    // Match directly to the URL captured inside < >, never include wrappers.
    const from=match.index+match[0].lastIndexOf(url),to=from+url.length;
    return {id:String(from),from,to,url,local:url.startsWith('media/'),
      status:url.startsWith('media/')?'本地':'待下载',bytes:0,total:null};
  }).filter(ref=>!evidence.some(([start,end])=>ref.from<end&&ref.to>start));
  const ordered=[...refs,...additional,...findBareMedia(source)].sort((a,b)=>a.from-b.from);
  let currentLine=1,last=0;
  for(const ref of ordered){
    for(let position=last;position<ref.from;position++)
      if(source.charCodeAt(position)===10)currentLine++;
    ref.line=currentLine;last=ref.from;
  }
  return ordered;
}

/** Public M01: pure, read-only media AG projection from live Markdown + disk inventory. */
export function projectLabMedia({source,mdRows,blocks=[],inventory=[],states=new Map(),running=new Set()}={}){
  if(typeof source!=='string'||!Array.isArray(mdRows))throw Error('媒体视图缺少 CM6 Markdown');
  const byBlock=new Map(blocks.map(row=>[row.block_id,row]));
  const linked=new Set();
  const refs=findLabMedia(source).map(ref=>{
    const row=mdRows[ref.line-1];
    if(!row||row.line_no!==ref.line)throw Error('媒体链接行号与 CM6 不一致');
    const state=states.get(ref.url)??{};
    const local=ref.local;
    const localPath=local?ref.url:approvedPath(state.path)&&state.state==='complete'?state.path:null;
    if(localPath)linked.add(localPath);
    const block=byBlock.get(row.block_id);
    const status=local?'本地':running.has(ref.url)?'下载中':
      ({complete:'已下载',partial:'部分下载',paused:'已暂停',error:'失败'}[state.state]??'待下载');
    const action=local?'—':running.has(ref.url)?'暂停':
      ['部分下载','已暂停','失败'].includes(status)?'续传':
      status==='已下载'?'替换引用':'下载';
    return {media_row_id:`ref:${row.line_id}:${ref.from}`,url:ref.url,local,
      source_from:ref.from,source_to:ref.to,line_no:ref.line,line_id:row.line_id,
      block_id:row.block_id,pbs:block?.pbs??'',
      source_kind:local?'本地':'远端',adopted:'已采用',
      status,action,
      bytes:Number(state.bytes)||0,total:Number(state.total)||0,
      progress:local?'—':state.state==='complete'?'100%':percent(state.bytes,state.total),
      preview_path:localPath??ref.url};
  });
  for(const file of inventory){
    if(!approvedPath(file.path)||linked.has(file.path))continue;
    refs.push({media_row_id:'file:'+file.path,url:file.path,local:true,
      source_from:null,source_to:null,line_no:null,line_id:null,block_id:null,pbs:'',
      source_kind:'本地',adopted:'未引用',status:'本地',action:'—',bytes:file.bytes||0,
      total:file.bytes||0,progress:'—',preview_path:file.path});
  }
  return refs;
}

/** Public M02: one controller with an existing AG and one CM6 replacement port. */
export function createLabOcrMediaView({request,read,replace,onChanged,onStatus=()=>{}}){
  if([request,read,replace,onChanged].some(fn=>typeof fn!=='function'))
    throw Error('媒体适配器缺少公开端口');
  let book='',inventory=[],active=false,epoch=0,bulk=false,disposed=false;
  const states=new Map(),running=new Set(),paused=new Set();
  const context=()=>{
    const ctx=read();
    if(ctx?.workspace!==book){book=ctx?.workspace??'';inventory=[];states.clear();
      paused.clear();epoch++;}
    return ctx;
  };
  const rows=()=>{
    const ctx=context();
    if(!ctx?.mdRows)return [];
    return projectLabMedia({source:ctx.source,mdRows:ctx.mdRows,blocks:ctx.blocks,
      inventory,states,running});
  };
  const notify=()=>{if(active&&!disposed)onChanged(rows());};
  const fileUrl=path=>{
    const ctx=context();
    return mediaFileUrl(ctx?.workspace,path);
  };
  function previewCell(params){
    const row=params.data;
    if(!row)return '';
    const link=document.createElement('a');link.className='ocr-lab-media-preview';
    const src=approvedPath(row.preview_path)?fileUrl(row.preview_path):row.preview_path;
    link.href=src;link.target='_blank';link.rel='noopener noreferrer';
    link.title='打开媒体原图（新窗口）';link.onclick=event=>event.stopPropagation();
    const image=document.createElement('img');image.className='ocr-lab-media-thumb';
    image.loading='eager';image.alt='媒体缩略图';
    const failure=()=>{image.hidden=true;link.title='无法预览 · 点击打开原图';if(!link.querySelector('.ocr-lab-media-error')){const label=document.createElement('span');label.className='ocr-lab-media-error';label.textContent='无法预览';link.append(label);}};
    image.addEventListener('load',()=>{image.hidden=false;link.querySelector('.ocr-lab-media-error')?.remove();link.title='打开媒体原图（新窗口）';});
    if(approvedPath(row.preview_path)&&src)retryLocalImage(image,src,failure);else image.addEventListener('error',failure);
    link.append(image);if(src)image.src=src;else failure();return link;
  }
  function actionCell(params){
    const row=params.data;
    if(!row||row.local)return '—';
    const button=document.createElement('button');button.type='button';
    button.className='ocr-lab-media-action';button.dataset.url=row.url;
    button.textContent=row.action;
    button.onclick=event=>{
      event.stopPropagation();
      if(running.has(row.url)){paused.add(row.url);onStatus('媒体将在本次分块后暂停');return;}
      if(row.status==='已下载'){
        const state=states.get(row.url);
        if(state?.path&&approvedPath(state.path)){try{adopt(new Map([[row.url,state.path]]));}catch(error){onStatus('媒体替换失败：'+error.message,'error');}}
        return;
      }
      void downloadOne(row.url).catch(error=>onStatus('媒体下载失败：'+error.message,'error'));
    };
    return button;
  }
  function adopt(completed){
    const ctx=context();
    if(disposed||!ctx?.mdRows)return 0;
    // Re-scan AFTER network I/O; offsets may have changed while downloading.
    const edits=findLabMedia(ctx.source).filter(item=>!item.local&&completed.has(item.url))
      .map(item=>({from:item.from,to:item.to,expected:item.url,insert:completed.get(item.url)}));
    if(!edits.length)return 0;
    const result=replace(edits); // one guarded CM6 history transaction, no SQL writes here
    onStatus(`✓ 已将 ${result.changed} 处媒体链接替换为本地路径 · CM6 可撤销，后台保存 SQLite`,'ok');
    notify();return result.changed;
  }
  async function scan(){
    const ctx=context();if(!ctx?.workspace||!ctx.mdRows)return [];
    const snapshot=ctx.workspace,seq=++epoch;
    notify();
    const urls=[...new Set(findLabMedia(ctx.source).filter(x=>!x.local).map(x=>x.url))];
    const [files,...progress]=await Promise.allSettled([
      request('media-inventory',{workspace:snapshot}),
      ...urls.map(url=>request('media-status',{workspace:snapshot,url}))]);
    if(disposed||seq!==epoch||snapshot!==context()?.workspace)return [];
    if(files.status==='fulfilled')inventory=Array.isArray(files.value.files)?files.value.files:[];
    else onStatus('媒体目录读取失败：'+files.reason.message,'warning');
    let failed=0;
    progress.forEach((item,i)=>{
      if(item.status==='fulfilled')states.set(urls[i],item.value);
      else {failed++;states.set(urls[i],{state:'error',error:item.reason.message});}
    });
    notify();
    onStatus(`媒体 ${rows().length} 项 · 远端 ${urls.length} 个链接 · 本地 ${rows().filter(x=>x.local).length} 项`+
      (failed?` · ${failed} 个远端状态不可用`:''),failed?'warning':'ok');
    return rows();
  }
  async function downloadOne(url,{deferAdoption=false,expectedBook=null}={}){
    const ctx=context(),scope=expectedBook??ctx?.workspace;
    if(!scope||scope!==ctx?.workspace)throw Error('书籍已切换');
    if(running.has(url))return false;
    if(!findLabMedia(ctx.source).some(item=>item.url===url&&!item.local))return false;
    paused.delete(url);running.add(url);notify();
    try{
      for(;;){
        if(paused.has(url)){
          const prior=states.get(url)??{};
          states.set(url,{...prior,state:'paused'});
          onStatus('媒体下载已暂停；可点击续传','warning');return false;
        }
        const state=await request('media-chunk',{workspace:scope,url},true);
        if(disposed||context()?.workspace!==scope)throw Error('书籍已切换，停止旧下载');
        states.set(url,state);notify();
        if(state.state==='complete'){
          if(!approvedPath(state.path))throw Error('服务返回非法媒体路径');
          if(!inventory.some(item=>item.path===state.path))
            inventory.push({path:state.path,bytes:state.bytes});
          if(!deferAdoption)adopt(new Map([[url,state.path]]));
          else onStatus('媒体已下载到 media/，等待批量替换 CM6 引用','ok');
          return true;
        }
        if(state.state!=='partial'||!Number.isFinite(state.bytes))
          throw Error('媒体断点续传状态异常');
      }
    }catch(error){
      if(context()?.workspace===scope){
        states.set(url,{...states.get(url),state:'error'});
        onStatus('媒体下载失败：'+error.message,'error');
      }
      return false;
    }finally{running.delete(url);paused.delete(url);notify();}
  }
  async function downloadAll(){
    if(bulk)return;
    const ctx=context();if(!ctx?.mdRows)return;
    bulk=true;const scope=ctx.workspace;
    try{
      const urls=[...new Set(findLabMedia(ctx.source).filter(r=>!r.local).map(r=>r.url))];
      const completed=new Map();
      for(const url of urls){
        if(disposed||context()?.workspace!==scope)break;
        const prior=states.get(url);
        if(prior?.state==='complete'&&approvedPath(prior.path)){
          completed.set(url,prior.path);continue;
        }
        if(await downloadOne(url,{deferAdoption:true,expectedBook:scope})){
          const state=states.get(url);
          if(approvedPath(state?.path))completed.set(url,state.path);
        }
      }
      if(!disposed&&scope===context()?.workspace&&completed.size)adopt(completed);
      else if(!urls.length)onStatus('当前 Markdown 没有待下载的远端图片');
    }finally{bulk=false;notify();}
  }
  return Object.freeze({rows,scan,downloadOne,downloadAll,previewCell,actionCell,
    setActive(value){active=Boolean(value);if(active)notify();},
    dispose(){disposed=true;epoch++;paused.clear();running.clear();},
    get busy(){return bulk||running.size>0;}});
}
