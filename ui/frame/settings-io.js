/** Lab-only storage port for the EXISTING Main Settings + CMD JSON modules.
 * No UI, no setting registration, no duplicate state manager. Explicit Save.
 */
const VALID_SIZE=value=>Number.isInteger(value)&&value>=8&&value<=32;
// Lab OCR-only visual settings (other Labs keep their existing schema).
const VALID_OVERLAY_STROKE=value=>typeof value==='number'&&Number.isFinite(value)&&
  value>=0.25&&value<=3&&Number.isInteger(value*4);
const VALID_OVERLAY_TRANSPARENCY=value=>Number.isInteger(value)&&
  value>=0&&value<=95&&value%5===0;

const checksum=async text=>Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
export function createFrameSettingsIO(storage=localStorage,labName='lab-frame',
  getPublishedDirectory=()=> '',validateDirectory=async()=>{throw Error('未配置目录服务');}){
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(labName))throw Error('Invalid Lab ID');
  const KEY='ocr2md.'+labName+'.settings.json.v1';
  const LEGACY_FONT_SIZE_KEY='ocr2md.'+labName+'.font-size.v1';
  const workDirectory=()=>getPublishedDirectory()||'未发布';
  const workDirectoryRecord=()=>({key:'workDirectory',category1:'运行环境',category2:'目录',
    comment:'当前发布入口对应的本机目录；只读，与业务模块无关',
    value:workDirectory(),range:{kind:'readonly'}});
  const read=()=>{
    let content;
    try{content=storage.getItem(KEY);}catch{}
    if(content){
      // The release directory must never come from persisted browser data.
      // Keep old settings, but project this authoritative read-only key.
      try{
        const data=JSON.parse(content);
        if(data?.settings&&typeof data.settings==='object'&&!Array.isArray(data.settings)){
          data.settings['runtime.workDirectory']=workDirectoryRecord();
          return JSON.stringify(data,null,2)+'\n';
        }
      }catch{}
      return content;
    }
    let size=16;
    try{const legacy=storage.getItem(LEGACY_FONT_SIZE_KEY);
      if(legacy!==null&&/^\d+$/.test(legacy)&&VALID_SIZE(Number(legacy)))size=Number(legacy);
    }catch{}
    return JSON.stringify({settings:{
      'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',
        comment:'Sarasa Fixed SC；字体家族固定',value:'Sarasa',range:{kind:'readonly'}},
      'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',
        comment:'统一界面字号（8–32 px）',value:size,range:{min:8,max:32,step:1}},
      'runtime.workDirectory':workDirectoryRecord(),
      'workspace.dataDirectory':{key:'dataDirectory',category1:'工作区',category2:'目录',
        comment:'通用资料目录绑定；不检查 OCR、MinerU 或 PDF',
        value:'',range:{kind:'server-directory'}},
    }},null,2)+'\n';
  };
  return Object.freeze({
    getInitialSize(){try{const data=JSON.parse(read());const size=data.settings?.['globalUi.font.size']?.value;
      return VALID_SIZE(size)?size:16;}catch{return 16;}},
    getInitialOverlayStyle(){
      let width,transparency;
      try{
        const values=JSON.parse(read()).settings;
        width=values?.['pdf.overlay.borderWidth']?.value;
        transparency=values?.['pdf.overlay.transparency']?.value;
      }catch{}
      return Object.freeze({borderWidth:VALID_OVERLAY_STROKE(width)?width:0.75,
        transparency:VALID_OVERLAY_TRANSPARENCY(transparency)?transparency:65});
    },
    async readSnapshot(){const text=read();return {text,etag:await checksum(text)};},
    async saveSnapshot({text,etag}){
      if(await checksum(read())!==etag)throw Error('设置文件版本已更新，请重新加载');
      const parsed=JSON.parse(text);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
        parsed.settings?.['globalUi.font.family']?.value!=='Sarasa' ||
        !VALID_SIZE(parsed.settings?.['globalUi.font.size']?.value) ||
        parsed.settings?.['runtime.workDirectory']?.value!==workDirectory()||
        parsed.settings?.['runtime.workDirectory']?.range?.kind!=='readonly'||
        typeof parsed.settings?.['workspace.dataDirectory']?.value!=='string'||
        parsed.settings?.['workspace.dataDirectory']?.range?.kind!=='server-directory'||
        (labName==='lab-ocr'&&(
          !VALID_OVERLAY_STROKE(parsed.settings?.['pdf.overlay.borderWidth']?.value)||
          !VALID_OVERLAY_TRANSPARENCY(parsed.settings?.['pdf.overlay.transparency']?.value))))
        throw Error('设置值无效：请检查字体、字号、资料目录及 PDF 覆盖框参数');
      const selected=parsed.settings['workspace.dataDirectory'].value;
      if(selected){
        if(!selected.startsWith('/')||selected.length>1024||/[\0\r\n]/.test(selected))
          throw Error('资料目录必须是合法的绝对路径');
        const validated=await validateDirectory(selected);
        if(validated?.path!==selected)throw Error('资料目录未经服务器授权');
      }
      if(!storage)throw Error('本地设置存储不可用');
      storage.setItem(KEY,text);
    },
  });
}
