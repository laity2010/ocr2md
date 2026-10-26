/** WP3: one CMD index, three ORIGINAL business-owned AG instances, no fourth grid.
 * Scope is an AG external filter; no file is loaded to switch chapter views.
 * Legacy physical chapter mode is deliberately excluded until WP4.
 */
import {createIndexProjector} from './document-index.js';
import {viewStore,publishFocus} from '../../../ui/view-store.js';

const TYPE=Object.freeze({'chapter-boundary':'heading',media:'media',latex:'latex'});
const gridType=Object.freeze({outline:'heading',media:'media',latex:'latex'});
export function mountVirtualAgQuery({checkbox,chapterSelect,status,getModule,isPhysicalChapter,isIndexMode}){
  let view=null,sourcePort=null,unsubscribe=null,disposed=false,index=null;
  let priorScope=null,updateTimer=null;
  const original=new Map(),adapted=new Map(),enabled=()=>!isPhysicalChapter()&&isIndexMode();
  const currentChapter=()=>!enabled()||checkbox.checked?'all':chapterSelect.value;
  const locate=(data,type)=>{
    if(type==='heading')return data?.id;
    return data?.from;
  };
  const refreshIndex=()=>{
    if(!sourcePort)return null;
    try{index=sourcePort.get();return index;}catch(error){
      index=null;status.textContent='CMD 索引失败：'+error.message;return null;
    }
  };
  function scopedKeys(type){
    const state=index;
    if(!enabled()||!state)return null;
    const chapter=currentChapter();
    const allowed=state.queryElements({chapter,type});
    return new Set(allowed.map(x=>type==='heading'?x.id.slice('heading:'.length):x.from));
  }
  const owningChapter=(sourceLine)=>{
    if(!index||!Number.isInteger(sourceLine))return null;
    return index.chapters.find(c=>c.startLine<=sourceLine&&sourceLine<c.endLine)||null;
  };
  function focusChapterStart(){
    if(!enabled()||checkbox.checked)return;
    const chapter=index?.getChapter(chapterSelect.value);
    if(!chapter)return;
    requestAnimationFrame(()=>{
      if(disposed||!enabled()||checkbox.checked||chapterSelect.value!==chapter.id)return;
      // Intentional chapter navigation is an explicit user location, not a
      // passive CM6 scroll; the shared PDF and preview focus contracts apply.
      publishFocus({sourceLine:chapter.startLine,origin:'wp5-chapter',intent:'click'});
    });
  }
  const grids=()=>view?Object.entries(gridType).map(([name,type])=>({name,type,api:view[name]?.api})).filter(x=>x.api):[];
  function apply(){
    if(disposed||!view)return;
    const state=refreshIndex();
    // Actual source is always the same CM6 mother doc in virtual mode.
    // A physical chapter restores native row filtering; it is NOT a virtual view.
    for(const {name,type,api} of grids()){
      const keySet=scopedKeys(type);
      const originalColumns=original.get(name);
      if(!originalColumns)continue;
      const chapterColumn={colId:'virtualChapter',headerName:'所属章节',width:147,minWidth:117,
        sortable:false,resizable:true,suppressMovable:true,
        valueGetter:p=>{
          const current=index;
          if(!current||!p.data)return '';
          const found=type==='heading'?current.elements.find(x=>x.type==='heading'&&x.id==='heading:'+p.data.id):
            current.elements.find(x=>x.type===type&&x.from===p.data.from);
          const chapter=found&&current.getChapter(found.chapterId);
          return chapter?`${chapter.number} · ${chapter.title}`:'';
        },
      };
      if(!adapted.has(name))adapted.set(name,[
        ...originalColumns.filter(c=>type==='heading'?c.field!=='independent'&&c.field!=='chapterFile':true),
        chapterColumn,
      ]);
      const actual=api.getGridOption('columnDefs')||[];
      const usesWP3Column=actual.some(c=>c.colId==='virtualChapter');
      if(enabled()){
        const target=adapted.get(name);
        if(actual.length!==target.length||actual.some((c,i)=>c!==target[i]))
          api.setGridOption('columnDefs',target);
      }else if(usesWP3Column){
        // Only remove WP3-owned columns. Physical chapter schema is owned by
        // chapter-outline.js, which may already have reacted to file switch.
        api.setGridOption('columnDefs',originalColumns);
      }
      // The CMD query result, not a second parse of chapter files, provides
      // row membership. AG's native filter preserves row state and renderer DOM.
      api.setGridOption('isExternalFilterPresent',()=>Boolean(keySet));
      api.setGridOption('doesExternalFilterPass',node=>!keySet||keySet.has(locate(node.data,type)));
      api.onFilterChanged();
    }
    const nextScope=enabled()&&state&&currentChapter()!=='all'
      ?state.getChapter(currentChapter()):null;
    const signature=nextScope?nextScope.id+'|'+nextScope.from+'|'+nextScope.to:'all';
    if(signature!==priorScope){
      priorScope=signature;
      document.dispatchEvent(new CustomEvent('ocr2md:wp4-virtual-scope',{
        detail:{scope:nextScope?{id:nextScope.id,from:nextScope.from,to:nextScope.to}:null},
      }));
    }
    const type=TYPE[getModule()];
    if(!enabled()){
      status.textContent='实体章节兼容模式（WP4 尚未接管编辑）';
    }else if(state&&type){
      const chapter=currentChapter();
      const count=state.queryElements({chapter,type}).length;
      status.textContent=`CMD · ${chapter==='all'?'全部章节':state.getChapter(chapter)?.number||'—'} · ${count} 项`;
    }
  }
  const populate=()=>{
    const state=refreshIndex();if(!state)return;
    const saved=chapterSelect.value;
    chapterSelect.replaceChildren();
    for(const chapter of state.chapters){const option=document.createElement('option');
      option.value=chapter.id;option.textContent=`${chapter.number} · ${chapter.title}`;
      chapterSelect.append(option);
    }
    if(state.getChapter(saved))chapterSelect.value=saved;
  };
  function onGridReady(event){
    if(disposed||view)return;
    view=event.detail?.views;
    if(!view?.outline?.api||!view?.media?.api||!view?.latex?.api)
      throw Error('WP3 requires three original AG module APIs');
    // The Workspace is instantiated before its CM6/CMD transaction port.
    // Its one-shot AG-ready callback can run before that port is initialized,
    // especially in fast Linux Chromium. Resolve the CURRENT CMD port on
    // each read rather than capturing the initial, possibly unready object.
    // The fallback is only for an experiment without WP6 wired at all.
    const legacyProjection=createIndexProjector(event.detail.getMarkdown);
    sourcePort={
      get:()=>event.detail.getCMD?.()?.getIndex?.() ?? legacyProjection.get(),
      clear:()=>legacyProjection.clear(),
    };
    for(const {name,api} of grids())original.set(name,api.getGridOption('columnDefs'));
    populate();
    unsubscribe=viewStore.subscribe((current,prior)=>{
      if(current.focusTarget!==prior.focusTarget &&
         current.focusTarget?.origin==='pdf' &&
         current.focusTarget.revision===current.documentRevision &&
         enabled()&&!checkbox.checked){
        const target=current.focusTarget;
        const owner=owningChapter(target.sourceLine);
        if(owner&&owner.id!==chapterSelect.value){
          chapterSelect.value=owner.id;
          chapterSelect.ocrNavigationSelect?.tom.setValue(owner.id,true);
          apply();
          // The original PDF focus may have reached scroll followers before
          // the scoped CM6 decorations updated. Replay the SAME full-doc line
          // once after scope switch; subsequent replay sees matching owner.
          queueMicrotask(()=>{if(!disposed&&enabled()&&!checkbox.checked)
            publishFocus({sourceLine:target.sourceLine,sourceEnd:target.sourceEnd,
              origin:'pdf',elementId:target.elementId,intent:'click'});
          });
        }
      }
      if(current.documentRevision!==prior.documentRevision){
        // Coalesce expensive full-document CMD indexing while typing. CM6
        // maps current chapter bounds through ChangeDesc synchronously.
        clearTimeout(updateTimer);
        updateTimer=setTimeout(()=>{sourcePort.clear();populate();apply();},700);
      }
    });
    apply();
  }
  document.addEventListener('ocr2md:wp3-ag-ready',onGridReady);
  checkbox.checked=true;
  checkbox.addEventListener('change',()=>{chapterSelect.hidden=checkbox.checked;
    chapterSelect.ocrNavigationSelect?.show();apply();focusChapterStart();});
  chapterSelect.addEventListener('change',()=>{apply();focusChapterStart();});
  status.title='WP3 仅按母 Markdown 已有 CMD 标定查询；旧实体章节的独立审阅记录须先无损迁移。';
  return Object.freeze({
    sync(){if(enabled()&&sourcePort)populate();apply();},
    setModule(){apply();},
    dispose(){disposed=true;clearTimeout(updateTimer);
      document.removeEventListener('ocr2md:wp3-ag-ready',onGridReady);
      unsubscribe?.();for(const {name,api} of grids()){
        const originalColumns=original.get(name);
        if(originalColumns)api.setGridOption('columnDefs',originalColumns);
        api.setGridOption('isExternalFilterPresent',()=>false);
        api.setGridOption('doesExternalFilterPass',()=>true);
        api.onFilterChanged();
      }
    },
  });
}
