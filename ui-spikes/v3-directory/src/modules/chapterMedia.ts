/** Media module: source scanning and explicit, serial, CAS-guarded downloads.
 * Owns media task state, columns, row projection, toolbar actions and
 * presentation order. Shared workbench owns the AG instance, not its policy.
 */
import {scanChapterElements} from "../../../../src/chapterElementCatalog";
import {MacVaultHttpFS} from "../../../../src/v3HttpWorkspaceFs";
import type {Candidate} from "../../../../src/types";
import type {ColDef} from "ag-grid-community";
import type {ChapterDocumentPort,ChapterGridView,ChapterModuleDefinition} from "./contracts";

export const chapterMediaModule:ChapterModuleDefinition={
  id:"媒体",stage:"cleaning",toolIds:["wb-clean-download-media"],
  scan:(md,path)=>scanChapterElements(md,path,"媒体"),
};
export type MediaTaskStatus="等待"|"下载中"|"已下载"|"失败"|"未处理";
/** Module-owned AG columns and presentation; AG instance remains shared. */
export const chapterMediaColumns:readonly ColDef<Candidate>[]=[
  {colId:"mediaTaskStatus",headerName:"下载状态",width:116,minWidth:104,
    valueGetter:params=>params.data?.mediaTaskStatus??
      (params.data?.mediaGroup==="已采用"?"已采用":"未下载"),
    cellRenderer:params=>{
      const span=document.createElement("span");
      span.textContent=String(params.value??"");
      span.dataset.mediaDownloadState=String(params.value??"");
      return span;
    }},
  {colId:"mediaTaskReason",headerName:"失败原因",minWidth:220,flex:1,sortable:false,
    valueGetter:params=>params.data?.mediaTaskReason??"",
    tooltipValueGetter:params=>params.data?.mediaTaskReason??"",
    cellRenderer:params=>{
      const span=document.createElement("span");
      span.textContent=params.data?.mediaTaskReason??"";
      span.title=params.data?.mediaTaskReason??"";
      span.dataset.mediaDownloadReason="true";
      return span;
    }},
];

export type MediaDownloadEntry={source:string;result:"running"|"ok"|"failed";detail:string};
export type MediaDownloadProgress={
  chapter:string;phase:"running"|"done";total:number;processed:number;
  succeeded:number;failed:number;stopReason:string;entries:MediaDownloadEntry[];
  summary:string;
};

