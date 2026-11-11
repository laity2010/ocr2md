/** Lab-only storage port for the EXISTING Main Settings + CMD JSON modules.
 * No UI, no setting registration, no duplicate state manager. Explicit Save.
 */
const VALID_SIZE=value=>Number.isInteger(value)&&value>=8&&value<=32;
const checksum=async text=>Array.from(new Uint8Array(await crypto.subtle.digest(
  'SHA-256',new TextEncoder().encode(text))),byte=>byte.toString(16).padStart(2,'0')).join('');
export function createFrameSettingsIO(storage=localStorage,labName='lab-frame'){
  if(!/^[a-z][a-z0-9-]{0,31}$/.test(labName))throw Error('Invalid Lab ID');
  const KEY='ocr2md.'+labName+'.settings.json.v1';
  const LEGACY_FONT_SIZE_KEY='ocr2md.'+labName+'.font-size.v1';
  const read=()=>{
    let content;
    try{content=storage.getItem(KEY);}catch{}
    if(content)return content;
    let size=16;
    try{const legacy=storage.getItem(LEGACY_FONT_SIZE_KEY);
      if(legacy!==null&&/^\d+$/.test(legacy)&&VALID_SIZE(Number(legacy)))size=Number(legacy);
    }catch{}
    return JSON.stringify({settings:{
      'globalUi.font.family':{key:'family',category1:'全局 UI',category2:'字体',
        comment:'Sarasa Fixed SC；字体家族固定',value:'Sarasa',range:{kind:'readonly'}},
      'globalUi.font.size':{key:'size',category1:'全局 UI',category2:'字体',
        comment:'统一界面字号（8–32 px）',value:size,range:{min:8,max:32,step:1}},
    }},null,2)+'\n';
  };
  return Object.freeze({
    getInitialSize(){try{const data=JSON.parse(read());const size=data.settings?.['globalUi.font.size']?.value;
      return VALID_SIZE(size)?size:16;}catch{return 16;}},
    async readSnapshot(){const text=read();return {text,etag:await checksum(text)};},
    async saveSnapshot({text,etag}){
      if(await checksum(read())!==etag)throw Error('设置文件版本已更新，请重新加载');
      const parsed=JSON.parse(text);
      if(!parsed||typeof parsed!=='object'||Array.isArray(parsed)||
        parsed.settings?.['globalUi.font.family']?.value!=='Sarasa' ||
        !VALID_SIZE(parsed.settings?.['globalUi.font.size']?.value))
        throw Error('设置值无效：只允许 Sarasa 和 8–32 px 字号');
      if(!storage)throw Error('本地设置存储不可用');
      storage.setItem(KEY,text);
    },
  });
}
