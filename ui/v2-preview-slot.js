/** V1 Lab-OCR Frame PDF-slot lifecycle for the V2 frame shell.
 * One PDF.js viewer per preview pane. Split only moves its DOM and tools.
 */
import {mountV2PDF} from './v2-pdf-viewer.js';
import {mountV2MarkdownPreview} from './v2-markdown-preview.js';

export function mountV2PreviewSlot({pane,mdScroller,modeSelect,pdfSurface,pdfTools,pdfSlot}){
  if(pdfSlot.preview)throw Error('V2 PDF preview owner already mounted');
  const markdown=mountV2MarkdownPreview(mdScroller);
  const pdf=mountV2PDF(pdfSurface,{toolbar:pdfTools});
  const pdfOption=modeSelect.querySelector('option[value="pdf"]');
  const toolbar=pane.querySelector('.ocr-preview-switchbar');
  let disposed=false;
  function setMode(next){
    if(disposed)return false;
    if(next==='pdf'&&(pdfSlot.detached||!pdfSurface.v2PDFPort)){
      modeSelect.value='md';return false;
    }
    if(next!=='md'&&next!=='pdf')return false;
    pane.dataset.previewMode=next;
    modeSelect.value=next;
    pdfTools.hidden=next!=='pdf';
    pdfSurface.setAttribute('aria-hidden',String(next!=='pdf'&&!pdfSlot.detached));
    if(next==='pdf')pdf.layout();
    return true;
  }
  function setSplit(enabled){
    pdfOption.disabled=Boolean(enabled);
    if(enabled){
      setMode('md');
      if(pdfSlot.detached){
        // Exact V1 special case: PDF tools now live in the detached pane.
        // They must stay visible even though preview mode is Markdown.
        pdfTools.hidden=false;
        pdfSurface.setAttribute('aria-hidden','false');
      }
    }else setMode(modeSelect.value);
  }
  const preview=Object.freeze({
    surface:pdfSurface,tools:pdfTools,
    restore(){
      // Original V1 Frame PDF-slot semantics: move the same nodes back.
      pane.append(pdfSurface);
      toolbar.append(pdfTools);
      pdf.layout();
    },
    setSplit,setMode,
  });
  function onChange(){setMode(modeSelect.value);}
  modeSelect.addEventListener('change',onChange);
  pdfSlot.preview=preview;
  pdfSlot.current=pdf;
  setSplit(false);
  return Object.freeze({
    layout(){markdown.layout();pdf.layout();},
    dispose(){
      disposed=true;
      modeSelect.removeEventListener('change',onChange);
      if(pdfSlot.detached){pdfSlot.detached=null;preview.restore();}
      pdfSlot.preview=null;pdfSlot.current=null;
      pdf.dispose();markdown.dispose();
    },
  });
}
export function mountV2DetachedPDF({surface,actions,pdfSlot}){
  const preview=pdfSlot.preview;
  if(!preview||pdfSlot.detached)throw Error('V1 PDF split owner unavailable');
  surface.replaceWith(preview.surface);
  actions.replaceChildren(preview.tools);
  pdfSlot.detached={surface:preview.surface,actions};
  preview.setSplit(true);
  pdfSlot.current?.layout();
  return Object.freeze({
    layout(){pdfSlot.current?.layout();},
    dispose(){
      if(pdfSlot.detached?.surface!==preview.surface)return;
      pdfSlot.detached=null;
      preview.restore();
      preview.setSplit(false);
      pdfSlot.current?.layout();
    },
  });
}
