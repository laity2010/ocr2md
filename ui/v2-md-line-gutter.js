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

/** Show the deletion control exclusively on the highlighted focus row.
 * All other rows remain plain numerals, not disabled/fake buttons.
 */
export function focusedLineHasAction(lineNo,focusLineNo,mdLoaded,lineId){
  return Boolean(mdLoaded&&lineId&&lineNo===focusLineNo);
}

/** Native CM6 line-number gutter: one button follows the highlighted focus
 * line. The same immutable document/line-ID authority owns its menu action.
 */
export function createMdLineGutter({lineIdAt,isMarkdown,focusLineAt,onDelete,getPdfText=null,onPdfText=null,captureLine=null}){
  if(typeof lineIdAt!=='function'||typeof isMarkdown!=='function'||
     typeof focusLineAt!=='function'||typeof onDelete!=='function')
    throw Error('CM6 line gutter port invalid');
  let menu=null,cleanup=()=>{};
  function close(){
    cleanup();cleanup=()=>{};
    menu?.remove();menu=null;
  }
  function open(anchor,lineNo){
    const lineId=lineIdAt(lineNo);
    if(!lineId)return;
    const lineRef=captureLine?.(lineNo)??null;
    if(captureLine&&!lineRef)return;
    if(menu){close();}
    const root=document.createElement('div');
    root.className='ocr-cm-line-menu';root.setAttribute('role','menu');
    root.setAttribute('aria-label',`第 ${lineNo} 行操作`);
    root.dataset.lineNo=String(lineNo);
    const item=document.createElement('button');item.type='button';
    item.className='ocr-cm-line-delete';item.setAttribute('role','menuitem');
    item.textContent='删除当前行';
    item.addEventListener('click',event=>{
      event.stopPropagation();close();onDelete(lineId,lineRef);
    });
    root.append(item);
    // V2-only addition to the copied V1 Frame gutter. Never insert PDF
    // text through the old PDF selection: this menu carries the clicked
    // immutable logical ID, so scrolling does not retarget the operation.
    if(typeof getPdfText==='function'&&typeof onPdfText==='function'){
      const actions=[['insert','提取文本插入'],['replace','提取文本替换']];
      const buttons=actions.map(([mode,label])=>{
        const button=document.createElement('button');button.type='button';
        button.className='ocr-cm-line-pdf-'+mode;
        button.setAttribute('role','menuitem');button.textContent=label;
        button.disabled=true;button.title='读取当前行对应 PDF 原生文字层…';
        root.append(button);return button;
      });
      void Promise.resolve().then(()=>getPdfText(lineId)).then(result=>{
        if(menu!==root)return;
        const text=result?.text,workspace=result?.workspace;
        const available=typeof text==='string'&&Boolean(text.trim())&&
          typeof workspace==='string'&&Boolean(workspace);
        buttons.forEach(button=>{
          button.disabled=!available;button.title=available?'PDF 文字层原文':'此逻辑块的 PDF 覆盖框没有原生文字层';
        });
        if(!available)return;
        buttons.forEach((button,i)=>button.addEventListener('click',event=>{
          event.stopPropagation();close();
          // Live source port revalidates the ID and normalizes native text.
          onPdfText(lineId,actions[i][0],text,workspace,lineRef);
        }));
      }).catch(()=>{
        if(menu===root)buttons.forEach(button=>{button.disabled=true;
          button.title='PDF 文字层读取失败';});
      });
    }
    document.body.append(root);menu=root;
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
    const invalidate=event=>{
      if(['clear','load','structure','edit'].includes(event.detail?.kind))close();
    };
    document.addEventListener('pointerdown',dismiss,true);
    document.addEventListener('keydown',key,true);
    document.addEventListener('scroll',scroll,true);
    document.addEventListener('v2-cm-session',invalidate);
    cleanup=()=>{
      document.removeEventListener('pointerdown',dismiss,true);
      document.removeEventListener('keydown',key,true);
      document.removeEventListener('scroll',scroll,true);
      document.removeEventListener('v2-cm-session',invalidate);
    };
  }
  class NumberButtonMarker extends GutterMarker {
    constructor(value,enabled=false,spacer=false){super();
      this.value=String(value);this.enabled=enabled;this.spacer=spacer;
    }
    eq(other){return other instanceof NumberButtonMarker&&this.value===other.value&&
      this.enabled===other.enabled&&this.spacer===other.spacer;}
    toDOM(){
      if(!this.enabled){
        const number=document.createElement('span');
        number.className='ocr-cm-line-number-label';
        number.textContent=this.value;
        number.dataset.lineNo=this.value;
        if(this.spacer)number.dataset.spacer='true';
        return number;
      }
      const button=document.createElement('button');button.type='button';
      button.className='ocr-cm-line-number-button';
      button.textContent=this.value;
      button.dataset.lineNo=this.value;
      button.setAttribute('aria-label',`第 ${this.value} 行操作`);
      button.title='行号操作';
      // A gutter tap may open the menu, but must never move the CM6 caret.
      button.addEventListener('mousedown',event=>event.preventDefault());
      button.addEventListener('click',event=>{
        event.stopPropagation();open(button,Number(this.value));
      });
      return button;
    }
  }
  const extension=gutter({
    class:'cm-lineNumbers ocr-cm-line-button-gutter',
    lineMarker:(view,line)=>{
      const row=view.state.doc.lineAt(line.from);
      if(row.from!==line.from)return null;
      return new NumberButtonMarker(row.number,focusedLineHasAction(
        row.number,focusLineAt(view.state),isMarkdown(view.state),lineIdAt(row.number)));
    },
    lineMarkerChange:update=>update.docChanged||
      focusLineAt(update.startState)!==focusLineAt(update.state)||
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
