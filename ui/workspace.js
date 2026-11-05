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
import {createFootnotePopover} from './footnote-popover.js';
import {createScrollSync} from './scroll-sync.js';
import {createOutlineGrid} from './wcp-chapter-outline.js';
import {createMediaModule} from './media-module.js';
import {createLatexModule} from './latex-module.js';
import {createNotePairModule} from './note-pair-module.js';
import {createHtmlElementsModule} from './html-elements-module.js';
import {createSpellcheckModule} from './spellcheck-module.js';
import {createIllegalBreakModule} from './illegal-break-module.js';
import {createSentenceModule} from './sentence-module.js';
import {createTextBlockModule} from './text-block-module.js';
import {paintSentencePreviewHighlight,clearSentencePreviewHighlight,
  paintSentenceCoverageHighlight,clearSentenceCoverageHighlight,hitSentencePreview} from './sentence-preview-highlight.js';
import {createSourceLineCalloutMenu} from './source-line-callout-menu.js';
import {PdfPreview} from './pdf-preview.js';
import {paintCMDTextBlockCoverage,clearCMDTextBlockCoverage} from './text-block-preview-coverage.js';
import {paintIllegalBreakMDPair,clearIllegalBreakMDPair} from './illegal-break-md-pair.js';
import './workspace.css';

const sourceHost = document.createElement('div');
sourceHost.id = 'editor';
sourceHost.classList.add('ocr-cm-source');
sourceHost.setAttribute('aria-label','CodeMirror 6 Markdown 编辑器');

