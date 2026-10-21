/**
 * Bare JS Dockview panes. Only CM6 creates an editable document;
 * Zustand vanilla transports revision/selection signals, not content.
 */
import {createDockview, themeAbyss} from 'dockview';
import 'dockview/dist/styles/dockview.css';
import {viewStore,publishFocus} from './view-store.js';
import {renderMarkdown} from './markdown-preview.js';
import {createScrollSync} from './scroll-sync.js';
import {createOutlineGrid} from './outline-grid.js';
import './workspace.css';

const sourceHost = document.createElement('div');
sourceHost.id = 'editor';
sourceHost.setAttribute('aria-label','CodeMirror 6 Markdown 编辑器');

let getMarkdown = () => '';
let getEditor = () => null;
let refreshPreview = () => {};
let currentPreview=null;
let scrollSync=null;
let currentOutline=null;

class OutlinePanel {
  constructor(){
    this.element=document.createElement('div');
    this.element.setAttribute('aria-label','AG Grid 章节大纲');
    this.grid=null;
    currentOutline=this;
  }
  init(){
    this.grid=createOutlineGrid(this.element,()=>getMarkdown(),()=>getEditor());
  }
  layout() {}
  dispose(){
    this.grid?.dispose();
    if(currentOutline===this)currentOutline=null;
  }
}

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
    this.lastFocusElement=null;
    this.onClick=event=>{
      if(!(event.target instanceof Element) || event.target.closest('a[href]'))return;
      const target=event.target.closest('[data-source-start][data-source-end]');
      if(!target)return;
      publishFocus({
        sourceLine:Number(target.dataset.sourceStart),
        sourceEnd:Number(target.dataset.sourceEnd),
        origin:'preview',
      });
    };
    currentPreview=this;
  }
  init() {
    this.unsubscribe=viewStore.subscribe((next,prior) => {
      if (next.documentRevision !== prior.documentRevision) this.schedule();
      if (next.focusTarget!==prior.focusTarget) this.highlight(next.focusTarget);
    });
    this.body.addEventListener('click',this.onClick);
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
    const preserved=scrollSync?.beforeRender();
    const scrollRatio=pane.scrollHeight>pane.clientHeight
      ? pane.scrollTop/(pane.scrollHeight-pane.clientHeight) : 0;
    this.body.innerHTML=renderMarkdown(source);
    this.lastFocusElement=null;
    this.highlight(viewStore.getState().focusTarget);
    if(scrollSync) scrollSync.afterRender(preserved);
    else {
      pane.scrollTop=scrollRatio*Math.max(0,pane.scrollHeight-pane.clientHeight);
    }
  }
  highlight(focus){
    this.lastFocusElement?.classList.remove('ocr-outline-focused-element');
    this.lastFocusElement=null;
    if(!focus)return;
    const elements=[...this.body.querySelectorAll('[data-source-start][data-source-end]')];
    let selected=null;
    for(const element of elements){
      const start=Number(element.dataset.sourceStart);
      const end=Number(element.dataset.sourceEnd);
      if(start<=focus.sourceLine && focus.sourceLine<end &&
         (!selected || end-start < Number(selected.dataset.sourceEnd)-Number(selected.dataset.sourceStart))){
        selected=element;
      }
    }
    if(selected){
      selected.classList.add('ocr-outline-focused-element');
      this.lastFocusElement=selected;
    }
  }
  dispose() {
    this.disposed=true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.body.removeEventListener('click',this.onClick);
    scrollSync?.dispose();
    scrollSync=null;
    if(currentPreview===this) currentPreview=null;
    if (refreshPreview) refreshPreview=()=>{};
  }
}

export function createWorkspace(container, getDocument, getCurrentEditor) {
  getMarkdown=getDocument;
  getEditor=getCurrentEditor;
  const dockview=createDockview(container, {
    theme:themeAbyss,
    createComponent: ({name}) => {
      if (name==='outline') return new OutlinePanel();
      if (name==='source') return new SourcePanel();
      if (name==='preview') return new PreviewPanel();
      throw new Error('Unknown pane '+name);
    },
  });
  // Left AG fills the entire left height; right side is split top/bottom.
  const outlinePanel=dockview.addPanel({id:'outline',component:'outline',title:'章节大纲 · AG'});
  const sourcePanel=dockview.addPanel({id:'source',component:'source',title:'Markdown 源码',
    position:{referencePanel:'outline',direction:'right'}});
  dockview.addPanel({id:'preview',component:'preview',title:'Markdown 预览',
    position:{referencePanel:'source',direction:'below'}});
  // Dockview's native group header visibility reflows the panel content;
  // do not hide tabs with CSS (that leaves an unused titlebar gap).
  // Preview keeps its tab for identification; AG + CM6 use all their height.
  for(const panel of [outlinePanel,sourcePanel]) {
    panel.group.header.hidden=true;
    panel.group.relayout();
  }
  dockview.onDidActivePanelChange(event => {
    viewStore.setState({activePanel:event.panel?.id||null});
  });
  return {
    dockview, editorHost:sourceHost,
    refreshPreview:()=>refreshPreview(),
    refreshOutline:()=>currentOutline?.grid?.refresh(),
    get outlineGrid(){return currentOutline?.grid;},
    startScrollSync() {
      if(scrollSync) return scrollSync;
      if(!currentPreview || !getEditor()) return null;
      scrollSync=createScrollSync(getEditor,currentPreview.element,currentPreview.body);
      scrollSync.afterRender(null);
      return scrollSync;
    },
    get scrollSync(){return scrollSync;},
  };
}
