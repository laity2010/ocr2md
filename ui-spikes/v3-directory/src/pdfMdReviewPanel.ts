/** WP7 side-by-side audit AG Grid. Decisions remain in memory until Save. */
import {
  createGrid,type GridApi,type ColDef,
} from "../../v2/node_modules/ag-grid-community";
import { calibrationTheme } from "../../v2/src/calibrationTheme";
import { EnumCheckboxFilter } from "../../v2/src/tableConfigurationGrid";
import type { WorkspaceFSV3 } from "../../../src/workspaceFsV3";
import type { MappingRelationV1,PdfMdMappingSidecarV1 } from "../../../src/mineruMappingSidecar";
import {
  REVIEW_STATUSES,emptyReview,loadReview,saveReview,
  type LoadedReview,type ReviewDecision,type ReviewStatus,type ReviewAnchor,
} from "../../../src/pdfMdReviewStore";

interface ReviewRow { elementId:string;page:number;type:string;match:string;
  audit:string;note:string;corrected:string;relation:MappingRelationV1; }
export class PdfMdReviewPanel {
  private readonly grid:GridApi<ReviewRow>;
  private fs?:WorkspaceFSV3;
  private map?:PdfMdMappingSidecarV1;
  private mapSha="";
  private folder="";
  private loaded?:LoadedReview;
  private decisions=new Map<string,ReviewDecision>();
  private selectedId="";
  private dirty=false;
  private saving=false;
  private epoch=0;
  private rows:ReviewRow[]=[];
  private readonly summary:HTMLElement;
  private readonly note:HTMLTextAreaElement;
  private readonly saveButton:HTMLButtonElement;
  private readonly anchorButton:HTMLButtonElement;
  private readonly clearButton:HTMLButtonElement;
  constructor(host:HTMLElement,private readonly onNavigate:(relation:MappingRelationV1)=>void,
    private readonly getSelection:()=>ReviewAnchor|undefined){
    this.summary=document.getElementById("pdf-md-review-status")!;
    this.note=document.getElementById("pdf-md-review-note") as HTMLTextAreaElement;
    this.saveButton=document.getElementById("pdf-md-review-save") as HTMLButtonElement;
    this.anchorButton=document.getElementById("pdf-md-review-capture") as HTMLButtonElement;
    this.clearButton=document.getElementById("pdf-md-review-clear-anchor") as HTMLButtonElement;
    const columnDefs:ColDef<ReviewRow>[]=[
      {field:"page",headerName:"原PDF页",width:90,pinned:"left",lockPinned:true,filter:EnumCheckboxFilter},
      {field:"audit",headerName:"审核",minWidth:126,flex:1,filter:EnumCheckboxFilter,
        cellRenderer:(p:{data?:ReviewRow})=>{
          if(!p.data)return "";
          const s=document.createElement("select");s.className="pdf-md-review-cell-status";
          s.dataset.elementId=p.data.elementId;s.setAttribute("aria-label","审核 · "+p.data.elementId);
          for(const key of ["未审核",...REVIEW_STATUSES])s.add(new Option(key,key));
          s.value=p.data.audit;s.addEventListener("click",e=>e.stopPropagation());
          s.addEventListener("change",()=>this.mark(p.data!.elementId,s.value as ReviewStatus|"未审核"));
          return s;
        }},
      {field:"type",headerName:"元素",minWidth:90,flex:1,filter:EnumCheckboxFilter},
      {field:"match",headerName:"自动证据",minWidth:125,flex:1,filter:EnumCheckboxFilter},
      {field:"corrected",headerName:"人工关联",minWidth:105,flex:1},
      {field:"note",headerName:"说明",minWidth:130,flex:1,tooltipField:"note"},
    ];
    this.grid=createGrid<ReviewRow>(host,{theme:calibrationTheme,rowData:[],columnDefs,
      defaultColDef:{sortable:true,resizable:true,suppressMovable:true},
      suppressMovableColumns:true,animateRows:false,rowHeight:40,headerHeight:40,
      getRowId:p=>p.data.elementId,onRowClicked:event=>{
        if(!event.data)return;
        this.selectedId=event.data.elementId;
        this.note.value=this.decisions.get(this.selectedId)?.note??"";
        this.refreshControls();
        this.onNavigate(event.data.relation);
      }});
    this.note.addEventListener("change",()=>{
      if(this.selectedId)this.edit(this.selectedId,{note:this.note.value.slice(0,2000)});
    });
    this.saveButton.addEventListener("click",()=>void this.save());
    this.anchorButton.addEventListener("click",()=>this.captureAnchor());
    this.clearButton.addEventListener("click",()=>{
      if(this.selectedId)this.edit(this.selectedId,{status:"待复核",correctedAnchor:undefined});
    });
    this.reset();
  }
  isDirty():boolean{return this.dirty;}
  getCorrectedAnchor(id:string):ReviewAnchor|undefined{return this.decisions.get(id)?.correctedAnchor;}

