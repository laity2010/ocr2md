/** Read-only CM6 source + V2 Markdown renderer, no document persistence. */
import {EditorState,StateEffect,StateField,Prec} from '@codemirror/state';
import {EditorView,Decoration,lineNumbers,WidgetType} from '@codemirror/view';
import {markdown,markdownLanguage} from '@codemirror/lang-markdown';
import {syntaxHighlighting} from '@codemirror/language';
import {oneDarkHighlightStyle} from '@codemirror/theme-one-dark';
import {obsidianMarkdown} from '../obsidian-markdown.js';
import {obsidianSourceSyntax} from '../obsidian-source-syntax.js';
import {obsidianHeadingMarkers} from '../obsidian-heading-markers.js';
import {renderMarkdown} from '../markdown-preview.js';
import {mediaFileUrl,retryLocalImage} from '../v2-media-url.js';
import {createFootnotePopover} from '../footnote-popover.js';
import {applyPreviewProtection} from './preview-protection.js';
import './reading.css';
import {nearestSentence,fractionWithin,anchorHeight} from './scroll-anchor.js';

/** Adopted Sentence Lab green boundary, rendered without adding RAW chars. */
class FinalBoundary extends WidgetType {
  constructor(line,index){super();this.line=line;this.index=index;}
  eq(other){return other instanceof FinalBoundary&&other.line===this.line&&other.index===this.index;}
  toDOM(){
    const span=document.createElement('span');
    span.className='ocr-sb-boundary ocr-sb-agreed translation-final-boundary';
    span.setAttribute('aria-label','最终句界 · MDLine '+this.line+' · 句 '+this.index);
    span.title=span.getAttribute('aria-label');return span;
  }
  ignoreEvent(){return true;}
}
export function mountReadingSource(host,onLocate,{numbered=true,origin='source',onScroll=()=>{},onScrollIntent=()=>{}}={}){
  const protect=StateEffect.define(),focus=StateEffect.define(),replace=StateEffect.define(),cuts=StateEffect.define();
  const field=(effect,build)=>StateField.define({create:()=>Decoration.none,update(value,tr){
    if(tr.docChanged)value=Decoration.none;
    for(const e of tr.effects)if(e.is(effect))value=build(e.value,tr.state.doc);
    return value;
  },provide:f=>EditorView.decorations.from(f)});
  const protectedField=field(protect,ranges=>Decoration.set(ranges.map(p=>Decoration.mark({class:'translation-protected-source'}).range(p.from,p.to)),true));
  const boundaryField=field(cuts,marks=>Decoration.set(marks.map(m=>Decoration.widget({widget:new FinalBoundary(m.line,m.index),side:1}).range(m.pos)),true));
  const focusField=field(focus,(row,doc)=>row?Decoration.set([row.from===row.to?Decoration.line({class:'translation-focus-source'}).range(doc.lineAt(row.from).from):Decoration.mark({class:'translation-focus-source'}).range(row.from,row.to)]):Decoration.none);
  let programmatic=false,model=null;
  host.classList.add('translation-reading-source');
  if(numbered)host.classList.add('translation-raw-source');
  const editor=new EditorView({state:EditorState.create({doc:'',extensions:[
    EditorState.readOnly.of(true),EditorView.editable.of(false),...(numbered?[lineNumbers()]:[]),EditorView.lineWrapping,
    EditorView.contentAttributes.of({spellcheck:'false','aria-label':numbered?'原文源码（只读）':'待译句源码（只读）'}),
    ...(numbered?[markdown({base:markdownLanguage}),obsidianMarkdown,syntaxHighlighting(oneDarkHighlightStyle,{fallback:true}),obsidianSourceSyntax,obsidianHeadingMarkers,boundaryField]:[]),Prec.high(protectedField),focusField,
    EditorState.transactionFilter.of(tr=>tr.docChanged&&!tr.effects.some(e=>e.is(replace))?[]:tr),
    EditorView.updateListener.of(update=>{
      if(!programmatic&&update.selectionSet&&model)onLocate(model.atOffset(update.state.selection.main.head),origin);
    }),
    EditorView.domEventHandlers({click(event,view){
      if(!model)return false;
      const pos=view.posAtCoords({x:event.clientX,y:event.clientY});
      if(pos!==null)onLocate(model.atOffset(pos),origin);return false;
    }})
  ]}),parent:host});
  // Real CM6 geometry, including wrapped visual lines. Estimated block
  // geometry is used only for a target that has not yet been rendered.
  function bounds(row){
    const start=editor.coordsAtPos(row.from,1);
    const end=editor.coordsAtPos(Math.max(row.from,row.to-1),-1);
    return {top:start?start.top-editor.documentTop:editor.lineBlockAt(row.from).top,
      bottom:end?end.bottom-editor.documentTop:editor.lineBlockAt(Math.max(row.from,row.to-1)).bottom};
  }
  function getScrollAnchor(){
    if(!model?.sentences.length||!editor.scrollDOM.clientHeight)return null;
    const rect=editor.scrollDOM.getBoundingClientRect(),y=rect.top+2;
    const pos=editor.posAtCoords({x:editor.contentDOM.getBoundingClientRect().left+2,y},false);
    const block=editor.lineBlockAtHeight(Math.max(0,y-editor.documentTop));
    const row=nearestSentence(model,pos??block.from);
    if(!row)return null;
    const b=bounds(row);
    return {key:row.key,fraction:fractionWithin(b.top,b.bottom,y-editor.documentTop)};
  }
  function scrollToAnchor(anchor){
    const row=model?.byKey(anchor.key);
    if(!row||!editor.scrollDOM.clientHeight)return;
    const b=bounds(row),target=anchorHeight(b.top,b.bottom,anchor.fraction);
    const y=editor.scrollDOM.getBoundingClientRect().top;
    editor.scrollDOM.scrollTop+=editor.documentTop+target-y-2;
  }
  let scheduled=0;
  const scroll=()=>{
    if(scheduled)return;
    scheduled=requestAnimationFrame(()=>{scheduled=0;const anchor=getScrollAnchor();if(anchor)onScroll(anchor,origin);});
  };
  const intent=()=>onScrollIntent(origin);
  editor.scrollDOM.addEventListener('scroll',scroll,{passive:true});
  for(const event of ['wheel','pointerdown','touchstart','keydown'])editor.scrollDOM.addEventListener(event,intent,{passive:true});
  return Object.freeze({
    getScrollAnchor,scrollToAnchor,
    setDocument(next){
      if(model===next)return;
      const changed=model?.text!==next?.text;model=next;programmatic=true;
      try{editor.dispatch({...(changed?{changes:{from:0,to:editor.state.doc.length,insert:next?.text??''},selection:{anchor:0}}:{}),effects:[replace.of(null),protect.of(next?.ranges??[]),...(numbered?[cuts.of(next?.boundaries??[])]:[]),...(changed?[focus.of(null)]:[])]});}
      finally{programmatic=false;}
    },
    getMarkdown:()=>editor.state.doc.toString(),
    locate(row,{scroll=true}={}){
      programmatic=true;
      try{editor.dispatch({effects:[focus.of(row),...(row&&scroll?[EditorView.scrollIntoView(row.from,{y:'center'})]:[])],...(row&&scroll?{selection:{anchor:row.from}}:{})});}
      finally{programmatic=false;}
    },
    layout:()=>editor.requestMeasure(),dispose(){
      if(scheduled)cancelAnimationFrame(scheduled);
      editor.scrollDOM.removeEventListener('scroll',scroll);
      for(const event of ['wheel','pointerdown','touchstart','keydown'])editor.scrollDOM.removeEventListener(event,intent);
      editor.destroy();
    }
  });
}

