/**
 * Bare JS Dockview panes. Only CM6 creates an editable document;
 * Zustand vanilla transports revision/selection signals, not content.
 */
import {createDockview, themeAbyss} from 'dockview';
import {readPaneRatios,applyPaneRatios} from './pane-layout-ratios.js';
import morphdom from 'morphdom';
import 'dockview/dist/styles/dockview.css';
import {viewStore,publishFocus,publishActivePanel} from './view-store.js';
import {renderMarkdown} from './markdown-preview.js';
import {createScrollSync} from './scroll-sync.js';
import {createOutlineGrid} from './wcp-chapter-outline.js';
import {createMediaModule} from './media-module.js';
import {createLatexModule} from './latex-module.js';
import {PdfPreview} from './pdf-preview.js';
import './workspace.css';

const sourceHost = document.createElement('div');
sourceHost.id = 'editor';
sourceHost.classList.add('ocr-cm-source');
sourceHost.setAttribute('aria-label','CodeMirror 6 Markdown 编辑器');

let getMarkdown = () => '';
let getEditor = () => null;
let getCMD = () => null;
// AG receives only the CMD capabilities needed for chapter projection/marking.
// In particular, this port has no EditorView or other editor internals.
const mediaCMD=Object.freeze({
  replaceRanges:edits=>{
    const cmd=getCMD();
    return typeof cmd.replaceMediaReferences==='function'
      ?cmd.replaceMediaReferences(edits):cmd.replaceRanges(edits);
  },
});
// Review plugins only receive optimistic CMD changes, never EditorView or a filesystem port.
const latexCMD=Object.freeze({
  readAnnotations:filter=>getCMD().readAnnotations(filter),
  editAnnotations:(operations,options)=>getCMD().editAnnotations(operations,options),
});
let reportMediaStatus=()=>{};
const chapterCMD=Object.freeze({
  readLine:n=>getCMD().readLine(n),
  lineAtOffset:n=>getCMD().lineAtOffset(n),
  matchesSnapshot:token=>getCMD().matchesSnapshot(token),
  writeHtml:options=>getCMD().writeHtml(options), // legacy custom chapter tags only
  readAnnotations:filter=>getCMD().readAnnotations(filter),
  writeAnnotation:options=>getCMD().writeAnnotation(options),
});
let refreshPreview = () => {};
let currentPreview=null;
let scrollSync=null;
let currentOutline=null;
let outlineTitleFontScale=1;
let currentPdf=null;
let toggleSplitPreview=()=>{};
let wcpRuntime=null;

class OutlinePanel {
  constructor(){
    this.element=document.createElement('div');
    this.element.setAttribute('aria-label','AG Grid 章节大纲');
    this.grid=null;
    this.media=null;
    this.latex=null;
    this.mediaHost=document.createElement('div');
    this.mediaHost.hidden=true;
    this.latexHost=document.createElement('div');
    this.latexHost.hidden=true;
    currentOutline=this;
  }
  init(){
    this.grid=createOutlineGrid(this.element,()=>getMarkdown(),()=>getCMD()?chapterCMD:null);
    this.grid.setTitleFontScale(outlineTitleFontScale);
    this.element.append(this.mediaHost,this.latexHost);
    this.media=createMediaModule(this.mediaHost,()=>getMarkdown(),()=>mediaCMD,reportMediaStatus);
    this.latex=createLatexModule(this.latexHost,()=>getMarkdown(),()=>latexCMD,reportMediaStatus);
    // Only scalar/immutable chapter projections cross WCP: no raw AG API or
    // CMD editor objects leave Layout's ownership boundary.
    const bridge=Object.freeze({
      getChapterIndex:()=>getCMD()?.getIndex?.()??null,
      getStartNumber:()=>this.grid?.startText||'000',
      // Only semantic query intents enter business-owned AGs.
      applyChapterQuery:(module,intent)=>{
        const owner={outline:this.grid,media:this.media,latex:this.latex}[module];
        if(!owner?.setVirtualQuery)throw Error('Unknown AG chapter query owner');
        owner.setVirtualQuery(intent);
      },
    });
    queueMicrotask(()=>wcpRuntime?.onAGReady(bridge));
  }
  setModule(module){
    this.element.setAttribute('aria-label',module==='media'?'AG Grid 媒体清单':
      module==='latex'?'AG Grid LaTeX 审阅':'AG Grid 章节大纲');
    this.element.querySelector('.ocr-outline-grid').hidden=module!=='chapter-boundary';
    this.media?.setActive(module==='media');
    this.latex?.setActive(module==='latex');
  }
  layout() {}
  dispose(){
    this.media?.dispose();
    this.latex?.dispose();
    this.grid?.dispose();
    if(currentOutline===this)currentOutline=null;
  }
}

