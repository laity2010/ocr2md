/** Source-pane health is a CM6 *view* concern, never a second Markdown store.
 * AG, CMD and PDF can repaint independently, but none may replace/remove the
 * editor doc to "fix" a blank viewport. Recovery only requests CM6 layout.
 */
import {EditorView} from '@codemirror/view';
import {viewStore} from './view-store.js';

export function inspectCM6SourceVisibility(view){
  const doc=view.state.doc;
  if(!doc.length)return {status:'empty-doc',docLength:0};
  const scroll=view.scrollDOM;
  if(!view.dom.isConnected||!scroll.isConnected)return {status:'detached',docLength:doc.length};
  const bounds=scroll.getBoundingClientRect();
  if(bounds.height<64||bounds.width<80||document.hidden)return {status:'hidden',docLength:doc.length};
  // CM6 only renders its current virtual viewport; use actual bounding boxes
  // rather than .cm-content.textContent or total document line count.
  const visible=[...view.contentDOM.querySelectorAll('.cm-line')].some(line=>{
    const rect=line.getBoundingClientRect();
    return rect.height>0&&rect.bottom>bounds.top+1&&rect.top<bounds.bottom-1;
  });
  return {status:visible?'visible':'blank',docLength:doc.length};
}

export function createCM6SourceVisibilityGuard(view,report=()=>{}){
  let frame=0,pending=false,disposed=false,blankStreak=0,reported=false;
  let focusTarget=null;
  function inspect(){
    frame=0;
    if(disposed)return;
    const state=inspectCM6SourceVisibility(view);
    if(state.status!=='blank'&&state.status!=='detached'){
      blankStreak=0;
      if(reported)report('');
      reported=false;
      return;
    }
    if(state.status==='detached'){
      if(blankStreak++<3){frame=requestAnimationFrame(inspect);return;}
      if(!reported){
        reported=true;
        report('⚠ 源码仍在 CM6，但源码编辑器已脱离窗格；未清空文档');
      }
      return;
    }
    // A WebKit CM6 viewport can be temporarily empty immediately after a
    // large folded-document jump. Give CM6 a bounded opportunity to measure
    // before touching the scroll position; never dispatch text changes.
    if(blankStreak++<2){
      view.requestMeasure();
      frame=requestAnimationFrame(inspect);
      return;
    }
    if(blankStreak===3){
      const position=view.viewport.from;
      view.dispatch({effects:EditorView.scrollIntoView(position,{y:'start',yMargin:24})});
      view.requestMeasure();
      frame=requestAnimationFrame(inspect);
      return;
    }
    if(!reported){
      reported=true;
      report('⚠ 源码仍在 CM6，源码窗渲染异常；未清空或重建文档');
    }
  }
  function schedule(){
    if(disposed||pending)return;
    pending=true;
    // CM6 scrollIntoView is realized during its next measure/paint pass.
    requestAnimationFrame(()=>{
      pending=false;
      if(!disposed&&!frame)frame=requestAnimationFrame(inspect);
    });
  }
  const observer=new ResizeObserver(schedule);
  observer.observe(view.scrollDOM);
  document.addEventListener('visibilitychange',schedule);
  const unsubscribe=viewStore.subscribe((next,prev)=>{
    if(next.focusTarget!==prev.focusTarget||
       next.documentRevision!==prev.documentRevision)schedule();
  });
  schedule();
  return Object.freeze({
    schedule,
    inspect:()=>inspectCM6SourceVisibility(view),
    dispose(){disposed=true;observer.disconnect();unsubscribe();
      document.removeEventListener('visibilitychange',schedule);
      if(frame)cancelAnimationFrame(frame);},
  });
}
