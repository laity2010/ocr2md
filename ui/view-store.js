/**
 * Cross-panel notifications only. CM6 owns the Markdown text, selection and
 * history; Dockview owns layout. Never store document text or HTML here.
 */
import {createStore} from 'zustand/vanilla';

export const viewStore = createStore(() => ({
  documentRevision: 0,
  activePanel: 'source',
  sourceOffset: 0,
  scrollSyncEnabled: true,
  scrollTarget: null,
  // Explicit cross-pane navigation; ephemeral location, not document data.
  focusTarget: null,
  // Lab OCR semantic location event. No document bytes, editor instance or DOM.
  labFocusTarget: null,
  outlineCount: null,
}));

export function documentChanged() {
  viewStore.setState(s => ({documentRevision:s.documentRevision + 1}));
}

export function selectionChanged(offset) {
  if (viewStore.getState().sourceOffset !== offset)
    viewStore.setState({sourceOffset:offset});
}

// One-way events, not a second representation of Markdown. Fraction refers to
// a logical CM6 source line (0..1), origin suppresses feedback and revision
// rejects events computed for an older render.
export function publishScroll(sourceLine, fraction, origin) {
  viewStore.setState(state => ({
    scrollTarget:{
      sourceLine, fraction, origin, revision:state.documentRevision,
      sequence:(state.scrollTarget?.sequence||0)+1,
    },
  }));
}

export function setScrollSyncEnabled(enabled) {
  viewStore.setState({scrollSyncEnabled:Boolean(enabled)});
}

export function publishFocus({sourceLine,sourceEnd=sourceLine+1,origin,elementId=null,intent=null,sourceOffset=null,
  beforeBlockId=null,afterBlockId=null}) {
  if(!Number.isInteger(sourceLine)||sourceLine<1)return;
  if(sourceOffset!==null&&(!Number.isInteger(sourceOffset)||sourceOffset<0))return;
  viewStore.setState(state=>({
    focusTarget:{sourceLine,sourceEnd,origin,elementId,intent,sourceOffset,
      beforeBlockId,afterBlockId,revision:state.documentRevision,
      sequence:(state.focusTarget?.sequence||0)+1},
  }));
}

export function publishOutlineCount(count){
  if(!Number.isInteger(count)||count<0)throw Error('Invalid outline count');
  if(viewStore.getState().outlineCount!==count)viewStore.setState({outlineCount:count});
}
export function publishActivePanel(panelId){
  if(panelId!==null&&typeof panelId!=='string')throw Error('Invalid active panel');
  if(viewStore.getState().activePanel!==panelId)viewStore.setState({activePanel:panelId});
}

/** Four-pane Lab OCR location notification; readers map stable IDs locally.
 * Increment sequence even on repeated clicks so navigation may re-center.
 */
export function publishLabFocus({origin,intent='click',lineId=null,blockId=null,
  lineNo=null,page=null,pbs=null,formulaColumn=null,formulaEndColumn=null,formulaBBox=null,formulaKind=null}){
  if(!['ag','cm6','preview','pdf'].includes(origin))throw Error('Invalid review origin');
  if(lineId!==null&&(typeof lineId!=='string'||!lineId))throw Error('Invalid LineID');
  if(blockId!==null&&(!Number.isSafeInteger(blockId)||blockId<1))throw Error('Invalid BlockID');
  if(lineNo!==null&&(!Number.isInteger(lineNo)||lineNo<1))throw Error('Invalid line number');
  if(page!==null&&(!Number.isInteger(page)||page<1))throw Error('Invalid PDF page');
  if(!['click','edit'].includes(intent))throw Error('Invalid review intent');
  if(formulaColumn!==null&&(!Number.isInteger(formulaColumn)||formulaColumn<0||
     origin!=='ag'||lineNo===null))throw Error('Invalid formula caret column');
  if(formulaEndColumn!==null&&(!Number.isInteger(formulaEndColumn)||
     formulaColumn===null||formulaEndColumn<=formulaColumn||origin!=='ag'||
     lineNo===null))throw Error('Invalid formula end column');
  if(formulaKind!==null&&(!['inline','display'].includes(formulaKind)||origin!=='ag'||
    (!Number.isInteger(formulaColumn)&&formulaBBox===null)))
    throw Error('Invalid formula highlight kind');
  if(formulaBBox!==null&&(!Array.isArray(formulaBBox)||formulaBBox.length!==4||
     !formulaBBox.every(Number.isFinite)||formulaBBox[2]<=formulaBBox[0]||
     formulaBBox[3]<=formulaBBox[1]||origin!=='ag'||!page||!blockId))
    throw Error('Invalid PDF formula bbox');
  viewStore.setState(state=>({labFocusTarget:Object.freeze({origin,intent,lineId,blockId,
    lineNo,page,pbs,formulaColumn,formulaEndColumn,formulaKind,
    formulaBBox:formulaBBox?Object.freeze([...formulaBBox]):null,
    sequence:(state.labFocusTarget?.sequence||0)+1})}));
}
