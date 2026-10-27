/** WCP application integration contract.
 *
 * Formal V6 exports an intentionally inert adapter; an experiment can supply
 * its own module through the named Vite module slot. No shared UI internals
 * are patched by text replacement.
 */
export function createWCPRuntime(){
  return Object.freeze({
    editorExtensions:[],
    preservePreviewNodes:false,
    onLayoutReady(){return ()=>{};},
    wrapCMD:cm=>cm,
    onCMReady(){},
    onAGReady(){},
    onPreviewInit(){return ()=>{};},
    renderPreview(source,_panel,render){return render(source);},
  });
}
