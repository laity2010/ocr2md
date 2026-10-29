/** Original read-only footnote reader: markdown-it owns the sanitized HTML;
 * Floating UI owns geometry. No hash navigation, CMD edits, or second renderer.
 */
import {autoUpdate,computePosition,flip,offset,shift,size} from '@floating-ui/dom';
import './footnote-popover.css';

export function createFootnotePopover({root,onLocate}){
  if(!root||typeof onLocate!=='function')throw Error('Footnote reader needs root and focus port');
  const popup=document.createElement('aside');
  popup.className='ocr-footnote-popover';
  popup.setAttribute('role','dialog');
  popup.setAttribute('aria-modal','false');
  popup.setAttribute('aria-label','注释阅读卡片');
  popup.hidden=true;
  const header=document.createElement('div');
  header.className='ocr-footnote-card-header';
  const title=document.createElement('strong');title.className='ocr-footnote-card-title';
  const dismiss=document.createElement('button');dismiss.type='button';
  dismiss.className='ocr-footnote-card-close';dismiss.textContent='×';
  dismiss.setAttribute('aria-label','关闭注释');
  header.append(title,dismiss);
  const text=document.createElement('div');text.className='ocr-footnote-card-content';
  const footer=document.createElement('div');footer.className='ocr-footnote-card-footer';
  const locate=document.createElement('button');locate.type='button';
  locate.className='ocr-footnote-card-locate';locate.textContent='定位注文';
  footer.append(locate);
  popup.append(header,text,footer);
  document.body.append(popup);
  let anchor=null,cleanup=null,hoverTimer=null,closeTimer=null,pinned=false;
  let sourceLine=null,epoch=0,disposed=false;

  const cancelHover=()=>{clearTimeout(hoverTimer);hoverTimer=null;};
  const cancelClose=()=>{clearTimeout(closeTimer);closeTimer=null;};
  function close(){
    cancelHover();cancelClose();epoch++;
    cleanup?.();cleanup=null;anchor=null;pinned=false;sourceLine=null;
    popup.hidden=true;
  }
  function reference(element){
    if(!(element instanceof Element))return null;
    const candidate=element.closest('sup.footnote-ref a[href^="#fn"]');
    if(!candidate||!root.contains(candidate))return null;
    const hash=candidate.getAttribute('href');
    return /^#fn[0-9]+$/.test(hash)?candidate:null;
  }
  function updatePosition(){
    if(!anchor||popup.hidden)return;
    const myEpoch=epoch;
    void computePosition(anchor,popup,{
      strategy:'fixed',placement:'bottom-start',
      middleware:[
        offset(8),flip({padding:12}),shift({padding:12}),
        size({padding:12,apply:({availableHeight,elements})=>{
          elements.floating.style.maxHeight=Math.max(110,availableHeight)+'px';
        }}),
      ],
    }).then(({x,y})=>{
      if(disposed||myEpoch!==epoch||popup.hidden)return;
      popup.style.left=x+'px';popup.style.top=y+'px';
    });
  }
  function show(candidate,sticky){
    cancelHover();cancelClose();
    if(disposed)return false;
    const hash=candidate.getAttribute('href');
    const note=root.querySelector('li.footnote-item[id="'+hash.slice(1)+'"]');
    if(!note)return false;
    if(anchor===candidate&&!popup.hidden){
      if(sticky){pinned=true;return true;}
      if(pinned)return true;
    }
    cleanup?.();cleanup=null;anchor=candidate;pinned=sticky;epoch++;
    title.textContent='注释 '+(candidate.textContent||'').trim();
    text.replaceChildren();
    const body=document.createElement('div');
    body.className='ocr-footnote-card-body';
    for(const child of note.childNodes)body.append(child.cloneNode(true));
    for(const backref of body.querySelectorAll('a.footnote-backref'))backref.remove();
    for(const id of body.querySelectorAll('[id]'))id.removeAttribute('id');
    text.append(body);
    sourceLine=Number(note.dataset.sourceStart)||null;
    locate.hidden=!sourceLine;
    popup.hidden=false;popup.style.left='0px';popup.style.top='0px';
    cleanup=autoUpdate(candidate,popup,updatePosition,{
      ancestorScroll:true,ancestorResize:true,elementResize:true,layoutShift:true,
    });
    updatePosition();
    return true;
  }
  function onPointerOver(event){
    if(event.pointerType!=='mouse')return;
    const found=reference(event.target);
    if(!found||pinned||anchor===found)return;
    cancelHover();
    hoverTimer=setTimeout(()=>show(found,false),300);
  }
  function onPointerOut(event){
    if(event.pointerType!=='mouse')return;
    const found=reference(event.target);
    if(found&&found.contains(event.relatedTarget))return;
    cancelHover();
    if(found&&!pinned)closeTimer=setTimeout(close,180);
  }
  function onOutside(event){
    if(popup.hidden)return;
    if(popup.contains(event.target)||anchor?.contains(event.target))return;
    close();
  }
  function onKeyboard(event){
    if(event.key==='Escape'&&!popup.hidden){
      event.preventDefault();close();
    }
  }
  const onLeave=()=>{if(!pinned){cancelClose();closeTimer=setTimeout(close,180);}};
  const onEnter=()=>cancelClose();
  dismiss.addEventListener('click',close);
  locate.addEventListener('click',()=>{
    const line=sourceLine;close();
    if(line)onLocate(line);
  });
  popup.addEventListener('pointerenter',onEnter);
  popup.addEventListener('pointerleave',onLeave);
  root.addEventListener('pointerover',onPointerOver);
  root.addEventListener('pointerout',onPointerOut);
  document.addEventListener('pointerdown',onOutside);
  document.addEventListener('keydown',onKeyboard);
  return Object.freeze({
    handleClick(event){
      const found=reference(event.target);
      if(!found)return false;
      // Only intercept valid notes; broken references retain normal fallback.
      if(!root.querySelector('li.footnote-item[id="'+found.getAttribute('href').slice(1)+'"]'))
        return false;
      event.preventDefault();
      event.stopPropagation();
      show(found,true);
      return true;
    },
    close,
    dispose(){
      disposed=true;close();
      root.removeEventListener('pointerover',onPointerOver);
      root.removeEventListener('pointerout',onPointerOut);
      document.removeEventListener('pointerdown',onOutside);
      document.removeEventListener('keydown',onKeyboard);
      popup.removeEventListener('pointerenter',onEnter);
      popup.removeEventListener('pointerleave',onLeave);
      popup.remove();
    },
  });
}
