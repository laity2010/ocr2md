/** V2 Markdown reader: V1's actual renderer and stylesheet, no fork.
 * Read only the CURRENT CM6 in-memory source, never the SQL snapshot.
 * The existing Frame preview scroll pane stays the sole preview owner.
 */
import {renderMarkdown} from './markdown-preview.js';
import {previewLineProjection} from './v2-preview-line-projection.js';
import morphdom from 'morphdom';
import {createFootnotePopover} from './footnote-popover.js';
import {mountV2PaneFocus,focusSourceLine} from './v2-pane-focus.js';
import './v2-markdown-preview.css';
import {mediaFileUrl} from './v2-media.js';

const SOURCE='#workspace #editor';
export function mountV2MarkdownPreview(scroller){
  scroller.classList.remove('ocr-markdown');
  scroller.setAttribute('aria-label','Markdown 阅读预览');
  const article=document.createElement('article');
  article.className='ocr-markdown';
  scroller.append(article);
  const sourcePort=()=>document.querySelector(SOURCE)?.v2SourcePort;
  const coordinator=mountV2PaneFocus(scroller,article);
  const footnotes=createFootnotePopover({root:article,onLocate:({sourceLine})=>
    focusSourceLine(sourceLine,'footnote-reader')});
  const onClick=event=>{
    if(footnotes.handleClick(event))return;
    if(!(event.target instanceof Element)||event.target.closest('a[href],summary'))return;
    const tagged=event.target.closest('[data-source-start]');
    if(!tagged||!article.contains(tagged))return;
    focusSourceLine(Number(tagged.dataset.sourceStart),'preview');
  };
  article.addEventListener('click',onClick);
  let lastSource=null,renderCount=0,timer=null,disposed=false,focusedId=null,focusedLine=null;
  const highlight=(logicalId)=>{
    for(const node of article.querySelectorAll('.v2-sync-preview-focus'))
      node.classList.remove('v2-sync-preview-focus');
    if(!Number.isInteger(logicalId))return;
    const source=sourcePort();
    const row=source?.getIntervals().find(item=>item.logicalId===logicalId);
    if(!row)return;
    const real=source.getMdLineIndex()?.atSourceLine(focusedLine);
    const first=real?.logical_id===logicalId?real.source_line:source.getLineAtOffset(row.from);
    const last=real?.logical_id===logicalId?real.source_line:source.getLineAtOffset(Math.max(row.from,row.to-1));
    // Multiple Markdown tokens can belong to one logical block; mark all
    // intersecting render ranges, not just the first paragraph.
    for(const node of article.querySelectorAll('[data-source-start][data-source-end]')){
      const a=Number(node.dataset.sourceStart),b=Number(node.dataset.sourceEnd);
      if(a<=last&&b>first)node.classList.add('v2-sync-preview-focus');
    }
  };
  const onFocus=event=>{
    focusedId=event.detail?.logicalId??null;focusedLine=event.detail?.sourceLine??null;
    highlight(focusedId);
  };
  document.addEventListener('v2-sync-focus',onFocus);

  const refresh=()=>{
    if(disposed)return;
    const port=document.querySelector(SOURCE)?.v2SourcePort;
    const source=port?.getState().loaded?port.getMarkdown():'';
    if(lastSource===source)return;
    // The V1 renderMarkdown() function is already responsible for its
    // Markdown-it/KaTeX/footnote/Obsidian plugins and DOMPurify sanitation.
    // Render first, then update the DOM, so malformed input doesn't clear it.
    const location=coordinator.port.beforeRender();
    const rows=port.getBlocks();
    const intervals=new Map(port.getIntervals().map(row=>[row.logicalId,row]));
    const render=port.getState().ownedLF?
      {source,map:(first,last)=>({start:Number(first),end:Number(last)})}:
      previewLineProjection(rows,id=>port.getLineAtOffset(intervals.get(id)?.from??0));
    const html=source?renderMarkdown(render.source,{nativeInlineMath:true}):'';
    footnotes.close();
    const ratio=scroller.scrollHeight>scroller.clientHeight
      ?scroller.scrollTop/(scroller.scrollHeight-scroller.clientHeight):0;
    const folds=new Map();
    for(const detail of article.querySelectorAll('details.ocr-callout[data-source-start]'))
      folds.set(detail.dataset.sourceStart+':'+detail.dataset.callout,detail.open);
    const fresh=article.cloneNode(false);
    fresh.innerHTML=html;
    // Same V1 book-scoped local image resolver; Markdown itself is unchanged.
    for(const img of fresh.querySelectorAll('img[src]')){
      const url=mediaFileUrl(port.getWorkspace(),img.getAttribute('src'));
      if(url)img.setAttribute('src',url);
    }
    // Markdown-it offsets are PREVIEW lines, not the single-LF CM6 lines.
    // Convert before coordinator/highlight sees them; no parallel document.
    for(const el of fresh.querySelectorAll('[data-source-start][data-source-end]')){
      const line=render.map(el.dataset.sourceStart,el.dataset.sourceEnd);
      el.dataset.sourceStart=String(line.start);
      el.dataset.sourceEnd=String(line.end);
    }
    const mappedHtml=fresh.innerHTML;
    if(article.innerHTML!==mappedHtml) morphdom(article,fresh,{childrenOnly:true,
      onBeforeElUpdated:(from,to)=>!from.isEqualNode(to)});
    for(const detail of article.querySelectorAll('details.ocr-callout[data-source-start]')){
      const key=detail.dataset.sourceStart+':'+detail.dataset.callout;
      if(folds.has(key))detail.open=folds.get(key);
    }
    lastSource=source;renderCount++;
    highlight(focusedId);
    if(location)coordinator.port.afterRender(location);
    else{
      scroller.scrollTop=ratio*Math.max(0,scroller.scrollHeight-scroller.clientHeight);
      coordinator.port.measureLater();
    }
  };
  const schedule=(immediate=false)=>{
    clearTimeout(timer);timer=null;
    if(immediate)refresh();
    else timer=setTimeout(()=>{timer=null;refresh();},180); // same as V1
  };
  const onSession=event=>{
    // All source changes, including CM6 Undo and Redo, trigger the same
    // immutable view read. Do not use a cached WP03 SQL projection here.
    schedule(event.detail?.kind!=='edit');
  };
  document.addEventListener('v2-cm-session',onSession);
  const port=Object.freeze({
    getHtml:()=>article.innerHTML,
    getText:()=>article.textContent,
    getRenderedCount:()=>renderCount,
    getFocusedId:()=>focusedId,
    getScrollDriver:()=>coordinator.port.getScrollDriver(),
    getScrollAnchorCount:()=>coordinator.port.getScrollAnchorCount(),
    beforeSourceEdit:()=>coordinator.port.sourceEditGesture(),
    refresh:()=>schedule(true),
  });
  scroller.v2MarkdownPreviewPort=port;
  // The Frame may already have mounted the source before the preview pane.
  queueMicrotask(refresh);
  return Object.freeze({dispose(){
    disposed=true;clearTimeout(timer);
    document.removeEventListener('v2-cm-session',onSession);
    document.removeEventListener('v2-sync-focus',onFocus);
    coordinator.dispose();
    delete scroller.v2MarkdownPreviewPort;
    article.removeEventListener('click',onClick);
    footnotes.dispose();
    article.remove();
  },layout(){}});
}