export function mountReadingPreview(scroller,onLocate){
  scroller.classList.remove('ocr-markdown');
  scroller.setAttribute('aria-label','Markdown 阅读预览（只读）');
  const article=document.createElement('article');article.className='ocr-markdown';scroller.append(article);
  let model=null,workspace='',mapped=null;
  const footnotes=createFootnotePopover({root:article,onLocate:({sourceLine})=>onLocate(model?.atOffset(model.lineOffset(sourceLine)),'preview')});
  function click(event){
    if(footnotes.handleClick(event))return;
    if(!(event.target instanceof Element)||event.target.closest('a[href],summary'))return;
    const offset=mapped?.offsetAt(event);
    if(Number.isInteger(offset))onLocate(model?.atOffset(offset),'preview');
  }
  article.addEventListener('click',click);
  function setDocument(next,markdown,path){
    if(next===model&&workspace===path)return;
    if(next&&markdown!==next.text)throw Error('CM6 原文与阅读坐标不一致');
    const folds=new Map([...article.querySelectorAll('details.ocr-callout[data-source-start]')].map(el=>[el.dataset.sourceStart+':'+el.dataset.callout,el.open]));
    const oldTop=scroller.scrollTop,keep=next&&model?.text===next.text;
    footnotes.close();
    article.innerHTML=next?renderMarkdown(markdown,{nativeInlineMath:true,bareMedia:true,completeTableBoundary:true}):'';
    model=next;workspace=path;
    mapped=next?applyPreviewProtection(article,next):null;
    for(const img of article.querySelectorAll('img[src]')){
      const local=mediaFileUrl(path,img.getAttribute('src'));
      if(local){img.setAttribute('src',local);retryLocalImage(img,local);}
    }
    if(keep)for(const detail of article.querySelectorAll('details.ocr-callout[data-source-start]')){
      const key=detail.dataset.sourceStart+':'+detail.dataset.callout;
      if(folds.has(key))detail.open=folds.get(key);
    }
    scroller.scrollTop=keep?oldTop:0;
  }
  function locate(row,{scroll=true}={}){
    article.querySelectorAll('.translation-focus-preview').forEach(el=>el.classList.remove('translation-focus-preview'));
    if(!row||!mapped)return;
    const target=mapped.elementFor(row);
    if(!target)return;
    target.classList.add('translation-focus-preview');
    if(scroll){
      for(let el=target.parentElement;el&&el!==article;el=el.parentElement)if(el.tagName==='DETAILS')el.open=true;
      const rect=target.getBoundingClientRect(),outer=scroller.getBoundingClientRect();
      if(rect.top<outer.top||rect.bottom>outer.bottom)scroller.scrollTop+=rect.top-outer.top-(outer.height-Math.min(rect.height,outer.height))/2;
    }
  }
  return Object.freeze({setDocument,locate,layout(){},dispose(){footnotes.dispose();article.removeEventListener('click',click);article.remove();}});
}
