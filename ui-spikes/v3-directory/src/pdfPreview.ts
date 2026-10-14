/** Lazy, page-at-a-time PDF.js viewer over the authenticated v3 Mac Vault FS.
 * PDF bytes are requested by PDF.js range transport, never as a full-file blob.
 * No direct PDF URL, public unauthenticated route or browser storage copy.
 */
import {
  PDFDataRangeTransport, GlobalWorkerOptions, getDocument,
  type PDFDocumentLoadingTask, type PDFDocumentProxy,
} from "../../v2/node_modules/pdfjs-dist/build/pdf.mjs";
import { EventBus, PDFViewer } from "../../v2/node_modules/pdfjs-dist/web/pdf_viewer.mjs";
import "../../v2/node_modules/pdfjs-dist/web/pdf_viewer.css";
import type { WorkspaceFSV3, WorkspaceNode } from "../../../src/workspaceFsV3";
import { location } from "../../../src/workspaceFsV3";
import type { MappingPdfRegion } from "../../../src/mineruMappingSidecar";
import { pdfRegionOverlayPercent } from "../../../src/pdfMdRegionGeometry";

GlobalWorkerOptions.workerSrc = new URL("./pdf.worker.min.mjs", import.meta.url).href;
// Large PDF experiment: raising PDF.js's chunk size from 64KiB to 128KiB
// nearly doubled bytes with no reduction in range count for the user's
// 109MiB scanned original; 512KiB triggered a complete download. Keep 64KiB.
const RANGE_CHUNK = 64 * 1024;
const MAX_PARALLEL_PDF_READS = 4;

export interface PdfPreviewStatus {
  phase: "empty" | "loading" | "rendering" | "ready" | "error";
  file?: WorkspaceNode;
  page: number;
  pages: number;
  /** On-demand page paint is pending while the document stays interactive. */
  renderingPage?: number;
  error?: string;
  zoomMode: "page-width" | "page-fit" | "custom";
  zoomPercent: number;
}
class VaultPdfRangeTransport extends PDFDataRangeTransport {
  private cancelled = false;
  private active = 0;
  private readonly pending: Array<{begin:number;end:number}> = [];
  constructor(private readonly fs: WorkspaceFSV3, private readonly file: WorkspaceNode,
    private readonly onProblem: (e: unknown) => void) {
    super(file.size, null);
  }
  override requestDataRange(begin: number, end: number): void {
    if(this.cancelled)return;
    this.pending.push({begin,end});
    this.pump();
  }
  private pump():void {
    while(!this.cancelled && this.active < MAX_PARALLEL_PDF_READS && this.pending.length) {
      const range=this.pending.shift()!;
      this.active++;
      void this.readRangeForPdfJs(range.begin,range.end).catch(error=>{
        if(!this.cancelled){this.abort();this.onProblem(error);}
      }).finally(()=>{this.active--;this.pump();});
    }
  }
  private async readRangeForPdfJs(begin:number,end:number):Promise<void> {
    // One response per PDF.js [begin,end) request. Never send partial ranges
    // under the same reader: PDF.js 5 drops readers after their first chunk.
    const combined = new Uint8Array(end-begin);
    for(let position=begin;position<end && !this.cancelled;){
      const length=Math.min(RANGE_CHUNK,end-position);
      const result=await this.fs.readRange({
        workspaceId:this.fs.workspaceId,path:this.file.path,nodeId:this.file.nodeId,
      },{offset:position,length,expectedRevision:this.file.revision});
      if(this.cancelled)return;
      if(result.bytes.byteLength!==length||result.revision!==this.file.revision){
        throw new Error("PDF 已发生外部变更或 Range 读取不完整，请重新打开工作目录");
      }
      combined.set(result.bytes,position-begin);
      position+=length;
    }
    if(!this.cancelled)this.onDataRange(begin,combined);
  }
  override abort():void {this.cancelled=true;this.pending.length=0;}
}