class SourcePanel {
  constructor() {
    this.element=document.createElement('div');
    this.element.className='ocr-source-pane';
    this.element.classList.add('ocr-source-file-source');
    const bar=document.createElement('div');
    bar.className='ocr-source-file-toolbar';
    const files=document.createElement('select');
    files.className='ocr-source-file-select';
    files.setAttribute('aria-label','源码文件导航');
    files.add(new Option('章节定界/Buffett’s Alpha.minerujson.md','document'));
    // Real shared CodeMirror action buttons; no clones or new handlers.
    bar.append(files,document.querySelector('.quote-indent-tools'));
    this.element.append(bar,sourceHost);
  }
  init() {}
  layout() { getCMD()?.requestMeasure(); }
  dispose() {
    // Dockview may reparent a tab during drag/drop. Do not destroy the CM6
    // instance or its history; it will reattach to the next source pane.
  }
}

/** One Dockview pane, two persistent read-only projections. Neither is
 * re-created when the user changes the dropdown: PDF.js continues to receive
 * location events while Markdown is visible, and vice versa. */
class PreviewPanel {
  constructor(){
    this.element=document.createElement('div');
    this.element.className='ocr-preview-pane';
    this.element.setAttribute('aria-label','Markdown / PDF 共用预览');
    this.toolbar=document.createElement('div');
    this.toolbar.className='ocr-preview-switchbar';
    this.switcher=document.createElement('select');
    this.switcher.className='ocr-preview-mode';
    this.switcher.setAttribute('aria-label','预览类型');
    this.switcher.innerHTML='<option value="md">Markdown 预览</option><option value="pdf" disabled>PDF 原文（预热中）</option>';
    this.pdfOption=this.switcher.querySelector('option[value="pdf"]');
    this.toolbar.append(this.switcher);
    this.splitLabel=document.createElement('label');
    this.splitLabel.className='ocr-preview-split-toggle';
    this.splitCheckbox=document.createElement('input');
    this.splitCheckbox.type='checkbox';
    this.splitCheckbox.disabled=true;
    this.splitCheckbox.setAttribute('aria-label','拆分 PDF 预览');
    this.splitLabel.append(this.splitCheckbox,document.createTextNode('拆分'));
    this.toolbar.append(this.splitLabel);
    this.mdTools=document.createElement('div');
    this.mdTools.className='ocr-preview-mode-tools';
    this.mdTools.dataset.mode='md';
    this.toolbar.append(this.mdTools);
    this.pdfTools=document.createElement('div');
    this.pdfTools.className='ocr-preview-mode-tools';
    this.pdfTools.dataset.mode='pdf';
    this.pdfTools.hidden=true;
    this.toolbar.append(this.pdfTools);
    this.mdPane=document.createElement('div');
    this.mdPane.className='ocr-preview-md-scroll';
    this.mdPane.setAttribute('aria-label','Markdown 阅读预览');
    this.body=document.createElement('article');
    this.body.className='ocr-markdown';
    this.mdPane.append(this.body);
    this.pdfPane=document.createElement('div');
    this.pdfPane.className='ocr-preview-pdf-host';
    this.pdfPane.setAttribute('aria-label','PDF 原文阅读预览');
    this.element.append(this.toolbar,this.mdPane,this.pdfPane);
    this.pdf=null;
    this.pdfUsable=false;
    this.timer=null;
    this.disposed=false;
    this.mode='md';
    this.lastFocusElement=null;
    this.onClick=event=>{
      if(!(event.target instanceof Element) || event.target.closest('a[href]'))return;
      const target=event.target.closest('[data-source-start][data-source-end]');
      if(!target)return;
      publishFocus({sourceLine:Number(target.dataset.sourceStart),
        sourceEnd:Number(target.dataset.sourceEnd),origin:'preview'});
    };
    this.switcher.addEventListener('change',()=>this.setMode(this.switcher.value));
    this.splitCheckbox.addEventListener('change',()=>toggleSplitPreview(this.splitCheckbox.checked));
    currentPreview=this;
  }
  init(){
    this.pdf=new PdfPreview(this.pdfPane,()=>getMarkdown());
    this.pdf.moveToolbarTo(this.pdfTools);
    currentPdf=this;
    this.setMode('md');
    // Keep Markdown interactive while PDF.js preloads in the hidden pane.
    // Enable PDF selection only after its first rendered page is ready.
    void this.pdf.whenReady().then(ready=>{
      if(this.disposed)return;
      this.pdfUsable=ready;
      this.pdfOption.disabled=!ready;
      this.pdfOption.textContent=ready?'PDF 原文':'PDF 原文（加载失败）';
      this.pdfOption.title=ready?'':'PDF 预热失败';
      this.splitCheckbox.disabled=!ready;
    });
    this.unsubscribe=viewStore.subscribe((next,prior)=>{
      if(next.documentRevision!==prior.documentRevision)this.schedule();
      if(next.focusTarget!==prior.focusTarget)this.highlight(next.focusTarget);
    });
    // WCP receives only a bounded semantic preview port, never the raw
    // Dockview panel or Markdown DOM. The panel remains the renderer owner.
    this.releaseWPCRenderer=wcpRuntime?.onPreviewInit(Object.freeze({
      setScope:scope=>{this.virtualScope=scope;},
      repaint:()=>{if(this.disposed)return;this.render();this.mdPane.scrollTop=0;},
      isDisposed:()=>this.disposed,
    }));
    this.body.addEventListener('click',this.onClick);
    refreshPreview=()=>this.schedule();
    this.schedule(true);
  }
  setMode(mode){
    if(mode!=='md'&&mode!=='pdf')return false;
    if(mode==='pdf' && (!this.pdfUsable || this.splitCheckbox.checked)){
      // Also reject scripted/early change events; the disabled option alone
      // is not a sufficient guard on every iPad select implementation.
      this.switcher.value=this.mode;
      return false;
    }
    this.mode=mode;
    this.switcher.value=mode;
    this.element.dataset.previewMode=mode;
    this.mdPane.setAttribute('aria-hidden',String(mode!=='md'));
    this.pdfPane.setAttribute('aria-hidden',String(mode!=='pdf'));
    this.pdfTools.hidden=mode!=='pdf';
    this.pdfTools.setAttribute('aria-hidden',String(mode!=='pdf'));
    if(this.pdf){
      this.pdf.setActive(mode==='pdf');
      if(mode==='pdf')this.pdf.revealCurrentLocation(); // only pending explicit click
      // Hidden MD viewport retains its geometry and synchronized scroll.
    }
    return true;
  }
  detachPdf(panel){
    panel.pdfHost.append(this.pdfPane);
    this.pdf.moveToolbarTo(panel.pdfTools);
    this.pdf.setActive(true);
  }
  reattachPdf(){
    if(this.pdfPane.parentElement!==this.element)this.element.append(this.pdfPane);
    this.pdf?.moveToolbarTo(this.pdfTools);
    this.pdf?.setActive(this.mode==='pdf');
  }
  layout(){this.pdf?.onResize();scrollSync?.measureLater();}
  schedule(immediate=false){
    if(this.disposed)return;
    clearTimeout(this.timer);
    if(immediate)this.render();
    else this.timer=setTimeout(()=>this.render(),180);
  }
  render(){
    if(this.disposed)return;
    const source=getMarkdown();
    if(!source)return;
    const pane=this.mdPane;
    const preserved=scrollSync?.beforeRender();
    const ratio=pane.scrollHeight>pane.clientHeight
      ?pane.scrollTop/(pane.scrollHeight-pane.clientHeight):0;
    const html=wcpRuntime
      ?wcpRuntime.renderPreview(source,{scope:this.virtualScope??null},renderMarkdown)
      :renderMarkdown(source);
    // PreviewPanel alone owns Markdown DOM. The Lab requests stable-node
    // reconciliation through a boolean capability; it never receives body DOM.
    if(wcpRuntime?.preservePreviewNodes){
      if(this.body.innerHTML!==html){
        const next=this.body.cloneNode(false);
        next.innerHTML=html;
        morphdom(this.body,next,{childrenOnly:true,
          onBeforeElUpdated:(from,to)=>!from.isEqualNode(to)});
      }
    }else this.body.innerHTML=html;
    this.lastFocusElement=null;
    this.highlight(viewStore.getState().focusTarget);
    if(scrollSync)scrollSync.afterRender(preserved);
    else pane.scrollTop=ratio*Math.max(0,pane.scrollHeight-pane.clientHeight);
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
      if(start<=focus.sourceLine&&focus.sourceLine<end&&
        (!selected||end-start<Number(selected.dataset.sourceEnd)-Number(selected.dataset.sourceStart)))
        selected=element;
    }
    if(selected){
      selected.classList.add('ocr-outline-focused-element');
      this.lastFocusElement=selected;
    }
  }
  dispose(){
    this.disposed=true;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.body.removeEventListener('click',this.onClick);
    this.releaseWPCRenderer?.();
    this.pdf?.dispose();
    scrollSync?.dispose();scrollSync=null;
    if(currentPdf===this)currentPdf=null;
    if(currentPreview===this)currentPreview=null;
    refreshPreview=()=>{};
  }
}

