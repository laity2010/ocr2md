/** PDF owns the label magnification setting; Settings publishes the value
 * through its public subscription contract, Shell routes to Workspace.
 * Physical OCR geometry and CMD text are intentionally untouched.
 */
export const PDF_BLOCK_LABEL_SCALE_KEY='pdf.textBlocks.labelScale';
export const PDF_BLOCK_LABEL_DEFAULT_SCALE=1;
export function registerPDFBlockLabelScaleSetting(settings,applyScale){
  settings.register({module:'P',key:PDF_BLOCK_LABEL_SCALE_KEY,
    category:['PDF','文本块'],label:'标签放大倍数',
    comment:'PDF 原文页左右两侧的父块、子块标签统一缩放。自动受页面空白边距和避让规则限制，不覆盖 PDF 内容；1.0 为默认尺寸。',
    type:'number',control:'slider',unit:'×',
    defaultValue:PDF_BLOCK_LABEL_DEFAULT_SCALE,min:0.5,max:2.5,step:0.1,
    message:'settings.changed'});
  return settings.subscribe({module:'P',key:PDF_BLOCK_LABEL_SCALE_KEY},({value})=>applyScale(value));
}
