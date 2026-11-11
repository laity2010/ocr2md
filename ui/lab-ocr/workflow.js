/** Lab OCR workflow port: saved workspace -> authorized import -> SQL navigation.
 * UI never reads disk or SQLite; those belong to the isolated OCR API.
 */
const ENDPOINT='/labs/lab-ocr/api/ocr/';
const NAV_VALUE='sql:minerujson';
const COLUMNS=Object.freeze([
  {field:'global_page',headerName:'页（0起）',width:112,sortable:true,filter:'agNumberColumnFilter'},
  {field:'source_name',headerName:'源 JSON',width:170,sortable:true,filter:true},
  {field:'local_page',headerName:'分段页',width:95,sortable:true,filter:'agNumberColumnFilter'},
  {field:'block_group',headerName:'原始数组',width:145,sortable:true,filter:true},
  {field:'block_index',headerName:'块序号',width:102,sortable:true,filter:'agNumberColumnFilter'},
  {field:'block_type',headerName:'块类型',width:120,sortable:true,filter:true},
  {field:'bbox_json',headerName:'覆盖框',width:158,sortable:false,filter:false},
  {field:'text_preview',headerName:'内容预览',flex:1,minWidth:250,sortable:false,filter:true},
  {field:'block_json',headerName:'原始块 JSON',width:280,hide:true,sortable:false,filter:false},
]);
async function request(op,params,post=false){
  const url=new URL(ENDPOINT+op,location.origin);
  if(!post)for(const [key,value] of Object.entries(params))url.searchParams.set(key,String(value));
  const response=await fetch(url,{cache:'no-store',credentials:'same-origin',
    ...(post?{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(params)}:{})});
  if(!response.ok){
    let reason='HTTP '+response.status;
    try{const body=await response.json();reason=body.error||reason;}catch{}
    if(response.status===403)reason='需要 Main 编辑授权：'+reason;
    throw Error(reason);
  }
  return response.json();
}

export function createLabOcrWorkflow({io,frame,navigation,settingsRoot,onStatus,showModule}){
  let workspace='',tableReady=false,operation=0,loaded=0;
  const sqlReady=()=>tableReady;
  async function savedWorkspace(){
    const snapshot=await io.readSnapshot();
    const settings=JSON.parse(snapshot.text)?.settings;
    const value=settings?.['workspace.dataDirectory']?.value;
    return typeof value==='string'?value.trim():'';
  }
  function revealNavigation(){
    for(const select of [navigation,settingsRoot.querySelector('.ocr-source-file-select')]){
      if(!select||select.querySelector(`option[value="${NAV_VALUE}"]`))continue;
      const group=document.createElement('optgroup');group.label='SQL';
      group.append(new Option('minerujson',NAV_VALUE));select.append(group);
    }
  }
  function hideNavigation(){
    for(const select of [navigation,settingsRoot.querySelector('.ocr-source-file-select')]){
      const group=[...select?.querySelectorAll('optgroup')||[]].find(e=>e.label==='SQL');
      if(group)group.remove();
    }
  }
  async function inspectAndImport(nextWorkspace){
    const epoch=++operation;
    workspace=nextWorkspace;
    tableReady=false;hideNavigation();frame.clearSqlRows();
    if(!workspace){onStatus('请在全局设置中绑定书籍工作目录','warning');return false;}
    onStatus('检查工作区：MinerU JSON 与 PDF…','info');
    try{
      const result=await request('inspect',{workspace});
      if(epoch!==operation)return false;
      if(result.status==='changed'){
        // Do not auto-overwrite reviewed/imported source material.
        tableReady=result.blocks>0;
        if(tableReady)revealNavigation();
        onStatus('源 JSON 已变化：保留旧 SQL，不自动覆盖；请人工确认重新导入','warning');
        return tableReady;
      }
      if(result.status==='ready'){
        onStatus(`发现 ${result.pages} 页 MinerU JSON 和 PDF，首次导入 SQLite…`,'info');
        const imported=await request('import',{workspace},true);
        if(epoch!==operation)return false;
        if(!['imported','unchanged'].includes(imported.status))throw Error('导入结果异常：'+imported.status);
        onStatus(`SQL 导入成功：${imported.pages} 页、${imported.blocks} 行；请选择导航 SQL → minerujson`,'ok');
      }else{
        onStatus(`工作区已绑定，SQL 共 ${result.blocks} 行；请选择导航 SQL → minerujson`,'ok');
      }
      tableReady=true;revealNavigation();return true;
    }catch(error){
      if(epoch===operation){tableReady=false;hideNavigation();
        onStatus('工作区检查或 SQL 导入失败：'+error.message,'error');}
      return false;
    }
  }
  async function initialize(){
    const saved=await savedWorkspace();
    if(!saved){workspace='';tableReady=false;return false;}
    await inspectAndImport(saved);
    return true;
  }
  async function afterSave(){
    const saved=await savedWorkspace();
    if(!saved){++operation;workspace='';tableReady=false;hideNavigation();
      frame.clearSqlRows();await showModule('settings');
      onStatus('尚未绑定工作区，请在全局设置中选择书籍目录','warning');return;}
    const success=await inspectAndImport(saved);
    if(success)await showModule('frame');
  }
  async function openSql(){
    if(!tableReady||!workspace){onStatus('请先绑定工作区并完成 MinerU JSON 导入','warning');return;}
    const id=++loaded;
    onStatus('正在从 SQLite 加载 minerujson 表…','info');
    try{
      const entries=[];let offset=0,total=0;
      do{
        const page=await request('rows',{workspace,offset,limit:200});
        if(id!==loaded)return;
        if(offset===0)total=page.total;
        if(total>10000)throw Error('当前 AG 单次显示上限为 10000 行，请缩小数据范围');
        if(!page.rows.length&&offset<total)throw Error('SQL 分页提前结束');
        entries.push(...page.rows);offset=entries.length;
      }while(offset<total);
      frame.showSqlRows(entries,COLUMNS.map(column=>({...column})));
      onStatus(`SQL · minerujson：已显示 ${entries.length} 行（全量原始数据保存在 SQLite）`,'ok');
    }catch(error){onStatus('SQL 行读取失败：'+error.message,'error');}
  }
  return Object.freeze({savedWorkspace,initialize,afterSave,openSql,sqlReady,refreshNavigation:revealNavigation});
}
