/** WP3: one CMD index, independent business-owned AG instances.
 * Scope is an AG external filter; no file is loaded to switch chapter views.
 * Legacy physical chapter mode is deliberately excluded until WP4.
 */
import {viewStore,publishFocus} from './view-store.js';

const TYPE=Object.freeze({'chapter-boundary':'heading',media:'media',latex:'latex',note:'note'});
const gridType=Object.freeze({outline:'heading',media:'media',latex:'latex',note:'note'});
export function mountVirtualAgQuery({checkbox,chapterSelect,status,getModule,isPhysicalChapter,isIndexMode}){
  let bridge=null,sourcePort=null,unsubscribe=null,disposed=false,index=null;
  let priorScope=null,updateTimer=null;
  const enabled=()=>!isPhysicalChapter()&&isIndexMode();
  // AG row filtering and source projection are independent. In the mother
  // document '全部' is locked on. Only a selected chapter file can
  // uncheck it to filter AG to its current indexed chapter.
  const queryEnabled=()=>!isPhysicalChapter();
  const currentChapter=()=>!queryEnabled()||!isIndexMode()||checkbox.checked?'all':chapterSelect.value;
  // AG '全部' is also the scope of AG-initiated operations, independently
  // from the editor/Markdown/PDF chapter projection.
  const sourceChapter=()=>enabled()?chapterSelect.value:null;
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
    if(type==='note')return null; // Note's configurable regex owns row membership.
    const state=index;
    if(!queryEnabled()||!state)return null;
    const chapter=currentChapter();
    // 全部 means NO chapter filtering. A Set of all CMD 'from' offsets
    // is not equivalent: review annotations shift later offsets immediately,
    // while the WP3 CMD index updates on a delayed revision tick. Reapplying
    // that stale Set briefly hides all but the first LaTeX row on iPad.
    if(chapter==='all')return null;
    const allowed=state.queryElements({chapter,type});
    return new Set(allowed.map(x=>type==='heading'?x.id.slice('heading:'.length):x.from));
  }
  const owningChapter=(sourceLine)=>{
    if(!index||!Number.isInteger(sourceLine))return null;
    return index.chapters.find(c=>c.startLine<=sourceLine&&sourceLine<c.endLine)||null;
  };
  function focusChapterStart(){
    if(!enabled())return;
    const chapter=index?.getChapter(chapterSelect.value);
    if(!chapter)return;
    requestAnimationFrame(()=>{
      if(disposed||!enabled()||chapterSelect.value!==chapter.id)return;
      // Intentional chapter navigation is an explicit user location, not a
      // passive CM6 scroll; the shared PDF and preview focus contracts apply.
      publishFocus({sourceLine:chapter.startLine,origin:'wp5-chapter',intent:'click'});
    });
  }
  const grids=()=>Object.entries(gridType).map(([name,type])=>({name,type}));
  function apply(){
    if(disposed||!bridge)return;
    const state=refreshIndex();
    for(const {name,type} of grids()){
      const keys=scopedKeys(type);
      // Cross-module intention only. Each AG owner creates its own column and
      // external filter; WCP never reads/writes raw AG Grid APIs.
      const chapter=currentChapter();
      bridge.applyChapterQuery(name,{enabled:queryEnabled(),keys,
        operationScope:chapter==='all'?{mode:'all'}:{mode:'chapter',chapterId:chapter},
        chapterLabel:data=>{
        const current=index;
        if(!current||!data)return '';
        const found=type==='heading'?
          current.elements.find(x=>x.type==='heading'&&x.id==='heading:'+data.id):
          current.elements.find(x=>x.type===type&&x.from===data.from);
        const chapter=type==='note'?current.chapterAt(data.from):
          found&&current.getChapter(found.chapterId);
        return chapter?chapter.number+' · '+chapter.title:'';
      }});
    }
    const nextScope=state&&sourceChapter()?state.getChapter(sourceChapter()):null;
    const signature=nextScope?nextScope.id+'|'+nextScope.from+'|'+nextScope.to:'all';
    if(signature!==priorScope){
      priorScope=signature;
      document.dispatchEvent(new CustomEvent('ocr2md:wp4-virtual-scope',{
        detail:{scope:nextScope?{id:nextScope.id,from:nextScope.from,to:nextScope.to}:null},
      }));
    }
    const type=TYPE[getModule()];
    status.hidden=isPhysicalChapter()||(!isIndexMode()&&checkbox.checked);
    if(isPhysicalChapter())status.textContent='实体章节兼容模式（WP4 尚未接管编辑）';
    else if(state&&type){
      const chapter=currentChapter();
      const count=type==='note'?bridge.countNotes(chapter):
        state.queryElements({chapter,type}).length;
      status.textContent='CMD · '+(chapter==='all'?'全部章节':state.getChapter(chapter)?.number||'—')+' · '+count+' 项';
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
    if(disposed||bridge)return;
    bridge=event.detail;
    if(typeof bridge?.applyChapterQuery!=='function'||
       typeof bridge?.getChapterIndex!=='function')
      throw Error('WP3 needs semantic AG query and CMD index ports');
    sourcePort={get:()=>bridge.getChapterIndex(),clear:()=>{}};
    populate();
    unsubscribe=viewStore.subscribe((current,prior)=>{
      if(current.focusTarget!==prior.focusTarget &&
         current.focusTarget?.revision===current.documentRevision&&enabled()){
        const target=current.focusTarget;
        const clickedAG=['outline','media','latex','note'].includes(target.origin);
        // A click in an all-chapters AG or original PDF may refer to a line
        // hidden by the current CM6/Markdown virtual scope. Resolve the
        // owning chapter from the *one current CMD index*, not AG row order.
        if(target.origin==='pdf'||clickedAG&&checkbox.checked){
          const owner=owningChapter(target.sourceLine);
          if(owner&&owner.id!==chapterSelect.value){
            const detail={id:owner.id,preserveAll:checkbox.checked,
              accepted:false};
            document.dispatchEvent(new CustomEvent('ocr2md:lab-virtual-open',
              {detail}));
            if(detail.accepted&&chapterSelect.value===owner.id){
              // The initial focus may be consumed before the MD projection
              // repaints. Replay its absolute line after the scope's own
              // render frame, preserving origin, element ID, and "全部".
              requestAnimationFrame(()=>{
                if(disposed||!enabled()||chapterSelect.value!==owner.id)return;
                publishFocus({sourceLine:target.sourceLine,
                  sourceEnd:target.sourceEnd,origin:target.origin,
                  elementId:target.elementId,intent:target.intent||'click'});
              });
            }
          }
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
  checkbox.addEventListener('change',()=>{
    // Even synthetic changes cannot leave the mother view in a filtered state.
    if(!isIndexMode())checkbox.checked=true;
    chapterSelect.hidden=true;apply();
  });
  chapterSelect.addEventListener('change',()=>{apply();focusChapterStart();});
  status.title='WP3 仅按母 Markdown 已有 CMD 标定查询；旧实体章节的独立审阅记录须先无损迁移。';
  return Object.freeze({
    sync(){if(enabled()&&sourcePort)populate();apply();},
    setModule(){apply();},
    dispose(){disposed=true;clearTimeout(updateTimer);
      document.removeEventListener('ocr2md:wp3-ag-ready',onGridReady);
      unsubscribe?.();
      for(const {name} of grids())bridge?.applyChapterQuery(name,
        {enabled:false,operationScope:{mode:'all'}});
    },
  });
}
