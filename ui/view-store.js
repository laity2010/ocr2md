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

export function publishFocus({sourceLine,sourceEnd=sourceLine+1,origin,elementId=null,intent=null}) {
  if(!Number.isInteger(sourceLine)||sourceLine<1)return;
  viewStore.setState(state=>({
    focusTarget:{sourceLine,sourceEnd,origin,elementId,intent,
      revision:state.documentRevision,
      sequence:(state.focusTarget?.sequence||0)+1},
  }));
}
