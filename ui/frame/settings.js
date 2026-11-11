/** Frame-owned global UI settings. No CMD, SQL, Media, fetch, or document state.
 * Public F05: one narrow register/read/update/subscribe API.
 */
export const FONT_FAMILY_KEY='globalUi.font.family';
export const FONT_SIZE_KEY='globalUi.font.size';
const STORE_KEY='ocr2md.lab-frame.font-size.v1';

export function createFrameSettings({storage=typeof localStorage==='undefined'?null:localStorage,
  root=typeof document==='undefined'?null:document.documentElement,
  onStatus=()=>{}}={}){
  const defs=new Map();
  const listeners=new Set();
  const values=new Map();
  let selected=null;
  function register(input){
    if(!input||typeof input.key!=='string'||defs.has(input.key)||
        !['readonly','range'].includes(input.control)||
        !Array.isArray(input.category)||input.category.length!==2||
        !input.category.every(x=>typeof x==='string'&&x)||
        typeof input.label!=='string'||!input.label)
      throw Error('无效或重复的全局设置参数');
    const entry=Object.freeze({...input,category:Object.freeze([...input.category])});
    if(entry.control==='range'&&(!Number.isInteger(entry.defaultValue)||
        !Number.isInteger(entry.min)||!Number.isInteger(entry.max)||
        entry.min>=entry.max||entry.defaultValue<entry.min||entry.defaultValue>entry.max))
      throw Error('字号设置范围无效');
    defs.set(entry.key,entry);
    values.set(entry.key,entry.defaultValue);
    if(!selected)selected=entry.key;
    emit();
    return entry.key;
  }
  function readSize(){
    try{
      const raw=storage?.getItem(STORE_KEY);
      if(raw===null||raw===undefined||!/^\d+$/.test(raw))return 16;
      const value=Number(raw);
      return Number.isInteger(value)&&value>=8&&value<=32?value:16;
    }catch{return 16;}
  }
  function applySize(size){
    root?.style?.setProperty('--ocr-frame-font-size',size+'px');
    root?.style?.setProperty('--ocr-frame-scale',String(size/16));
  }
  function emit(){for(const listener of [...listeners])listener();}
  function get(key){
    if(!defs.has(key))throw Error('未知全局设置：'+key);
    return values.get(key);
  }
  function set(key,value){
    const definition=defs.get(key);
    if(!definition)throw Error('未知全局设置：'+key);
    if(definition.control==='readonly')throw Error('只读设置不可修改：'+key);
    if(!Number.isInteger(value)||value<definition.min||value>definition.max)
      throw Error('字号超出允许范围');
    if(value===get(key))return false;
    values.set(key,value);
    if(key===FONT_SIZE_KEY){
      applySize(value);
      try{storage?.setItem(STORE_KEY,String(value));}
      catch{onStatus('字号已应用，但浏览器禁止保存本地偏好','warning');}
    }
    emit();
    onStatus('全局字体：Sarasa · 字号：'+value+' px','ok');
    return true;
  }
  function list(){return [...defs.values()].map(d=>({
    key:d.key,primaryCategory:d.category[0],secondaryCategory:d.category[1],
    keyName:d.label,keyComment:d.comment||'',value:get(d.key),readonly:d.control==='readonly',
    control:d.control,...(d.control==='range'?{min:d.min,max:d.max,step:d.step||1}:{}),
  }));}
  function snapshot(){return {settings:Object.fromEntries(list().map(d=>[d.key,{
    key:d.keyName,category1:d.primaryCategory,category2:d.secondaryCategory,
    comment:d.keyComment,value:d.value,readonly:d.readonly,
    ...(d.control==='range'?{range:{min:d.min,max:d.max,step:d.step}}:{}),
  }]))};}
  function select(key){if(!defs.has(key))throw Error('未知全局设置：'+key);
    if(selected!==key){selected=key;emit();}}
  register({key:FONT_FAMILY_KEY,label:'字体',category:['全局 UI','字体'],
    comment:'固定 Sarasa Fixed SC，不可更改字体家族',control:'readonly',defaultValue:'Sarasa'});
  register({key:FONT_SIZE_KEY,label:'字号',category:['全局 UI','字体'],
    comment:'整个 Lab Frame 的显示字号（8–32 px）',control:'range',
    min:8,max:32,step:1,defaultValue:16});
  const saved=readSize();values.set(FONT_SIZE_KEY,saved);applySize(saved);
  // Make the immediately useful adjustable setting the default AG selection.
  selected=FONT_SIZE_KEY;
  return Object.freeze({register,get,set,list,snapshot,select,
    get selected(){return selected;},
    subscribe(listener){if(typeof listener!=='function')throw Error('订阅函数无效');
      listeners.add(listener);return ()=>listeners.delete(listener);},
    dispose(){listeners.clear();},
  });
}