let getMarkdown = () => '';
let getEditor = () => null;
let getCMD = () => null;
// All document-element readers receive the same CM6-backed CMD source port.
const readElementSource=()=>getCMD()?.readSource?.()??'';
let documentFileLabel='Buffett’s Alpha.minerujson.md';
// AG receives only the CMD capabilities needed for chapter projection/marking.
// In particular, this port has no EditorView or other editor internals.
const mediaCMD=Object.freeze({
  // Semantic CMD capability only; no fallback that bypasses virtual chapter guards.
  replaceMediaReferences:(edits,scope)=>getCMD().replaceMediaReferences(edits,scope),
  queryElements:filter=>getCMD().queryElements(filter),
});
const latexCMD=Object.freeze({
  readAnnotations:filter=>getCMD().readAnnotations(filter),
  editAnnotations:(operations,options)=>getCMD().editAnnotations(operations,options),
  queryElements:filter=>getCMD().queryElements(filter),
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
let currentSourcePanel=null;
let outlineTitleFontScale=1;
let pdfBlockLabelScale=1;
let currentPdf=null;
let toggleSplitPreview=()=>{};
let wcpRuntime=null;
let geometryReady=()=>Promise.reject(Error('CMD 尚未准备好'));
let textBlockActionHost=null;
let blockJoinAction=()=>Promise.reject(Error('CMD 尚未准备好'));
let blockMoveAction=()=>Promise.reject(Error('CMD 尚未准备好'));
let pdfBBoxAction=()=>Promise.reject(Error('CMD PDF bbox 尚未准备好'));
let blockChainAction=()=>Promise.reject(Error('CMD 块链尚未准备好'));
let markSubblocksAction=()=>Promise.reject(Error('CMD 尚未准备好'));
let insertPDFText=()=>Promise.reject(Error('CMD 尚未准备好'));
let refreshTextBlockInventory=()=>{};
let reportTextBlockSummary=()=>{};
let mdTextBlockCoverageEnabled=false;
let pdfTextBlockCoverageEnabled=true;

class OutlinePanel {
  constructor(){
    this.element=document.createElement('div');
    this.element.setAttribute('aria-label','AG Grid 章节大纲');
    this.grid=null;
    this.media=null;
    this.latex=null;
    this.note=null;
    this.html=null;
    this.spellcheck=null;
    this.illegalBreak=null;
    this.sentence=null;
    this.textBlock=null;
    this.mediaHost=document.createElement('div');
    this.mediaHost.hidden=true;
    this.latexHost=document.createElement('div');
    this.latexHost.hidden=true;
    this.noteHost=document.createElement('div');
    this.noteHost.hidden=true;
    this.htmlHost=document.createElement('div');
    this.htmlHost.hidden=true;
    this.spellcheckHost=document.createElement('div');
    this.spellcheckHost.hidden=true;
    this.illegalBreakHost=document.createElement('div');
    this.illegalBreakHost.hidden=true;
    this.sentenceHost=document.createElement('div');
    this.sentenceHost.hidden=true;
    this.textBlockHost=document.createElement('div');
    this.textBlockHost.hidden=true;
    currentOutline=this;
  }
  init(){
    this.grid=createOutlineGrid(this.element,readElementSource,()=>getCMD()?chapterCMD:null);
    this.grid.setTitleFontScale(outlineTitleFontScale);
    this.element.append(this.mediaHost,this.latexHost,this.noteHost,this.htmlHost,this.spellcheckHost,this.illegalBreakHost,this.sentenceHost,this.textBlockHost);
    this.media=createMediaModule(this.mediaHost,readElementSource,()=>mediaCMD,reportMediaStatus);
    this.latex=createLatexModule(this.latexHost,readElementSource,()=>latexCMD,reportMediaStatus);
    this.note=createNotePairModule(this.noteHost,readElementSource,()=>getCMD(),reportMediaStatus);
    this.html=createHtmlElementsModule(this.htmlHost,readElementSource,()=>getCMD(),reportMediaStatus);
    this.spellcheck=createSpellcheckModule(this.spellcheckHost,id=>getCMD()?.getChapter(id),reportMediaStatus);
    this.illegalBreak=createIllegalBreakModule(this.illegalBreakHost,id=>getCMD()?.getChapter(id),
      reportMediaStatus,(row,decision)=>getCMD().reviewIllegalBreak(row,decision));
    this.sentence=createSentenceModule(this.sentenceHost,id=>getCMD()?.getChapter(id),
      reportMediaStatus,()=>currentPreview?.redrawSentenceCoverage());
    this.textBlock=createTextBlockModule(this.textBlockHost,id=>getCMD()?.getChapter(id),
      reportMediaStatus,point=>{if(currentPreview?.pdfUsable){
        currentPreview.setMode('pdf');void currentPreview.focusOriginalBlock(point.pageIndex,point.blockIndex);
      }},selection=>{
        if(!selection){currentPreview?.clearBlockComparison();return;}
        if(selection.overview){void currentPreview?.overviewBlockComparison();return;}
        if(!currentPreview?.pdfUsable){reportMediaStatus('PDF 预热中，双框暂不可用');return;}
        currentPreview.setMode('pdf');
        void currentPreview.compareOriginalBlocks(selection.from,selection.to,selection.reveal);
      },textBlockActionHost,()=>markSubblocksAction(),(action,request)=>blockChainAction(action,request),
      (message,kind)=>reportTextBlockSummary(message,kind));
    // Only scalar/immutable chapter projections cross WCP: no raw AG API or
    // CMD editor objects leave Layout's ownership boundary.
    const bridge=Object.freeze({
      getChapterIndex:()=>getCMD()?.getIndex?.()??null,
      getStartNumber:()=>this.grid?.startText||'000',
      // Only semantic query intents enter business-owned AGs.
      applyChapterQuery:(module,intent)=>{
        const owner={outline:this.grid,media:this.media,latex:this.latex,note:this.note,html:this.html,spellcheck:this.spellcheck,'illegal-break':this.illegalBreak,sentence:this.sentence,'text-block':this.textBlock}[module];
        if(!owner?.setVirtualQuery)throw Error('Unknown AG chapter query owner');
        owner.setVirtualQuery(intent);
      },
      countNotes:chapter=>this.note?.count(chapter)??0,
      countHtml:chapter=>this.html?.count(chapter)??0,
      countSpellcheck:chapter=>this.spellcheck?.count(chapter)??0,
      countIllegalBreak:chapter=>this.illegalBreak?.count(chapter)??0,
      countSentences:chapter=>this.sentence?.count(chapter)??0,
      countTextBlocks:chapter=>this.textBlock?.count(chapter)??0,
    });
    queueMicrotask(()=>wcpRuntime?.onAGReady(bridge));
  }
  setModule(module){
    this.workModule=module;
    this.grid?.setChapterBoundaryModuleActive(module==='chapter-boundary');
    this.element.setAttribute('aria-label',module==='media'?'AG Grid 媒体清单':
      module==='latex'?'AG Grid LaTeX 审阅':module==='note'?'AG Grid 注释配对':
      module==='html'?'AG Grid HTML 元素':
      module==='spellcheck'?'AG Grid 英文拼写审阅':
      module==='illegal-break'?'AG Grid 非法断行审阅':
      module==='sentence'?'AG Grid 分句审阅':module==='text-block'?'AG Grid 文本块覆盖审阅':'AG Grid 章节大纲');
    this.element.querySelector('.ocr-outline-grid').hidden=module!=='chapter-boundary';
    this.media?.setActive(module==='media');
    this.latex?.setActive(module==='latex');
    this.note?.setActive(module==='note');
    this.html?.setActive(module==='html');
    this.spellcheck?.setActive(module==='spellcheck');
    this.illegalBreak?.setActive(module==='illegal-break');
    this.sentence?.setActive(module==='sentence');
    this.textBlock?.setActive(module==='text-block');
  }
  layout() {}
  dispose(){
    this.media?.dispose();
    this.latex?.dispose();
    this.note?.dispose();
    this.html?.dispose();
    this.spellcheck?.dispose();
    this.illegalBreak?.dispose();
    this.sentence?.dispose();
    this.textBlock?.dispose();
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
    files.add(new Option('章节定界/'+documentFileLabel,'document'));
    // Source actions live on the active CM6 gutter line, not in the toolbar.
    bar.append(files);
    this.bar=bar;this.menu=null;currentSourcePanel=this;
    this.element.append(bar,sourceHost);
  }
  init() {}
  mountLineMenu(view,handlers){
    this.menu?.dispose();
    this.menu=createSourceLineCalloutMenu({host:this.element,view,...handlers,
      onBeforeSourceEdit:()=>scrollSync?.sourceEditGesture()});
  }
  layout() { getCMD()?.requestMeasure(); }
  dispose() {
    // Dockview may reparent a tab during drag/drop. Do not destroy the CM6
    // instance or its history; it will reattach to the next source pane.
    this.menu?.dispose();
    if(currentSourcePanel===this)currentSourcePanel=null;
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
    this.coverLabel=document.createElement('label');
    this.coverLabel.className='ocr-preview-block-toggle';
    this.coverToggle=document.createElement('input');
    this.coverToggle.type='checkbox';
    this.coverToggle.setAttribute('aria-label','文本块');
    this.coverLabel.append(this.coverToggle,document.createTextNode('文本块'));
    this.coverLabel.title='Markdown/PDF 文本块标记；切分时同时控制两个预览窗';
    this.coverToggle.addEventListener('change',()=>this.setCoverageEnabled(this.coverToggle.checked));
    this.toolbar.append(this.coverLabel);
    this.splitCoverageEnabled=pdfTextBlockCoverageEnabled;
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
    this.returnNoteButton=document.createElement('button');
    this.returnNoteButton.type='button';
    this.returnNoteButton.className='ocr-preview-return-note';
    this.returnNoteButton.textContent='↩ 返回注引';
    this.returnNoteButton.title='返回打开注文前的 Markdown 阅读位置';
    this.returnNoteButton.hidden=true;
    this.returnNoteButton.addEventListener('click',()=>this.returnToNoteReference());
    this.mdTools.append(this.returnNoteButton);
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
    this.coverageResizeTimer=null;
    // Safari draws range rectangles, not native CSS Highlights. Image decode,
    // font reflow, or callout expansion can move text after its first paint.
    this.coverageObserver=new ResizeObserver(()=>this.scheduleCoverageResize());
    this.coverageObserver.observe(this.body);
    this.onCoverageImageLoad=event=>{
      if(event.target instanceof HTMLImageElement)this.scheduleCoverageResize();
    };
    this.body.addEventListener('load',this.onCoverageImageLoad,true);
    this.disposed=false;
    this.mode='md';
    this.lastFocusElement=null;
    this.noteReturn=null;
    this.footnoteReader=null;
    this.renderedCalloutScope=null;
    this.onCalloutToggle=event=>{
      if(event.target instanceof Element && event.target.matches('details.ocr-callout')){
        scrollSync?.measureLater();
        this.scheduleCoverageResize();
      }
    };
    this.onClick=event=>{
      if(this.footnoteReader?.handleClick(event))return;
      if(!(event.target instanceof Element) ||
         event.target.closest('a[href],details.ocr-callout > summary'))return;
      const target=event.target.closest('[data-source-start][data-source-end]');
      if(!target)return;
      if(currentOutline?.workModule==='sentence'){
        const cmd=getCMD();
        const sourceLine=Number(target.dataset.sourceStart);
        const row=cmd&&hitSentencePreview(this.body,event.target,sourceLine,
          event.clientX,event.clientY,cmd.querySentences().rows,cmd.readSource(),
          offset=>cmd.lineAtOffset(offset));
        if(row){
          publishFocus({sourceLine:row.line,origin:'preview',elementId:row.id,intent:'click'});
          return;
        }
      }
      publishFocus({sourceLine:Number(target.dataset.sourceStart),
        sourceEnd:Number(target.dataset.sourceEnd),origin:'preview'});
    };
    this.switcher.addEventListener('change',()=>this.setMode(this.switcher.value));
    this.splitCheckbox.addEventListener('change',()=>toggleSplitPreview(this.splitCheckbox.checked));
    currentPreview=this;
  }
  init(){
    this.footnoteReader=createFootnotePopover({
      root:this.body,
      onLocate:target=>this.navigateToNote(target),
    });
    this.pdf=new PdfPreview(this.pdfPane,()=>getMarkdown(),()=>geometryReady(),
      (id,join)=>blockJoinAction(id,join),
      (id,targetId,placement)=>blockMoveAction(id,targetId,placement),
      (pageIndex,blockIndex,text)=>insertPDFText(pageIndex,blockIndex,text),
      ()=>markSubblocksAction(),
      (id,bbox,snapshot)=>pdfBBoxAction(id,bbox,snapshot),
      (sourceId,targetId)=>blockChainAction('reparent',{memberId:sourceId,targetId}),
      childId=>blockChainAction('promote-child',{childId}),
      pageNumber=>currentOutline?.textBlock?.setCurrentPDFPage(pageNumber),
      (message,kind)=>reportMediaStatus(message,kind));
    this.pdf.setBlockLabelScale(pdfBlockLabelScale);
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
      if(next.documentRevision!==prior.documentRevision){
        this.clearNoteReturn();this.schedule();
      }
      if(next.focusTarget!==prior.focusTarget)this.highlight(next.focusTarget);
    });
    // WCP receives only a bounded semantic preview port, never the raw
    // Dockview panel or Markdown DOM. The panel remains the renderer owner.
    this.releaseWPCRenderer=wcpRuntime?.onPreviewInit(Object.freeze({
      setScope:scope=>{
        if((scope?.id??null)!==(this.virtualScope?.id??null))this.clearNoteReturn();
        this.virtualScope=scope;
      },
      repaint:()=>{if(this.disposed)return;this.render();this.mdPane.scrollTop=0;},
      isDisposed:()=>this.disposed,
    }));
    this.body.addEventListener('click',this.onClick);
    this.body.addEventListener('toggle',this.onCalloutToggle,true);
    refreshPreview=()=>this.schedule();
    this.schedule(true);
  }
  clearNoteReturn(){
    this.noteReturn=null;
    this.returnNoteButton.hidden=true;
  }
  navigateToNote({sourceLine,noteId,referenceLine,referenceScrollTop,reference}){
    const note=this.body.querySelector('li.footnote-item[id="'+noteId+'"]');
    if(!note || !Number.isInteger(sourceLine) || sourceLine<1)return;
    this.noteReturn={referenceLine,referenceScrollTop,reference,
      revision:viewStore.getState().documentRevision};
    this.returnNoteButton.hidden=false;
    // A normal preview-origin focus moves only CM6, assuming preview is
    // already at its target. This deliberate annotation navigation must move
    // ALL panes, including the initiating Markdown reader and PDF.
    publishFocus({sourceLine,origin:'footnote-reader',intent:'click'});
    // Footnote list items are not necessarily normal scroll-sync block
    // anchors. Place the actual rendered definition within the reader.
    const pane=this.mdPane;
    pane.scrollTop+=note.getBoundingClientRect().top-
      pane.getBoundingClientRect().top-18;
  }
  returnToNoteReference(){
    const saved=this.noteReturn;
    this.clearNoteReturn();
    if(!saved || saved.revision!==viewStore.getState().documentRevision)return;
    if(Number.isInteger(saved.referenceLine) && saved.referenceLine>=1)
      publishFocus({sourceLine:saved.referenceLine,
        origin:'footnote-reader',intent:'click'});
    // Restore the exact preview scroll position even if the reference is
    // mid-paragraph, rather than approximating from its source block line.
    this.mdPane.scrollTop=saved.referenceScrollTop;
    if(saved.reference?.isConnected)saved.reference.focus({preventScroll:true});
  }
  // Semantic layout port: no AG or WCP consumer touches the PDF.js owner.
  focusOriginalBlock(pageIndex,blockIndex){return this.pdf?.focusBlock(pageIndex,blockIndex);}
  compareOriginalBlocks(from,to,reveal='from'){
    return this.pdf?.compareBlocks(from,to,{reveal});
  }
  overviewBlockComparison(){return this.pdf?.overviewComparison();}
  clearBlockComparison(){this.pdf?.clearComparison();}
  coverageEnabled(mode){
    return this.splitCheckbox.checked?this.splitCoverageEnabled:
      mode==='md'?mdTextBlockCoverageEnabled:pdfTextBlockCoverageEnabled;
  }
  setCoverageEnabled(enabled){
    const value=Boolean(enabled);
    if(this.splitCheckbox.checked){
      this.splitCoverageEnabled=value;
      mdTextBlockCoverageEnabled=value;
      pdfTextBlockCoverageEnabled=value;
    }else if(this.mode==='md')mdTextBlockCoverageEnabled=value;
    else pdfTextBlockCoverageEnabled=value;
    this.setBlockCoverage();
    if(value)refreshTextBlockInventory();
  }
  enterSplitCoverage(){
    // First split uses the PDF preference (on by default). An explicit
    // click while split synchronizes the two remembered single-pane states.
    this.splitCoverageEnabled=pdfTextBlockCoverageEnabled;
    this.setBlockCoverage();
  }
  getCoverageState(){
    return {md:this.coverageEnabled('md'),pdf:this.coverageEnabled('pdf')};
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
    if(mode!=='md')this.footnoteReader?.close();
    this.switcher.value=mode;
    this.element.dataset.previewMode=mode;
    this.mdPane.setAttribute('aria-hidden',String(mode!=='md'));
    this.pdfPane.setAttribute('aria-hidden',String(mode!=='pdf'));
    this.pdfTools.hidden=mode!=='pdf';
    this.pdfTools.setAttribute('aria-hidden',String(mode!=='pdf'));
    this.setBlockCoverage();
    if(mode==='md')requestAnimationFrame(()=>{
      if(this.disposed)return;
      this.redrawSentenceCoverage();
      this.paintBlockCoverage();
      this.highlight(viewStore.getState().focusTarget);
    });
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
  scheduleCoverageResize(){
    clearTimeout(this.coverageResizeTimer);
    if(!currentOutline?.sentence?.getCoverageRows()&&!this.coverageEnabled('md'))return;
    this.coverageResizeTimer=setTimeout(()=>{
      if(!this.disposed){
        this.redrawSentenceCoverage();
        this.paintBlockCoverage();
        this.highlight(viewStore.getState().focusTarget);
      }
    },130);
  }
  layout(){
    this.pdf?.onResize();scrollSync?.measureLater();
    this.scheduleCoverageResize();
    const focus=viewStore.getState().focusTarget;
    if(focus?.origin==='sentence'&&currentOutline?.workModule==='sentence')
      requestAnimationFrame(()=>{if(!this.disposed)this.highlight(focus);});
  }
  schedule(immediate=false){
    if(this.disposed)return;
    clearTimeout(this.timer);
    if(immediate)this.render();
    else this.timer=setTimeout(()=>this.render(),180);
  }
  render(){
    if(this.disposed)return;
    this.footnoteReader?.close(); // DOM source refs can be replaced by morphdom.
    const source=getMarkdown();
    if(!source)return;
    const pane=this.mdPane;
    const preserved=scrollSync?.beforeRender();
    const ratio=pane.scrollHeight>pane.clientHeight
      ?pane.scrollTop/(pane.scrollHeight-pane.clientHeight):0;
    const html=wcpRuntime
      ?wcpRuntime.renderPreview(source,{scope:this.virtualScope??null},renderMarkdown)
      :renderMarkdown(source);
    // Keep the reader's fold choices during a repaint of the SAME chapter.
    // Native details handles the actual interaction, no handler toggles it.
    const scopeId=this.virtualScope?.id??null;
    const foldState=new Map();
    if(scopeId===this.renderedCalloutScope){
      for(const detail of this.body.querySelectorAll('details.ocr-callout[data-source-start]'))
        foldState.set(detail.dataset.sourceStart+':'+detail.dataset.callout,detail.open);
    }
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
    for(const detail of this.body.querySelectorAll('details.ocr-callout[data-source-start]')){
      const key=detail.dataset.sourceStart+':'+detail.dataset.callout;
      if(foldState.has(key))detail.open=foldState.get(key);
    }
    this.renderedCalloutScope=scopeId;
    this.lastFocusElement=null;
    this.redrawSentenceCoverage();
    this.paintBlockCoverage();
    this.highlight(viewStore.getState().focusTarget);
    if(this.coverageEnabled('md')||this.coverageEnabled('pdf'))this.refreshTextBlockCoverage();
    if(scrollSync)scrollSync.afterRender(preserved);
    else pane.scrollTop=ratio*Math.max(0,pane.scrollHeight-pane.clientHeight);
  }
  paintBlockCoverage(){
    const blocks=this.coverageEnabled('md')?currentOutline?.textBlock?.getBlocks():null;
    return blocks?.length?paintCMDTextBlockCoverage(this.body,blocks):
      (clearCMDTextBlockCoverage(this.body),{mappedIds:[],painted:0});
  }
  setBlockCoverage(){
    this.coverToggle.checked=this.coverageEnabled(this.mode);
    this.paintBlockCoverage();
    this.pdf?.setBlockCoverage(this.coverageEnabled('pdf')?currentOutline?.textBlock?.getBlocks():[]);
  }
  refreshTextBlockCoverage(){
    const owner=currentOutline?.textBlock,rows=owner?.getBlocks();
    if(!rows?.length)return;
    const mapped=[...this.body.querySelectorAll('[data-source-start][data-source-end]')]
      .map(el=>({from:Number(el.dataset.sourceStart),to:Number(el.dataset.sourceEnd)}));
    this.paintBlockCoverage();
    this.pdf?.setBlockCoverage(this.coverageEnabled('pdf')?rows:[]);
    owner.setPreviewCoverage(rows.filter(row=>row.expectsPreview&&row.sourceLine!==null&&
      mapped.some(region=>region.from<=row.sourceLine+2&&row.sourceLine+2<region.to))
      .map(row=>row.id));
  }
  clearSentenceSelection(){clearSentencePreviewHighlight();clearSentenceCoverageHighlight();}
  redrawSentenceCoverage(){
    clearSentenceCoverageHighlight();
    const rows=currentOutline?.sentence?.getCoverageRows();
    let result={sentenceCount:rows?.length||0,coveredCount:0,unmappedCount:rows?.length||0};
    if(Array.isArray(rows)){
      this.highlight(viewStore.getState().focusTarget);
    }
    if(rows?.length&&currentOutline?.workModule==='sentence'){
      const cmd=getCMD();
      if(cmd)result=paintSentenceCoverageHighlight(this.body,rows,cmd.readSource(),
        offset=>cmd.lineAtOffset(offset));
    }
    currentOutline?.sentence?.setCoverageResult(result);
  }
  highlight(focus){
    clearSentencePreviewHighlight();
    this.lastFocusElement?.classList.remove('ocr-outline-focused-element');
    this.lastFocusElement=null;
    clearIllegalBreakMDPair(this.body);
    if(!focus)return;
    if(focus.origin==='illegal-break'&&currentOutline?.workModule==='illegal-break'&&
       focus.beforeBlockId&&focus.afterBlockId&&
       focus.revision===viewStore.getState().documentRevision){
      const atoms=getCMD()?.queryBlockChains?.().atoms||[];
      paintIllegalBreakMDPair(this.body,atoms,focus.beforeBlockId,focus.afterBlockId);
      return;
    }
    if((focus.origin==='sentence'||focus.origin==='preview')&&focus.elementId&&currentOutline?.workModule==='sentence'&&
       focus.revision===viewStore.getState().documentRevision){
      const row=getCMD()?.querySentences?.().rows.find(x=>x.id===focus.elementId);
      const covered=currentOutline?.sentence?.getCoverageRows();
      if(row&&(covered===null||covered.some(item=>item.id===row.id)))
        paintSentencePreviewHighlight(this.body,row,getCMD().readSource(),
        offset=>getCMD().lineAtOffset(offset));
      return;
    }
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
    this.clearSentenceSelection();
    clearIllegalBreakMDPair(this.body);
    clearCMDTextBlockCoverage(this.body);
    this.footnoteReader?.dispose();
    clearTimeout(this.timer);
    clearTimeout(this.coverageResizeTimer);
    this.coverageObserver.disconnect();
    this.body.removeEventListener('load',this.onCoverageImageLoad,true);
    this.unsubscribe?.();
    this.body.removeEventListener('click',this.onClick);
    this.body.removeEventListener('toggle',this.onCalloutToggle,true);
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

export function createWorkspace(container, getDocument, getCurrentEditor, getCommandDocument, mediaStatus=()=>{},runtime=null,documentName=null,textBlockActionsHost=null,onTextBlockSummary=()=>{}) {
  let unlockGeometry;
  const ready=new Promise(resolve=>{unlockGeometry=resolve;});
  geometryReady=()=>ready.then(()=>getCMD().queryLayout());
  if(documentName)documentFileLabel=documentName;
  wcpRuntime=runtime;
  getMarkdown=getDocument;
  getEditor=getCurrentEditor;
  getCMD=getCommandDocument;
  reportMediaStatus=mediaStatus;
  reportTextBlockSummary=onTextBlockSummary;
  if(!(textBlockActionsHost instanceof HTMLElement)||textBlockActionsHost.dataset.module!=='text-block')
    throw Error('文本块模块需要 Shell 提供功能菜单容器');
  textBlockActionHost=textBlockActionsHost;
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
      preview.enterSplitCoverage();
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
      preview.setBlockCoverage();
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
    notifyCMDReady:()=>unlockGeometry(),
    editorHost:sourceHost,
    mountSourceLineMenu:(view,handlers)=>currentSourcePanel?.mountLineMenu(view,handlers),
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
    setPDFBlockLabelScale(value){
      if(!Number.isFinite(value)||value<0.5||value>2.5)
        throw Error('Invalid PDF text block label scale');
      pdfBlockLabelScale=value;
      currentPdf?.pdf?.setBlockLabelScale(value);
    },
    refreshPDFBlockLabels:()=>currentPdf?.pdf?.refreshBlockLabelLayout(),
    refreshPdf:()=>currentPdf?.pdf?.refreshAnchors(),
    setWorkModule:(module,{activateTextBlocks=true}={})=>{
      // AG text-block selection turns on the active preview lens. In split
      // mode one change enables MD and PDF together. Initial page load is
      // NOT a user module switch, and must preserve Markdown's default OFF.
      if(module==='text-block'&&activateTextBlocks)currentPreview?.setCoverageEnabled(true);
      if(module!=='sentence')currentPreview?.clearSentenceSelection();
      currentOutline?.setModule(module);
      // A/B selection belongs to the Illegal Breaks AG lens, not to the
      // underlying PDF/Markdown documents or another review module.
      if(module!=='illegal-break'&&viewStore.getState().focusTarget?.origin==='illegal-break'){
        currentPreview?.pdf?.clearComparison();
      }
      currentPreview?.highlight(viewStore.getState().focusTarget);
      currentPreview?.setBlockCoverage();
      currentPreview?.redrawSentenceCoverage();
    },
    updateSpellcheck:(rows,options)=>currentOutline?.spellcheck?.setResults(rows,options),
    getSpellingElements:()=>{
      const result=getCMD().querySpellingElements();
      currentOutline?.spellcheck?.setMarkedRows(result);
      return result;
    },
    applySpellingCandidates:(candidates,expectedSource)=>{
      const scope=currentOutline?.spellcheck?.getOperationScope()??{mode:'all'};
      return getCMD().markSpellingCandidates(candidates,{expectedSource,agScope:scope});
    },
    setBlockJoinAction:action=>{blockJoinAction=action;},
    setBlockMoveAction:action=>{blockMoveAction=action;},
    setPDFBBoxAction:action=>{pdfBBoxAction=action;},
    setBlockChainAction:action=>{blockChainAction=action;},
    setSubblockMarkAction:action=>{markSubblocksAction=action;},
    setPDFTextInsertAction:insert=>{insertPDFText=insert;},
    setTextBlockInventoryRefreshAction:action=>{refreshTextBlockInventory=action;},
    setTextBlockShowAll:enabled=>currentOutline?.textBlock?.setShowAllPages(enabled),
    setTextBlockLoading:()=>currentOutline?.textBlock?.setLoading(),
    setTextBlockError:message=>currentOutline?.textBlock?.setError(message),
    setTextBlockContinuationCandidates:result=>currentOutline?.textBlock?.setContinuationCandidates(result),
    setTextBlockInventory:result=>{currentOutline?.textBlock?.setInventory(result);
      currentPreview?.refreshTextBlockCoverage();},
    setSentenceCoverage:enabled=>currentOutline?.sentence?.setCoverage(enabled),
    setTextBlockCoverage:enabled=>currentPreview?.setCoverageEnabled(enabled),
    isTextBlockCoverageEnabled:()=>mdTextBlockCoverageEnabled||pdfTextBlockCoverageEnabled,
    setSentenceLoading:()=>currentOutline?.sentence?.setLoading(),
    setSentenceError:message=>currentOutline?.sentence?.setError(message),
    getSentences:()=>{
      const result=getCMD().querySentences();
      currentOutline?.sentence?.setRows(result);
      return result;
    },
    segmentSentenceCandidates:()=>getCMD().segmentSentenceCandidates(),
    markSentences:(candidates,source)=>{
      const scope=currentOutline?.sentence?.getOperationScope()||{mode:'all'};
      return getCMD().markSentences(candidates,{expectedSource:source,agScope:scope});
    },
    setIllegalBreakPending:()=>currentOutline?.illegalBreak?.setPending(),
    setIllegalBreakError:message=>currentOutline?.illegalBreak?.setError(message),
    setIllegalBreakReviewCandidates:candidates=>currentOutline?.illegalBreak?.setReviewCandidates(candidates),
    getIllegalBreakElements:()=>{
      const result=getCMD().queryIllegalBreakElements();
      currentOutline?.illegalBreak?.setReviewDecisions(result.reviewChoices||[],result.reviewStale||0);
      currentOutline?.illegalBreak?.setMarkedRows(result);
      return result;
    },
    getIllegalBreakScanLimit:()=>getCMD().getLinebreakScanLimit(),
    markIllegalBreakCandidates:(candidates,expectedSource)=>{
      const scope=currentOutline?.illegalBreak?.getOperationScope()??{mode:'all'};
      return getCMD().markIllegalBreakCandidates(candidates,{expectedSource,agScope:scope});
    },
    scanMedia:()=>currentOutline?.media?.scan(),
    downloadMedia:()=>currentOutline?.media?.downloadAll(),
    scanLatex:()=>currentOutline?.latex?.refresh(),
    normalizeLatex:()=>currentOutline?.latex?.normalizeReviewed(),
    openNoteTemplates:()=>currentOutline?.note?.openTemplates(),
    convertAllNotes:()=>currentOutline?.note?.convertAll(),
    normalizeHtmlTables:()=>currentOutline?.html?.normalizeTables(),
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
