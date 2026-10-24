/** CM source module explicitly registers its public setting with Settings API.
 * A callback is subscribed to an event; Settings never imports CM module code.
 */
export const DEFAULT_CM_FONT_SIZE=12;
export const CM_FONT_SETTING_KEY='globalUi.cmSource.defaultFontSize';
export function registerCMSourceFontSetting(settings){
  settings.register({module:'C',key:CM_FONT_SETTING_KEY,
    category:['全局 UI','CM 源码窗'],label:'默认字号',
    comment:'所有 CM6 源码窗的默认字号（8–32 pt）',
    type:'number',control:'slider',defaultValue:DEFAULT_CM_FONT_SIZE,min:8,max:32,step:1,
    message:'settings.changed'});
  return settings.subscribe({module:'C',key:CM_FONT_SETTING_KEY},({value})=>{
    document.documentElement.style.setProperty('--ocr-cm-source-font-size',value+'pt');
  });
}
