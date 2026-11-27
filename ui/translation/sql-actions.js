/** V2 SQL group/title and modal interaction, using the existing Tom Select adapter. */
import './sql-actions.css';
export function wireSQLGroup(select,open){
  const tom=select.ocrNavigationSelect.tom;
  const dropdown=tom.dropdown;
  function activate(event){
    const header=event.target.closest('.optgroup-header');
    if(!header?.closest('.optgroup')||header.textContent.trim()!=='SQL')return;
    event.preventDefault();event.stopPropagation();tom.close();open();
  }
  function decorate(){
    for(const h of dropdown.querySelectorAll('.optgroup-header')){
      if(h.textContent.trim()!=='SQL')continue;
      if(h.getAttribute('role')!=='button')h.setAttribute('role','button');
      if(h.tabIndex!==0)h.tabIndex=0;
      h.setAttribute('aria-label','SQL · 数据操作');
    }
  }
  dropdown.addEventListener('click',activate,true);
  dropdown.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key))activate(e);},true);
  tom.wrapper.addEventListener('keydown',e=>{
    if(e.altKey&&e.key==='Enter'&&select.querySelector('optgroup[label="SQL"]')){
      e.preventDefault();e.stopPropagation();tom.close();open();
    }

  },true);
  tom.control_input?.setAttribute('aria-keyshortcuts','Alt+Enter');
  tom.on('dropdown_open',decorate);
  new MutationObserver(decorate).observe(dropdown,{childList:true,subtree:true});
}
export function createSQLActions(onInitialize,onRecheck){
  const dialog=document.createElement('dialog');dialog.id='translation-sql-actions-dialog';
  dialog.setAttribute('aria-labelledby','translation-sql-actions-title');
  const heading=document.createElement('h2');heading.id='translation-sql-actions-title';heading.textContent='SQL · 数据操作';
  const info=document.createElement('p');info.className='translation-sql-actions-info';
  const buttons=document.createElement('div');buttons.className='translation-sql-actions-buttons';
  const init=document.createElement('button');init.type='button';init.className='translation-sql-action-import';buttons.append(init);
  const recheck=document.createElement('button');recheck.type='button';recheck.textContent='重新检查';recheck.hidden=true;recheck.onclick=()=>{dialog.close();onRecheck();};buttons.append(recheck);
  const warning=document.createElement('p');warning.className='translation-sql-actions-warning';warning.textContent='仅处理本州译句表；不覆盖已有编辑、不修改原句表或原文。';
  const close=document.createElement('button');close.type='button';close.className='translation-sql-action-close';close.textContent='取消';
  close.onclick=()=>dialog.close();init.onclick=()=>{if(!init.disabled){dialog.close();onInitialize();}};
  dialog.append(heading,info,buttons,warning,close);document.body.append(dialog);
  return {open(state,message,busy){
    init.textContent=state==='legacy'?'补全旧译句表字段':'初始化译句表';
    init.disabled=busy||!['missing','legacy'].includes(state);
    recheck.hidden=state!=='error';recheck.disabled=busy;
    info.textContent=busy?'正在核验译句表…':state==='ready'?'译句表已存在，可直接加载，无需初始化。':state==='missing'?'已验证上游原句，首次创建译句表。':state==='legacy'?'旧表需要显式补全 text 字段；原有数据必须一致。':message||'前置条件未满足，不能初始化。';
    if(!dialog.open)dialog.showModal();
  },close(){if(dialog.open)dialog.close();}};
}