function safeMediaSource(url:string):string{
  try{
    const parsed=new URL(url);
    return (parsed.hostname+parsed.pathname).slice(0,160);
  }catch{return "无法解析的媒体地址";}
}
function mediaErrorMessage(error:unknown):string{
  const typed=error as {code?:string};
  const prefix=typed?.code?`[${typed.code}] `:"";
  const message=error instanceof Error?error.message:String(error);
  return (prefix+message).replace(/https?:\/\/[^\s"'<>]+/gi,url=>safeMediaSource(url)).slice(0,340);
}
export class ChapterMediaController {
  private current?:MediaDownloadProgress;
  private busy=false;
  private recordsChapter="";
  private readonly bySource=new Map<string,{status:MediaTaskStatus;reason:string}>();
  private readonly byLocal=new Map<string,{status:"已下载";reason:string}>();
  private downloadButton?:HTMLButtonElement;
  constructor(private readonly document:ChapterDocumentPort,private readonly onUpdate:()=>void){}
  get gridView():ChapterGridView{
    return {module:"媒体",afterColId:"mediaGroup",columns:chapterMediaColumns,
      columnOrder:["mediaGroup","mediaTaskStatus","mediaTaskReason",
        "mediaThumbnail","mediaFileName","mediaSize"],
      project:(rows,path)=>this.projectRows(rows,path)};
  }
  private projectRows(rows:Candidate[],path:string):Candidate[]{
    if(path!==this.recordsChapter){
      this.recordsChapter=path;this.bySource.clear();this.byLocal.clear();
    }
    return rows.map(row=>{
      const task=(row.mediaSourceUrl&&this.bySource.get(row.mediaSourceUrl))||
        (row.localPath&&this.byLocal.get(row.localPath));
      return task?{...row,mediaTaskStatus:task.status,mediaTaskReason:task.reason}:row;
    });
  }
  private record(source:string,status:MediaTaskStatus,reason="",localPath?:string,chapter?:string,
    redraw=true):void{
    if(this.document.chapter().path!==(chapter??this.recordsChapter))return;
    if(this.recordsChapter!==(chapter??this.recordsChapter)){
      this.recordsChapter=chapter!;this.bySource.clear();this.byLocal.clear();
    }
    this.bySource.set(source,{status,reason});
    if(status==="已下载"&&localPath)this.byLocal.set(localPath,{status,reason});
    if(redraw)this.document.refreshGrid();
  }
  get task():MediaDownloadProgress|undefined{return this.current;}
  get running():boolean{return this.busy;}
  pending():string[]{
    const doc=this.document.chapter();
    if(!doc.editing)return [];
    return [...new Set(chapterMediaModule.scan!(doc.text,doc.path)
      .flatMap(row=>row.mediaSourceUrl&&/^https?:\/\//i.test(row.mediaSourceUrl)
        ?[row.mediaSourceUrl]:[]))];
  }
  toolState():{disabled:boolean;label:string}{
    const doc=this.document.chapter();
    const count=this.pending().length;
    return {disabled:!doc.editing||doc.dirty||doc.saving||this.busy||count===0,
      label:this.busy?"图片下载中…":`下载图片（${count}）`};
  }
  /** Module owns tool behavior; host supplies the actual toolbar slot. */
  bindTool(button:HTMLButtonElement,getBook:()=>string,onError:(error:unknown)=>void):void{
    this.downloadButton=button;
    button.addEventListener("click",()=>{
      if(this.busy)return;
      void this.download(getBook()).catch(onError);
    });
    this.updateTool(false);
  }
  updateTool(visible:boolean):void{
    if(!this.downloadButton)return;
    this.downloadButton.hidden=!visible;
    if(!visible)return;
    const state=this.toolState();
    this.downloadButton.disabled=state.disabled;
    this.downloadButton.textContent=state.label;
  }
  status():{level:"busy"|"ready"|"error";summary:string}|undefined{
    const task=this.current,doc=this.document.chapter();
    if(!task||doc.path!==task.chapter)return;
    return {level:task.phase==="running"?"busy":
      task.failed||task.stopReason||task.processed<task.total?"error":"ready",
      summary:task.summary};
  }
  async download(book:string):Promise<void>{
    if(this.busy) return;
    const chapter=this.document.chapter();
    if(!book||!chapter.editing||chapter.dirty||chapter.saving)
      throw Error("无法下载：请先保存章节源码草稿并确认当前章节可编辑");
    const urls=this.pending();
    if(!urls.length)throw Error("当前章节没有未下载图片");
    const task:MediaDownloadProgress={
      chapter:chapter.path,phase:"running",total:urls.length,processed:0,
      succeeded:0,failed:0,stopReason:"",entries:[],
      summary:`图片下载准备中：0/${urls.length}`,
    };
    this.current=task;this.busy=true;
    for(const url of urls)this.record(url,"等待","",undefined,task.chapter,false);
    this.document.refreshGrid();this.onUpdate();
    try {
      for(const url of urls){
        const state=this.document.chapter();
        if(state.book!==book||state.path!==task.chapter||
           !state.editing||state.dirty||state.saving){
          task.stopReason="章节已切换、保存状态变化或源码有未保存修改；为避免覆盖已停止";
          break;
        }
        const entry:MediaDownloadEntry={
          source:safeMediaSource(url),result:"running",detail:"正在连接图片来源…",
        };
        task.entries.push(entry);
        this.record(url,"下载中","",undefined,task.chapter);
        task.summary=`图片下载 ${task.processed+1}/${task.total} · 成功 ${task.succeeded} · 失败 ${task.failed} · ${entry.source}`;
        this.onUpdate();
        try {
          if(!this.pending().includes(url))throw Error("当前章节找不到所选图片来源");
          const local=await this.document.transaction(book,async(fs,current)=>{
            if(!(fs instanceof MacVaultHttpFS))throw Error("媒体下载需要 Mac Vault 授权");
            const response=await fs.downloadCleanedChapterImage(book,
              current.path.slice((book+"/chapters/").length),current,url);
            return {...response,result:response.localPath};
          });
          task.succeeded++;entry.result="ok";entry.detail=`已保存并采用 ${local}`;
          this.record(url,"已下载","",local,task.chapter);
        }catch(error){
          task.failed++;
          const reason=mediaErrorMessage(error);
          entry.result="failed";entry.detail=`下载失败：${reason}`;
          this.record(url,"失败",reason,undefined,task.chapter);
          const code=(error as {code?:string})?.code;
          const authStatus=(error as {status?:number})?.status;
          if(code==="ESTALE"||code==="ECONFLICT"){
            // A 409 is not proof that the chapter's *contents* changed.
            // Re-read and accept the new CAS identity only when the complete
            // saved MD is unchanged; leave this image failed and move on.
            entry.detail=`下载失败：${reason}；正在核对章节版本…`;
            this.onUpdate();
            try{
              if(await this.document.revalidateUnchanged(book,task.chapter)){
                entry.detail=`下载失败：${reason}；章节正文未变，已恢复版本，继续其他图片`;
                this.record(url,"失败",
                  `${reason}；章节正文未变，其他图片继续下载`,undefined,task.chapter);
              }else task.stopReason=`图片 ${task.processed+1} 发生版本冲突，章节正文已改变或无法安全核对；后续未处理`;
            }catch(checkError){
              task.stopReason=`图片 ${task.processed+1} 版本重新核对失败：${mediaErrorMessage(checkError)}；后续未处理`;
            }
          }else if(["EACCES","EBUSY","EUNSUPPORTED","ENOENT"].includes(code??"")||
                   authStatus===401||authStatus===403){
            task.stopReason=`图片 ${task.processed+1} 因 ${reason} 中止，后续未处理`;
          }
        }
        task.processed++;
        task.summary=`图片下载 ${task.processed}/${task.total} · 成功 ${task.succeeded} · 失败 ${task.failed}`+
          (entry.result==="failed"?` · ${entry.source} 失败`:"");
        this.onUpdate();
        if(task.stopReason)break;
      }
    }catch(error){
      task.stopReason=`未预期的下载处理异常：${mediaErrorMessage(error)}`;
    }finally{
      task.phase="done";
      for(const source of urls.slice(task.processed))
        this.record(source,"未处理",task.stopReason||"未执行下载",undefined,task.chapter,false);
      this.document.refreshGrid();
      task.summary=(task.stopReason?"图片下载已中止":"图片下载已结束")+
        `：成功 ${task.succeeded}，失败 ${task.failed}，未处理 ${task.total-task.processed}`+
        (task.stopReason?`；${task.stopReason}`:"");
      this.busy=false;this.onUpdate();
    }
  }
}
