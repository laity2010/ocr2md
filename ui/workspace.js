/**
 * Bare JS Dockview panes. Only CM6 creates an editable document;
 * Zustand vanilla transports revision/selection signals, not content.
 */
import {createDockview, themeAbyss} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import {viewStore} from './view-store.js';
import {renderMarkdown} from './markdown-preview.js';
import './workspace.css';

const sourceHost = document.createElement('div');
sourceHost.id = 'editor';
sourceHost.setAttribute('aria-label','CodeMirror 6 Markdown 编辑器');

let getMarkdown = () => '';
let getEditor = () => null;
let refreshPreview = () => {};

class SourcePanel {
  constructor() {
    this.element=document.createElement('div');
    this.element.className='ocr-source-pane';
    this.element.append(sourceHost);
  }
  init() {}
  layout() { getEditor()?.requestMeasure(); }
  dispose() {
    // Dockview may reparent a tab during drag/drop. Do not destroy the CM6
    // instance or its history; it will reattach to the next source pane.
  }
}

class PreviewPanel {
  constructor() {
    this.element=document.createElement('div');
    this.element.className='ocr-preview-pane';
    this.element.setAttribute('aria-label','Markdown 阅读预览');
    this.body=document.createElement('article');
    this.body.className='ocr-markdown';
    this.element.append(this.body);
    this.timer=null;
    this.disposed=false;
  }
  init() {
    this.unsubscribe=viewStore.subscribe((next,prior) => {
      if (next.documentRevision !== prior.documentRevision) this.schedule();
    });
    refreshPreview=()=>this.schedule();
    this.schedule(true);
  }
  schedule(immediate=false) {
    if (this.disposed) return;
    clearTimeout(this.timer);
    if (immediate) this.render();
    else this.timer=setTimeout(()=>this.render(),180);
  }
  render() {
    if (this.disposed) return;
    const source=getMarkdown();
    if (!source) return; // CM6 may not be initialized yet.
    const pane=this.element;
    const scrollRatio=pane.scrollHeight>pane.clientHeight
      ? pane.scrollTop/(pane.scrollHeight-pane.clientHeight) : 0;
    this.body.innerHTML=renderMarkdown(source);
    // Keep the visible position on edit rather than snapping to the top.
    pane.scrollTop=scrollRatio*Math.max(0,pane.scrollHeight-pane.clientHeight);
  }
  dispose() {
    this.disposed=true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    if (refreshPreview) refreshPreview=()=>{};
  }
}

export function createWorkspace(container, getDocument, getCurrentEditor) {
  getMarkdown=getDocument;
  getEditor=getCurrentEditor;
  const dockview=createDockview(container, {
    theme:themeAbyss,
    createComponent: ({name}) => {
      if (name==='source') return new SourcePanel();
      if (name==='preview') return new PreviewPanel();
      throw new Error('Unknown pane '+name);
    },
  });
  dockview.addPanel({id:'source',component:'source',title:'Markdown 源码'});
  dockview.addPanel({id:'preview',component:'preview',title:'Markdown 预览',
    position:{referencePanel:'source',direction:'right'}});
  dockview.onDidActivePanelChange(event => {
    viewStore.setState({activePanel:event.panel?.id||null});
  });
  return {dockview, editorHost:sourceHost, refreshPreview:()=>refreshPreview()};
}
