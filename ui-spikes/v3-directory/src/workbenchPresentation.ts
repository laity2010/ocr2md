/** V2 typography semantics shared by AG heading cells, v2 CodeMirror and Markdown preview. */
import type { DirectorySettings } from "./settings";

const MONO='var(--laity-ui-font,"Sarasa Fixed SC","Sarasa Mono SC",ui-monospace,monospace)';
const SYSTEM="-apple-system,BlinkMacSystemFont,system-ui,sans-serif";
export function applyWorkbenchTypography(settings:DirectorySettings,root:HTMLElement=document.documentElement):void{
  const vars=root.style;
  vars.setProperty("--grid-font-size",`${settings.workbenchGridFontSize}px`);
  vars.setProperty("--ocr2md-hard-return-color",settings.mdHardReturnColor);
  vars.setProperty("--v3-ios-caret-color","#0a84ff");
  vars.setProperty("--v3-source-font-size",`${settings.mdSourceFontSize}px`);
  vars.setProperty("--v3-preview-font-size",`${settings.mdPreviewFontSize}px`);
  vars.setProperty("--v3-grid-row-height",`${settings.workbenchGridRowHeight}px`);
  vars.setProperty("--v3-source-line-height",String(settings.mdSourceLineHeight));
  vars.setProperty("--v3-preview-line-height",String(settings.mdPreviewLineHeight));
  Object.entries(settings.mdCodeColors).forEach(([token,color])=>
    vars.setProperty(`--obsidian-code-${token}`,color));
  vars.setProperty("--v3-md-font-family",settings.mdFontFamily==="system"?SYSTEM:MONO);
  settings.mdHeadingSizes.forEach((size,i)=>{
    vars.setProperty(`--obsidian-h${i+1}-size`,`${size}em`);
    vars.setProperty(`--v3-heading-${i+1}-absolute-size`,`${settings.mdSourceFontSize*size}px`);
  });
  settings.mdHeadingColors.forEach((color,i)=>vars.setProperty(`--obsidian-h${i+1}`,color));
}
export function headingLineHeight(settings:DirectorySettings,level:number):number{
  if(!Number.isInteger(level)||level<1||level>6)return settings.workbenchGridRowHeight;
  return Math.max(settings.workbenchGridRowHeight,
    Math.ceil(settings.mdSourceFontSize*settings.mdHeadingSizes[level-1]*1.3+15));
}
/** Use the actual IR-rendered heading, not MinerU's unreliable OCR level. */
export function renderedHeadingLevel(markdown:string):number|null{
  const match=/^\s{0,3}(#{1,6})(?=\s|$)/u.exec(markdown);
  return match?match[1].length:null;
}
