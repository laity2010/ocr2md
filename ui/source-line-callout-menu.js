/** Layout-owned source action UI. CMD/CM6 remain the only source writer.
 * A toolbar line-number button and existing CM6 line-number gutter open
 * the same small accessible menu. Neither changes the current caret.
 */
import './source-line-callout-menu.css';

import {CHOICES,planCalloutAtCursor} from './source-callout-plan.js';

export function createSourceLineCalloutMenu({host,view,onInsert}){
  if(!(host instanceof HTMLElement)||!view||typeof onInsert!=='function')
    throw TypeError('Source line menu requires toolbar, CM6 and insertion action');
  const root=document.createElement('div');root.className='ocr-source-line-actions';
  const trigger=document.createElement('button');trigger.type='button';
  trigger.className='ocr-source-line-trigger';trigger.textContent='行号 ▾';
  trigger.setAttribute('aria-label','行号菜单');
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  const menu=document.createElement('div');menu.className='ocr-source-line-menu';
  menu.setAttribute('role','menu');menu.setAttribute('aria-label','源码行操作');menu.hidden=true;
  const title=document.createElement('div');title.className='ocr-source-line-menu-title';
  menu.append(title);
  for(const choice of CHOICES){
    const button=document.createElement('button');button.type='button';
    button.textContent=choice.label;button.dataset.mode=choice.mode;
    button.setAttribute('role','menuitem');
    button.addEventListener('click',event=>{
      event.stopPropagation();close();
      const at=view.state.selection.main.head;
      onInsert(planCalloutAtCursor(view.state.doc.toString(),at,choice.mode));
    });
    menu.append(button);
  }
  root.append(trigger,menu);host.insertBefore(root,host.querySelector('.quote-indent-tools'));
  let disposed=false;
  const close=()=>{menu.hidden=true;trigger.setAttribute('aria-expanded','false');};
  function open(){
    if(disposed)return;
    title.textContent='光标：第 '+view.state.doc.lineAt(view.state.selection.main.head).number+' 行';
    menu.hidden=false;trigger.setAttribute('aria-expanded','true');
  }
  trigger.addEventListener('click',()=>menu.hidden?open():close());
  // The existing CM6 gutter remains genuine line numbers. Tap a number to
  // open the menu without moving the editor caret to the tapped line.
  const isLineNumber=target=>target instanceof Element&&Boolean(
    target.closest('.cm-lineNumbers .cm-gutterElement')&&
    /^\d+$/.test(target.closest('.cm-gutterElement').textContent.trim()));
  const onPointerDown=event=>{
    if(isLineNumber(event.target)){event.preventDefault();event.stopPropagation();}
  };
  const onGutterClick=event=>{
    if(!isLineNumber(event.target))return;
    event.preventDefault();event.stopPropagation();open();
  };
  const onOutside=event=>{
    if(!menu.hidden&&!root.contains(event.target)&&!isLineNumber(event.target))close();
  };
  const onKeyDown=event=>{
    if(event.key==='Escape'&&!menu.hidden){event.preventDefault();close();trigger.focus();}
  };
  view.dom.addEventListener('pointerdown',onPointerDown,true);
  view.dom.addEventListener('click',onGutterClick,true);
  document.addEventListener('pointerdown',onOutside);
  document.addEventListener('keydown',onKeyDown);
  return Object.freeze({
    dispose(){disposed=true;close();view.dom.removeEventListener('pointerdown',onPointerDown,true);
      view.dom.removeEventListener('click',onGutterClick,true);
      document.removeEventListener('pointerdown',onOutside);
      document.removeEventListener('keydown',onKeyDown);root.remove();},
  });
}
