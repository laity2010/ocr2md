/** CM6-native inline source-line action, owned by the source Layout pane.
 * Only the caret line replaces its gutter number with an actual <button>.
 * Four menu items appear next to that button; CMD owns every edit.
 */
import {Compartment,RangeSet,StateEffect} from '@codemirror/state';
import {EditorView,GutterMarker,lineNumberMarkers} from '@codemirror/view';
import {planCalloutAtCursor} from './source-callout-plan.js';
import {planFencedBlock} from './source-fence-plan.js';
import './source-line-callout-menu.css';

const markerCompartment=new WeakMap();

/** Share CMD's half-open line-selection rule, including reverse selections. */
function summarizeSourceLineSelection(doc,selection){
  const lines=new Set();
  let selected=false;
  for(const range of selection.ranges){
    selected||=!range.empty;
    const start=doc.lineAt(range.from).number;
    const end=doc.lineAt(range.empty?range.to:Math.max(range.from,range.to-1)).number;
    for(let n=start;n<=end;n++)lines.add(n);
  }
  const ordered=[...lines].sort((a,b)=>a-b);
  const start=ordered[0],end=ordered[ordered.length-1];
  return Object.freeze({selected,count:ordered.length,start,end,
    text:selected?`已选 ${ordered.length} 行 · 第 ${start}${start===end?'':`–${end}`} 行`:
      `未选区 · 光标第 ${doc.lineAt(selection.main.head).number} 行`});
}


class CaretLineButton extends GutterMarker {
  constructor(number,onOpen,onPress){super();this.number=number;this.onOpen=onOpen;this.onPress=onPress;}
  eq(other){return other instanceof CaretLineButton&&this.number===other.number&&this.onOpen===other.onOpen&&this.onPress===other.onPress;}
  toDOM(){
    const button=document.createElement('button');
    button.type='button';
    button.className='ocr-source-caret-line-button';
    button.dataset.line=String(this.number);
    button.textContent=String(this.number)+' ▾';
    button.setAttribute('aria-label','第 '+this.number+' 行操作');
    button.setAttribute('aria-haspopup','menu');
    button.setAttribute('aria-expanded','false');
    button.title='当前光标行操作';
    button.addEventListener('pointerdown',event=>{
      // Capture selection BEFORE touch or mouse focus transfers to the gutter.
      this.onPress();
      event.stopPropagation();
      if(event.pointerType!=='touch')event.preventDefault();
    });
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();this.onOpen(button);
    });
    return button;
  }
}

