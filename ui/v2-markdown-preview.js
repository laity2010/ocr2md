/** V2 Markdown reader: V1's actual renderer and stylesheet, no fork.
 * Read only the CURRENT CM6 in-memory source, never the SQL snapshot.
 * The existing Frame preview scroll pane stays the sole preview owner.
 */
import {renderMarkdown} from './markdown-preview.js';
import morphdom from 'morphdom';
import {createFootnotePopover} from './footnote-popover.js';

const SOURCE='#workspace #editor';
export function mountV2MarkdownPreview(scroller){
  scroller.classList.remove('ocr-markdown');
  scroller.setAttribute('aria-label','Markdown 阅读预览');
  const article=document.createElement('article');
  article.className='ocr-markdown';
  scroller.append(article);
  const sourcePort=()=>document.querySelector(SOURCE)?.v2SourcePort;
  const footnotes=createFootnotePopover({root:article,onLocate:({sourceLine})=>
    sourcePort()?.locateSourceLine(sourceLine)});
  const onClick=event=>{
    if(footnotes.handleClick(event))return;
    if(!(event.target instanceof Element)||event.target.closest('a[href],summary'))return;
    const tagged=event.target.closest('[data-source-start]');
    if(!tagged||!article.contains(tagged))return;
    sourcePort()?.locateSourceLine(Number(tagged.dataset.sourceStart));
  };
  article.addEventListener('click',onClick);
  let lastSource=null,renderCount=0,timer=null,disposed=false;

  const refresh=()=>{
    if(disposed)return;
    const port=document.querySelector(SOURCE)?.v2SourcePort;
    const source=port?.getState().loaded?port.getMarkdown():'';
    if(lastSource===source)return;
    // The V1 renderMarkdown() function is already responsible for its
    // Markdown-it/KaTeX/footnote/Obsidian plugins and DOMPurify sanitation.
    // Render first, then update the DOM, so malformed input doesn't clear it.
    const html=source?renderMarkdown(source):'';
    footnotes.close();
    const ratio=scroller.scrollHeight>scroller.clientHeight
      ?scroller.scrollTop/(scroller.scrollHeight-scroller.clientHeight):0;
    const folds=new Map();
    for(const detail of article.querySelectorAll('details.ocr-callout[data-source-start]'))
      folds.set(detail.dataset.sourceStart+':'+detail.dataset.callout,detail.open);
    const fresh=article.cloneNode(false);
    fresh.innerHTML=html;
    if(article.innerHTML!==html) morphdom(article,fresh,{childrenOnly:true,
      onBeforeElUpdated:(from,to)=>!from.isEqualNode(to)});
    for(const detail of article.querySelectorAll('details.ocr-callout[data-source-start]')){
      const key=detail.dataset.sourceStart+':'+detail.dataset.callout;
      if(folds.has(key))detail.open=folds.get(key);
    }
    lastSource=source;renderCount++;
    scroller.scrollTop=ratio*Math.max(0,scroller.scrollHeight-scroller.clientHeight);
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
    refresh:()=>schedule(true),
  });
  scroller.v2MarkdownPreviewPort=port;
  // The Frame may already have mounted the source before the preview pane.
  queueMicrotask(refresh);
  return Object.freeze({dispose(){
    disposed=true;clearTimeout(timer);
    document.removeEventListener('v2-cm-session',onSession);
    delete scroller.v2MarkdownPreviewPort;
    article.removeEventListener('click',onClick);
    footnotes.dispose();
    article.remove();
  },layout(){}});
}
