/** CM6-native inline source-line action, owned by the source Layout pane.
 * Only the caret line replaces its gutter number with an actual <button>.
 * A single menu item appears next to that button; CMD owns every edit.
 */
import {Compartment,RangeSet,StateEffect} from '@codemirror/state';
import {GutterMarker,lineNumberMarkers} from '@codemirror/view';
import {planCalloutAtCursor} from './source-callout-plan.js';
import './source-line-callout-menu.css';

const markerCompartment=new WeakMap();

class CaretLineButton extends GutterMarker {
  constructor(number,onOpen){super();this.number=number;this.onOpen=onOpen;}
  eq(other){return other instanceof CaretLineButton&&this.number===other.number&&this.onOpen===other.onOpen;}
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
    button.addEventListener('pointerdown',event=>event.stopPropagation());
    button.addEventListener('click',event=>{
      event.preventDefault();event.stopPropagation();this.onOpen(button);
    });
    return button;
  }
}

export function createSourceLineCalloutMenu({host,view,onInsert}){
  if(!(host instanceof HTMLElement)||!view||typeof onInsert!=='function')
    throw TypeError('Source line menu requires source pane, CM6 and insertion action');
  let disposed=false,activeButton=null,target=null;
  const menu=document.createElement('div');
  menu.className='ocr-source-line-menu';menu.hidden=true;
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','源码行操作');
  const insert=document.createElement('button');
  insert.type='button';insert.setAttribute('role','menuitem');
  insert.textContent='插入 Callout';
  menu.append(insert);host.append(menu);
  function close(){
    menu.hidden=true;
    activeButton?.setAttribute('aria-expanded','false');
    activeButton=null;target=null;
  }
  function open(button){
    if(disposed)return;
    if(activeButton===button&&!menu.hidden){close();return;}
    close();
    const state=view.state;
    const offset=state.selection.main.head;
    const number=state.doc.lineAt(offset).number;
    if(button.dataset.line!==String(number))return;
    activeButton=button;target={snapshot:state.doc,offset};
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
    return RangeSet.of([new CaretLineButton(line.number,open).range(line.from)]);
  });
  let instance=markerCompartment.get(view);
  if(!instance){instance=new Compartment();markerCompartment.set(view,instance);
    view.dispatch({effects:StateEffect.appendConfig.of(instance.of(gutter))});
  }else view.dispatch({effects:instance.reconfigure(gutter)});
  insert.addEventListener('click',event=>{
    event.preventDefault();event.stopPropagation();
    const captured=target;
    close();
    if(!captured||!view.state.doc.eq(captured.snapshot))return;
    onInsert(planCalloutAtCursor(view.state.doc.toString(),captured.offset));
  });
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