  reset():void{
    ++this.epoch;this.map=undefined;this.fs=undefined;this.folder="";
    this.loaded=undefined;this.decisions.clear();this.selectedId="";
    this.dirty=false;this.saving=false;this.rows=[];
    this.note.value="";this.grid.setGridOption("rowData",[]);
    this.setStatus("尚未加载人工关联审核（需要 WP4 映射）。");
    this.refreshControls();
  }
  private setStatus(message:string):void{this.summary.textContent=message;}
  async open(fs:WorkspaceFSV3,folder:string,map:PdfMdMappingSidecarV1,mapSha:string):Promise<void>{
    this.reset();const epoch=++this.epoch;
    this.fs=fs;this.folder=folder;this.map=map;this.mapSha=mapSha;
    this.setStatus("正在加载人工审核记录…");
    try{
      const loaded=await loadReview(fs,folder,map,mapSha);
      if(epoch!==this.epoch)return;
      this.loaded=loaded;
      for(const d of loaded.review.decisions)this.decisions.set(d.elementId,d);
      this.rebuild();
    }catch(e){
      if(epoch!==this.epoch)return;
      this.fs=undefined;this.setStatus("审核记录版本/内容不一致，已禁用保存："+String(e));
      this.refreshControls();
    }
  }
  private rebuild():void{
    if(!this.map)return;
    this.rows=this.map.relations.map(relation=>{
      const d=this.decisions.get(relation.elementId);
      return {elementId:relation.elementId,page:relation.pdfRegions[0]?.pdfPageNumber??0,
        type:relation.type,match:relation.matchStatus,audit:d?.status??"未审核",
        note:d?.note??"",corrected:d?.correctedAnchor?"已指定 MD 锚点":"—",relation};
    });
    this.grid.setGridOption("rowData",this.rows);
    this.refreshControls();
  }
  private refreshControls():void{
    const reviewCount=this.decisions.size;
    if(this.map&&this.loaded&&!this.saving){
      const note=`已审核 ${reviewCount} / ${this.map.relations.length} 项` +
        (this.dirty?" · 有未保存改动，请按「保存审核」":" · 已与文件同步");
      this.setStatus(note);
    }
    this.saveButton.disabled=!this.fs||!this.loaded||!this.dirty||this.saving;
    this.note.disabled=!this.selectedId||!this.fs||this.saving;
    this.anchorButton.disabled=!this.selectedId||!this.fs||this.saving;
    this.clearButton.disabled=!this.selectedId||!this.decisions.get(this.selectedId)?.correctedAnchor||this.saving;
  }
  private edit(id:string,patch:{status?:ReviewStatus|"未审核";note?:string;correctedAnchor?:ReviewAnchor}):void{
    if(!this.map||!this.loaded||this.saving)return;
    const old=this.decisions.get(id),status=patch.status??old?.status??"待复核";
    if(status==="未审核")this.decisions.delete(id);
    else{
      const correctedAnchor=patch.correctedAnchor??(status==="已校正"?old?.correctedAnchor:undefined);
      const decision:ReviewDecision={elementId:id,status,note:patch.note??old?.note??"",
        updatedAt:new Date().toISOString(),...(correctedAnchor?{correctedAnchor}:{})};
      if(status==="已校正"&&!correctedAnchor){
        this.setStatus("请先在 MD 源码选中文字，并点击「使用当前 MD 选区校正」。");
        this.grid.refreshCells({force:true});
        return;
      }
      this.decisions.set(id,decision);
    }
    this.dirty=true;
    const row=this.rows.find(r=>r.elementId===id);
    if(row){
      const next=this.decisions.get(id);
      row.audit=next?.status??"未审核";row.note=next?.note??"";
      row.corrected=next?.correctedAnchor?"已指定 MD 锚点":"—";
      this.grid.applyTransaction({update:[row]});
    }
    this.refreshControls();
  }
  private mark(id:string,status:ReviewStatus|"未审核"):void{this.edit(id,{status});}
  private captureAnchor():void{
    const current=this.getSelection();
    if(!current||!this.selectedId){
      this.setStatus("请先单击审核表的元素行，然后在相应章节 MD 源码中选择非空文字范围。");return;
    }
    const expected=this.map?.chapterVersions.flatMap(c=>[c.source,c.working])??[];
    const documents=[...(this.map?[this.map.originalMd]:[]),...expected];
    if(!documents.some(doc=>doc.path===current.path&&doc.sha256===current.sha256)){
      this.setStatus("当前选区不属于经 WP4 校验的 Markdown 版本，无法校正。");return;
    }
    this.edit(this.selectedId,{status:"已校正",correctedAnchor:current});
  }
  private async save():Promise<void>{
    if(!this.map||!this.fs||!this.loaded||!this.dirty||this.saving)return;
    const epoch=this.epoch,fs=this.fs,map=this.map,folder=this.folder,sha=this.mapSha;
    this.saving=true;this.refreshControls();this.setStatus("正在按 CAS 保存全部审核决策…");
    let outcome="";
    try{
      const review={...emptyReview(map,sha),decisions:[...this.decisions.values()]};
      const loaded=await saveReview(fs,folder,map,sha,review,crypto.randomUUID(),this.loaded.node?.revision);
      if(epoch!==this.epoch)return;
      this.loaded=loaded;this.dirty=false;
      outcome=`已安全保存 ${loaded.review.decisions.length} 条人工决策，回读校验通过。`;
    }catch(e){
      if(epoch!==this.epoch)return;
      outcome="保存被拒绝，草稿仍保留（请检查版本冲突/重新载入）："+String(e);
    }finally{if(epoch===this.epoch){this.saving=false;this.refreshControls();this.setStatus(outcome);}}
  }
}
