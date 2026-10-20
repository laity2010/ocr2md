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
