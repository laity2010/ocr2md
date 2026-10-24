/** Public WCP Settings module: registrations + three synchronized projections.
 * No file access, no cross-module DOM mutation. CMD owns JSON and persistence.
 */
import {createDockview,themeAbyss} from 'dockview';
import {AllCommunityModule,ModuleRegistry,createGrid,themeQuartz} from 'ag-grid-community';
import {openCMDJsonSource,readCMDJsonSnapshot} from './cmd-json-source.js';
import './settings-module.css';

ModuleRegistry.registerModules([AllCommunityModule]);
const theme=themeQuartz.withParams({accentColor:'#569d79',backgroundColor:'#2f383e',
  foregroundColor:'#d3c6aa',headerBackgroundColor:'#272f34',headerTextColor:'#d3c6aa',
  borderColor:'#525c62',selectedRowBackgroundColor:'rgba(86,157,121,.2)',
  fontFamily:'"OCR2MD Sarasa",monospace',fontSize:13,spacing:3});

export function createSettingsModule(container,onStatus=()=>{}){
  const definitions=new Map(),applied=new Map();
  const selectedFilters=new Map();
  let keyComments=Object.create(null);
  let source=null,grid=null,dockview=null,loadPromise=null,initialPromise=null,slider=null,valueLabel=null,details=null;
  let agHost=null,sourceHost=null,previewHost=null;
  let activeKey=null,invalid=false;
  function entry(key){const item=definitions.get(key);if(!item)throw Error('Unregistered setting: '+key);return item;}
  function register(definition){
    const {module,key,category,label,comment,type,control,defaultValue,min,max,step,message}=definition;
    if(!module||typeof key!=='string'||!/^\w+(?:\.\w+)+$/.test(key)||
       !Array.isArray(category)||category.length!==2||!category.every(v=>typeof v==='string'&&v)||
       !label||(comment!==undefined&&typeof comment!=='string')||type!=='number'||control!=='slider'||message!=='settings.changed'||
       !Number.isInteger(min)||!Number.isInteger(max)||max<=min||
       !Number.isInteger(defaultValue)||defaultValue<min||defaultValue>max||step!==1)
      throw Error('Invalid settings registration');
    if(definitions.has(key))throw Error('Duplicate settings key: '+key);
    definitions.set(key,Object.freeze({...definition,category:Object.freeze([...category])}));
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
  function defaultComments(){
    const defaults={};
    for(const item of definitions.values()){
      const path=item.key.split('.');
      if(path.length>=2){
        defaults[path[0]]??=item.category[0];
        defaults[path.slice(0,2).join('.')]??=item.category[1];
      }
      defaults[item.key]??=item.comment||item.label;
    }
    return defaults;
  }
  function displayedComment(key){
    return typeof keyComments[key]==='string'?keyComments[key]:defaultComments()[key]||'';
  }
  function createFilterHeader(field,title){
    return class {
      init(params){
        const el=document.createElement('div');el.className='ocr-settings-filter-header';
        const label=document.createElement('span');label.textContent=title;
        const select=document.createElement('select');select.className='ocr-settings-filter';
        select.setAttribute('aria-label','筛选'+title);select.title='按值筛选'+title;
        const addOption=(value,text)=>{const option=document.createElement('option');
          option.value=value;option.textContent=text;select.append(option);};
        addOption('','全部');
        const keys=new Set([...definitions.values()].map(item=>({
          primaryCategory:item.category[0],secondaryCategory:item.category[1],
          keyName:item.key.split('.').at(-1),
        })[field]));
        for(const value of [...keys].sort((a,b)=>a.localeCompare(b,'zh-CN')))
          addOption(value,value);
        select.value=selectedFilters.get(field)||'';
        select.addEventListener('pointerdown',event=>event.stopPropagation());
        select.addEventListener('click',event=>event.stopPropagation());
        select.addEventListener('change',()=>{
          if(select.value)selectedFilters.set(field,select.value);
          else selectedFilters.delete(field);
          params.api.onFilterChanged();
        });
        el.append(label,select);this.gui=el;
      }
      getGui(){return this.gui;}
      refresh(){return false;}
    };
  }
  function showSelectedRow({reveal=false}={}){
    if(!grid||!activeKey)return;
    // Clicks in source must reveal the matching AG record even if a user
    // previously applied a filter that hides it.
    const node=grid.getRowNode(activeKey);
    if(!node)return;
    if(reveal && selectedFilters.size){
      const item=entry(activeKey);
      const data={primaryCategory:item.category[0],secondaryCategory:item.category[1],
        keyName:item.key.split('.').at(-1)};
      if([...selectedFilters].some(([field,value])=>data[field]!==value)){
        selectedFilters.clear();grid.refreshHeader();grid.onFilterChanged();
      }
    }
    node.setSelected(true);
    if(reveal)grid.ensureNodeVisible(node,'middle');
  }
  function valueAt(object,key){
    return key.split('.').reduce((value,part)=>value&&typeof value==='object'?value[part]:undefined,object);
  }
  function isValid(item,value){return typeof value==='number'&&Number.isInteger(value)&&
    value>=item.min&&value<=item.max&&((value-item.min)%item.step===0);}
  function valuesFromDocument(data){
    if(!data||typeof data!=='object'||Array.isArray(data))return null;
    const values=new Map();
    for(const [key,item]of definitions){
      const value=valueAt(data,key);
      if(!isValid(item,value))return null;
      values.set(key,value);
    }
    keyComments=data.$comments && typeof data.$comments==='object' && !Array.isArray(data.$comments)
      ?data.$comments:Object.create(null);
    return values;
  }
  function parseValues(){return source?valuesFromDocument(source.readJSON()):null;}
  function refreshGrid(){
    if(!grid||!activeKey)return;
    const rows=[...definitions.values()].map(item=>({
      key:item.key,
      primaryCategory:item.category[0],
      secondaryCategory:item.category[1],
      keyName:item.key.split('.').at(-1),
      keyComment:displayedComment(item.key),
    }));
    grid.setGridOption('rowData',rows);
    showSelectedRow();
  }
  function renderPreview(){
    if(!previewHost||!activeKey)return;
    const item=entry(activeKey);
    previewHost.replaceChildren();
    const pane=document.createElement('section');pane.className='ocr-settings-control';
    const breadcrumb=document.createElement('div');breadcrumb.className='ocr-settings-breadcrumb';
    const rawName=item.key.split('.').at(-1);
    breadcrumb.textContent=[...item.category,rawName].join(' / ');
    const label=document.createElement('label');label.textContent=rawName;
    label.htmlFor='settings-font-slider';
    const row=document.createElement('div');row.className='ocr-settings-slider-row';
    slider=document.createElement('input');slider.id='settings-font-slider';slider.type='range';
    slider.min=String(item.min);slider.max=String(item.max);slider.step=String(item.step);
    slider.setAttribute('aria-label',item.label);
    valueLabel=document.createElement('output');valueLabel.htmlFor=slider.id;
    row.append(slider,valueLabel);
    const comment=document.createElement('p');comment.className='ocr-settings-key-comment';
    comment.textContent=displayedComment(item.key);
    const footer=document.createElement('div');footer.className='ocr-settings-description';
    footer.textContent=`字号 ${item.min}–${item.max} pt · ${item.key}`;
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
    valueLabel.textContent=slider.value+' pt';
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
    if(docChanged){refreshGrid();renderPreview();}
    else syncPreview();
    if(Number.isInteger(sourceOffset)){
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
    if(!isValid(item,value))throw Error('Setting value outside allowed range');
    if(!source||invalid)throw Error('JSON 源码尚未就绪或存在错误');
    // Settings cannot read/write disk or operate CM6 internals. CMD alone
    // performs the precise JSON scalar transaction and owns undo history.
    source.changeScalar(key,value);
  }
  function createPanel(name){
    const host=document.createElement('div');host.className='ocr-settings-pane';
    if(name==='outline')agHost=host;
    if(name==='source'){sourceHost=host;host.classList.add('ocr-settings-source','ocr-cm-source');}
    if(name==='preview')previewHost=host;
    return {element:host,init(){},layout(){if(name==='source')source?.requestMeasure();},dispose(){}};
  }
  async function doLoad(){
    dockview=createDockview(container,{theme:themeAbyss,createComponent:({name})=>createPanel(name)});
    const left=dockview.addPanel({id:'settings-outline',component:'outline',title:'设置 · AG'});
    const center=dockview.addPanel({id:'settings-source',component:'source',title:'settings.json',
      position:{referencePanel:left,direction:'right'}});
    const right=dockview.addPanel({id:'settings-preview',component:'preview',title:'设置控件',
      position:{referencePanel:center,direction:'below'}});
    for(const panel of [left,center,right]){panel.group.header.hidden=true;panel.group.relayout();}
    grid=createGrid(agHost,{theme,headerHeight:42,rowHeight:35,getRowId:p=>p.data.key,
      rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
      isExternalFilterPresent:()=>selectedFilters.size>0,
      doesExternalFilterPass:node=>[...selectedFilters].every(([field,value])=>node.data[field]===value),
      defaultColDef:{sortable:false,resizable:true,suppressMovable:true,lockPosition:true},
      columnDefs:[
        {field:'primaryCategory',headerName:'一级分类',width:145,minWidth:110,pinned:'left',lockPinned:true,headerComponent:createFilterHeader('primaryCategory','一级分类')},
        {field:'secondaryCategory',headerName:'二级分类',width:150,minWidth:120,headerComponent:createFilterHeader('secondaryCategory','二级分类')},
        {field:'keyName',headerName:'键名',width:160,minWidth:130,headerComponent:createFilterHeader('keyName','键名')},
        {field:'keyComment',headerName:'键注释',flex:1,minWidth:180,
          tooltipField:'keyComment'},
      ],
      onRowClicked:event=>{
        if(!event.data?.key)return;
        activeKey=event.data.key;
        source?.revealKeyPath(activeKey);
        renderPreview();
      },
    });
    source=await openCMDJsonSource(sourceHost,onSourceChange);
    source.ensureKeyComments(defaultComments());
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
    source.ensureKeyComments(defaultComments());
    return source.save();
  }
  return Object.freeze({register,subscribe,get,set,initialize,load,activate,hasUnsaved,save,
    undo:()=>source?.undo(),redo:()=>source?.redo(),
    get history(){return source?.history||{undo:0,redo:0};},
    get invalid(){return invalid;},
    ...(import.meta.env.DEV?{debug:{get grid(){return grid;},get source(){return source;}}}:{}),
  });
}
