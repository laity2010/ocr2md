/** WP2: standalone JSON-backed translation production UI.
 * No CMD document edits, sentence segmentation, or English arbitration here.
 */
import './translation-lab.css';
import {createGrid,AllCommunityModule,ModuleRegistry,themeQuartz} from 'ag-grid-community';
import {EditorView,basicSetup} from 'codemirror';
import {EditorState} from '@codemirror/state';
ModuleRegistry.registerModules([AllCommunityModule]);
const $=id=>document.getElementById(id);
const NAMES={gpt:'GPT',grok:'Grok',muse:'Muse'};
const JSON_HEADERS={'Content-Type':'application/json','X-OCR2MD-Translation-Lab':'1'};
let currentAI='gpt',currentTab='tasks',data=null,lastTask=null,uploadAction=null;
let promptDrafts=new Map(),promptVersions=new Map();
let pending=false;
const promptView=new EditorView({parent:$('prompt-editor'),
  state:EditorState.create({doc:'',extensions:[basicSetup,EditorView.lineWrapping,
    EditorView.updateListener.of(change=>{
      if(change.docChanged)promptDrafts.set(currentAI,change.state.doc.toString());
    })]})});
const theme=themeQuartz.withParams({accentColor:'#a7c080',backgroundColor:'#2d383b',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#263338',headerTextColor:'#d3c6aa',
  borderColor:'#4e6157',rowHoverColor:'#3b4c44',selectedRowBackgroundColor:'#425849',
  fontFamily:'"OCR2MD Sarasa",monospace',fontSize:12,spacing:3});
