/** WP3: one CMD index, three ORIGINAL business-owned AG instances, no fourth grid.
 * Scope is an AG external filter; no file is loaded to switch chapter views.
 * Legacy physical chapter mode is deliberately excluded until WP4.
 */
import {createIndexProjector} from './document-index.js';
import {viewStore} from '../../../ui/view-store.js';

const TYPE=Object.freeze({'chapter-boundary':'heading',media:'media',latex:'latex'});
const gridType=Object.freeze({outline:'heading',media:'media',latex:'latex'});
export function mountVirtualAgQuery({checkbox,chapterSelect,status,getModule,isPhysicalChapter,isIndexMode}){
  let view=null,sourcePort=null,unsubscribe=null,disposed=false,index=null;
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
    sourcePort=createIndexProjector(event.detail.getMarkdown);
    for(const {name,api} of grids())original.set(name,api.getGridOption('columnDefs'));
    populate();
    unsubscribe=viewStore.subscribe((current,prior)=>{
      if(current.documentRevision!==prior.documentRevision){
        sourcePort.clear();populate();queueMicrotask(apply);
      }
    });
    apply();
  }
  document.addEventListener('ocr2md:wp3-ag-ready',onGridReady);
  checkbox.checked=true;
  checkbox.addEventListener('change',()=>{chapterSelect.hidden=checkbox.checked;
    chapterSelect.ocrNavigationSelect?.show();apply();});
  chapterSelect.addEventListener('change',apply);
  status.title='WP3 仅按母 Markdown 已有 CMD 标定查询；旧实体章节的独立审阅记录须先无损迁移。';
  return Object.freeze({
    sync(){if(enabled()&&sourcePort)populate();apply();},
    setModule(){apply();},
    dispose(){disposed=true;document.removeEventListener('ocr2md:wp3-ag-ready',onGridReady);
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
