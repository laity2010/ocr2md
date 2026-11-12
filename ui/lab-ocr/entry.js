/** Register an optional *lazy* PDF module before the shared Frame boots.
 * A book with no PDF configured loads no PDF.js code or worker.
 */
import {registerFramePdfPane} from '../frame/layout.js';
registerFramePdfPane(context=>{
  let disposed=false,viewer=null,initialization=null,overlayConfig=null,pendingFocus=null,activeSource=null;
  return Object.freeze({
    async loadPdf(source){
      if(source!==activeSource){pendingFocus=null;activeSource=source;}
      if(!source)return viewer?.loadPdf(null)??false;
      if(!initialization)initialization=import('./pdf-viewer.js').then(module=>{
        if(disposed)return null;
        viewer=module.mountLabOcrPdf(context);
        if(overlayConfig)viewer.setOverlays(overlayConfig);
        return viewer;
      });
      const mounted=await initialization;
      if(!mounted)return false;
      const loaded=await mounted.loadPdf(source);
      if(loaded&&pendingFocus)mounted.focusBlock(pendingFocus);
      return loaded;
    },
    setOverlays(config){overlayConfig={...overlayConfig,...config};return viewer?.setOverlays(config)??false;},
    focusBlock(target){pendingFocus=target;return viewer?.focusBlock(target)??false;},
    relayout(){viewer?.relayout?.();},
    dispose(){disposed=true;viewer?.dispose();},
  });
});
await import('../frame/frame.js');
