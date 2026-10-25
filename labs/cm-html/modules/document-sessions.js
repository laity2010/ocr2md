/** Experiment-only document switch state: one original V6 workbench, CM6
 * EditorView and PDF.js viewer. Per-file immutable CM6 EditorState carries
 * history/selection; independent saved Text snapshot drives save/dirty status.
 */
export function createDocumentSessions({cm,initialName=null,initialSaved,fetchDocument,onActivated}){
  const states=new Map();
  const keyOf=name=>name||'';
  let current=keyOf(initialName);
  states.set(current,{state:cm.view.state,saved:initialSaved,scrollTop:cm.view.scrollDOM.scrollTop});
  let switching=false;
  function updateActive(){
    const item=states.get(current);
    item.state=cm.view.state;
    item.scrollTop=cm.view.scrollDOM.scrollTop;
  }
  const dirty=item=>Boolean(item)&&!item.state.doc.eq(item.saved);
  const api={
    get currentName(){return current||null;},
    get savedDoc(){return states.get(current).saved;},
    markSaved(snapshot,filename){
      const key=keyOf(filename);
      const item=states.get(key);
      if(item){item.saved=snapshot; if(key===current)item.state=cm.view.state;}
    },
    hasOtherUnsaved(){
      updateActive();
      return [...states].some(([key,item])=>key!==current&&dirty(item));
    },
    hasAnyUnsaved(){
      updateActive();
      return [...states].some(([,item])=>dirty(item));
    },
    async switchTo(name){
      const target=keyOf(name);
      if(switching)return false;
      if(target===current)return true;
      switching=true;
      try{
        // Fetch BEFORE touching current state. Failed loads leave the current
        // document, history, cursor, and unsaved changes completely intact.
        let next=states.get(target);
        if(!next){
          const source=await fetchDocument(name);
          const state=cm.createFileState(source);
          next={state,saved:state.doc,scrollTop:0};
        }
        updateActive();
        states.set(target,next);
        cm.activateFileState(next.state);
        current=target;
        cm.view.scrollDOM.scrollTop=next.scrollTop;
        onActivated({name:target||null,saved:next.saved});
        return true;
      }finally{switching=false;}
    },
  };
  return Object.freeze(api);
}
