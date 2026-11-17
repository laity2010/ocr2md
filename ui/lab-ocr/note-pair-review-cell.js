/** AG Note Match status cell: three editable values and two derived states.
 * Only explicit user action persists an override. In ambiguous cases the
 * second-stage body choice is mandatory, never silently pick one.
 */
export const NOTE_MATCH_STATUS_OPTIONS=Object.freeze(['已匹配','待核实','忽略','已转换','转换失败']);

export function createNoteMatchStatusCell(onChoose){
  if(typeof onChoose!=='function')throw TypeError('注释状态操作回调无效');
  return function renderCell({data:row}){
    const root=document.createElement('span');
    root.className='ocr-note-review-cell';
    const status=row?.match_state??'待核实';
    if(!row?.reference_id){
      const label=document.createElement('span');
      label.className='ocr-note-match-status';label.dataset.status=status;
      label.textContent=status;root.append(label);return root;
    }
    const select=document.createElement('select');
    select.className='ocr-note-match-status-select';
    select.dataset.status=status;
    select.setAttribute('aria-label',`注号 ${row.number} 匹配状态`);
    for(const item of NOTE_MATCH_STATUS_OPTIONS){
      const option=new Option(item,item);
      if(['已转换','转换失败'].includes(item))option.disabled=true;
      select.add(option);
    }
    select.value=NOTE_MATCH_STATUS_OPTIONS.includes(status)?status:'待核实';
    const converted=row.review==='已转换'||row.review==='转换待保存';
    select.disabled=converted;
    select.title=converted?'已转换由 CM6 Undo/Redo 恢复，不能手动伪造状态':
      '修改匹配状态后立即保存人工决定；转换统一使用 AG 功能菜单';
    for(const type of ['pointerdown','click','mousedown'])
      select.addEventListener(type,event=>event.stopPropagation());
    let chooser=null;
    const outside=event=>{
      if(chooser&&!chooser.contains(event.target)&&event.target!==select)
        closeChooser(true);
    };
    const closeChooser=(cancel=false)=>{
      chooser?.remove();chooser=null;
      document.removeEventListener('pointerdown',outside,true);
      if(cancel)select.value=status;
    };
    select.addEventListener('change',()=>{
      closeChooser();
      const next=select.value,previous=status;
      // Selecting the already displayed status does not create redundant
      // SQL writes; converting is intentionally a separate function.
      if(next===previous)return;
      if(['已转换','转换失败'].includes(next)){select.value=previous;return;}
      const commit=(choice,bodyId=null)=>{
        Promise.resolve().then(()=>onChoose(row,choice,bodyId)).then(success=>{
          if(!success)select.value=previous;
        }).catch(()=>{select.value=previous;});
      };
      if(next==='忽略'){commit('忽略');return;}
      if(next==='待核实'){commit('待核实');return;}
      const choices=row.body_choices??[];
      if(!choices.length){select.value=previous;commit('待转换');return;}
      if(choices.length===1){commit('待转换',choices[0].id);return;}
      // Second-stage selector only appears for an ambiguous note number.
      // The status dropdown itself still has exactly three values.
      chooser=document.createElement('select');
      chooser.className='ocr-note-body-choice';
      chooser.setAttribute('aria-label',`注号 ${row.number} 选择对应注文`);
      chooser.add(new Option('选择注文…',''));
      for(const item of choices)
        chooser.add(new Option(`${item.pbs||'无 PBS'} · 行${item.line_no??'?'}`,item.id));
      for(const type of ['pointerdown','click','mousedown'])
        chooser.addEventListener(type,event=>event.stopPropagation());
      chooser.addEventListener('change',()=>{
        const selected=chooser.value;closeChooser(!selected);
        if(selected)commit('待转换',selected);
      });
      // Pinned AG columns are narrow and overflow-clipped. Place the
      // second-stage selector on the document layer, as the old reviewed
      // picker did, so iPad users can actually select among several bodies.
      const rect=select.getBoundingClientRect();
      chooser.style.position='fixed';chooser.style.zIndex='10045';
      chooser.style.width='min(220px,90vw)';
      chooser.style.left=Math.max(5,Math.min(rect.left,innerWidth-230))+'px';
      chooser.style.top=Math.max(5,Math.min(rect.bottom+5,innerHeight-40))+'px';
      document.body.append(chooser);
      document.addEventListener('pointerdown',outside,true);
      chooser.focus();
    });
    root.append(select);
    if(converted){
      const marker=document.createElement('span');marker.className='ocr-note-converted-marker';
      marker.textContent='✓';marker.title=row.review;root.append(marker);
    }
    return root;
  };
}
