/** Translation Lab's read-only reader surface. Uses Main's sole renderMarkdown
 * API and the existing .ocr-markdown theme, not a copied Markdown renderer.
 * All image requests are SAME-ORIGIN GETs to Main's existing /media/ reader.
 */
import {renderMarkdown} from './markdown-preview.js';
import {mainMediaURL} from './translation-review-reading.js';

export class TranslationReaderPane {
  constructor(id,owner){
    this.id=id;this.owner=owner;
    this.element=document.createElement('div');
    this.element.className='ocr-sb-pane ocr-tr-pane ocr-tr-reader-pane';
    this.element.dataset.engine='original';
    const toolbar=document.createElement('div');
    toolbar.className='ocr-sb-pane-toolbar';
    const title=document.createElement('strong');
    title.textContent='单语 Markdown · 成品预览';
    this.status=document.createElement('span');
    this.status.className='ocr-sb-pane-status';
    toolbar.append(title,this.status);
    this.scroller=document.createElement('div');
    this.scroller.className='ocr-tr-reader-scroll';
    this.scroller.setAttribute('aria-label','单语 Markdown 成品阅读预览');
    this.body=document.createElement('article');
    this.body.className='ocr-markdown';
    this.scroller.append(this.body);
    this.element.append(toolbar,this.scroller);
    this.nodes=new Map();this.anchors=[];this.content='';
    this.suppressUntil=0;this.lastGesture=0;this.current=null;
  }
  init(){
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
      // Let details/summary own folding. Clicks on hyperlinks and images do
      // not navigate or mutate review state; only explicit sentence hits do.
      if(event.target.closest('summary.ocr-callout-title'))return;
      const target=event.target.closest('[data-unit-id]');
      if(!target)return;
      const selected=this.anchors.find(x=>x.id===target.dataset.unitId);
      if(selected)this.owner.receivePosition(this.id,selected.from);
    });
  }
  updateDoc(text,anchors){
    this.anchors=anchors;
    if(text!==this.content){
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
  }
  assignAnchors(){
    for(const node of this.body.querySelectorAll('[data-unit-id]'))
      node.removeAttribute('data-unit-id');
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
        this.nodes.set(anchor.id,node);
      }
    }
  }
  mark(id){
    if(this.current)this.nodes.get(this.current)?.classList.remove('ocr-tr-reader-current');
    this.current=id;
    this.nodes.get(id)?.classList.add('ocr-tr-reader-current');
  }
  reveal(id){
    const node=this.nodes.get(id);
    if(!node)return;
    for(let current=node.parentElement;current&&current!==this.body;current=current.parentElement){
      if(current.tagName==='DETAILS'&&!current.open)current.open=true;
    }
    const parentRect=this.scroller.getBoundingClientRect();
    const rect=node.getBoundingClientRect();
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
  layout(){}
  dispose(){this.nodes.clear();this.element.replaceChildren();}
}
