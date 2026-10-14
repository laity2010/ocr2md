/** Settings UI preferences owned by OCR2MD V4 (not Workspace or Workbench). */
export const DEFAULT_UI_SETTINGS=Object.freeze({
  sourceFontSize:13,
  sourceLineHeight:1.5,
  sourceComments:true,
  previewHeight:30,
  accentColor:'#83c092',
});
export function parseUiSettings(value){
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('设置必须为 JSON 对象');
  const keys=Object.keys(DEFAULT_UI_SETTINGS);
  const unknown=Object.keys(value).filter(key=>!keys.includes(key));
  if(unknown.length)throw Error('未知设置项：'+unknown.join('、'));
  const settings={...DEFAULT_UI_SETTINGS,...value};
  if(!Number.isInteger(settings.sourceFontSize)||settings.sourceFontSize<11||settings.sourceFontSize>24)
    throw Error('sourceFontSize 必须为 11–24');
  if(typeof settings.sourceLineHeight!=='number'||!Number.isFinite(settings.sourceLineHeight)||
      settings.sourceLineHeight<1||settings.sourceLineHeight>2.5)
    throw Error('sourceLineHeight 必须为 1–2.5');
  if(typeof settings.sourceComments!=='boolean')throw Error('sourceComments 必须为布尔值');
  if(!Number.isInteger(settings.previewHeight)||settings.previewHeight<20||settings.previewHeight>45)
    throw Error('previewHeight 必须为 20–45');
  if(typeof settings.accentColor!=='string'||!/^#[0-9a-fA-F]{6}$/.test(settings.accentColor))
    throw Error('accentColor 必须为 #RRGGBB');
  return settings;
}