/** Dockview wrapper: PDF.js and its scroller survive detaching and merging.
 * This component never owns or disposes the viewer, only its layout host. */
class DetachedPdfPanel {
  constructor(){
    this.element=document.createElement('div');
    this.element.className='ocr-detached-pdf-pane';
    this.element.setAttribute('aria-label','独立 PDF 原文预览');
    this.toolbar=document.createElement('div');
    this.toolbar.className='ocr-detached-pdf-toolbar';
    const name=document.createElement('span');
    name.className='ocr-detached-pdf-title';
    name.textContent='PDF';
    this.pdfTools=document.createElement('div');
    this.pdfTools.className='ocr-detached-pdf-tools';
    this.toolbar.append(name,this.pdfTools);
    this.pdfHost=document.createElement('div');
    this.pdfHost.className='ocr-detached-pdf-host';
    this.element.append(this.toolbar,this.pdfHost);
    this.preview=null;
  }
  init(){
    this.preview=currentPreview;
    if(!this.preview?.pdf)throw Error('PDF 预览尚未初始化');
    this.preview.detachPdf(this);
  }
  layout(){this.preview?.pdf?.onResize();}
  dispose(){
    // Emergency restoration also covers external Dockview panel removal.
    this.preview?.reattachPdf();
    this.preview=null;
  }
}

