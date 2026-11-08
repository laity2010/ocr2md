/** Independent sentence-language AG module, following Media's compact facade.
 * Receives detached CMD sentence values, never EditorView/CMD internals.
 * Exports pure JSON, imports AI response only as REVIEW data. Does not write
 * Markdown, protected elements or translations into user files.
 */
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import {publishFocus} from './view-store.js';
import {prepareSentenceTranslationTask,validateSentenceTranslationReply} from './sentence-translation-core.js';
import './sentence-translation-module.css';
ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#81b29a',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',rowHoverColor:'#37464b',fontSize:13,
  fontFamily:'"OCR2MD Sarasa",monospace',spacing:3});
const copyRow=(row,ai)=>({sid:row.sid,line:row.line,from:row.from,to:row.to,
  source:row.source,checked:ai?.checked||'',translation:ai?.translation||'',
  status:ai?.status||'待处理',protected:row.protectedCount>0?'需结构复核':'—'});
/** Public ST03. All only shell/semantic IO flows; no direct CMD write API. */
export function createSentenceTranslationModule(host,{readSource,readSentences,getChapter,onStatus=()=>{}}){
  if(!host||typeof readSource!=='function'||typeof readSentences!=='function'||
    typeof getChapter!=='function')throw TypeError('分句翻译模块缺少只读 CMD 接口');
  host.classList.add('ocr-sentence-translation');
  const toolbar=document.createElement('div');toolbar.className='ocr-sentence-translation-toolbar';
  const exportButton=document.createElement('button');exportButton.type='button';
  exportButton.textContent='导出纯句子 JSON';exportButton.setAttribute('aria-label','导出分句翻译任务');
  const importButton=document.createElement('button');importButton.type='button';
  importButton.textContent='导入 AI 检查与翻译';importButton.setAttribute('aria-label','导入分句翻译结果');
  const input=document.createElement('input');input.type='file';input.accept='.json,application/json';
  input.hidden=true;input.setAttribute('aria-label','选择 AI 返回 JSON');
  const hint=document.createElement('span');hint.textContent='AI 结果仅供审阅，不自动回填正文';
  const gridHost=document.createElement('div');gridHost.className='ocr-sentence-translation-grid';
  toolbar.append(exportButton,importButton,input,hint);host.append(toolbar,gridHost);
  let disposed=false,active=false,scope=null,prepared=null,visible=[],allRows=[],sourceSnapshot=null;
  let translation=new Map();
  const columns=[
    {field:'line',headerName:'行号',width:80,pinned:'left',lockPinned:true},
    {field:'sid',headerName:'句子 ID',width:112},
    {field:'source',headerName:'纯文本原句',flex:2,minWidth:200},
    {field:'checked',headerName:'AI 检查原句',flex:2,minWidth:200},
    {field:'translation',headerName:'译句',flex:2,minWidth:200},
    {field:'protected',headerName:'结构',width:122},
    {field:'status',headerName:'状态',width:92},
  ].map(column=>({sortable:false,resizable:true,suppressMovable:true,...column}));
  const grid=createGrid(gridHost,{theme,columnDefs:columns,rowHeight:34,rowData:[],
    getRowId:p=>p.data.sid,
    rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
    onRowClicked:p=>{
      if(!p.data?.line)return;
      publishFocus({sourceLine:p.data.line,origin:'sentence-translation',
        intent:'click',elementId:p.data.sid});
    }});
  const chapterFilter=rows=>{
    const operation=scope?.operationScope;
    if(operation?.mode!=='chapter')return rows;
    const chapter=getChapter(operation.chapterId);
    return chapter?rows.filter(row=>row.from>=chapter.from&&row.to<=chapter.to):[];
  };
  const report=(message,kind)=>{onStatus(message,kind);};
  function refresh(){
    if(disposed)return;
    const source=readSource(),all=readSentences();
    if(typeof source!=='string'||!Array.isArray(all))throw Error('分句翻译 CMD 读取接口无效');
    const selected=chapterFilter(all);
    const signature=selected.map(row=>row.id).join('|');
    if(sourceSnapshot===source&&visible.map(x=>x.sid).join('|')===signature)return;
    sourceSnapshot=source;
    translation=new Map();
    prepared=null;visible=[];allRows=[];
    if(!selected.length){
      prepared=null;visible=[];allRows=[];grid.setGridOption('rowData',[]);
      report('分句翻译：暂无已标定句子，请先到「分句」完成标定');return;
    }
    try{prepared=prepareSentenceTranslationTask(source,selected);}
    catch(error){grid.setGridOption('rowData',[]);
      report('分句翻译：'+error.message+'，请重新分句标定','error');return;}
    const original=new Map(selected.map(row=>[row.id,row]));
    visible=prepared.mapping.map(map=>({sid:map.sid,from:original.get(map.sid)?.from,
      to:original.get(map.sid)?.to,line:original.get(map.sid)?.line,
      source:prepared.task.sentences.find(s=>s.sid===map.sid).source,
      protectedCount:map.protectedCount}));
    allRows=visible.map(row=>copyRow(row));
    grid.setGridOption('rowData',allRows);
    report(`分句翻译：${allRows.length} 句纯文本 · 请导出 AI 任务`);
  }
  function exportTask(){
    refresh();
    if(!prepared||!prepared.task.sentences.length)throw Error('请先完成分句标定');
    const file=new Blob([JSON.stringify(prepared.task,null,2)+'\n'],{type:'application/json'});
    const url=URL.createObjectURL(file);
    try{
      const link=document.createElement('a');link.href=url;
      link.download='ocr2md-sentences-'+prepared.task.sourceVersion+'.json';
      host.append(link);link.click();link.remove();
    }finally{queueMicrotask(()=>URL.revokeObjectURL(url));}
    report(`已导出 ${prepared.task.sentences.length} 个纯句子，不含公式和 CMD 标签`);
    return prepared.task;
  }
  function importResponse(response){
    refresh();
    if(!prepared)throw Error('句表已失效，请先重新分句标定');
    const checked=validateSentenceTranslationReply(prepared,response,readSource());
    const byId=new Map(checked.rows.map(row=>[row.sid,row]));
    translation=byId;
    // Preserve mounted AG rows and user scroll; only change actual review cells.
    for(const original of visible){
      const ai=byId.get(original.sid),node=grid.getRowNode(original.sid);
      const row=allRows.find(item=>item.sid===original.sid);
      if(!row||!ai)continue;
      row.checked=ai.checked;row.translation=ai.translation;row.status=ai.status;
      row.protected=ai.placementReview?'需结构复核':'—';
      if(node){for(const field of ['checked','translation','status','protected'])
        node.setDataValue(field,row[field]);}
    }
    report(`收到 ${checked.rows.length} 句 AI 结果 · 仅供审阅，未改写 CMD`);
    return checked;
  }
  exportButton.addEventListener('click',()=>{
    try{exportTask();}catch(error){report('分句翻译导出失败：'+error.message,'error');}
  });
  importButton.addEventListener('click',()=>input.click());
  input.addEventListener('change',async()=>{
    const file=input.files?.[0];input.value='';if(!file)return;
    try{
      if(file.size>8*1024*1024)throw Error('AI 回包不可超过 8 MB');
      const response=JSON.parse(await file.text());
      importResponse(response);
    }catch(error){report('分句翻译导入失败：'+error.message,'error');}
  });
  return Object.freeze({
    setActive(enabled){active=Boolean(enabled);host.hidden=!active;if(active){try{refresh();}catch(error){report('分句翻译：'+error.message,'error');}}},
    setVirtualQuery(query){scope=query;if(active)refresh();},
    refresh(){if(active)refresh();},
    count(chapter){const rows=readSentences();if(chapter==='all')return rows.length;
      const current=getChapter(chapter);return current?rows.filter(row=>row.from>=current.from&&row.to<=current.to).length:0;},
    exportTask,importResponse,
    dispose(){disposed=true;grid.destroy();host.replaceChildren();},
  });
}
