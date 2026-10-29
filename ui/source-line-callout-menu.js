/** CM6-native inline source-line action, owned by the source Layout pane.
 * Only the caret line replaces its gutter number with an actual <button>.
 * Three menu items appear next to that button; CMD owns every edit.
 */
import {Compartment,RangeSet,StateEffect} from '@codemirror/state';
import {EditorView,GutterMarker,lineNumberMarkers} from '@codemirror/view';
import {planCalloutAtCursor} from './source-callout-plan.js';
import './source-line-callout-menu.css';

const markerCompartment=new WeakMap();

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

export function createSourceLineCalloutMenu({host,view,onInsert,onQuoteIndent}){
  if(!(host instanceof HTMLElement)||!view||typeof onInsert!=='function'||
     typeof onQuoteIndent!=='function')
    throw TypeError('Source line menu requires source pane, CM6 and insertion action');
  let disposed=false,activeButton=null,target=null,pressSelection=null,actionInProgress=false;
  const menu=document.createElement('div');
  menu.className='ocr-source-line-menu';menu.hidden=true;
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','源码行操作');
  const insert=document.createElement('button');
  insert.type='button';insert.setAttribute('role','menuitem');
  insert.textContent='插入 Callout';
  const increase=document.createElement('button');
  increase.type='button';increase.setAttribute('role','menuitem');
  increase.textContent='>+ 增加引用层级';increase.dataset.direction='1';
  const decrease=document.createElement('button');
  decrease.type='button';decrease.setAttribute('role','menuitem');
  decrease.textContent='>− 减少引用层级';decrease.dataset.direction='-1';
  menu.append(insert,increase,decrease);host.append(menu);
  function close(){
    menu.hidden=true;
    activeButton?.setAttribute('aria-expanded','false');
    activeButton=null;target=null;pressSelection=null;
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
    button.setAttribute('aria-expanded','true');
    menu.hidden=false;
    const box=button.getBoundingClientRect();
    const menuWidth=menu.offsetWidth,menuHeight=menu.offsetHeight;
    menu.style.left=Math.max(6,Math.min(box.right+5,innerWidth-menuWidth-6))+'px';
    menu.style.top=Math.max(6,Math.min(box.top,innerHeight-menuHeight-6))+'px';
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
    onInsert(planCalloutAtCursor(view.state.doc.toString(),captured.offset));
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
        // CMD maps the full selection. Keep the menu open for repeated levels.
        onQuoteIndent(Number(button.dataset.direction));
        target={snapshot:view.state.doc,offset:view.state.selection.main.head,
          selection:view.state.selection};
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