const grid=createGrid($('translation-grid'),{
 theme,columnDefs:[
  {field:'id',headerName:'句 ID',width:155,pinned:'left',checkboxSelection:true},
  {field:'original',headerName:'原句',flex:2,minWidth:220,tooltipField:'original'},
  {field:'changeType',headerName:'变更',width:96,valueFormatter:p=>({initial:'初次',unchanged:'未变',new:'新增',source_changed:'原句修改',structure_changed:'结构修改',renumbered:'仅编号变化'}[p.value]||p.value)},
  ...['gpt','grok','muse'].map(ai=>({colId:ai,headerName:NAMES[ai],width:88,
    valueGetter:p=>p.data?.state?.[ai]==='completed'?'✓ 已译':'— 缺译',
    cellStyle:p=>({color:p.data?.state?.[ai]==='completed'?'#a7c080':'#e4ad6c'})}))
 ],defaultColDef:{resizable:true,sortable:true,filter:true,suppressMovable:true},
 rowData:[],rowHeight:40,headerHeight:37,
 rowSelection:{mode:'multiRow',checkboxes:true,headerCheckbox:true,enableClickSelection:true},
 getRowId:p=>p.data.id,
 onSelectionChanged:()=>{$('selected-count').textContent='已选 '+grid.getSelectedRows().length;}
});
function notice(message,error=false){
  $('global-status').textContent=message;
  $('global-status').style.color=error?'#efaa81':'';
}
async function request(route,options={}){
  const isWrite=options.body!==undefined||options.method==='POST';
  const response=await fetch('./api/translation-lab/'+route,{
    method:isWrite?'POST':'GET',cache:'no-store',
    headers:isWrite?JSON_HEADERS:undefined,
    body:isWrite?JSON.stringify(options.body||{}):undefined});
  if(!response.ok)throw Error('HTTP '+response.status+' · '+await response.text());
  return response.json();
}
function download(name,packet){
 const blob=new Blob([JSON.stringify(packet,null,2)+'\n'],{type:'application/json'});
 const url=URL.createObjectURL(blob),anchor=document.createElement('a');
 anchor.href=url;anchor.download=name;document.body.append(anchor);anchor.click();anchor.remove();
 setTimeout(()=>URL.revokeObjectURL(url),1200);
}
function renderProviders(){
 const host=$('provider-cards');host.replaceChildren();
 for(const item of data.providers){
  const btn=document.createElement('button');btn.className='trn-ai-card'+
    (item.aiId===currentAI?' active':'');btn.type='button';
  btn.setAttribute('aria-pressed',String(item.aiId===currentAI));
  btn.dataset.ai=item.aiId;
  const label=document.createElement('span');label.className='name';label.textContent=NAMES[item.aiId];
  const count=document.createElement('span');count.className='count';
  count.textContent=item.covered+' / '+item.total;
  const bar=document.createElement('div');bar.className='coverage-bar';
  const progress=document.createElement('span');progress.style.width=
    (item.total?(item.covered/item.total)*100:0)+'%';bar.append(progress);
  const missing=document.createElement('span');missing.className='hint';
  missing.textContent='缺译 '+item.missing+' · 已译 '+item.covered;
  btn.append(label,count,bar,missing);
  btn.onclick=()=>{currentAI=item.aiId;lastTask=null;render();};
  host.append(btn);
 }
}
function updatePrompt(){
 if(!data?.prompts?.[currentAI])return;
 const info=data.prompts[currentAI];
 const replacement=promptDrafts.has(currentAI)?promptDrafts.get(currentAI):info.body;
 if(promptView.state.doc.toString()!==replacement)
   promptView.dispatch({changes:{from:0,to:promptView.state.doc.length,insert:replacement}});
 promptVersions.set(currentAI,info.promptVersion);
 $('prompt-version').textContent='Prompt SHA-256 '+info.promptVersion.slice(0,16);
 $('task-version').textContent='Prompt '+info.promptVersion.slice(0,12);
}
function updateTabs(){
 for(const button of $('work-tabs').querySelectorAll('button')){
  const selected=button.dataset.tab===currentTab;
  button.classList.toggle('active',selected);
  button.setAttribute('aria-selected',String(selected));
  $('panel-'+button.dataset.tab).hidden=!selected;
 }
 if(currentTab==='prompt')requestAnimationFrame(()=>promptView.requestMeasure());
}
function render(){
 if(!data)return;
 renderProviders();
 $('work-ai-name').textContent=NAMES[currentAI]+' · 工作台';
 $('filter-mode').value=window.__translationFilter||'all';
 $('unit-revision').textContent=data.ready?'句表 '+data.unitVersion.slice(0,12):'尚未导入句表';
 $('unit-revision').title=data.unitVersion||'';
 $('table-meta').textContent=(data.total||0)+' 条 · '+
   (data.rows?.length||0)+' 条符合当前过滤';
 $('work-version').textContent=data.ready?'版本 '+data.unitVersion.slice(0,12):'无句表';
 const active=data.providers.find(item=>item.aiId===currentAI);
 $('pending-count').textContent='缺译 '+active.missing+' / '+active.total;
 grid.setGridOption('rowData',data.rows||[]);
 grid.setGridOption('quickFilterText',$('search-units').value);
 updatePrompt();updateTabs();
 $('export-task').disabled=!data.ready;
 $('import-reply').disabled=!data.ready;
 $('import-history').disabled=!data.ready;
 $('publish-table').disabled=!data.ready;
 $('download-table').disabled=!data.ready;
 $('save-prompt').disabled=false;
 $('selected-count').textContent='已选 0';
 $('copy-task').disabled=!lastTask;
}
async function refresh(){
 try{
  data=await request('state?ai='+currentAI+'&filter='+($('filter-mode').value||'all'));
  render();
  notice(data.ready?'已连接 SQLite · 句表 '+data.total+' 条 · '+NAMES[currentAI]+' 覆盖 '+
    data.providers.find(p=>p.aiId===currentAI).covered+'/'+data.total:
    'SQLite 已就绪 · 请从分句 Lab 读取句表，或导入句表 JSON');
 }catch(error){notice('读取翻译 Lab 失败：'+error.message,true);}
}
async function action(label,fn){
 if(pending)return;
 pending=true;
 try{const result=await fn();notice(label+' · '+(result||'成功'));}
 catch(error){notice(label+'失败：'+error.message,true);}
 finally{pending=false;}
}
function chooseFile(callback){
 uploadAction=callback;$('json-file').value='';$('json-file').click();
}
$('json-file').onchange=async()=>{
 const file=$('json-file').files?.[0];if(!file||!uploadAction)return;
 await action('导入 '+file.name,async()=>{
  if(file.size>6*1024*1024)throw Error('JSON 超过 6 MB 限制');
  const packet=JSON.parse(await file.text());
  const result=await uploadAction(packet);
  await refresh();return JSON.stringify(result);
 });
};
$('reload').onclick=()=>refresh();
$('filter-mode').onchange=()=>{window.__translationFilter=$('filter-mode').value;refresh();};
$('search-units').oninput=()=>grid.setGridOption('quickFilterText',$('search-units').value);
$('work-tabs').onclick=event=>{
 const button=event.target.closest('button[data-tab]');
 if(button){currentTab=button.dataset.tab;updateTabs();}
};
$('import-upstream').onclick=()=>action('读取分句 Lab',async()=>{
 const result=await request('import-upstream',{method:'POST',body:{}});
 await refresh();return JSON.stringify(result);
});
$('import-sentences').onclick=()=>chooseFile(packet=>request('units',{body:packet}));
$('import-history').onclick=()=>chooseFile(packet=>request('historical',{
 body:{aiId:currentAI,table:packet}}));
