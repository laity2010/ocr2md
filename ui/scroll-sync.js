/**
 * Scroll synchronization by source lines, not by scrollbar percentage.
 *
 * CM6 owns document coordinates; markdown-it supplies token.map to the
 * read-only preview. Zustand Vanilla transports only transient location events.
 * No MD text, DOM, editor history, or view instance is stored in Zustand.
 */
import {viewStore, publishScroll} from './view-store.js';
import {EditorView} from '@codemirror/view';

const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
const lerp=(a,b,t)=>a+(b-a)*clamp(t,0,1);
const leadingOffset=24;

export function createScrollSync(getEditor, previewPane, previewBody) {
  let anchors=[];
  let measuredRevision=-1;
  let lastDriver='cm6';
  let disposed=false;
  let measureFrame=0, sourceFrame=0, previewFrame=0;
  let sourceCorrectionFrame=0, sourceCorrectionTries=0, desiredSource=null;
  let explicitNavigation=false;
  // Programmatically moved followers generate 'scroll' events too.
  // Ignore exactly that movement, but allow immediate real user input.
  let ignoredSource=null,ignoredPreview=null;
  // CM6 virtual line heights can settle after scrollTop is assigned, producing
  // additional scroll events at a different pixel offset. A short follower
  // suppression window prevents those corrections from stealing leadership.
  // Actual wheel/touch/pointer/keyboard input clears it immediately.
  let suppressSourceUntil=0, suppressPreviewUntil=0;

  const sourceElement=()=>getEditor()?.scrollDOM;

  function measure() {
    if(disposed || !previewPane.isConnected) return;
    const paneRect=previewPane.getBoundingClientRect();
    const scroll=previewPane.scrollTop;
    anchors=[...previewBody.querySelectorAll('[data-source-start][data-source-end]')]
      .map(element=>{
        const start=Number(element.dataset.sourceStart);
        const end=Number(element.dataset.sourceEnd);
        const rect=element.getBoundingClientRect();
        return {start,end,
          top:rect.top-paneRect.top+scroll,
          bottom:Math.max(rect.bottom-paneRect.top+scroll,rect.top-paneRect.top+scroll+1)};
      })
      .filter(a=>Number.isFinite(a.start)&&Number.isFinite(a.end)&&a.end>a.start)
      .sort((a,b)=>a.start-b.start||a.end-b.end);
    measuredRevision=viewStore.getState().documentRevision;
  }

  function measureLater() {
    if(measureFrame || disposed) return;
    measureFrame=requestAnimationFrame(()=>{
      measureFrame=0;
      measure();
      // A new image height or Dockview width changes the visual positions.
      // Keep the driver pane still; only adjust the follower.
      if(viewStore.getState().scrollSyncEnabled && anchors.length) {
        // PDF and AG explicit location events are source-document driven.
        // Only an actual Markdown preview scroll may drive the CM6 follower;
        // treating 'pdf' as 'preview' pulls everyone back to stale MD text.
        if(lastDriver==='preview')moveSource(readPreview());
        else movePreview(readSource());
      }
    });
  }

  function readSource() {
    const view=getEditor();
    if(!view || !view.scrollDOM.isConnected) return null;
    const rect=view.scrollDOM.getBoundingClientRect();
    if(rect.height<4) return null;
    const documentY=clamp(rect.top+leadingOffset,rect.top+1,rect.bottom-1)-view.documentTop;
    const block=view.lineBlockAtHeight(documentY);
    const line=view.state.doc.lineAt(block.from);
    return {
      sourceLine:line.number,
      fraction:clamp((documentY-block.top)/Math.max(1,block.height),0,0.9999),
    };
  }

  // Find a preview coordinate for an exact logical MD source line. Empty
  // evidence-comment ranges simply interpolate between adjacent rendered blocks.
  function previewY(position) {
    if(!position || !anchors.length) return null;
    const x=position.sourceLine+position.fraction;
    let before=null,after=null;
    for(const a of anchors) {
      if(x>=a.start && x<a.end) {
        // For nested blocks prefer the smallest enclosing source range.
        if(!before || !(before.start<=x&&x<before.end) ||
           (a.end-a.start)<(before.end-before.start)) before=a;
      } else if(a.end<=x && (!before || before.end<=a.end)) {
        before=a;
      } else if(a.start>x && (!after || after.start>a.start)) after=a;
    }
    if(before && before.start<=x && x<before.end)
      return lerp(before.top,before.bottom,(x-before.start)/(before.end-before.start));
    if(before && after)
      return lerp(before.bottom,after.top,(x-before.end)/Math.max(1,after.start-before.end));
    if(after) return after.top;
    return before?.bottom ?? null;
  }

  function readPreview() {
    if(!anchors.length || previewPane.clientHeight<4) return null;
    const y=previewPane.scrollTop+leadingOffset;
    // DOM order is the visual order (there can be nested/overlapping blocks).
    const visual=[...anchors].sort((a,b)=>a.top-b.top||(a.bottom-a.top)-(b.bottom-b.top));
    let before=null,after=null;
    for(const a of visual) {
      if(y>=a.top && y<a.bottom) {
        if(!before || !(before.top<=y&&y<before.bottom) ||
           (a.bottom-a.top)<(before.bottom-before.top)) before=a;
      } else if(a.bottom<=y && (!before || before.bottom<=a.bottom)) {
        before=a;
      } else if(a.top>y && (!after || after.top>a.top)) after=a;
    }
    let x;
    if(before && before.top<=y && y<before.bottom)
      x=lerp(before.start,before.end,(y-before.top)/Math.max(1,before.bottom-before.top));
    else if(before && after)
      x=lerp(before.end,after.start,(y-before.bottom)/Math.max(1,after.top-before.bottom));
    else x=after?.start ?? before?.end ?? 1;
    const doc=getEditor()?.state.doc;
    x=clamp(x,1,doc?.lines||Math.ceil(x));
    return {sourceLine:Math.floor(x),fraction:clamp(x-Math.floor(x),0,0.9999)};
  }

  function movePreview(position, independent=false) {
    if(!position || !anchors.length ||
       (!independent && !viewStore.getState().scrollSyncEnabled)) return;
    if(measuredRevision!==viewStore.getState().documentRevision) return;
    const y=previewY(position);
    if(y===null) return;
    const wanted=clamp(y-leadingOffset,0,
      Math.max(0,previewPane.scrollHeight-previewPane.clientHeight));
    if(Math.abs(previewPane.scrollTop-wanted)<1.5) return;
    ignoredPreview=wanted;
    suppressPreviewUntil=performance.now()+700;
    previewPane.scrollTop=wanted;
  }

  function adjustSource(position) {
    const view=getEditor();
    if(!position || !view || !view.scrollDOM.isConnected ||
       (!viewStore.getState().scrollSyncEnabled && !explicitNavigation)) return;
    const sourceLine=clamp(Math.floor(position.sourceLine),1,view.state.doc.lines);
    const block=view.lineBlockAt(view.state.doc.line(sourceLine).from);
    const scroller=view.scrollDOM;
    const screenTop=scroller.getBoundingClientRect().top;
    const targetScreenY=view.documentTop+block.top+
      clamp(position.fraction,0,0.9999)*block.height;
    const wanted=clamp(scroller.scrollTop+targetScreenY-screenTop-leadingOffset,
      0,Math.max(0,scroller.scrollHeight-scroller.clientHeight));
    if(Math.abs(scroller.scrollTop-wanted)<1.5) return;
    ignoredSource=wanted;
    suppressSourceUntil=performance.now()+700;
    scroller.scrollTop=wanted; // CM6's own scroll element; no selection dispatch.
  }
  function correctSource() {
    sourceCorrectionFrame=0;
    if(disposed || (lastDriver!=='preview' && !explicitNavigation) ||
       (!viewStore.getState().scrollSyncEnabled && !explicitNavigation) ||
       !desiredSource) return;
    const actual=readSource();
    const error=(desiredSource.sourceLine+desiredSource.fraction)-
      (actual?.sourceLine+actual?.fraction||0);
    if(Math.abs(error)<1.3 || sourceCorrectionTries++>=12) return;
    adjustSource(desiredSource);
    sourceCorrectionFrame=requestAnimationFrame(correctSource);
  }
  function moveSource(position,force=false) {
    const view=getEditor();
    if(!position || !view || !view.scrollDOM.isConnected ||
       (!viewStore.getState().scrollSyncEnabled && !force)) return;
    explicitNavigation=force;
    desiredSource=position;
    sourceCorrectionTries=0;
    if(sourceCorrectionFrame) cancelAnimationFrame(sourceCorrectionFrame);
    const line=clamp(Math.floor(position.sourceLine),1,view.state.doc.lines);
    suppressSourceUntil=performance.now()+700;
    // CM6 handles its virtualized layout before correcting finer intra-line
    // offsets. This effect never touches the selection or undo history.
    view.dispatch({effects:EditorView.scrollIntoView(view.state.doc.line(line).from,
      {y:'start',yMargin:leadingOffset})});
    // A short Dockview source pane may expose stale virtual line heights on
    // the first frame. Apply the best available pixel estimate immediately,
    // then continue correcting as CM6's height map settles.
    adjustSource(position);
    sourceCorrectionFrame=requestAnimationFrame(correctSource);
  }

  function publishFrom(origin) {
    if(disposed || !viewStore.getState().scrollSyncEnabled) return;
    if((origin==='cm6'&&performance.now()<suppressSourceUntil) ||
       (origin==='preview'&&performance.now()<suppressPreviewUntil)) return;
    const position=origin==='cm6'?readSource():readPreview();
    if(!position) return;
    lastDriver=origin;
    publishScroll(position.sourceLine,position.fraction,origin);
  }
  function sourceScrolled() {
    const scroller=sourceElement();
    if(!scroller || disposed || !viewStore.getState().scrollSyncEnabled) return;
    if(performance.now()<suppressSourceUntil) return;
    if(ignoredSource!==null && Math.abs(scroller.scrollTop-ignoredSource)<3) {
      ignoredSource=null;
      return;
    }
    ignoredSource=null;
    if(sourceFrame) return;
    sourceFrame=requestAnimationFrame(()=>{sourceFrame=0;publishFrom('cm6');});
  }
  function previewScrolled() {
    if(disposed || !viewStore.getState().scrollSyncEnabled) return;
    if(performance.now()<suppressPreviewUntil) return;
    if(ignoredPreview!==null && Math.abs(previewPane.scrollTop-ignoredPreview)<3) {
      ignoredPreview=null;
      return;
    }
    ignoredPreview=null;
    if(previewFrame) return;
    previewFrame=requestAnimationFrame(()=>{previewFrame=0;publishFrom('preview');});
  }

  const source=sourceElement();
  function sourceUserInput() {
    suppressSourceUntil=0; ignoredSource=null; desiredSource=null;
    explicitNavigation=false;
    if(sourceCorrectionFrame) cancelAnimationFrame(sourceCorrectionFrame);
    sourceCorrectionFrame=0;
  }
  function previewUserInput() { suppressPreviewUntil=0; ignoredPreview=null; }
  const inputEvents=['wheel','touchstart','pointerdown','keydown'];
  for(const event of inputEvents) {
    source?.addEventListener(event,sourceUserInput,{capture:true,passive:true});
    previewPane.addEventListener(event,previewUserInput,{capture:true,passive:true});
  }
  source?.addEventListener('scroll',sourceScrolled,{passive:true});
  previewPane.addEventListener('scroll',previewScrolled,{passive:true});
  previewPane.addEventListener('load',measureLater,true); // lazy MinerU images

  const observer=new ResizeObserver(measureLater);
  observer.observe(previewBody);
  observer.observe(previewPane);

  const unsubscribe=viewStore.subscribe((state,previous)=>{
    if(!state.scrollSyncEnabled) return;
    if(!previous.scrollSyncEnabled && state.scrollSyncEnabled) {
      lastDriver='cm6';
      measureLater();
    }
    if(state.scrollTarget!==previous.scrollTarget && state.scrollTarget &&
       state.scrollTarget.revision===state.documentRevision) {
      if(state.scrollTarget.origin==='cm6') movePreview(state.scrollTarget);
      else if(state.scrollTarget.origin==='preview') moveSource(state.scrollTarget);
    }
  });

  // Explicit three-pane navigation operates even with continuous sync off.
  // The initiating pane does not scroll itself; only the other panes follow.
  const unsubscribeFocus=viewStore.subscribe((state,previous)=>{
    const target=state.focusTarget;
    if(target===previous.focusTarget || !target ||
       target.revision!==state.documentRevision)return;
    const position={sourceLine:target.sourceLine,fraction:0};
    if(target.origin==='outline'){
      lastDriver='outline';
      moveSource(position,true);
      movePreview(position,true);
    } else if(target.origin==='cm6'){
      lastDriver='cm6';
      movePreview(position,true);
    } else if(target.origin==='preview'){
      lastDriver='preview';
      moveSource(position,true);
    } else if(target.origin==='pdf'){
      lastDriver='pdf';
      moveSource(position,true);
      movePreview(position,true);
    }
  });

  // Preserve the logical preview location across HTML re-renders. It matters
  // especially when inserting lines near the start of a 3,560-line document.
  function beforeRender() {
    if(!viewStore.getState().scrollSyncEnabled) return readPreview();
    return lastDriver==='preview' ? readPreview() : readSource();
  }
  function afterRender(preserved) {
    measure();
    if(!viewStore.getState().scrollSyncEnabled) {
      // No cross-view notification: just preserve this preview's own anchor.
      movePreview(preserved,true);
      return;
    }
    if(lastDriver==='preview' && preserved) movePreview(preserved);
    else movePreview(readSource());
  }

  function dispose() {
    disposed=true;
    source?.removeEventListener('scroll',sourceScrolled);
    for(const event of inputEvents) {
      source?.removeEventListener(event,sourceUserInput,true);
      previewPane.removeEventListener(event,previewUserInput,true);
    }
    previewPane.removeEventListener('scroll',previewScrolled);
    previewPane.removeEventListener('load',measureLater,true);
    observer.disconnect();
    unsubscribe();
    unsubscribeFocus();
    [measureFrame,sourceFrame,previewFrame,sourceCorrectionFrame].forEach(x=>x&&cancelAnimationFrame(x));
  }

  return {beforeRender,afterRender,measureLater,dispose,
    // Read-only diagnostics in development to verify real user scrolls.
    get anchorCount(){return anchors.length;},
    get lastDriver(){return lastDriver;},
    get currentSource(){return readSource();},
    get currentPreview(){return readPreview();},
    get pendingSource(){return desiredSource;},
    get correctionAttempts(){return sourceCorrectionTries;},
  };
}
