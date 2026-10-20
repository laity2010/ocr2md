/**
 * Cross-panel notifications only. CM6 owns the Markdown text, selection and
 * history; Dockview owns layout. Never store document text or HTML here.
 */
import {createStore} from 'zustand/vanilla';

export const viewStore = createStore(() => ({
  documentRevision: 0,
  activePanel: 'source',
  sourceOffset: 0,
}));

export function documentChanged() {
  viewStore.setState(s => ({documentRevision:s.documentRevision + 1}));
}

export function selectionChanged(offset) {
  if (viewStore.getState().sourceOffset !== offset)
    viewStore.setState({sourceOffset:offset});
}