$('save-prompt').onclick=()=>action('保存 Prompt',async()=>{
 const body=promptView.state.doc.toString();
 const result=await request('prompt',{body:{aiId:currentAI,body}});
 promptDrafts.delete(currentAI);await refresh();return result.promptVersion.slice(0,12);
});
$('export-task').onclick=()=>action('生成增量任务',async()=>{
 const force=$('force-selected').checked;
 const ids=force?grid.getSelectedRows().map(row=>row.id):undefined;
 if(force&&!ids?.length)throw Error('强制重译前请先在 AG 勾选句子');
 const task=await request('task',{body:{aiId:currentAI,...(force?{ids,force:true}:{})}});
 lastTask=task;
 $('task-preview').textContent=JSON.stringify({...task,rows:task.rows.slice(0,5)},null,2)+
   (task.rows.length>5?'\n… 余 '+(task.rows.length-5)+' 条在下载文件中':'');
 $('copy-task').disabled=false;
 download('task-'+task.aiId+'-'+task.unitVersion.slice(0,10)+'-'+task.taskId.slice(0,6)+'.json',task);
 return task.rows.length+' 条 · '+task.taskId.slice(0,12);
});
$('copy-task').onclick=async()=>{
 if(!lastTask)return;
 try{await navigator.clipboard.writeText(JSON.stringify(lastTask,null,2));notice('任务 JSON 已复制');}
 catch(error){notice('无法复制任务：'+error.message,true);}
};
$('import-reply').onclick=()=>chooseFile(async packet=>{
 const result=await request('reply',{body:packet});
 $('reply-info').textContent=NAMES[result.aiId]+' 本次接收 '+result.accepted+
   ' 条 · 当前已覆盖 '+result.covered+' 条'+(result.duplicate?' · 重复回件未写入':'');
 return result;
});
$('publish-table').onclick=()=>action('发布译表',async()=>{
 const result=await request('publish',{body:{aiId:currentAI}});
 return NAMES[currentAI]+' '+result.covered+'/'+result.total+' · 缺译 '+result.missing;
});
$('download-table').onclick=()=>action('导出译表',async()=>{
 const output=await request('table?ai='+currentAI);
 download('translated-'+currentAI+'-'+output.unitVersion.slice(0,12)+'.json',output);
 return output.covered+'/'+output.total+' · 缺译 '+output.missing;
});
async function loadVersion(){
 try{const response=await fetch('./healthz',{cache:'no-store'});
  if(!response.ok)return;const health=await response.json();
  $('build-version').textContent=health.version||'Lab';
 }catch{}
}
void loadVersion();void refresh();
