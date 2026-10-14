/** V3-only source/preview scroll link. Uses markdown-it source-line anchors,
 * not fragile pixel-percentage ratios; never changes CodeMirror selection. */
import type {WorkingEditor} from '../../../v2/src/workingEditor';

export class MdScrollSync {
  private quietSourceUntil=0;
  private quietPreviewUntil=0;
  private scheduled=0;
  private semanticUntil=0;
  /** AG target is authoritative over scroll sync for a brief layout cycle. */
  suspendForSemanticFocus(milliseconds=1000):void{
    this.semanticUntil=performance.now()+milliseconds;
    if(this.scheduled){cancelAnimationFrame(this.scheduled);this.scheduled=0;}
  }
  private readonly offSource:()=>void;
  constructor(private readonly editor:WorkingEditor,private readonly preview:HTMLElement){
    this.offSource=this.editor.onScroll(()=>this.schedule('source'));
    this.preview.addEventListener('scroll',this.previewScrolled,{passive:true});
    window.addEventListener('ocr2md:v3:md-preview-shown',this.previewShown);
  }
  private readonly previewScrolled=()=>this.schedule('preview');
  private readonly previewShown=()=>{
    if(!this.visible())return;
    if(this.preview.dataset.cleanFocusLine){
      this.focusSourceLine(Number(this.preview.dataset.cleanFocusLine));
      return;
    }
    if(this.preview.dataset.irBlockId){
      // Returning from PDF must restore the selected semantic element rather
      // than align to the visually first CodeMirror line.
      this.suspendForSemanticFocus();
      const node=Array.from(this.preview.querySelectorAll<HTMLElement>(".v3-ir-preview-target"))
        .find(x=>x.dataset.irBlockId===this.preview.dataset.irBlockId);
      if(node)requestAnimationFrame(()=>this.alignNode(node));
    }else requestAnimationFrame(()=>this.sourceToPreview());
  };
  /** AG title → exact rendered MD line, using MarkdownIt's source-line anchors. */
  focusSourceLine(line:number):void{
    if(!Number.isSafeInteger(line)||line<1)return;
    const anchors=this.anchors();
    const chosen=anchors.find(item=>item.line===line);
    for(const item of Array.from(this.preview.querySelectorAll<HTMLElement>(".v3-clean-preview-target")))
      item.classList.remove("v3-clean-preview-target");
    if(!chosen){delete this.preview.dataset.cleanFocusLine;return;}
    chosen.node.classList.add("v3-clean-preview-target");
    this.preview.dataset.cleanFocusLine=String(line);
    this.suspendForSemanticFocus();
    const align=()=>{
      if(this.preview.dataset.cleanFocusLine===String(line))this.alignNode(chosen.node);
    };
    align();requestAnimationFrame(align);
  }
  clearChapterFocus():void{
    delete this.preview.dataset.cleanFocusLine;
    for(const item of Array.from(this.preview.querySelectorAll<HTMLElement>(".v3-clean-preview-target")))
      item.classList.remove("v3-clean-preview-target");
  }
  alignNode(node:HTMLElement):void{
    if(!this.visible()||!node.isConnected)return;
    const box=node.getBoundingClientRect();const frame=this.preview.getBoundingClientRect();
    const target=Math.max(0,this.preview.scrollTop+box.top-frame.top-
      Math.min(frame.height*.18,80));
    this.quietPreviewUntil=performance.now()+250;
    this.preview.scrollTop=target;
  }
  private visible():boolean{return this.preview.getClientRects().length>0 &&
    !this.preview.closest('[hidden]');}
  private anchors():Array<{line:number;node:HTMLElement}>{
    return Array.from(this.preview.querySelectorAll<HTMLElement>('[data-source-line]'))
      .map(node=>({line:Number(node.dataset.sourceLine),node}))
      .filter(x=>Number.isSafeInteger(x.line)&&x.line>0)
      .sort((a,b)=>a.line-b.line);
  }
  private schedule(origin:'source'|'preview'):void{
    if(!this.visible())return;
    const now=performance.now();
    if(now<this.semanticUntil)return;
    if(origin==='source'&&now<this.quietSourceUntil)return;
    if(origin==='preview'&&now<this.quietPreviewUntil)return;
    if(this.scheduled)cancelAnimationFrame(this.scheduled);
    this.scheduled=requestAnimationFrame(()=>{
      this.scheduled=0;
      if(origin==='source')this.sourceToPreview();
      else this.previewToSource();
    });
  }
  sourceToPreview():void{
    if(!this.visible())return;
    const anchors=this.anchors();if(!anchors.length)return;
    const line=this.editor.topVisibleLine();
    let selected=anchors[0];
    for(const anchor of anchors){if(anchor.line>line)break;selected=anchor;}
    const rootTop=this.preview.getBoundingClientRect().top;
    const targetTop=selected.node.getBoundingClientRect().top;
    const next=Math.max(0,this.preview.scrollTop+targetTop-rootTop-14);
    if(Math.abs(next-this.preview.scrollTop)>2){
      this.quietPreviewUntil=performance.now()+160;
      this.preview.scrollTop=next;
    }
  }
  private previewToSource():void{
    const anchors=this.anchors();if(!anchors.length)return;
    const top=this.preview.getBoundingClientRect().top+18;
    let selected=anchors[0];
    for(const anchor of anchors){
      if(anchor.node.getBoundingClientRect().top>top)break;
      selected=anchor;
    }
    const line=this.editor.topVisibleLine();
    if(line!==selected.line){
      this.quietSourceUntil=performance.now()+160;
      this.editor.scrollLineToTop(selected.line);
    }
  }
  destroy():void{
    this.offSource();this.preview.removeEventListener('scroll',this.previewScrolled);
    window.removeEventListener('ocr2md:v3:md-preview-shown',this.previewShown);
    if(this.scheduled)cancelAnimationFrame(this.scheduled);
  }
}
