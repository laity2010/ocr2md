/** Register an optional *lazy* PDF module before the shared Frame boots.
 * A book with no PDF configured loads no PDF.js code or worker.
 */
import {registerFramePdfPane} from '../frame/layout.js';
import './focus-theme.css';
import './title-view.css';
// Only Lab OCR installs the shared four-pane review-focus palette.
document.getElementById('workspace')?.classList.add('ocr-review-focus-unified');
registerFramePdfPane(context=>{
  let disposed=false,viewer=null,initialization=null,overlayConfig=null,
    pendingFocus=null,activeSource=null,formulaHighlights=[];
  return Object.freeze({
    async loadPdf(source){
      if(source!==activeSource){pendingFocus=null;activeSource=source;}
      if(!source)return viewer?.loadPdf(null)??false;
      if(!initialization)initialization=import('./pdf-viewer.js').then(module=>{
        if(disposed)return null;
        viewer=module.mountLabOcrPdf(context);
        if(overlayConfig)viewer.setOverlays(overlayConfig);
        viewer.setFormulaHighlights(formulaHighlights);
        return viewer;
      });
      const mounted=await initialization;
      if(!mounted)return false;
      const loaded=await mounted.loadPdf(source);
      if(loaded&&pendingFocus){
        if(pendingFocus.formula)mounted.focusFormula(pendingFocus);
        else mounted.focusBlock(pendingFocus);
      }
      return loaded;
    },
    setOverlays(config){overlayConfig={...overlayConfig,...config};return viewer?.setOverlays(config)??false;},
    setFormulaHighlights(rows=[]){
      formulaHighlights=rows;
      return viewer?.setFormulaHighlights(rows)??rows.length;
    },
    focusBlock(target){pendingFocus=target;return viewer?.focusBlock(target)??false;},
    focusFormula(target){pendingFocus={...target,formula:true};
      return viewer?.focusFormula(target)??false;},
    async renderFormulaCrop(target){
      const mounted=viewer??await initialization?.catch(()=>null);
      return mounted?.renderFormulaCrop(target)??null;
    },
    clearFocus(){pendingFocus=null;return viewer?.clearFocus()??false;},
    invalidateOverlayPage(page,changedRows){
      return viewer?.invalidateOverlayPage(page,changedRows)??false;
    },
    repaintOverlayPage(page){return viewer?.repaintOverlayPage(page)??false;},
    relayout(){viewer?.relayout?.();},
    dispose(){disposed=true;viewer?.dispose();},
  });
});
await import('../frame/frame.js');
