/** Native Safari <option> colors are not reliable. The AG-owned cell opens a
 * tiny accessible, fixed-position listbox; it owns no source text or SQL.
 */
export const REVIEW_DECISIONS=Object.freeze(['待定','断块合并','忽略']);
let openMenuClose=null;

export function createBlockBreakReviewCell(onChoose){
  if(typeof onChoose!=='function')throw TypeError('断块审阅回调无效');
  return function renderReviewCell(params){
    const row=params.data;
    const value=REVIEW_DECISIONS.includes(row?.review)?row.review:'待定';
    const root=document.createElement('span');root.className='ocr-break-review-cell';
    const trigger=document.createElement('button');trigger.type='button';
    trigger.className='ocr-break-review-trigger';trigger.dataset.review=value;
    trigger.textContent=value+' ▾';
    trigger.setAttribute('aria-haspopup','listbox');
    trigger.setAttribute('aria-expanded','false');
    trigger.setAttribute('aria-label',`审阅 ${row?.before_pbs??''} → ${row?.after_pbs??''}，当前${value}`);
    trigger.title='选择审阅结论；断块合并仅记录决定，不直接修改 Markdown';
    trigger.addEventListener('pointerdown',e=>e.stopPropagation());
    trigger.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      if(openMenuClose)openMenuClose();
      const menu=document.createElement('div');menu.className='ocr-break-review-menu';
      menu.setAttribute('role','listbox');menu.setAttribute('aria-label','断块审阅候选');
      const bounds=trigger.getBoundingClientRect();
      const left=Math.max(6,Math.min(bounds.left,innerWidth-196));
      const top=bounds.bottom+7+137>innerHeight?
        Math.max(5,bounds.top-137):bounds.bottom+7;
      menu.style.left=left+'px';menu.style.top=top+'px';
      let closed=false;
      const close=()=>{
        if(closed)return;
        closed=true;menu.remove();
        trigger.setAttribute('aria-expanded','false');
        document.removeEventListener('pointerdown',outside,true);
        document.removeEventListener('keydown',onKey,true);
        document.removeEventListener('scroll',onScroll,true);
        if(openMenuClose===close)openMenuClose=null;
      };
      const outside=event=>{
        if(!menu.contains(event.target)&&!trigger.contains(event.target))close();
      };
      const onKey=event=>{
        if(event.key==='Escape'){event.preventDefault();close();trigger.focus();}
      };
      const onScroll=()=>close();
      for(const choice of REVIEW_DECISIONS){
        const item=document.createElement('button');item.type='button';
        item.className='ocr-break-review-option';
        item.dataset.review=choice;item.setAttribute('role','option');
        item.setAttribute('aria-selected',String(value===choice));
        item.textContent=choice==='断块合并'?'断块合并（仅记录）':choice;
        item.addEventListener('pointerdown',event=>event.stopPropagation());
        item.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();
          close();
          if(choice!==value)Promise.resolve().then(()=>onChoose(row,choice))
            .catch(()=>{}); // workflow reports errors in the global status strip
        });
        menu.append(item);
      }
      document.body.append(menu);trigger.setAttribute('aria-expanded','true');
      document.addEventListener('pointerdown',outside,true);
      document.addEventListener('keydown',onKey,true);
      document.addEventListener('scroll',onScroll,true);
      openMenuClose=close;
    });
    root.append(trigger);return root;
  };
}
