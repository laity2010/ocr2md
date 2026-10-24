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
  let source=null,grid=null,dockview=null,loadPromise=null,initialPromise=null,slider=null,valueLabel=null,details=null;
  let agHost=null,sourceHost=null,previewHost=null;
  let activeKey=null,invalid=false;
  function entry(key){const item=definitions.get(key);if(!item)throw Error('Unregistered setting: '+key);return item;}
  function register(definition){
    const {module,key,category,label,type,control,defaultValue,min,max,step,message}=definition;
    if(!module||typeof key!=='string'||!/^\w+(?:\.\w+)+$/.test(key)||
       !Array.isArray(category)||category.length!==2||!category.every(v=>typeof v==='string'&&v)||
       !label||type!=='number'||control!=='slider'||message!=='settings.changed'||
       !Number.isInteger(min)||!Number.isInteger(max)||max<=min||
       !Number.isInteger(defaultValue)||defaultValue<min||defaultValue>max||step!==1)
      throw Error('Invalid settings registration');
    if(definitions.has(key))throw Error('Duplicate settings key: '+key);
    definitions.set(key,Object.freeze({...definition,category:Object.freeze([...category])}));
    if(!activeKey)activeKey=key;
    refreshGrid();renderPreview();
  }
  function subscribe({module,key},handler){
    if(!module||typeof handler!=='function'||entry(key).module!==module)
      throw Error('Subscriber must own this setting');
    const listener=event=>{if(event.detail.key===key)handler(event.detail);};
    container.addEventListener('settings.changed',listener);
    if(applied.has(key))handler({topic:'settings.changed',key,value:applied.get(key),origin:'initial'});
    return ()=>container.removeEventListener('settings.changed',listener);
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
    return values;
  }
  function parseValues(){return source?valuesFromDocument(source.readJSON()):null;}
  function refreshGrid(){
    if(!grid||!activeKey)return;
    const item=entry(activeKey),value=applied.get(activeKey);
    const rows=[{id:'category',label:item.category[0],value:'',depth:0},
      {id:'section',label:item.category[1],value:'',depth:1},
      {id:activeKey,label:item.label,value:value===undefined?'—':value+' pt',depth:2}];
    grid.setGridOption('rowData',rows);
    grid.getRowNode(activeKey)?.setSelected(true);
  }
  function renderPreview(){
    if(!previewHost||!activeKey)return;
    const item=entry(activeKey);
    previewHost.replaceChildren();
    const pane=document.createElement('section');pane.className='ocr-settings-control';
    const breadcrumb=document.createElement('div');breadcrumb.className='ocr-settings-breadcrumb';
    breadcrumb.textContent=[...item.category,item.label].join(' / ');
    const label=document.createElement('label');label.textContent=item.label;
    label.htmlFor='settings-font-slider';
    const row=document.createElement('div');row.className='ocr-settings-slider-row';
    slider=document.createElement('input');slider.id='settings-font-slider';slider.type='range';
    slider.min=String(item.min);slider.max=String(item.max);slider.step=String(item.step);
    slider.setAttribute('aria-label',item.label);
    valueLabel=document.createElement('output');valueLabel.htmlFor=slider.id;
    row.append(slider,valueLabel);
    const footer=document.createElement('div');footer.className='ocr-settings-description';
    footer.textContent=`字号 ${item.min}–${item.max} pt · ${item.key}`;
    details=document.createElement('div');details.className='ocr-settings-validation';
    slider.addEventListener('input',()=>{
      try{set(item.key,Number(slider.value));}catch(error){onStatus(error.message,'warning');syncPreview();}
    });
    pane.append(breadcrumb,label,row,footer,details);previewHost.append(pane);
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
  function onSourceChange({docChanged}){
    if(!source)return;
    let values;
    try{values=parseValues();}catch{} // Partial JSON is allowed while typing.
    invalid=!values;
    if(values)for(const [key,value]of values)publish(key,value,docChanged?'cm6':'load');
    refreshGrid();syncPreview();
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
    source.changeScalar(key.split('.').at(-1),value);
  }
  function createPanel(name){
    const host=document.createElement('div');host.className='ocr-settings-pane';
    if(name==='outline')agHost=host;
    if(name==='source'){sourceHost=host;host.classList.add('ocr-settings-source');}
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
    grid=createGrid(agHost,{theme,headerHeight:33,rowHeight:35,getRowId:p=>p.data.id,
      rowSelection:{mode:'singleRow',checkboxes:false,enableClickSelection:true},
      columnDefs:[{field:'label',headerName:'设置分类 / 键值',flex:1,minWidth:130,
        cellRenderer:params=>{
          const span=document.createElement('span');span.textContent=params.value;
          span.style.paddingLeft=(params.data.depth*14)+'px';return span;
        }},{field:'value',headerName:'当前值',width:90}],
      onRowClicked:()=>{if(activeKey)source?.revealKey(activeKey);},
    });
    source=await openCMDJsonSource(sourceHost,onSourceChange);
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
