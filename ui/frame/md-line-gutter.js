/** Replaces only CM6's stock line-number gutter with a source-line action.
 * This generic Frame component knows neither OCR blocks nor SQLite.
 */
import {GutterMarker,gutter} from '@codemirror/view';

/** A physical CM6 row is removed with exactly one document transaction.
 * Delete following LF, except the last line which removes its preceding LF.
 * The final physical line cannot be removed: it becomes an empty line.
 */
export function physicalLineDeleteRange(doc,lineNo){
  if(!doc||!Number.isSafeInteger(lineNo)||lineNo<1||lineNo>doc.lines)return null;
  const line=doc.line(lineNo);
  if(doc.lines===1)return {from:line.from,to:line.to};
  if(lineNo<doc.lines)return {from:line.from,to:doc.line(lineNo+1).from};
  return {from:line.from-1,to:line.to};
}

/** Native CM6 GutterMarker button, only enabled when a line owns an MD LineID.
 * Exposes a single menu action without introducing a parallel document state.
 */
export function createMdLineGutter({lineIdAt,isMarkdown,onDelete}){
  if(typeof lineIdAt!=='function'||typeof isMarkdown!=='function'||
     typeof onDelete!=='function')throw Error('CM6 line gutter port invalid');
  let menu=null,cleanup=()=>{};
  function close(){
    cleanup();cleanup=()=>{};
    menu?.remove();menu=null;
  }
  function open(anchor,lineNo){
    const lineId=lineIdAt(lineNo);
    if(!lineId)return;
    if(menu){close();}
    const root=document.createElement('div');
    root.className='ocr-cm-line-menu';root.setAttribute('role','menu');
    root.setAttribute('aria-label',`第 ${lineNo} 行操作`);
    root.dataset.lineNo=String(lineNo);
    const item=document.createElement('button');item.type='button';
    item.className='ocr-cm-line-delete';item.setAttribute('role','menuitem');
    item.textContent='删除当前行';
    item.addEventListener('click',event=>{
      event.stopPropagation();close();onDelete(lineId);
    });
    root.append(item);document.body.append(root);menu=root;
    const rect=anchor.getBoundingClientRect();
    // Place BELOW the target line, never over its original source text.
    const width=root.getBoundingClientRect().width;
    const height=root.getBoundingClientRect().height;
    const space=8;
    const left=Math.max(space,Math.min(rect.right+space,window.innerWidth-width-space));
    const below=rect.bottom+4;
    const top=below+height+space<=window.innerHeight?below:
      Math.max(space,rect.top-height-4);
    root.style.left=`${left}px`;root.style.top=`${top}px`;
    const dismiss=event=>{
      if(!root.contains(event.target))close();
    };
    const key=event=>{
      if(event.key==='Escape'){event.preventDefault();close();}
    };
    const scroll=event=>{
      if(!root.contains(event.target))close();
    };
    document.addEventListener('pointerdown',dismiss,true);
    document.addEventListener('keydown',key,true);
    document.addEventListener('scroll',scroll,true);
    cleanup=()=>{
      document.removeEventListener('pointerdown',dismiss,true);
      document.removeEventListener('keydown',key,true);
      document.removeEventListener('scroll',scroll,true);
    };
  }
  class NumberButtonMarker extends GutterMarker {
    constructor(value,enabled=false,spacer=false){super();
      this.value=String(value);this.enabled=enabled;this.spacer=spacer;
    }
    eq(other){return other instanceof NumberButtonMarker&&this.value===other.value&&
      this.enabled===other.enabled&&this.spacer===other.spacer;}
    toDOM(){
      const button=document.createElement('button');button.type='button';
      button.className='ocr-cm-line-number-button';
      button.textContent=this.value;
      button.dataset.lineNo=this.value;
      if(this.spacer){button.dataset.spacer='true';button.tabIndex=-1;}
      else if(this.enabled){
        button.setAttribute('aria-label',`第 ${this.value} 行操作`);
        button.title='行号操作';
        // Mouse clicks in the gutter must not change an existing CM6 selection.
        button.addEventListener('mousedown',event=>event.preventDefault());
        button.addEventListener('click',event=>{
          event.stopPropagation();open(button,Number(this.value));
        });
      }else{button.disabled=true;button.tabIndex=-1;}
      return button;
    }
  }
  const extension=gutter({
    class:'cm-lineNumbers ocr-cm-line-button-gutter',
    lineMarker:(view,line)=>{
      const row=view.state.doc.lineAt(line.from);
      if(row.from!==line.from)return null;
      return new NumberButtonMarker(row.number,Boolean(isMarkdown(view.state)&&lineIdAt(row.number)));
    },
    lineMarkerChange:update=>update.docChanged||
      Boolean(isMarkdown(update.startState))!==Boolean(isMarkdown(update.state)),
    initialSpacer:view=>new NumberButtonMarker('8'.repeat(String(view.state.doc.lines).length),false,true),
    updateSpacer:(spacer,update)=>{
      const digits=String(update.state.doc.lines).length;
      return spacer.value.length===digits?spacer:
        new NumberButtonMarker('8'.repeat(digits),false,true);
    },
  });
  return {extension,close,dispose:close};
}
