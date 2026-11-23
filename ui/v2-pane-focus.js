/** V2 cross-pane coordinator uses the exact V1 transient view-store and
 * scroll-sync module, layered with logical IDs. No second state store/editor.
 */
import {viewStore,publishFocus} from './view-store.js';
import {createScrollSync} from './scroll-sync.js';
import {logicalAtSourceLine,logicalForAG} from './v2-focus-map.js';

const sourcePort=()=>document.querySelector('#workspace #editor')?.v2SourcePort;
function emit(row,origin){
  if(!row)return;
  document.dispatchEvent(new CustomEvent('v2-sync-focus',{detail:{
    logicalId:row.logicalId,baseBlockId:row.baseBlockId,logicalOrder:row.logicalOrder,
    origin,
  }}));
}
export function focusLogical(row,origin){
  const source=sourcePort();if(!source||!row)return false;
  const line=source.getLineAtOffset(row.from);
  if(!Number.isInteger(line))return false;
  publishFocus({sourceLine:line,origin,intent:'click',elementId:String(row.logicalId)});
  if(origin!=='cm6')source.locateLogicalId(row.logicalId);
  return true;
}
export function focusSourceLine(line,origin='preview'){
  const source=sourcePort();if(!source)return false;
  const row=logicalAtSourceLine(source.getIntervals(),source.getDoc(),line);
  if(!row)return false;
  // Keep actual click target line for headings, footnotes, multiline blocks.
  publishFocus({sourceLine:line,origin,intent:'click',elementId:String(row.logicalId)});
  if(origin!=='cm6')source.locateSourceLine(line);
  return true;
}
export function mountV2PaneFocus(previewPane,previewBody){
  let scroll=null,lastId=null;
  const initialize=()=>{
    if(scroll||!sourcePort())return;
    scroll=createScrollSync(()=>sourcePort()?.getEditorView(),previewPane,previewBody);
    scroll.measureLater();
  };
  const onSession=event=>{
    initialize();
    const kind=event.detail?.kind;
    if(kind==='clear'){lastId=null;scroll?.measureLater();return;}
    if(kind==='load'){lastId=null;scroll?.measureLater();}
    if(kind==='edit')scroll?.measureLater();
  };
  const onAG=event=>{
    const {table,row,workspace}=event.detail||{};
    const source=sourcePort();if(!source?.getState().loaded||source.getWorkspace()!==workspace)return;
    const match=logicalForAG(source.getIntervals(),table,row);
    if(match)focusLogical(match,'outline');
  };
  const unsub=viewStore.subscribe((state,prev)=>{
    if(state.focusTarget!==prev.focusTarget && state.focusTarget){
      const target=state.focusTarget;
      const source=sourcePort();if(!source?.getState().loaded)return;
      const row=logicalAtSourceLine(source.getIntervals(),source.getDoc(),target.sourceLine);
      if(row){lastId=row.logicalId;emit(row,target.origin);}
    }
    // WP19: scrollTarget means VIEWPORT POSITION, never selection.
    // ScrollSync still moves CM6/Markdown panes together, but only the
    // explicit focusTarget/click path above may update the logical highlight.
    // Otherwise simply swiping a pane silently moves AG/PDF selection and
    // can change the selected logical page without any click or caret move.
  });
  document.addEventListener('v2-cm-session',onSession);
  document.addEventListener('v2-ag-row-click',onAG);
  const onPreviewToggle=()=>scroll?.measureLater();
  previewBody.addEventListener('toggle',onPreviewToggle,true);
  previewBody.addEventListener('load',onPreviewToggle,true);
  queueMicrotask(initialize);
  const port=Object.freeze({
    getActiveId:()=>lastId,
    getScrollDriver:()=>scroll?.lastDriver??null,
    getScrollAnchorCount:()=>scroll?.anchorCount??0,
    focusId:id=>{
      const source=sourcePort();const row=source?.getIntervals().find(row=>row.logicalId===id);
      return focusLogical(row,'outline');
    },
    beforeRender:()=>scroll?.beforeRender()??null,
    afterRender:previous=>scroll?.afterRender(previous),
    measureLater:()=>scroll?.measureLater(),
  });
  return Object.freeze({port,dispose(){unsub();scroll?.dispose();
    document.removeEventListener('v2-cm-session',onSession);
    document.removeEventListener('v2-ag-row-click',onAG);
    previewBody.removeEventListener('toggle',onPreviewToggle,true);
    previewBody.removeEventListener('load',onPreviewToggle,true);
  }});
}
