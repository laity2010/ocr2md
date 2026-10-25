/** Public WCP Settings module: registrations + three synchronized projections.
 * No file access, no cross-module DOM mutation. CMD owns JSON and persistence.
 */
import {createDockview,themeAbyss} from 'dockview';
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

export function createSettingsModule(container,onStatus=()=>{}){
  const definitions=new Map(),applied=new Map();
  let records=new Map();
  let source=null,grid=null,dockview=null,loadPromise=null,initialPromise=null,slider=null,valueLabel=null,details=null;
  let agHost=null,sourceHost=null,previewHost=null;
  let activeKey=null,invalid=false,locatingFromGrid=false;
  function entry(key){const item=definitions.get(key);if(!item)throw Error('Unregistered setting: '+key);return item;}
  function register(definition){
    const {module,key,category,label,comment,type,control,defaultValue,min,max,step,message,unit}=definition;
    if(!module||typeof key!=='string'||!/^\w+(?:\.\w+)+$/.test(key)||
       !Array.isArray(category)||category.length!==2||!category.every(v=>typeof v==='string'&&v)||
       !label||(comment!==undefined&&typeof comment!=='string')||type!=='number'||control!=='slider'||message!=='settings.changed'||
       !Number.isFinite(min)||!Number.isFinite(max)||max<=min||
       !Number.isFinite(defaultValue)||defaultValue<min||defaultValue>max||
       !Number.isFinite(step)||step<=0||(unit!==undefined&&typeof unit!=='string'))
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
      range:{min:item.min,max:item.max,step:item.step}};
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
  function renderPreview(){
    if(!previewHost||!activeKey)return;
    const item=entry(activeKey),record=recordFor(activeKey);
    previewHost.replaceChildren();
    const pane=document.createElement('section');pane.className='ocr-settings-control';
    const breadcrumb=document.createElement('div');breadcrumb.className='ocr-settings-breadcrumb';
    const rawName=record.key;
    breadcrumb.textContent=[record.category1,record.category2,rawName].join(' / ');
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
  function syncPreview(){
    if(!slider||!activeKey)return;
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
    if(docChanged&&values){refreshGrid();renderPreview();}
    else syncPreview();
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
    return source.save();
  }
  return Object.freeze({register,subscribe,get,set,initialize,load,activate,hasUnsaved,save,
    undo:()=>source?.undo(),redo:()=>source?.redo(),
    get history(){return source?.history||{undo:0,redo:0};},
    get invalid(){return invalid;},
    ...(import.meta.env.DEV?{debug:{get grid(){return grid;},get source(){return source;}}}:{}),
  });
}