/** Official PDF.js viewer: continuous layout and priority rendering, authenticated Range FS. */
export class V3PdfPreview {
  private task?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private transport?: VaultPdfRangeTransport;
  private viewer?: PDFViewer;
  private bus?: EventBus;
  private generation=0;
  private readonly paintedPages=new Set<number>();
  // The hidden PDF panel has real geometry (not display:none); cache the
  // background first-frame viewport so switching tabs does not re-scale it.
  private lastLayoutWidth=0;
  private lastLayoutHeight=0;
  private resizeUpdateCount=0;
  private firstCanvasReady=false;
  private waitingForPaintPage=0;
  private focusRequestId=0;
  /** Consume once: PDF.js can paint the same page repeatedly while scrolling. */
  private initialFocusCenterPending=false;
  private status: PdfPreviewStatus={phase:"empty",page:0,pages:0,zoomMode:"page-width",zoomPercent:100};
  private readonly minZoom=50;
  private readonly maxZoom=300;
  private activeRegion?: { region:MappingPdfRegion;elementId:string;viewport:{width:number;height:number} };
  private readonly scroll: HTMLDivElement;
  private readonly pages: HTMLDivElement;
  constructor(private readonly host: HTMLElement,
    private readonly onState: (state: PdfPreviewStatus)=>void,
    private readonly onPagePoint?: (page:number,x:number,y:number)=>void,
    private readonly onUserNavigate?: ()=>void) {
    this.scroll=document.createElement("div");
    this.scroll.className="pdfViewerContainer";
    this.scroll.style.cssText="position:absolute;inset:0;overflow:auto;direction:ltr";
    // Explicit human interaction cancels a queued/page-fetch focus. Programmatic
    // PDF.js scrolls must not count as input (so we do not listen to scroll).
    const humanNavigate=()=>{
      ++this.focusRequestId;
      this.initialFocusCenterPending=false;
      this.onUserNavigate?.();
    };
    this.scroll.addEventListener("wheel",humanNavigate,{passive:true});
    this.scroll.addEventListener("touchstart",humanNavigate,{passive:true});
    this.scroll.addEventListener("pointerdown",humanNavigate,{passive:true});
    this.scroll.addEventListener("keydown",event=>{
      if(["ArrowUp","ArrowDown","PageUp","PageDown","Home","End"," "].includes(event.key))
        humanNavigate();
    });
    this.pages=document.createElement("div");
    this.pages.className="pdfViewer";
    this.scroll.append(this.pages);
    this.pages.addEventListener("click",event=>{
      if(!this.onPagePoint||!this.pdf||this.status.phase!=="ready")return;
      const target=event.target;
      if(!(target instanceof Element))return;
      const page=target.closest(".pdfViewer .page") as HTMLElement|null;
      const canvas=page?.querySelector("canvas");
      const number=Number(page?.dataset.pageNumber);
      if(!canvas||!Number.isSafeInteger(number)||number<1)return;
      const r=canvas.getBoundingClientRect();
      if(!r.width||!r.height)return;
      const x=(event.clientX-r.left)/r.width,y=(event.clientY-r.top)/r.height;
      if(x>=0&&x<=1&&y>=0&&y<=1)this.onPagePoint(number,x,y);
    });
    this.host.replaceChildren(this.scroll);
    this.setTheme("dark");
  }
  /** Change PDF appearance without re-rendering pages, ranges or OCR overlays. */
  setTheme(theme:"dark"|"light"):void{this.host.dataset.pdfTheme=theme;}
  snapshot():PdfPreviewStatus{return {...this.status};}
  /** Official PDF.js zoom, same scale applied to its page canvases and overlay DOM. */
  setZoom(mode:"page-width"|"page-fit"|"custom",percent?:number):void{
    const viewer=this.viewer;
    if(!viewer||!this.pdf||this.status.phase!=="ready")return;
    if(mode==="custom"&&(!Number.isFinite(percent)||!Number.isInteger(percent)||
      percent!<this.minZoom||percent!>this.maxZoom))throw Error("PDF 缩放范围为 50%～300%");
    const beforePage=viewer.currentPageNumber;
    viewer.currentScaleValue=mode==="custom"?String(percent!/100):mode;
    viewer.update();
    const actual=Math.round(viewer.currentScale*100);
    this.update({zoomMode:mode,zoomPercent:mode==="custom"?percent!:actual,
      page:viewer.currentPageNumber||beforePage});
    if(this.activeRegion)this.renderOverlay(false);
  }
  zoomStep(direction:-1|1):void{
    if(!this.viewer||this.status.phase!=="ready")return;
    const stops=[50,67,75,90,100,110,125,150,175,200,250,300];
    const current=this.viewer.currentScale*100;
    const next=direction>0?stops.find(p=>p>current+.5):[...stops].reverse().find(p=>p<current-.5);
    this.setZoom("custom",next??(direction>0?300:50));
  }
  private update(next:Partial<PdfPreviewStatus>):void{
    this.status={...this.status,...next};this.onState(this.snapshot());
  }
  async open(fs:WorkspaceFSV3,file:WorkspaceNode):Promise<void>{
    const generation=++this.generation;
    await this.disposeActive();
    if(generation!==this.generation)return;
    this.pages.replaceChildren();
    this.paintedPages.clear();this.waitingForPaintPage=0;
    this.firstCanvasReady=false;
    this.lastLayoutWidth=0;this.lastLayoutHeight=0;
    this.resizeUpdateCount=0;this.host.dataset.pdfResizeUpdates="0";
    delete this.host.dataset.renderingPage;
    delete this.host.dataset.firstPagePainted;
    this.update({phase:"loading",file,page:0,pages:0,renderingPage:undefined,error:undefined});
    try{
      if(file.kind!=="file"||!/\.pdf$/i.test(file.path)||file.size<=0)throw Error("不是有效 PDF 文件");
      const current=await fs.stat(location(fs.workspaceId,file.path));
      if(current.nodeId!==file.nodeId||current.revision!==file.revision)throw Error("PDF 文件已变化，请刷新工作目录");
      if(generation!==this.generation)return;
      const transport=new VaultPdfRangeTransport(fs,file,e=>{if(generation===this.generation)this.fail(e);});
      this.transport=transport;
      const task=getDocument({range:transport,rangeChunkSize:RANGE_CHUNK,
        disableAutoFetch:true,disableStream:true,stopAtErrors:true});
      this.task=task;
      const pdf=await task.promise;
      if(generation!==this.generation)return;
      this.pdf=pdf;
      const eventBus=new EventBus();
      this.bus=eventBus;
      // Scanned PDFs may exceed 100MB. A 6MP canvas plus dark compositing
      // consumes too much WebKit/iPad GPU memory when several pages coexist.
      // Keep PDF.js's real geometry intact, only cap raster backing pixels.
      const reducedCanvas=/iPad|iPhone|iPod/i.test(navigator.userAgent)||
        (navigator.maxTouchPoints>1&&navigator.platform==="MacIntel");
      const viewer=new PDFViewer({container:this.scroll,viewer:this.pages,eventBus,
        maxCanvasPixels:reducedCanvas?1_500_000:6_000_000,
        // Native selectable/copyable text for PDF files with embedded text.
        // PDF.js text layer is transparent and remains aligned with the canvas;
        // scanned PDFs without embedded text still require separate OCR review.
        textLayerMode:1,annotationMode:0});
      this.viewer=viewer;
      eventBus.on("pagerendered",(evt:{pageNumber:number;error?:unknown})=>{
        if(generation!==this.generation||this.status.phase==="error")return;
        // PDF.js emits pagerendered even when the canvas rendering task
        // failed. Never report a blank/error canvas as an available page.
        if(evt.error){
          if(evt.pageNumber===1||this.status.renderingPage===evt.pageNumber)
            this.fail(evt.error);
          return;
        }
        const canvas=viewer.getPageView(evt.pageNumber-1)?.div?.querySelector("canvas");
        // PDF.js `pagesinit` only knows the page geometry. A truly drawable
        // first frame needs a nonempty raster *after* `pagerendered`.
        if(!canvas||!canvas.width||!canvas.height)return;
        this.paintedPages.add(evt.pageNumber);
        if(evt.pageNumber===1&&!this.firstCanvasReady){
          this.firstCanvasReady=true;
          this.host.dataset.firstPagePainted="true";
          this.update({phase:"ready",page:viewer.currentPageNumber||1,
            pages:pdf.numPages,error:undefined});
        }
        if(this.waitingForPaintPage===evt.pageNumber||this.status.renderingPage===evt.pageNumber){
          this.waitingForPaintPage=0;
          delete this.host.dataset.renderingPage;
          this.update({page:viewer.currentPageNumber||evt.pageNumber,renderingPage:undefined});
        }
        // Center only on the FIRST painted frame after a deliberate focus.
        // Subsequent re-renders (lazy loading, zoom, scroll) only redraw.
        if(this.activeRegion?.region.pdfPageNumber===evt.pageNumber)
          this.renderOverlay(this.initialFocusCenterPending);
      });
      eventBus.on("pagechanging",(evt:{pageNumber:number})=>{
        if(generation===this.generation && this.status.phase!=="error")
          this.update({page:evt.pageNumber,
            renderingPage:this.status.phase==="ready"&&!this.paintedPages.has(evt.pageNumber)
              ?evt.pageNumber:undefined});
      });
      eventBus.on("pagesinit",()=>{
        if(generation!==this.generation)return;
        const requested=this.status.zoomMode;
        viewer.currentScaleValue=requested==="custom"?String(this.status.zoomPercent/100):requested;
        this.lastLayoutWidth=this.scroll.clientWidth;
        this.lastLayoutHeight=this.scroll.clientHeight;
        this.update({phase:"rendering",page:1,pages:pdf.numPages,error:undefined,
          zoomPercent:requested==="custom"?this.status.zoomPercent:Math.round(viewer.currentScale*100)});
        // The PDF panel remains visibility:hidden but measurable behind MD.
        // Ask PDF.js to schedule a single warm first frame now, not on tab click.
        viewer.update();
      });
      this.update({phase:"rendering",page:1,pages:pdf.numPages});
      viewer.setDocument(pdf);
    }catch(e){if(generation===this.generation)this.fail(e);}
  }
  /** Warm the latest AG-selected page behind MD without changing tabs,
   * applying an OCR box, or loading the entire scanned PDF. Calls are
   * debounced at the app boundary, preserving PDF.js Range lazy loading. */
  prewarmPage(pageNumber:number):void{
    const viewer=this.viewer,pdf=this.pdf;
    if(!viewer||!pdf||this.status.phase!=="ready"||
       !Number.isInteger(pageNumber)||pageNumber<1||pageNumber>pdf.numPages)return;
    const canvas=viewer.getPageView(pageNumber-1)?.div?.querySelector("canvas");
    if(this.paintedPages.has(pageNumber)&&canvas?.width&&canvas.height){
      // Latest AG selection wins even if a different background page was
      // still in flight. Cached target needs no fresh raster or busy marker.
      this.waitingForPaintPage=0;
      delete this.host.dataset.renderingPage;
      if(this.status.renderingPage)this.update({renderingPage:undefined});
      viewer.scrollPageIntoView({pageNumber});
      return;
    }
    this.waitingForPaintPage=pageNumber;
    this.host.dataset.renderingPage=String(pageNumber);
    this.update({renderingPage:pageNumber});
    viewer.scrollPageIntoView({pageNumber});
    viewer.update();
  }
  /** Focus one unverified OCR region; always validate against the real PDF page.
   * No annotation is saved to the PDF or Sidecar. */
  async focusRegion(region:MappingPdfRegion,elementId:string):Promise<void>{
    const pdf=this.pdf,viewer=this.viewer,generation=this.generation;
    const requestId=++this.focusRequestId;
    if(!pdf||!viewer||this.status.phase!=="ready" || !elementId)
      throw Error("PDF 尚未就绪，不能定位元素");
    if(region.pdfPageNumber<1||region.pdfPageNumber>pdf.numPages)
      throw Error("PDF_COORDINATE_INVALID: element page is outside PDF");
    const page=await pdf.getPage(region.pdfPageNumber);
    if(generation!==this.generation||pdf!==this.pdf||requestId!==this.focusRequestId)
      return; // superseded by a newer AG row during slow scanned page load
    // getViewport defaults to page.rotate. For pages 8/11 this already
    // reflects 90-degree orientation, matching MinerU's visual page_size.
    const viewport=page.getViewport({scale:1});
    const pageView=viewer.getPageView(region.pdfPageNumber-1);
    if(!pageView?.div)throw Error("PDF page view not available");
    // Validate BEFORE changing the viewer or destroying the prior marker.
    pdfRegionOverlayPercent(region,{width:viewport.width,height:viewport.height},
      {width:pageView.div.clientWidth,height:pageView.div.clientHeight});
    this.clearHighlight();
    this.activeRegion={region,elementId,viewport:{width:viewport.width,height:viewport.height}};
    this.initialFocusCenterPending=true;
    viewer.scrollPageIntoView({pageNumber:region.pdfPageNumber});
    if(!this.paintedPages.has(region.pdfPageNumber)){
      this.waitingForPaintPage=region.pdfPageNumber;
      this.host.dataset.renderingPage=String(region.pdfPageNumber);
      this.update({renderingPage:region.pdfPageNumber});
      // No misleading orange OCR box on a blank canvas: wait until PDF.js
      // actually finishes painting that scanned page.
      viewer.update();
    }else this.renderOverlay(true);
  }
  /** Manually transcribed titles have a reviewed PDF page but NO fake OCR bbox. */
  focusPage(pageNumber:number):void{
    if(!this.pdf||!this.viewer||this.status.phase!=="ready"||
       !Number.isInteger(pageNumber)||pageNumber<1||pageNumber>this.pdf.numPages)
      throw Error("人工补录 PDF 页码超出已加载原文范围");
    ++this.focusRequestId;
    this.clearHighlight();
    this.viewer.scrollPageIntoView({pageNumber});
    if(!this.paintedPages.has(pageNumber)){
      this.waitingForPaintPage=pageNumber;this.host.dataset.renderingPage=String(pageNumber);
      this.update({renderingPage:pageNumber});
      this.viewer.update();
    }else{
      this.waitingForPaintPage=0;delete this.host.dataset.renderingPage;
      if(this.status.renderingPage)this.update({renderingPage:undefined});
    }
  }
  clearHighlight():void{
    this.pages.querySelectorAll(".ocr2md-pdf-region-overlay").forEach(node=>node.remove());
    this.activeRegion=undefined;
    this.initialFocusCenterPending=false;
  }
  private renderOverlay(recenter:boolean):void{
    const focused=this.activeRegion,viewer=this.viewer;
    if(!focused||!viewer||!this.paintedPages.has(focused.region.pdfPageNumber))return;
    const page=viewer.getPageView(focused.region.pdfPageNumber-1)?.div;
    if(!page)return;
    const rect=pdfRegionOverlayPercent(focused.region,focused.viewport,
      {width:page.clientWidth,height:page.clientHeight});
    page.querySelectorAll(".ocr2md-pdf-region-overlay").forEach(node=>node.remove());
    const overlay=document.createElement("div");
    overlay.className="ocr2md-pdf-region-overlay";
    overlay.dataset.elementId=focused.elementId;
    overlay.dataset.pdfPage=String(focused.region.pdfPageNumber);
    overlay.setAttribute("aria-label","OCR 候选元素框选（尚未人工审核）");
    overlay.style.left=rect.left+"%";overlay.style.top=rect.top+"%";
    overlay.style.width=rect.width+"%";overlay.style.height=rect.height+"%";
    page.append(overlay);
    if(recenter && this.initialFocusCenterPending){
      // Mark consumed BEFORE scrolling: PDF.js pagechanging/pagerendered can
      // fire synchronously and must never cause a second navigation.
      this.initialFocusCenterPending=false;
      const box=overlay.getBoundingClientRect(),host=this.scroll.getBoundingClientRect();
      this.scroll.scrollTop+=(box.top+box.height/2)-(host.top+host.height/2);
      this.scroll.scrollLeft+=(box.left+box.width/2)-(host.left+host.width/2);
    }
  }
  async showPage(page:number):Promise<void>{
    if(!this.viewer||!this.pdf||page<1||page>this.pdf.numPages)return;
    this.clearHighlight();
    this.viewer.currentPageNumber=page;
  }
  async resize():Promise<void>{
    const viewer=this.viewer;
    if(!viewer||!this.pdf||this.status.phase!=="ready")return;
    const width=this.scroll.clientWidth,height=this.scroll.clientHeight;
    if(!width||!height)return;
    // The hidden PDF pane has exactly the same width and height as the
    // visible pane in a stable split layout: do NOT call PDF.js update()
    // again on each MD↔PDF tab switch. That can destroy an iPad canvas.
    if(width===this.lastLayoutWidth&&height===this.lastLayoutHeight)return;
    const widthChanged=width!==this.lastLayoutWidth;
    this.lastLayoutWidth=width;this.lastLayoutHeight=height;
    // Hidden PDF includes the 35px tab strip in its absolute box, while the
    // visible flex pane excludes it. For page-width/custom zoom this height
    // delta changes neither scale nor the already painted first Canvas.
    // Avoid a redundant PDF.js update; page-fit really depends on height.
    if(!widthChanged&&this.status.zoomMode!=="page-fit")return;
    if((widthChanged||this.status.zoomMode==="page-fit")&&this.status.zoomMode!=="custom"){
      viewer.currentScaleValue=this.status.zoomMode;
      const zoom=Math.round(viewer.currentScale*100);
      if(zoom!==this.status.zoomPercent)this.update({zoomPercent:zoom});
    }
    viewer.update();
    this.host.dataset.pdfResizeUpdates=String(++this.resizeUpdateCount);
    if(this.activeRegion)this.renderOverlay(false);
  }
  private fail(error:unknown):void{
    this.transport?.abort();
    this.update({phase:"error",error:error instanceof Error?error.message:String(error)});
  }
  async close():Promise<void>{
    ++this.generation;
    await this.disposeActive();
    this.pages.replaceChildren();
    this.paintedPages.clear();this.waitingForPaintPage=0;
    this.firstCanvasReady=false;
    this.lastLayoutWidth=0;this.lastLayoutHeight=0;
    delete this.host.dataset.renderingPage;
    delete this.host.dataset.firstPagePainted;
    this.update({phase:"empty",file:undefined,page:0,pages:0,renderingPage:undefined,error:undefined,
      zoomMode:"page-width",zoomPercent:100});
  }
  private async disposeActive():Promise<void>{
    ++this.focusRequestId;
    this.clearHighlight();
    this.transport?.abort();this.transport=undefined;
    this.viewer?.setDocument(null);
    this.viewer=undefined;this.bus=undefined;
    const task=this.task;this.task=undefined;this.pdf=undefined;
    if(task)try{await task.destroy();}catch{}
  }
}
