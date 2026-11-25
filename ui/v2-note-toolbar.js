/** Note-only adapter of the V1 action menu. No changes to Frame layout. */
import {createNoteMatchRulesDialog} from './lab-ocr/note-match-rules-dialog.js';
import './v2-note-toolbar.css';
export function mountNoteToolbar(bar,{getConfig,onConfig,onStatus,onConvert,onInlineMath,onDownloadAll,onMediaScan,onNormalizeMedia,onOrganizeTable}){
  const trigger=document.createElement('button');
  trigger.type='button';trigger.className='ocr-ag-function-select';
  trigger.setAttribute('aria-label','当前 AG View 功能');
  trigger.setAttribute('aria-haspopup','menu');trigger.setAttribute('aria-expanded','false');
  trigger.textContent='功能 ▾';trigger.hidden=true;
  bar.querySelector('.ocr-ag-module-select').after(trigger);
  let menu=null,dialog=null,mode=null;
  const close=()=>{
    menu?.remove();menu=null;trigger.setAttribute('aria-expanded','false');
    document.removeEventListener('pointerdown',outside,true);
    document.removeEventListener('keydown',escape,true);
  };
  const outside=e=>{if(menu&&!menu.contains(e.target)&&e.target!==trigger)close();};
  const escape=e=>{if(e.key==='Escape'){close();trigger.focus();}};
  const rules=()=>{
    dialog?.dispose();
    dialog=createNoteMatchRulesDialog({onSave:onConfig});
    dialog.open(getConfig());
    // The V1 callback is reused, but V2 deliberately has no separate
    // persistent review/rule table. Make the session lifetime explicit.
    const el=document.querySelector('.ocr-note-match-rules-dialog[open]');
    if(el){el.querySelector('p').textContent='分别选择注引与注文格式；本次会话有效，刷新恢复默认，不修改正文。';
      el.querySelector('button[type="submit"]').textContent='应用并重新识别';}
  };
  trigger.addEventListener('click',e=>{
    e.stopPropagation();if(menu){close();return;}
    menu=document.createElement('div');menu.className='ocr-ag-function-menu';
    menu.setAttribute('role','menu');menu.setAttribute('aria-label','当前 AG View 功能');
    const items=mode==='table'?[['organize-table','组织源码',onOrganizeTable]]:mode==='media'?[['download-all','下载并替换全部',onDownloadAll],['normalize-media','规范化图片链接',onNormalizeMedia],['refresh','刷新媒体清单',onMediaScan]]:mode==='latex'?[['inline-math','补全行内公式定界',onInlineMath]]:[['rules','注释格式',rules],...(onConvert?[['convert','转换匹配',onConvert]]:[])];
    for(const [id,label,run] of items){
      const option=document.createElement('button');option.type='button';option.className='ocr-ag-function-item';
      option.setAttribute('role','menuitem');option.dataset.action=id;option.textContent=label;
      option.onclick=e=>{e.stopPropagation();close();try{Promise.resolve(run()).catch(err=>onStatus(err.message,'error'));}catch(err){onStatus(err.message,'error');}};
      menu.append(option);
    }
    const rect=trigger.getBoundingClientRect();
    menu.style.left=Math.max(5,Math.min(rect.left,innerWidth-185))+'px';
    menu.style.top=Math.max(5,Math.min(rect.bottom+3,innerHeight-85))+'px';
    document.body.append(menu);trigger.setAttribute('aria-expanded','true');
    document.addEventListener('pointerdown',outside,true);document.addEventListener('keydown',escape,true);
  });
  return Object.freeze({setVisible(visible,nextMode='note-match'){const next=visible?nextMode:null;if(mode!==next){close();dialog?.dispose();dialog=null;}mode=next;trigger.hidden=!visible;},
    reset(){close();dialog?.dispose();dialog=null;}});
}
