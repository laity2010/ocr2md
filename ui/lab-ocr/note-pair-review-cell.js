/** Safari-safe review menu, modelled on proven break-review popup.
 * Note: '确认配对' means pending conversion, NOT an actual MD edit.
 */
let activeClose=null;
export function createNotePairReviewCell(onChoose){
  if(typeof onChoose!=='function')throw TypeError('注释审阅回调无效');
  return function renderCell(params){
    const row=params.data,eligible=Boolean(row?.reference_id);
    const status=eligible?row.review??'待定':'—';
    const root=document.createElement('span');root.className='ocr-note-review-cell';
    if(!eligible){root.textContent='—';return root;}
    const trigger=document.createElement('button');trigger.type='button';
    trigger.className='ocr-note-review-trigger';trigger.dataset.review=status;
    trigger.textContent=(status==='待转换'?'待转换 ✓':status)+' ▾';
    if(status==='已转换')trigger.disabled=true;
    trigger.setAttribute('aria-label',`审阅注号 ${row.number}，当前${status}`);
    trigger.setAttribute('aria-haspopup','listbox');
    trigger.setAttribute('aria-expanded','false');
    trigger.title=status==='已转换'?'已转换；使用 CM6 Undo/Redo 回退':
      '待转换是已确认配对，执行转换时才通过 CM6 修改 Markdown';
    trigger.addEventListener('pointerdown',e=>e.stopPropagation());
    trigger.addEventListener('click',e=>{
      e.preventDefault();e.stopPropagation();
      activeClose?.();
      const menu=document.createElement('div');menu.className='ocr-note-review-menu';
      menu.setAttribute('role','listbox');menu.setAttribute('aria-label','注释匹配审阅候选');
      const rect=trigger.getBoundingClientRect();
      menu.style.left=Math.max(5,Math.min(rect.left,innerWidth-270))+'px';
      menu.style.top=Math.max(5,Math.min(rect.bottom+5,innerHeight-245))+'px';
      let closed=false;
      const close=()=>{
        if(closed)return;closed=true;menu.remove();
        trigger.setAttribute('aria-expanded','false');
        document.removeEventListener('pointerdown',outside,true);
        document.removeEventListener('keydown',key,true);
        if(activeClose===close)activeClose=null;
      };
      const outside=ev=>{if(!menu.contains(ev.target)&&!trigger.contains(ev.target))close();};
      const key=ev=>{if(ev.key==='Escape'){ev.preventDefault();close();trigger.focus();}};
      const add=(label,choice,bodyId=null)=>{
        const button=document.createElement('button');button.type='button';
        button.className='ocr-note-review-option';button.dataset.review=choice;
        if(bodyId)button.dataset.bodyId=bodyId;
        button.setAttribute('role','option');
        button.setAttribute('aria-selected',String(choice===status&&
          (choice!=='待转换'||bodyId===row.selected_body_id)));
        button.textContent=label;
        button.addEventListener('pointerdown',event=>event.stopPropagation());
        button.addEventListener('click',event=>{
          event.preventDefault();event.stopPropagation();close();
          if(choice!==status||choice==='待转换'&&bodyId!==row.selected_body_id)
            Promise.resolve().then(()=>onChoose(row,choice,bodyId)).catch(()=>{});
        });
        menu.append(button);
      };
      add('待定 · 清除人工决定','待定');
      add('忽略 · 退出待审阅队列','忽略');
      if(status==='待转换'&&row.kind==='注引')
        add('执行转换 · 写入 Obsidian 脚注','转换');
      for(const option of row.body_choices??[])
        add('确认配对（待转换） → '+(option.pbs||'无 PBS')+
          ' · 行'+(option.line_no??'?'),'待转换',option.id);
      if(!row.body_choices?.length){
        const hint=document.createElement('p');
        hint.textContent='未找到候选注文，暂不可确认配对';
        hint.className='ocr-note-review-hint';menu.append(hint);
      }
      document.body.append(menu);
      trigger.setAttribute('aria-expanded','true');
      document.addEventListener('pointerdown',outside,true);
      document.addEventListener('keydown',key,true);
      // CM6 / PDF / AG virtual scrolling may fire while opening the menu.
      // Never dismiss a deliberate review choice on an unrelated scroll.
      activeClose=close;
    });
    root.append(trigger);return root;
  };
}