export function createWorkspace(container, getDocument, getCurrentEditor, getCommandDocument, mediaStatus=()=>{},runtime=null) {
  wcpRuntime=runtime;
  getMarkdown=getDocument;
  getEditor=getCurrentEditor;
  getCMD=getCommandDocument;
  reportMediaStatus=mediaStatus;
  const dockview=createDockview(container, {
    theme:themeAbyss,
    createComponent: ({name}) => {
      if (name==='outline') return new OutlinePanel();
      if (name==='source') return new SourcePanel();
      if (name==='preview') return new PreviewPanel();
      if (name==='pdf') return new DetachedPdfPanel();
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
  // The preview supplies its own switcher; no Dockview tabs are needed.
  for(const panel of [outlinePanel,sourcePanel,dockview.getPanel('preview')]) {
    panel.group.header.hidden=true;
    panel.group.relayout();
  }
  let split=false;
  toggleSplitPreview=(enabled)=>{
    if(!currentPreview || enabled===split)return;
    const preview=currentPreview;
    if(enabled && !preview.pdfUsable){
      preview.splitCheckbox.checked=false;
      return;
    }
    if(enabled){
      preview.setMode('md');
      try{
        const panel=dockview.addPanel({id:'pdf',component:'pdf',title:'PDF 原文',
          position:{referencePanel:'preview',direction:'right'}});
        panel.group.header.hidden=true;
        panel.group.relayout();
        split=true;
        preview.splitCheckbox.checked=true;
        preview.switcher.disabled=true;
      }catch(error){
        preview.reattachPdf();
        preview.splitCheckbox.checked=false;
        preview.switcher.disabled=false;
        throw error;
      }
    }else{
      // Return the persistent PDF.js DOM before Dockview removes its host.
      preview.reattachPdf();
      split=false;
      preview.splitCheckbox.checked=false;
      preview.switcher.disabled=false;
      const panel=dockview.getPanel('pdf');
      if(panel)dockview.removePanel(panel);
      preview.setMode('md');
    }
    requestAnimationFrame(()=>{
      preview.pdf?.onResize();
      scrollSync?.measureLater();
    });
  };
  const layoutPort=Object.freeze({
    getRatios:()=>readPaneRatios(dockview,'outline','source','preview'),
    setRatios:ratios=>applyPaneRatios(dockview,'outline','source','preview',ratios),
    onChange:listener=>dockview.onDidLayoutChange(listener),
  });
  const releaseWCPLayout=wcpRuntime?.onLayoutReady?.(layoutPort);
  dockview.onDidActivePanelChange(event => {
    publishActivePanel(event.panel?.id||null);
  });
  return {
    editorHost:sourceHost,
    getPaneRatios:()=>readPaneRatios(dockview,'outline','source','preview'),
    applyPaneRatios:ratios=>{
      // The workbench may just have returned from display:none; resynchronize
      // Dockview's measured size before restoring the user-selected sashes.
      if(!ratios||container.clientWidth<=0||container.clientHeight<=0)return false;
      dockview.layout(container.clientWidth,container.clientHeight);
      return applyPaneRatios(dockview,'outline','source','preview',ratios);
    },
    refreshPreview:()=>refreshPreview(),
    refreshOutline:()=>currentOutline?.grid?.refresh(),
    setOutlineTitleFontScale(value){
      if(!Number.isFinite(value)||value<0.2||value>2)throw Error('Invalid title font scale');
      outlineTitleFontScale=value;
      currentOutline?.grid?.setTitleFontScale(value);
    },
    refreshPdf:()=>currentPdf?.pdf?.refreshAnchors(),
    setWorkModule:module=>currentOutline?.setModule(module),
    scanMedia:()=>currentOutline?.media?.scan(),
    downloadMedia:()=>currentOutline?.media?.downloadAll(),
    scanLatex:()=>currentOutline?.latex?.refresh(),
    normalizeLatex:()=>currentOutline?.latex?.normalizeReviewed(),
    getChapterState(){
      const grid=currentOutline?.grid;
      return {rows:grid?.rows.map(row=>({...row}))||[], startText:grid?.startText||'000'};
    },
    setChapterStartNumber(value){currentOutline?.grid?.setStartNumber(value);},
    setChaptersExported(doc,names){currentOutline?.grid?.setExported(doc,names);},
    get previewMode(){return currentPreview?.mode;},
    get previewSplit(){return split;},
    setPreviewSplit(enabled){toggleSplitPreview(Boolean(enabled));},
    setPreviewMode(mode){currentPreview?.setMode(mode);},
    startScrollSync() {
      if(scrollSync) return scrollSync;
      if(!currentPreview || !getEditor()) return null;
      scrollSync=createScrollSync(getEditor,currentPreview.mdPane,currentPreview.body);
      scrollSync.afterRender(null);
      return scrollSync;
    },
    // The raw third-party objects exist ONLY in Vite DEV as test instrumentation.
    // Normal production consumers receive only the semantic Workspace facade.
    ...(import.meta.env.DEV ? {debug: {
      get dockview(){return dockview;},
      get outline(){return currentOutline?.grid;},
      get pdf(){return currentPdf?.pdf;},
      get scrollSync(){return scrollSync;},
    }} : {}),
  };
}
