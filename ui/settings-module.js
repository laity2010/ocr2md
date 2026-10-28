/** Public WCP Settings module: registrations + three synchronized projections.
 * No file access, no cross-module DOM mutation. CMD owns JSON and persistence.
 */
import {createDockview,themeAbyss} from 'dockview';
import {readPaneRatios,applyPaneRatios} from './pane-layout-ratios.js';
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {openCMDJsonSource,readCMDJsonSnapshot} from './cmd-json-source.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import './ag-enum-filter-shared.css';
import './settings-module.css';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function createSettingsModule(container,onStatus=()=>{},directoryPort=null){
  const definitions=new Map(),applied=new Map();
  let records=new Map();
  let source=null,grid=null,dockview=null,loadPromise=null,initialPromise=null,slider=null,valueLabel=null,details=null;
  let agHost=null,sourceHost=null,previewHost=null;
  let activeKey=null,invalid=false,locatingFromGrid=false;
  let renderedSignature=null,savedRootValue='',savedBookValue='',pathInput=null;
  function entry(key){const item=definitions.get(key);if(!item)throw Error('Unregistered setting: '+key);return item;}
  function register(definition){
    const {module,key,category,label,comment,type,control,defaultValue,min,max,step,message,unit}=definition;
    const numberSetting=type==='number'&&control==='slider'&&
      Number.isFinite(min)&&Number.isFinite(max)&&max>min&&
      Number.isFinite(defaultValue)&&defaultValue>=min&&defaultValue<=max&&
      Number.isFinite(step)&&step>0;
    const directorySetting=type==='path'&&control==='directory'&&
      typeof defaultValue==='string'&&directoryPort&&
      typeof directoryPort.roots==='function'&&typeof directoryPort.browse==='function';
    if(!module||typeof key!=='string'||!/\w+(?:\.\w+)+$/.test(key)||
       !Array.isArray(category)||category.length!==2||!category.every(v=>typeof v==='string'&&v)||
       !label||(comment!==undefined&&typeof comment!=='string')||message!=='settings.changed'||
       !(numberSetting||directorySetting)||(unit!==undefined&&typeof unit!=='string'))
      throw Error('Invalid settings registration');
    if(definitions.has(key))throw Error('Duplicate settings key: '+key);
    definitions.set(key,Object.freeze({...definition,category:Object.freeze([...category])}));
    // A new module may register after the settings editor is already open.
    // Add its initial record through CMD's undoable text transaction.
    if(source)ensureRegisteredRecords();
    if(!activeKey)activeKey=key;
    refreshGrid();grid?.refreshHeader();renderPreview();
  }
  function subscribe({module,key},handler){
    if(!module||typeof handler!=='function'||entry(key).module!==module)
      throw Error('Subscriber must own this setting');
    const listener=event=>{if(event.detail.key===key)handler(event.detail);};
    container.addEventListener('settings.changed',listener);
    if(applied.has(key))handler({topic:'settings.changed',key,value:applied.get(key),origin:'initial'});
    return ()=>container.removeEventListener('settings.changed',listener);
  }
  // Module declarations supply defaults and hard safety bounds. The editable
  // JSON record is authoritative for category/comment/value/control range.
  function defaultRecord(item,value=item.defaultValue,comment=item.comment||item.label){
    return {key:item.key.split('.').at(-1),category1:item.category[0],
      category2:item.category[1],comment,value,
      range:item.type==='path'?{kind:'server-directory'}:{min:item.min,max:item.max,step:item.step}};
  }
  function recordFor(key){return records.get(key)||defaultRecord(entry(key));}
  function normaliseDocument(data){
    if(!data||typeof data!=='object'||Array.isArray(data))return null;
    if(data.settings && typeof data.settings==='object'&&!Array.isArray(data.settings)){
      const missing=[...definitions.values()].filter(item=>!Object.hasOwn(data.settings,item.key));
      if(!missing.length)return data;
      const copy=structuredClone(data);
      for(const item of missing)copy.settings[item.key]=defaultRecord(item);
      return copy;
    }
    // Pre-existing V6 settings used nested scalar keys and a separate
    // $comments map. Migrate on opening the CM6 document as one undoable
    // edit, without an implicit write. Keep unrelated source data archived.
    const archived=structuredClone(data),converted={settings:{}};
    for(const item of definitions.values()){
      const prior=valueAt(data,item.key);
      const comment=data.$comments?.[item.key];
      converted.settings[item.key]=defaultRecord(item,
        prior===undefined?item.defaultValue:prior,
        typeof comment==='string'?comment:item.comment||item.label);
      let branch=archived;
      const parts=item.key.split('.');
      for(const name of parts.slice(0,-1))branch=branch?.[name];
      if(branch && typeof branch==='object')delete branch[parts.at(-1)];
    }
    function dropEmpty(obj){
      if(!obj||typeof obj!=='object'||Array.isArray(obj))return;
      for(const [key,value]of Object.entries(obj)){
        dropEmpty(value);
        if(value && typeof value==='object'&&!Array.isArray(value)&&!Object.keys(value).length)
          delete obj[key];
      }
    }
    delete archived.$comments;
    dropEmpty(archived);
    if(Object.keys(archived).length)converted.$legacy=archived;
    return converted;
  }
  function ensureRegisteredRecords(){
    if(!source)return false;
    const data=source.readJSON(),updated=normaliseDocument(data);
    if(updated===data)return false;
    source.replaceDocument(JSON.stringify(updated,null,2)+'\n');
    return true;
  }
  function showSelectedRow({reveal=false}={}){
    if(!grid||!activeKey)return;
    const node=grid.getRowNode(activeKey);
    if(!node)return;
    if(reveal && node.rowIndex==null){
      grid.setFilterModel(null);grid.onFilterChanged();
    }
    node.setSelected(true);
    if(reveal)grid.ensureNodeVisible(node,'middle');
  }
  function valueAt(object,key){
    return key.split('.').reduce((value,part)=>value&&typeof value==='object'?value[part]:undefined,object);
  }
  function isValid(item,record){
    if(!record||typeof record!=='object'||Array.isArray(record))return false;
    const range=record.range;
    if(item.type==='path')return record.key===item.key.split('.').at(-1)&&
      typeof record.category1==='string'&&typeof record.category2==='string'&&
      typeof record.comment==='string'&&range?.kind==='server-directory'&&
      typeof record.value==='string'&&record.value.length<=1024&&
      !/[\x00\r\n]/.test(record.value);
    return record.key===item.key.split('.').at(-1)&&
      typeof record.category1==='string'&&record.category1.length>0&&
      typeof record.category2==='string'&&record.category2.length>0&&
      typeof record.comment==='string'&&
      range&&typeof range==='object'&&!Array.isArray(range)&&
      Number.isFinite(range.min)&&Number.isFinite(range.max)&&
      Number.isFinite(range.step)&&range.step>0&&
      range.min>=item.min&&range.max<=item.max&&range.min<=range.max&&
      typeof record.value==='number'&&Number.isFinite(record.value)&&
      record.value>=range.min&&record.value<=range.max&&
      Math.abs((record.value-range.min)/range.step-
        Math.round((record.value-range.min)/range.step))<1e-8;
  }
  function valuesFromDocument(data){
    const normalized=normaliseDocument(data);
    if(!normalized||!normalized.settings||typeof normalized.settings!=='object')return null;
    const values=new Map(),nextRecords=new Map();
    for(const [key,item] of definitions){
      const record=normalized.settings[key];
      if(!isValid(item,record))return null;
      nextRecords.set(key,record);
      values.set(key,record.value);
    }
    records=nextRecords;
    return values;
  }
  function parseValues(){return source?valuesFromDocument(source.readJSON()):null;}
  function refreshGrid(){
    if(!grid||!activeKey)return;
    grid.setGridOption('rowData',[...definitions.values()].map(item=>{
      const record=recordFor(item.key);
      return {key:item.key,primaryCategory:record.category1,
        secondaryCategory:record.category2,keyName:record.key,
        keyComment:record.comment};
    }));
    showSelectedRow();
  }
  function presentationSignature(key){
    const record=recordFor(key);
    return JSON.stringify([key,record.key,record.category1,record.category2,
      record.comment,record.range]);
  }
  function renderPreview(){
    if(!previewHost||!activeKey)return;
    const nextSignature=presentationSignature(activeKey);
    // AG selection callbacks and CM6 selection updates may arrive after a
    // slider input. Never replace an unchanged control underneath its pointer.
    if(renderedSignature===nextSignature && previewHost.firstChild){
      syncPreview();return;
    }
    const item=entry(activeKey),record=recordFor(activeKey);
    renderedSignature=nextSignature;
    slider=null;pathInput=null;
    previewHost.replaceChildren();
    const pane=document.createElement('section');pane.className='ocr-settings-control';
    const breadcrumb=document.createElement('div');breadcrumb.className='ocr-settings-breadcrumb';
    const rawName=record.key;
    breadcrumb.textContent=[record.category1,record.category2,rawName].join(' / ');
    if(item.type==='path'){
      if(item.key==='workspace.files.bookName')renderBookControl(pane,item,record);
      else renderDirectoryControl(pane,item,record);
      previewHost.append(pane);return;
    }
    const label=document.createElement('label');label.textContent=rawName;
    label.htmlFor='settings-font-slider';
    const row=document.createElement('div');row.className='ocr-settings-slider-row';
    slider=document.createElement('input');slider.id='settings-font-slider';slider.type='range';
    slider.min=String(record.range.min);slider.max=String(record.range.max);slider.step=String(record.range.step);
    slider.setAttribute('aria-label',item.label);
    valueLabel=document.createElement('output');valueLabel.htmlFor=slider.id;
    row.append(slider,valueLabel);
    const comment=document.createElement('p');comment.className='ocr-settings-key-comment';
    comment.textContent=record.comment;
    const footer=document.createElement('div');footer.className='ocr-settings-description';
    footer.textContent=`${item.unit?'倍率':'字号'} ${record.range.min}–${record.range.max} ${item.unit||'pt'} · ${item.key}`;
    details=document.createElement('div');details.className='ocr-settings-validation';
    slider.addEventListener('input',()=>{
      try{set(item.key,Number(slider.value));}catch(error){onStatus(error.message,'warning');syncPreview();}
    });
    pane.append(breadcrumb,label,comment,row,footer,details);previewHost.append(pane);
    syncPreview();
  }
  function renderBookControl(pane,item,record){
    const label=document.createElement('label');label.textContent='当前书籍工作目录';
    const selected=document.createElement('p');selected.className='ocr-settings-description';
    selected.textContent=record.value?`当前选择：${record.value}`:'尚未选中书籍，继续使用原工作文档';
    const note=document.createElement('p');note.className='ocr-settings-description';
    note.textContent='书籍必须是根目录的首层文件夹，含 mineru json/ 和 pdf/。转换后的 .minerujson.md 若不存在，会在全局保存时自动生成；已有文件绝不覆盖。';
    const feedback=document.createElement('div');feedback.className='ocr-settings-directory-feedback';
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const items=document.createElement('div');items.className='ocr-settings-directory-list';
    const show=(kind,msg)=>{feedback.dataset.state=kind;feedback.textContent=msg;};
    const root=get('workspace.files.rootPath');
    if(!root){show('warning','⚠ 请先在工作根目录设置中选好书库根路径');pane.append(label,selected,note,feedback,items);return;}
    show('info','正在扫描书籍工作目录…');
    void directoryPort.books(root).then(data=>{
      if(!pane.isConnected)return;
      items.replaceChildren();
      for(const book of data.books){
        const choice=document.createElement('button');choice.type='button';
        const ready=book.state==='ready';
        choice.textContent=(ready?'✓ ':book.selectable?'◷ ':'⚠ ')+book.name+
          (ready?' · 已有转换文档':book.state==='needs-conversion'?' · 保存时转换':' · '+(book.reason||'母文档格式不合格'));
        choice.disabled=!book.selectable;
        choice.addEventListener('click',()=>{
          try{set(item.key,book.name);selected.textContent=`当前选择：${book.name}`;
            show(ready?'success':'warning',ready
              ?'✓ 已选中现有 MinerU 母 Markdown；全局保存后切换'
              :'◷ 已选中；全局保存时先无覆盖生成 MinerU 母 Markdown 再切换');}
          catch(error){show('error','✕ '+error.message);}
        });
        items.append(choice);
      }
      if(!data.books.length)show('warning','⚠ 工作根目录没有首层书籍文件夹');
      else if(data.books.every(book=>!book.selectable))show('warning','⚠ 这些文件夹尚无合格的 MinerU JSON/PDF 配套资料');
      else show('info',`发现 ${data.books.length} 个首层文件夹；请选择可用书籍`);
    }).catch(error=>{if(pane.isConnected)show('error','✕ 无法读取书籍目录：'+error.message);});
    pane.append(label,selected,note,feedback,items);
  }
  function renderDirectoryControl(pane,item,record){
    const label=document.createElement('label');label.textContent='工作根目录';
    label.htmlFor='settings-workspace-root';
    pathInput=document.createElement('input');pathInput.id='settings-workspace-root';
    pathInput.type='text';pathInput.value=String(record.value);
    pathInput.placeholder='Mac 上的书库根目录（首层为每本书）';
    pathInput.setAttribute('aria-label','服务器工作根目录');
    const actions=document.createElement('div');actions.className='ocr-settings-directory-actions';
    const browseButton=document.createElement('button');browseButton.type='button';
    browseButton.textContent='浏览目录';
    const verifyButton=document.createElement('button');verifyButton.type='button';
    verifyButton.textContent='验证路径';
    const feedback=document.createElement('div');feedback.className='ocr-settings-directory-feedback';
    feedback.setAttribute('role','status');feedback.setAttribute('aria-live','polite');
    const showFeedback=(kind,message)=>{
      feedback.dataset.state=kind;feedback.textContent=message;
      pathInput.setAttribute('aria-invalid',String(kind==='error'));
    };
    const normalizedPath=raw=>raw.trim().replace(/\\([ ~()&])/g,'$1');
    pathInput.addEventListener('change',()=>{
      try{set(item.key,normalizedPath(pathInput.value));pathInput.value=normalizedPath(pathInput.value);}
      catch(error){showFeedback('error','✕ '+error.message);}
    });
    const directoryList=document.createElement('div');directoryList.className='ocr-settings-directory-list';
    const display=async value=>{
      directoryList.replaceChildren();showFeedback('info','正在检查服务器目录…');
      try{
        const data=await directoryPort.browse(value);
        const selectable=data.books.filter(book=>book.selectable);
        showFeedback(selectable.length?'success':'warning',selectable.length
          ?`✓ 发现 ${data.books.length} 个首层文件夹，其中 ${selectable.length} 个可选；请再选择当前书籍`
          :'⚠ 目录存在，但没有完整的首层书籍（mineru json/、pdf/）');
        const choices=[...(data.parent?[{name:'.. 上一级',path:data.parent}]:[]),...data.children];
        const current=document.createElement('button');current.type='button';
        current.textContent='设为工作根目录';
        current.addEventListener('click',()=>{
          try{
            const previous=get(item.key);
            set(item.key,data.path);pathInput.value=data.path;
            if(previous!==data.path)set('workspace.files.bookName','');
            showFeedback('success','✓ 根目录已填写；请在「当前书籍工作目录」选书籍，然后顶栏保存');
          }catch(error){showFeedback('error','✕ 无法选用：'+error.message);}
        });
        directoryList.append(current);
        for(const choice of choices){
          const row=document.createElement('button');row.type='button';
          row.textContent='📁 '+choice.name;
          row.addEventListener('click',()=>void display(choice.path));
          directoryList.append(row);
        }
      }catch(error){showFeedback('error','✕ 无法浏览：'+error.message);}
    };
    browseButton.addEventListener('click',async()=>{
      try{
        const data=await directoryPort.roots();
        directoryList.replaceChildren();showFeedback('info','授权目录（选择后逐级浏览到书库根目录）');
        for(const path of data.allowedRoots){
          const button=document.createElement('button');button.type='button';
          button.textContent='📁 '+path;
          button.addEventListener('click',()=>void display(path));
          directoryList.append(button);
        }
      }catch(error){showFeedback('error','✕ 浏览失败：'+error.message);}
    });
    verifyButton.addEventListener('click',async()=>{
      const path=normalizedPath(pathInput.value);
      try{
        if(path!==pathInput.value){set(item.key,path);pathInput.value=path;}
        showFeedback('info','正在验证书库根目录…');
        const data=await directoryPort.books(path);
        const available=data.books.filter(book=>book.selectable);
        showFeedback(available.length?'success':'warning',available.length
          ?`✓ 目录可用：${available.length} 本书已具备转换前提；请选中当前书籍后保存`
          :'⚠ 目录存在，但没有同时具备 mineru json/、pdf/ 的可用书籍');
      }catch(error){showFeedback('error','✕ 验证失败：'+error.message);}
    });
    actions.append(browseButton,verifyButton);
    const help=document.createElement('p');help.className='ocr-settings-key-comment';
    help.textContent=record.comment;
    pane.append(label,pathInput,actions,feedback,directoryList,help);
    void directoryPort.roots().then(data=>{
      if(pane.isConnected&&record.value==='')
        showFeedback('info','默认工作文档仍保持不变；可选择其他书库根目录');
    }).catch(()=>{});
  }
  function syncPreview(){
    if(!activeKey)return;
    if(entry(activeKey).type==='path'){
      if(pathInput&&document.activeElement!==pathInput)
        pathInput.value=String(applied.get(activeKey)??'');
      if(pathInput)pathInput.disabled=invalid||!source;
      return;
    }
    if(!slider)return;
    const current=applied.get(activeKey);
    slider.value=String(current??entry(activeKey).defaultValue);
    slider.disabled=invalid||!source;
    valueLabel.textContent=slider.value+(entry(activeKey).unit||' pt');
    details.textContent=invalid?'JSON 语法或设置值无效，继续保留上次有效值':'';
  }
  function publish(key,value,origin){
    if(applied.get(key)===value)return;
    applied.set(key,value);
    container.dispatchEvent(new CustomEvent('settings.changed',{detail:Object.freeze({
      topic:'settings.changed',key,value,origin
    })}));
  }
  function initialize(){
    if(!initialPromise)initialPromise=readCMDJsonSnapshot().then(({text})=>{
      const values=valuesFromDocument(JSON.parse(text));
      if(!values)throw Error('设置文件键值超出注册范围');
      for(const [key,value] of values)publish(key,value,'startup');
    }).catch(error=>{
      onStatus('无法应用已保存设置：'+error.message,'warning');
      // A transient read error must not poison a retry when settings opens.
      initialPromise=null;
    });
    return initialPromise;
  }
  function onSourceChange({docChanged,sourceOffset}){
    if(!source)return;
    let values;
    try{values=parseValues();}catch{} // Partial JSON is allowed while typing.
    invalid=!values;
    if(values)for(const [key,value]of values)publish(key,value,docChanged?'cm6':'load');
    if(docChanged&&values){
      refreshGrid();
      // A scalar edit must not destroy its own active slider while an
      // input event, pointer drag or AG/CM6 selection transaction is pending.
      // Rebuild only for actual metadata/selection changes.
      if(renderedSignature===presentationSignature(activeKey))syncPreview();
      else renderPreview();
    }else syncPreview();
    if(!locatingFromGrid&&Number.isInteger(sourceOffset)){
      const candidate=source.keyAtOffset(sourceOffset);
      const exact=definitions.has(candidate)?candidate:
        [...definitions.keys()].find(key=>candidate && key.startsWith(candidate+'.'));
      if(exact){
        const changed=exact!==activeKey;
        activeKey=exact;
        showSelectedRow({reveal:true});
        if(changed)renderPreview();
      }
    }
    onStatus(invalid?'设置 JSON 暂时无效，未应用更改':
      source.isDirty()?'● 全局设置未保存':'✓ 全局设置已加载',invalid?'warning':'ok');
  }
  function get(key){entry(key);return applied.has(key)?applied.get(key):entry(key).defaultValue;}
  function set(key,value){
    const item=entry(key);
    if(!isValid(item,{...recordFor(key),value}))throw Error('Setting value outside allowed range');
    if(!source||invalid)throw Error('JSON 源码尚未就绪或存在错误');
    // Settings cannot read/write disk or operate CM6 internals. CMD alone
    // performs the precise JSON scalar transaction and owns undo history.
    source.changeScalar(['settings',key,'value'],value);
  }
  function createPanel(name){
    const host=document.createElement('div');host.className='ocr-settings-pane';
    if(name==='outline'){agHost=host;host.classList.add('ocr-settings-ag-pane');}
    if(name==='source'){sourceHost=host;host.classList.add('ocr-settings-source','ocr-cm-source');}
    if(name==='preview')previewHost=host;
    return {element:host,init(){},layout(){if(name==='source')source?.requestMeasure();},dispose(){}};
  }
  async function doLoad(){
    // Fetch and verify the server snapshot before creating Dockview/AG/CM.
    // On a sustained network failure, no partial widget remains behind and
    // loadPromise can safely retry when the module is selected again.
    const initialSnapshot=await readCMDJsonSnapshot();
    dockview=createDockview(container,{theme:themeAbyss,createComponent:({name})=>createPanel(name)});
    const left=dockview.addPanel({id:'settings-outline',component:'outline',title:'设置 · AG'});
    const center=dockview.addPanel({id:'settings-source',component:'source',title:'settings.json',
      position:{referencePanel:left,direction:'right'}});
    const right=dockview.addPanel({id:'settings-preview',component:'preview',title:'设置控件',
      position:{referencePanel:center,direction:'below'}});
    for(const panel of [left,center,right]){panel.group.header.hidden=true;panel.group.relayout();}
    grid=createGrid(agHost,{theme,headerHeight:33,rowHeight:35,getRowId:p=>p.data.key,
      rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
      defaultColDef:{sortable:false,resizable:true,suppressMovable:true,
        suppressHeaderMenuButton:true,suppressHeaderFilterButton:false},
      columnDefs:[
        {field:'primaryCategory',headerName:'一级分类',width:145,minWidth:110,
          pinned:'left',lockPinned:true,lockPosition:'left',filter:EnumCheckboxFilter},
        {field:'secondaryCategory',headerName:'二级分类',width:150,minWidth:120,
          filter:EnumCheckboxFilter},
        {field:'keyName',headerName:'键名',width:160,minWidth:130,
          filter:EnumCheckboxFilter},
        {field:'keyComment',headerName:'键注释',flex:1,minWidth:180,
          filter:false,tooltipField:'keyComment'},
      ],
      onRowClicked:event=>{
        if(!event.data?.key)return;
        activeKey=event.data.key;
        locatingFromGrid=true;
        try{source?.revealKeyPath(activeKey);}finally{locatingFromGrid=false;}
        renderPreview();
      },
    });
    const initialData=JSON.parse(initialSnapshot.text);
    savedRootValue=initialData.settings?.['workspace.files.rootPath']?.value??'';
    savedBookValue=initialData.settings?.['workspace.files.bookName']?.value??'';
    source=await openCMDJsonSource(sourceHost,onSourceChange,initialSnapshot);
    ensureRegisteredRecords();
    // Registered module values are applied after the first actual JSON read.
    onSourceChange({docChanged:false});
    refreshGrid();renderPreview();
  }
  function load(){
    if(!loadPromise)loadPromise=doLoad().catch(error=>{loadPromise=null;throw error;});
    return loadPromise;
  }
  function activate(){
    if(dockview && container.clientWidth>0 && container.clientHeight>0)
      dockview.layout(container.clientWidth,container.clientHeight);
    source?.requestMeasure();refreshGrid();
  }
  function hasUnsaved(){return Boolean(source?.isDirty());}
  async function save(){
    if(!source)throw Error('设置未加载');
    if(invalid)throw Error('无效 JSON 不允许保存');
    const completed=await source.save();
    if(completed){
      savedRootValue=source.readJSON().settings?.['workspace.files.rootPath']?.value??'';
      savedBookValue=source.readJSON().settings?.['workspace.files.bookName']?.value??'';
    }
    return completed;
  }
  return Object.freeze({register,subscribe,get,set,initialize,load,activate,hasUnsaved,save,
    get workspaceRootChanged(){
      if(!source||invalid)return false;
      try{const settings=source.readJSON().settings;return (settings?.['workspace.files.rootPath']?.value??'')!==savedRootValue||
        (settings?.['workspace.files.bookName']?.value??'')!==savedBookValue;}
      catch{return false;}
    },
    getPaneRatios:()=>readPaneRatios(dockview,'settings-outline','settings-source','settings-preview'),
    applyPaneRatios:ratios=>applyPaneRatios(dockview,'settings-outline','settings-source','settings-preview',ratios),
    undo:()=>source?.undo(),redo:()=>source?.redo(),
    get history(){return source?.history||{undo:0,redo:0};},
    get invalid(){return invalid;},
    ...(import.meta.env.DEV?{debug:{get grid(){return grid;},get source(){return source;}}}:{}),
  });
}