export function createSourceLineCalloutMenu({host,view,onInsert,onQuoteIndent,onBeforeSourceEdit=()=>{}}){
  if(!(host instanceof HTMLElement)||!view||typeof onInsert!=='function'||
     typeof onQuoteIndent!=='function')
    throw TypeError('Source line menu requires source pane, CM6 and insertion action');
  let disposed=false,activeButton=null,target=null,pressSelection=null,actionInProgress=false;
  let viewportAnchorToken=0;
  const viewportTimers=new Set();
  const menu=document.createElement('div');
  menu.className='ocr-source-line-menu';menu.hidden=true;
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','源码行操作');
  const summary=document.createElement('div');
  summary.className='ocr-source-line-menu-summary';
  summary.setAttribute('role','status');
  summary.setAttribute('aria-live','polite');
  const insert=document.createElement('button');
  insert.type='button';insert.setAttribute('role','menuitem');
  insert.textContent='插入 Callout';
  const fence=document.createElement('button');
  fence.type='button';fence.setAttribute('role','menuitem');
  fence.textContent='插入围栏块';
  const increase=document.createElement('button');
  increase.type='button';increase.setAttribute('role','menuitem');
  increase.textContent='>+ 增加引用层级';increase.dataset.direction='1';
  const decrease=document.createElement('button');
  decrease.type='button';decrease.setAttribute('role','menuitem');
  decrease.textContent='>− 减少引用层级';decrease.dataset.direction='-1';
  menu.append(summary,insert,fence,increase,decrease);host.append(menu);
  function close(){
    viewportAnchorToken++;
    for(const timer of viewportTimers)clearTimeout(timer);
    viewportTimers.clear();
    menu.hidden=true;
    menu.style.maxHeight='';
    activeButton?.setAttribute('aria-expanded','false');
    activeButton=null;target=null;pressSelection=null;
  }
  function refreshSummary(){
    summary.textContent=summarizeSourceLineSelection(view.state.doc,view.state.selection).text;
  }
  /** Position the popup outside the ENTIRE current source line, including
   * multi-row soft wraps. The gutter button itself is too short an anchor:
   * positioning at its top hides exactly the line being edited. */
  function positionMenu(){
    if(menu.hidden||!activeButton)return;
    const offset=view.state.selection.main.head;
    const sourceLine=view.state.doc.lineAt(offset);
    let lineRect=null;
    try{
      const node=view.domAtPos(sourceLine.from).node;
      const el=node instanceof Element?node:node.parentElement;
      lineRect=el?.closest('.cm-line')?.getBoundingClientRect()??null;
    }catch{}
    const buttonRect=activeButton.getBoundingClientRect();
    const sourceRect=lineRect??buttonRect;
    const gap=8,edge=6;
    const menuWidth=menu.offsetWidth;
    const naturalHeight=menu.scrollHeight;
    const below=Math.max(0,innerHeight-edge-sourceRect.bottom-gap);
    const above=Math.max(0,sourceRect.top-gap-edge);
    const placeBelow=below>=naturalHeight || below>=above;
    const freeSpace=placeBelow?below:above;
    // Extremely small mobile viewports still need a usable popup. Scroll
    // menu items on the chosen side instead of drawing over the active line.
    menu.style.maxHeight=Math.max(0,freeSpace)+'px';
    menu.style.left=Math.max(edge,Math.min(buttonRect.right+5,innerWidth-menuWidth-edge))+'px';
    menu.style.top=(placeBelow?sourceRect.bottom+gap:sourceRect.top-gap-
      Math.min(naturalHeight,freeSpace))+'px';
    menu.dataset.placement=placeBelow?'below':'above';
  }
  function keepCaretRowVisibleAt(screenY){
    if(!Number.isFinite(screenY))return;
    const token=++viewportAnchorToken;
    // CM6 may reflow long Markdown rows after the CMD transaction. Use a few
    // bounded post-layout corrections. iPad WebKit can throttle rAF while the
    // native selection/menu takes focus, so do not depend on animation frames.
    for(const delay of [0,55,115]){
      const timer=setTimeout(()=>{
        viewportTimers.delete(timer);
        if(token!==viewportAnchorToken||disposed||menu.hidden)return;
        const row=view.dom.querySelector('.ocr-source-caret-line-button');
        if(!row)return;
        const delta=row.getBoundingClientRect().top-screenY;
        if(Math.abs(delta)>1)view.scrollDOM.scrollTop+=delta;
        positionMenu();
      },delay);
      viewportTimers.add(timer);
    }
  }
  function savePointerSelection(){
    pressSelection={doc:view.state.doc,selection:view.state.selection};
  }
  function restoreSelection(captured){
    if(!captured||!view.state.doc.eq(captured.doc))return false;
    if(!view.state.selection.eq(captured.selection)){
      const wasInProgress=actionInProgress;
      actionInProgress=true;
      try{view.dispatch({selection:captured.selection});}
      finally{actionInProgress=wasInProgress;}
    }
    return true;
  }
  function open(button){
    if(disposed)return;
    if(activeButton===button&&!menu.hidden){close();return;}
    const saved=pressSelection;
    close();
    // Safari may blur the CM6 content while handling the gutter tap.
    // Restore the selection captured before pointerdown, if it was changed.
    if(saved&&!restoreSelection(saved))return;
    const state=view.state;
    const offset=state.selection.main.head;
    const number=state.doc.lineAt(offset).number;
    if(button.dataset.line!==String(number))return;
    activeButton=button;target={snapshot:state.doc,offset,selection:state.selection};
    refreshSummary();
    button.setAttribute('aria-expanded','true');
    menu.hidden=false;
    positionMenu();
  }
  const gutter= lineNumberMarkers.compute(['selection'],state=>{
    const offset=state.selection.main.head;
    const line=state.doc.lineAt(offset);
    return RangeSet.of([new CaretLineButton(line.number,open,savePointerSelection).range(line.from)]);
  });
  const selectionObserver=EditorView.updateListener.of(update=>{
    if(!menu.hidden&&update.selectionSet&&!actionInProgress)close();
  });
  let instance=markerCompartment.get(view);
  if(!instance){instance=new Compartment();markerCompartment.set(view,instance);
    view.dispatch({effects:StateEffect.appendConfig.of(instance.of([gutter,selectionObserver]))});
  }else view.dispatch({effects:instance.reconfigure([gutter,selectionObserver])});
  insert.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const captured=target;
    close();
    if(!captured||!restoreSelection({doc:captured.snapshot,selection:captured.selection}))return;
    onBeforeSourceEdit();
    onInsert(planCalloutAtCursor(view.state.doc.toString(),captured.offset));
  });
  fence.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const captured=target;
    close();
    if(!captured||!restoreSelection({doc:captured.snapshot,selection:captured.selection}))return;
    const range=captured.selection.main;
    const plan=planFencedBlock(view.state.doc.toString(),range.from,range.to);
    onBeforeSourceEdit();
    onInsert(plan,'fence');
  });
  for(const button of [increase,decrease]){
    button.addEventListener('pointerdown',event=>{
      actionInProgress=true;
      if(event.pointerType!=='touch')event.preventDefault();
    });
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();
      actionInProgress=true;
      try{
        const captured=target;
        if(!captured||!restoreSelection({doc:captured.snapshot,selection:captured.selection})){
          close();return;
        }
        // CMD maps the full selection. The Layout's source-edit signal keeps
        // the editor—not the preview—as the scroll leader during reflow.
        const caretY=activeButton?.getBoundingClientRect().top;
        onBeforeSourceEdit();
        onQuoteIndent(Number(button.dataset.direction));
        target={snapshot:view.state.doc,offset:view.state.selection.main.head,
          selection:view.state.selection};
        refreshSummary();
        positionMenu();
        keepCaretRowVisibleAt(caretY);
      }finally{actionInProgress=false;}
    });
  }
  const outside=event=>{
    if(!menu.hidden&&!menu.contains(event.target)&&!event.target.closest?.('.ocr-source-caret-line-button'))close();
  };
  const escape=event=>{
    if(event.key==='Escape'&&!menu.hidden){
      event.preventDefault();const button=activeButton;close();button?.focus();
    }
  };
  document.addEventListener('pointerdown',outside);
  document.addEventListener('keydown',escape);
  window.addEventListener('resize',close);
  return Object.freeze({
    dispose(){
      disposed=true;close();view.dispatch({effects:instance.reconfigure([])});
      document.removeEventListener('pointerdown',outside);
      document.removeEventListener('keydown',escape);
      window.removeEventListener('resize',close);menu.remove();
    },
  });
}
