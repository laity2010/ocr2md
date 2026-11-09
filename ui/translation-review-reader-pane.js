/** Translation Lab's read-only reader surface. Uses Main's sole renderMarkdown
 * API and the existing .ocr-markdown theme, not a copied Markdown renderer.
 * All image requests are SAME-ORIGIN GETs to Main's existing /media/ reader.
 */
import {renderMarkdown} from './markdown-preview.js';
import {createFootnotePopover} from './footnote-popover.js';
import {mainMediaURL} from './translation-review-reading.js';

export class TranslationReaderPane {
  constructor(id,owner){
    this.id=id;this.owner=owner;
    this.element=document.createElement('div');
    this.element.className='ocr-sb-pane ocr-tr-pane ocr-tr-reader-pane';
    this.element.dataset.engine='original';
    const toolbar=document.createElement('div');
    toolbar.className='ocr-sb-pane-toolbar';
    const makeToggle=(text,className)=>{
      const label=document.createElement('label');
      label.className='ocr-tr-reader-toggle '+className;
      const checkbox=document.createElement('input');
      checkbox.type='checkbox';
      checkbox.setAttribute('aria-label',text);
      label.append(checkbox,document.createTextNode(text));
      return {label,checkbox};
    };
    const sentenceToggle=makeToggle('句子编号','ocr-tr-reader-ids-control');
    this.sentenceIdInput=sentenceToggle.checkbox;
    const title=document.createElement('strong');
    title.textContent='单语 Markdown · 成品预览';
    this.returnNoteButton=document.createElement('button');
    this.returnNoteButton.type='button';
    this.returnNoteButton.className='ocr-tr-note-return';
    this.returnNoteButton.textContent='↩ 返回注引';
    this.returnNoteButton.title='返回注释引用前的阅读位置';
    this.returnNoteButton.hidden=true;
    this.status=document.createElement('span');
    this.status.className='ocr-sb-pane-status';
    toolbar.append(sentenceToggle.label,title,
      this.returnNoteButton,this.status);
    this.scroller=document.createElement('div');
    // Main's shared footnote reader uses this scroll port to remember the
    // exact citation position for its optional locate/return action.
    this.scroller.className='ocr-tr-reader-scroll ocr-preview-md-scroll';
    this.scroller.setAttribute('aria-label','单语 Markdown 成品阅读预览');
    this.canvas=document.createElement('div');
    this.canvas.className='ocr-tr-reader-canvas';
    this.gutter=document.createElement('div');
    this.gutter.className='ocr-tr-reader-gutter';
    this.gutter.setAttribute('aria-label','预览行号与句子 ID');
    this.body=document.createElement('article');
    this.body.className='ocr-markdown';
    this.canvas.append(this.gutter,this.body);
    this.scroller.append(this.canvas);
    this.element.append(toolbar,this.scroller);
    this.nodes=new Map();this.anchors=[];this.content='';
    this.suppressUntil=0;this.lastGesture=0;this.current=null;
    this.markers=new Map();this.markerEntries=[];this.measureHandle=0;
    this.resizeObserver=null;
    this.footnoteReader=null;this.noteReturn=null;
    this.showSentenceIds=false;
  }
  init(){
    this.footnoteReader=createFootnotePopover({root:this.body,
      onLocate:target=>this.navigateToNote(target)});
    this.returnNoteButton.addEventListener('click',()=>this.returnToNoteReference());
    this.sentenceIdInput.addEventListener('change',()=>{
      this.showSentenceIds=this.sentenceIdInput.checked;
      this.suppressUntil=performance.now()+650;
      const top=this.scroller.scrollTop;
      this.canvas.classList.toggle('ocr-tr-show-ids',this.showSentenceIds);
      this.scroller.scrollTop=top;
      this.scheduleMeasure();
    });
    // A tap on read-only source text (or its sentence ID) is a selection,
    // NEVER a request to reposition this scrollport. Mobile Safari may
    // scroll a nested pane when Dockview shifts keyboard focus, even though
    // no explicit reveal() was called. Record the pre-tap position and pin
    // it for the two paint frames immediately after a genuine tap.
    let tapStart=null;
    this.scroller.addEventListener('pointerdown',event=>{
      const element=event.target instanceof Element?event.target:null;
      const hit=element?.closest('[data-unit-id],[data-gutter-unit]');
      if(!event.isPrimary||!hit||
          element.closest('a[href],summary.ocr-callout-title'))return;
      const id=hit.dataset.gutterUnit||hit.dataset.unitId;
      if(!this.anchors.some(x=>x.id===id))return;
      tapStart={pointerId:event.pointerId,x:event.clientX,y:event.clientY,
        top:this.scroller.scrollTop,id};
    },{passive:true});
    this.scroller.addEventListener('pointercancel',()=>{tapStart=null;});
    this.scroller.addEventListener('pointerup',event=>{
      const start=tapStart;tapStart=null;
      if(!start||start.pointerId!==event.pointerId||
          Math.hypot(event.clientX-start.x,event.clientY-start.y)>9)return;
      // Commit the identity captured at pointerDOWN, BEFORE a click can be
      // retargeted to p5b2/p5b3 after a Safari focus-induced scroll jump.
      // This is essential: scroll restoration ALONE does not prevent a
      // subsequent click from accidentally selecting the old heading.
      this.scroller.scrollTop=start.top;
      const anchor=this.anchors.find(x=>x.id===start.id);
      if(anchor)this.owner.receivePosition(this.id,anchor.from);
      const preserve=()=>{
        if(Math.abs(this.scroller.scrollTop-start.top)>2)
          this.scroller.scrollTop=start.top;
      };
      requestAnimationFrame(()=>{
        preserve();requestAnimationFrame(preserve);
      });
    },{passive:true});
    for(const event of ['wheel','touchstart','pointerdown','keydown'])
      this.scroller.addEventListener(event,()=>{
        this.lastGesture=performance.now();this.suppressUntil=0;
      },{passive:true});
    this.scroller.addEventListener('scroll',()=>{
      if(performance.now()<this.suppressUntil||
          performance.now()-this.lastGesture>2200)return;
      this.owner.receiveScroll(this.id);
    },{passive:true});
    this.body.addEventListener('click',event=>{
      if(this.footnoteReader?.handleClick(event))return;
      // Pointer/touch selection is committed from the captured pointerdown
      // identity. The browser may retarget this later click if Safari moves
      // the scrollport during pointerup. Keyboard activation has detail=0.
      if(event.detail>0)return;
      // Let details/summary own folding. Clicks on hyperlinks and images do
      // not navigate or mutate review state; only explicit sentence hits do.
      if(event.target.closest('a[href],summary.ocr-callout-title'))return;
      const target=event.target.closest('[data-unit-id]');
      if(!target)return;
      const selected=this.anchors.find(x=>x.id===target.dataset.unitId);
      if(selected)this.owner.receivePosition(this.id,selected.from);
    });
    this.gutter.addEventListener('click',event=>{
      if(event.detail>0)return;
      const item=event.target.closest('[data-gutter-unit]');
      if(!item)return;
      const selected=this.anchors.find(x=>x.id===item.dataset.gutterUnit);
      if(selected)this.owner.receivePosition(this.id,selected.from);
    });
    // Position overlays without inserting text or affecting the article flow.
    // Image loads, table folds and Dockview resizes can change block Y values.
    this.resizeObserver=new ResizeObserver(()=>this.scheduleMeasure());
    this.resizeObserver.observe(this.body);
    this.resizeObserver.observe(this.scroller);
    this.body.addEventListener('load',()=>this.scheduleMeasure(),true);
    this.body.addEventListener('toggle',()=>this.scheduleMeasure(),true);
  }
  updateDoc(text,anchors){
    this.anchors=anchors;
    if(text!==this.content){
      this.footnoteReader?.close();
      this.clearNoteReturn();
      this.content=text;
      this.body.innerHTML=renderMarkdown(text);
      // Markdown-it uses document-relative paths; Lab URL has its own prefix.
      // Main's existing read-only /media/ route is the canonical image source.
      for(const img of this.body.querySelectorAll('img[src]')){
        const path=mainMediaURL(img.getAttribute('src'));
        if(path)img.setAttribute('src',path);
      }
    }
    this.assignAnchors();
    if(this.current)this.mark(this.current);
    this.scheduleMeasure();
  }
  clearNoteReturn(){
    this.noteReturn=null;
    this.returnNoteButton.hidden=true;
  }
  navigateToNote({sourceLine,noteId,referenceScrollTop,reference}){
    const note=this.body.querySelector('li.footnote-item[id="'+noteId+'"]');
    if(!note||!Number.isInteger(sourceLine)||sourceLine<1)return;
    this.noteReturn={referenceScrollTop,reference};
    this.returnNoteButton.hidden=false;
    this.suppressUntil=performance.now()+650;
    this.scroller.scrollTop+=note.getBoundingClientRect().top-
      this.scroller.getBoundingClientRect().top-18;
  }
  returnToNoteReference(){
    const saved=this.noteReturn;
    this.clearNoteReturn();
    if(!saved)return;
    this.suppressUntil=performance.now()+650;
    this.scroller.scrollTop=saved.referenceScrollTop;
    if(saved.reference?.isConnected)
      saved.reference.focus({preventScroll:true});
  }
  assignAnchors(){
    for(const node of this.body.querySelectorAll('[data-unit-id]')){
      node.removeAttribute('data-unit-id');
      node.classList.remove('ocr-tr-reader-sentence','ocr-tr-reader-block-start');
    }
    this.nodes.clear();
    const blocks=[...this.body.querySelectorAll('[data-source-start]')]
      .map(node=>({node,start:Number(node.dataset.sourceStart),
        end:Number(node.dataset.sourceEnd)}))
      .filter(x=>Number.isInteger(x.start)&&x.start>0);
    for(const anchor of this.anchors){
      const candidates=blocks.filter(x=>x.start<=anchor.line&&
        (!Number.isInteger(x.end)||x.end>anchor.line));
      candidates.sort((a,b)=>(a.end-a.start)-(b.end-b.start)||
        (b.start-a.start));
      const best=candidates[0]||blocks.find(x=>x.start===anchor.line);
      if(best){
        const node=best.node;
        node.dataset.unitId=anchor.id;
        node.classList.add('ocr-tr-reader-sentence');
        if(anchor.blockStart)node.classList.add('ocr-tr-reader-block-start');
        this.nodes.set(anchor.id,node);
      }
    }
    this.buildGutter(blocks);
  }
  buildGutter(blocks){
    const byLine=new Map();
    // Main's Markdown renderer can annotate nested elements on one line.
    for(const item of blocks){
      if(!byLine.has(item.start))byLine.set(item.start,{line:item.start,node:item.node});
    }
    for(const anchor of this.anchors){
      const node=this.nodes.get(anchor.id);
      if(node)byLine.set(anchor.line,{line:anchor.line,id:anchor.id,node});
    }
    this.markers.clear();
    const fragment=document.createDocumentFragment();
    this.markerEntries=[...byLine.values()].sort((a,b)=>a.line-b.line);
    for(const entry of this.markerEntries){
      const marker=document.createElement('div');
      marker.className='ocr-tr-reader-marker';
      marker.dataset.sourceLine=String(entry.line);
      const number=document.createElement('span');
      number.className='ocr-tr-reader-line-number';
      number.textContent=String(entry.line);
      marker.append(number);
      if(entry.id){
        const button=document.createElement('button');
        button.type='button';
        button.className='ocr-tr-reader-unit-id';
        button.dataset.gutterUnit=entry.id;
        button.textContent=entry.id;
        button.title='定位句块 '+entry.id;
        button.setAttribute('aria-label','定位句块 '+entry.id);
        marker.append(button);
        this.markers.set(entry.id,marker);
      }
      entry.marker=marker;
      fragment.append(marker);
    }
    this.gutter.replaceChildren(fragment);
  }
  scheduleMeasure(){
    if(this.measureHandle)return;
    this.measureHandle=requestAnimationFrame(()=>{
      this.measureHandle=0;
      const origin=this.canvas.getBoundingClientRect().top;
      for(const item of this.markerEntries){
        if(!item.node.isConnected||!item.node.getClientRects().length){
          item.marker.hidden=true;continue;
        }
        item.marker.hidden=false;
        item.marker.style.top=(item.node.getBoundingClientRect().top-origin)+'px';
      }
    });
  }
  mark(id){
    if(this.current)this.nodes.get(this.current)?.classList.remove('ocr-tr-reader-current');
    if(this.current)this.markers.get(this.current)?.classList.remove('ocr-tr-reader-marker-current');
    this.current=id;
    this.nodes.get(id)?.classList.add('ocr-tr-reader-current');
    this.markers.get(id)?.classList.add('ocr-tr-reader-marker-current');
  }
  reveal(id){
    const node=this.nodes.get(id);
    if(!node)return;
    let opened=false;
    for(let current=node.parentElement;current&&current!==this.body;current=current.parentElement){
      if(current.tagName==='DETAILS'&&!current.open){current.open=true;opened=true;}
    }
    const parentRect=this.scroller.getBoundingClientRect();
    const rect=node.getBoundingClientRect();
    // Preserve the reader's visual position when the target sentence is
    // already visible. A click in an AI pane must not unnecessarily drag the
    // entire article back to a fixed 28%-from-top position.
    if(!opened&&rect.top>=parentRect.top+12&&
        rect.bottom<=parentRect.bottom-12)return;
    this.suppressUntil=performance.now()+650;
    this.scroller.scrollTop+=rect.top-parentRect.top-parentRect.height*.28;
  }
  atPosition(pos){
    if(!this.anchors.length)return null;
    let lo=0,hi=this.anchors.length;
    while(lo<hi){const mid=(lo+hi)>>>1;
      if(this.anchors[mid].from<=pos)lo=mid+1;else hi=mid;}
    return this.anchors[Math.max(0,lo-1)].id;
  }
  visiblePosition(){
    const top=this.scroller.getBoundingClientRect().top;
    let nearest=null,distance=Infinity;
    for(const anchor of this.anchors){
      const node=this.nodes.get(anchor.id);
      if(!node || !node.getClientRects().length)continue;
      const delta=Math.abs(node.getBoundingClientRect().top-(top+36));
      if(delta<distance){nearest=anchor;distance=delta;}
    }
    return nearest?.from??null;
  }
  layout(){this.scheduleMeasure();}
  dispose(){
    this.footnoteReader?.dispose();
    this.clearNoteReturn();
    this.resizeObserver?.disconnect();
    if(this.measureHandle)cancelAnimationFrame(this.measureHandle);
    this.nodes.clear();this.markers.clear();this.element.replaceChildren();
  }
}
