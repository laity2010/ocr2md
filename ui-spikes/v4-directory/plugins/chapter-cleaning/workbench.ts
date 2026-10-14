/** V3 Mac Vault workbench. Only published chapters/*.md can be edited in
 * CodeMirror; AG Grid is the read-only, synchronously derived outline.
 * Other files remain read-only; chapter saves use guarded CAS replacement.
 */
import type { WorkspaceMountRegistry, WorkspaceFSV3, WorkspaceNode } from "../../../../src/workspaceFsV3";
import {MacVaultHttpFS} from "../../../../src/v3HttpWorkspaceFs";
import { location, WorkspaceV3Error } from "../../../../src/workspaceFsV3";
import { sha256 } from "../../../../src/mineruMappingSidecar";
import { sidecarMdDocuments } from "../../../../src/pdfMdBidirectional";
import type { PdfMdMappingSidecarV1 } from "../../../../src/mineruMappingSidecar";
import { loadPdfMdSidecar } from "../../../../src/mineruMappingSidecarStore";
import {scanTextBlocks} from "../../../../src/textBlocks";
import type {CleaningModuleId} from "./modules/contracts";
import type {ChapterDocumentPort,ChapterGridView} from "./modules/contracts";
import {cleaningModule} from "./modules/registry";
import { CalibrationGrid } from "../../../v2/src/calibrationGrid";
import { WorkingEditor } from "../../../v2/src/workingEditor";
import type {AgSourcePair} from "./agSourcePair";
import { BasicMarkdownPreview } from "../../../v2/src/basicMarkdownPreview";
import {MdScrollSync} from "./mdScrollSync";
import {renderFencedHtmlTablesInPreview} from "./fencedHtmlTablePreview";
import {renderFencedMathInPreview} from "./fencedMathPreview";
import {normalizeMineruChapter,type ChapterNormalization} from "../../../../src/normalizeMineruChapter";
import {chapterHeadingBlockId} from "./chapterHeadingAnchor";
import {headingLineHeight} from "./workbenchPresentation";
import type {DirectorySettings} from "./settings";

export type WorkbenchPhase = "idle" | "loading-directory" | "ready" | "loading-file" | "stale" | "error";
export interface WorkbenchView {
  phase: WorkbenchPhase;
  folder: string;
  file?: WorkspaceNode;
  files: readonly WorkspaceNode[];
  pdfs: readonly WorkspaceNode[];
  jsons: readonly WorkspaceNode[];
  truncated: boolean;
  error?: string;
}
export class V3Workbench implements ChapterDocumentPort {
  private fs?: WorkspaceFSV3;
  private token = 0;
  private topLevelFiles:WorkspaceNode[]=[];
  private mappedDocs=new Map<string,string>();
  private currentDocumentText="";
  private chapterFiles=new Map<string,WorkspaceNode>();
  private chapterMode=false;
  private cleaningModule:CleaningModuleId="章节标题";
  private readonly chapterGridViews=new Map<CleaningModuleId,ChapterGridView>();
  private titleNumbers=true;
  private chapterBase="";
  private undoSteps:string[]=[];
  private redoSteps:string[]=[];
  private savingChapter=false;
  private userSourceSelection=false;
  private lastHumanTextRange?:{path:string;sha256:string;from:number;to:number};
  private current: WorkbenchView = { phase:"idle",folder:"",files:[],pdfs:[],jsons:[],truncated:false };
  private readonly grid: CalibrationGrid;
  private readonly editor: WorkingEditor;
  private readonly preview: BasicMarkdownPreview;
  private readonly mdScrollSync:MdScrollSync;
  constructor(private readonly registry: WorkspaceMountRegistry,
    private readonly workspaceId: string,
    private readonly onState: (state: WorkbenchView)=>void,
    private readonly onSourcePosition:(path:string,from:number,to:number,origin:"row"|"cursor",blockId?:string)=>void,
    gridHost: HTMLElement, editorHost: HTMLElement, previewHost: HTMLElement,
    private readonly onChapterEdit:()=>void=()=>{},
    private readonly agSourcePair?:AgSourcePair) {
    this.editor = new WorkingEditor(editorHost,text=>this.chapterChanged(text),
      ()=>this.undoChapter(),()=>this.redoChapter(),undefined,undefined,undefined,
      undefined,false,true);
    this.editor.setEditable(false);
    this.preview = new BasicMarkdownPreview(previewHost);
    this.mdScrollSync=new MdScrollSync(this.editor,previewHost);
    this.grid = new CalibrationGrid(gridHost,()=>{},()=>{},()=>{}, (row,range)=>{
      // The AG table is navigation-only. Do not move the keyboard/caret into
      // CodeMirror: the user starts editing by touching the source pane.
      this.agSourcePair?.activateGridRow(()=>
        this.editor.revealRange(range??row.range,false),"inspect");
      if(!this.agSourcePair)this.editor.revealRange(range??row.range,false);
      const file=this.current.file;
      if(file){
        const isHeading=this.chapterMode&&row.typeLabel==="章节标题";
        if(isHeading)this.mdScrollSync.focusSourceLine(row.range.line+1);
        const blockId=isHeading?chapterHeadingBlockId(this.currentDocumentText,row.range.line):
          this.chapterMode?row.parentBlockId:undefined;
        const {from,to}=this.editor.selectionOffsets();
        this.onSourcePosition(file.path,from,to,"row",blockId);
      }
    });
    // CodeMirror handles caret positioning first; we report the actual state,
    // never derive UTF-16 positions from DOM spans or pixel coordinates.
    editorHost.addEventListener("mouseup",()=>{
      this.rememberHumanTextSelection();this.emitCursorPosition();
    });
    editorHost.addEventListener("touchend",()=>setTimeout(()=>{
      this.rememberHumanTextSelection();this.emitCursorPosition();
    },0));
    editorHost.addEventListener("keyup",()=>this.rememberHumanTextSelection());
    previewHost.addEventListener("click",event=>{
      const target=event.target;
      if(!(target instanceof Element)||!this.chapterMode)return;
      const heading=target.closest("h1[data-source-line],h2[data-source-line],h3[data-source-line],h4[data-source-line],h5[data-source-line],h6[data-source-line]");
      if(!heading||!previewHost.contains(heading))return;
      const line=Number((heading as HTMLElement).dataset.sourceLine);
      if(Number.isSafeInteger(line))this.activateHeadingLine(line-1);
    });
    this.grid.setContext([],"","文本块");
    this.preview.render("");
    this.editor.setDocument("");
  }
  private headingCandidates(){
    const path=this.current.file?.path;
    return this.chapterMode&&path&&this.chapterFiles.has(path)
      ?cleaningModule("章节标题").scan(this.currentDocumentText,path):[];
  }
  /** Stable block identity for media/formula AG rows, provided by the IR
   * marker preceding each exported element; no guessing from the OCR text. */
  cleaningElementAnchors():readonly string[]{
    const path=this.current.file?.path;
    return this.chapterMode&&path&&this.cleaningModule!=="章节标题"?
      [...new Set(cleaningModule(this.cleaningModule).scan(this.currentDocumentText,path)
        .flatMap(row=>row.parentBlockId?[row.parentBlockId]:[]))]:[];
  }
  activateCleaningBlock(blockId:string):boolean{
    if(!this.chapterMode||this.cleaningModule==="章节标题"||!this.current.file)return false;
    const row=cleaningModule(this.cleaningModule).scan(
      this.currentDocumentText,this.current.file.path).find(item=>item.parentBlockId===blockId);
    if(!row)return false;
    this.grid.revealRow(row.rowId??row.id);
    this.editor.revealRange(row.range,false);
    this.mdScrollSync.focusSourceLine(row.range.line+1);
    return true;
  }
  chapterHeadingAnchors():readonly string[]{
    return this.headingCandidates().flatMap(row=>{
      const id=chapterHeadingBlockId(this.currentDocumentText,row.range.line);
      return id?[id]:[];
    });
  }
  activateHeadingBlock(blockId:string):boolean{
    const heading=this.headingCandidates().find(row=>
      chapterHeadingBlockId(this.currentDocumentText,row.range.line)===blockId);
    return heading?this.activateHeadingLine(heading.range.line):false;
  }
  private activateHeadingLine(line:number):boolean{
    const row=this.headingCandidates().find(candidate=>candidate.range.line===line);
    const file=this.current.file;
    if(!row||!file)return false;
    this.grid.revealRow(row.rowId??row.id);
    this.editor.revealRange(row.range, false);
    this.mdScrollSync.focusSourceLine(line+1);
    const blockId=chapterHeadingBlockId(this.currentDocumentText,line);
    const {from,to}=this.editor.selectionOffsets();
    this.onSourcePosition(file.path,from,to,"row",blockId);
    return true;
  }
  private refreshChapterGrid():void{
    const path=this.current.file?.path??"";
    if(this.chapterMode&&this.current.file&&this.chapterFiles.has(path)){
      const scanned=cleaningModule(this.cleaningModule).scan(this.currentDocumentText,path);
      const rows=this.chapterGridViews.get(this.cleaningModule)?.project(scanned,path)??scanned;
      this.grid.setContext(rows,this.currentDocumentText,
        this.cleaningModule==='LaTeX'||this.cleaningModule==='表格'
          ?'文本块':this.cleaningModule,this.titleNumbers);
    }else{
      this.grid.setContext(scanTextBlocks(this.currentDocumentText,path),this.currentDocumentText,"文本块");
    }
  }
  setHeadingPresentation(presentation:DirectorySettings):void{
    this.grid.setChapterHierarchyView(level=>headingLineHeight(presentation,level));
    this.editor.setShowHardReturns(presentation.mdShowHardReturns);
    this.editor.setHardReturnColor(presentation.mdHardReturnColor);
  }
  setTitleNumbers(show:boolean):void{
    if(this.titleNumbers===show)return;
    this.titleNumbers=show;this.refreshChapterGrid();
  }
  titleNumbersEnabled():boolean{return this.titleNumbers;}
  /** Existing chapters may predate Obsidian-native publication.
   * Stage the conversion as one normal editable/undoable source transaction;
   * never re-publish the DIRjson over an already edited chapter. */
  chapterObsidianNormalization():ChapterNormalization|undefined{
    return this.chapterState().editing?normalizeMineruChapter(this.currentDocumentText):undefined;
  }
  normalizeCurrentChapter():ChapterNormalization{
    const state=this.chapterState();
    if(!state.editing||state.saving)throw Error("请先进入已发布章节的清洗工作台");
    const result=normalizeMineruChapter(this.currentDocumentText);
    if(result.changed){
      const old=this.currentDocumentText;
      this.editor.setDocumentPreservingCursor(result.text);
      // The editor's change handler normally records undo; the explicit
      // fallback covers composition controllers which suppress callbacks.
      if(this.currentDocumentText===old)this.chapterChanged(result.text);
    }
    return result;
  }
  setCleaningModule(module:CleaningModuleId):void{
    this.cleaningModule=module;
    const view=this.chapterGridViews.get(module);
    this.grid.setColumnExtensions(view?.columns??[],view?.afterColId,view?.columnOrder);
    this.refreshChapterGrid();
  }
  /** Workbench owns grid lifecycle; modules declare views and row projection. */
  registerChapterGridView(view:ChapterGridView):void{
    this.chapterGridViews.set(view.module,view);
    if(this.cleaningModule===view.module){
      this.grid.setColumnExtensions(view.columns,view.afterColId,view.columnOrder);
      this.refreshChapterGrid();
    }
  }
  refreshGrid():void{this.refreshChapterGrid();}
  chapter():ReturnType<ChapterDocumentPort["chapter"]>{
    const state=this.chapterState();
    return {book:this.current.folder,path:state.path,text:this.currentDocumentText,
      editing:state.editing,dirty:state.dirty,saving:state.saving};
  }
  private chapterChanged(text:string):void{
    if(!this.chapterMode||!this.current.file||this.savingChapter)return;
    const previous=this.currentDocumentText;
    if(text===previous)return;
    this.undoSteps.push(previous);
    if(this.undoSteps.length>40)this.undoSteps.shift();
    this.redoSteps=[];
    this.currentDocumentText=text;
    this.mdScrollSync.clearChapterFocus();
    this.refreshChapterGrid();
    this.preview.render(renderFencedMathInPreview(renderFencedHtmlTablesInPreview(text)));
    this.onChapterEdit();
  }
  chapterState():{editing:boolean;dirty:boolean;canUndo:boolean;canRedo:boolean;saving:boolean;path:string}{
    const editing=this.chapterMode&&!!this.current.file&&this.chapterFiles.has(this.current.file.path);
    return {editing,
      dirty:editing&&this.currentDocumentText!==this.chapterBase,
      canUndo:this.undoSteps.length>0,canRedo:this.redoSteps.length>0,
      saving:this.savingChapter,path:this.current.file?.path??""};
  }
  undoChapter():void{
    if(!this.chapterMode||!this.undoSteps.length||this.savingChapter)return;
    const previous=this.undoSteps.pop()!;
    this.redoSteps.push(this.currentDocumentText);
    this.currentDocumentText=previous;
    this.editor.setDocumentPreservingCursor(previous);
    this.refreshChapterPreview();
  }
  redoChapter():void{
    if(!this.chapterMode||!this.redoSteps.length||this.savingChapter)return;
    const next=this.redoSteps.pop()!;
    this.undoSteps.push(this.currentDocumentText);
    this.currentDocumentText=next;
    this.editor.setDocumentPreservingCursor(next);
    this.refreshChapterPreview();
  }
  private refreshChapterPreview():void{
    this.mdScrollSync.clearChapterFocus();
    this.refreshChapterGrid();
    this.preview.render(renderFencedMathInPreview(renderFencedHtmlTablesInPreview(this.currentDocumentText)));
    this.onChapterEdit();
  }
  async saveChapter(book:string):Promise<void>{
    const file=this.current.file;
    if(!this.chapterMode||!file||!this.chapterState().dirty||this.savingChapter)throw Error("没有需要保存的章节修改");
    if(!file.path.startsWith(book+"/chapters/")||!/\.md$/i.test(file.path))throw Error("章节不在当前书籍目录");
    const fs=await this.filesystem();
    if(!(fs instanceof MacVaultHttpFS))throw Error("章节保存需要 Mac Vault 授权");
    const text=this.currentDocumentText;
    const bytes=new TextEncoder().encode(text);
    if(bytes.length>512*1024)throw Error("章节超过 512KiB 安全保存上限");
    // Lock document transactions for the CAS window without toggling
    // contenteditable (important for iPad's native insertion caret).
    this.savingChapter=true;
    this.editor.setReadOnly(true);
    this.onChapterEdit();
    try{
      const saved=await fs.saveCleanedChapter(book,file.path.slice((book+"/chapters/").length),file,bytes);
      if(!saved.saved||saved.path!==file.path||saved.sha256!==sha256(bytes))throw Error("章节保存校验不一致");
      const after=await fs.stat(location(this.workspaceId,file.path));
      // Native coordinated replacement is atomic rename. Vault's current
      // inode-based nodeId necessarily changes; the trusted server returned
      // replacement identity is authoritative for the next CAS. Only verify
      // the new revision/path against that trusted response.
      if(after.path!==file.path||after.nodeId!==saved.file.nodeId||
         after.revision!==saved.file.revision)throw Error("章节保存后版本读回不一致");
      if(this.current.file?.path!==file.path||this.currentDocumentText!==text)
        throw Error("保存期间章节被切换或继续编辑，请检查版本");
      this.chapterFiles.set(file.path,after);
      this.current.files=this.current.files.map(entry=>entry.path===file.path?after:entry);
      this.chapterBase=text;
      this.update({file:after});
    }finally{
      this.savingChapter=false;
      this.editor.setReadOnly(false);
      this.onChapterEdit();
    }
  }
  /** Shared read-only CAS verification; does not make any writes and is not
   * permitted to adopt another writer's changed Markdown. */
  async revalidateUnchanged(book:string,chapterPath:string):Promise<boolean>{
    const state=this.chapterState();
    if(!state.editing||state.saving||state.dirty||state.path!==chapterPath||
       this.current.folder!==book||!chapterPath.startsWith(book+"/chapters/"))
      return false;
    const fs=await this.filesystem();
    const latest=await fs.stat(location(this.workspaceId,chapterPath));
    if(latest.kind!=="file"||latest.size<=0||latest.size>512*1024)return false;
    const chunks:Uint8Array[]=[];
    let offset=0;
    while(offset<latest.size){
      const response=await fs.readRange(latest,{
        offset,length:Math.min(128*1024,latest.size-offset),
        expectedRevision:latest.revision,
      });
      if(response.revision!==latest.revision||response.totalBytes!==latest.size||
         !response.bytes.length||offset+response.bytes.length>latest.size)return false;
      chunks.push(response.bytes);offset+=response.bytes.length;
    }
    const content=new Uint8Array(latest.size);
    offset=0;for(const chunk of chunks){content.set(chunk,offset);offset+=chunk.length;}
    const after=await fs.stat(location(this.workspaceId,chapterPath));
    if(after.nodeId!==latest.nodeId||after.revision!==latest.revision||
       sha256(content)!==sha256(new TextEncoder().encode(this.currentDocumentText))||
       this.chapterState().dirty||this.chapterState().path!==chapterPath)return false;
    this.chapterFiles.set(chapterPath,after);
    this.current.files=this.current.files.map(item=>item.path===chapterPath?after:item);
    this.update({file:after});
    return true;
  }
  /** Generic verified chapter transaction. Module supplies server operation;
   * the host owns editor locking, CAS readback and adopting changed document. */
  async transaction<T>(book:string,execute:(fs:WorkspaceFSV3,current:WorkspaceNode)=>
    Promise<{saved:true;path:string;file:WorkspaceNode;workingText:string;
      sha256:string;result:T}>):Promise<T>{
    const current=this.current.file;
    if(!current||!this.chapterState().editing||this.chapterState().dirty||this.savingChapter)
      throw Error("请先保存章节草稿，再执行章节操作");
    if(!current.path.startsWith(book+"/chapters/"))throw Error("当前章节不属于所选书籍");
    const fs=await this.filesystem();
    const previous=this.currentDocumentText;
    this.savingChapter=true;
    this.editor.setReadOnly(true);
    this.onChapterEdit();
    try{
      const response=await execute(fs,current);
      if(!response.saved||response.path!==current.path||
         sha256(new TextEncoder().encode(response.workingText))!==response.sha256)
        throw Error("章节操作返回的 Markdown 校验失败");
      const after=await fs.stat(location(this.workspaceId,current.path));
      if(after.nodeId!==response.file.nodeId||after.revision!==response.file.revision)
        throw Error("章节操作后文件版本不一致");
      if(this.current.file?.path!==current.path||this.currentDocumentText!==previous||
         this.current.folder!==book)throw Error("章节操作期间已切换章节");
      this.chapterFiles.set(current.path,after);
      this.current.files=this.current.files.map(e=>e.path===current.path?after:e);
      this.currentDocumentText=response.workingText;
      this.chapterBase=response.workingText;
      this.undoSteps=[];this.redoSteps=[];
      this.editor.setDocumentPreservingCursor(response.workingText);
      this.refreshChapterPreview();
      this.update({file:after});
      return response.result;
    }finally{
      this.savingChapter=false;
      this.editor.setReadOnly(false);
      this.onChapterEdit();
    }
  }
  setChapterMode(enabled:boolean):void{
    this.chapterMode=enabled;
    this.editor.setEditable(enabled&&!!this.current.file&&this.chapterFiles.has(this.current.file.path));
    this.refreshChapterGrid();
    this.onChapterEdit();
  }
  setChapterFiles(files:WorkspaceNode[]):void{
    this.chapterFiles=new Map(files.filter(f=>f.kind==="file"&&/\.md$/i.test(f.path)).map(f=>[f.path,f]));
    const combined=[...this.topLevelFiles,...this.chapterFiles.values()];
    combined.sort((a,b)=>a.path.localeCompare(b.path,"zh-CN"));
    this.update({files:combined});
  }
  private emitCursorPosition():void {
    const file=this.current.file;
    if(!file||this.current.phase!=="ready")return;
    const {from,to}=this.editor.selectionOffsets();
    const line=this.currentDocumentText.slice(0,from).split("\n").length-1;
    const row=this.headingCandidates().find(candidate=>candidate.range.line===line);
    const blockId=row?chapterHeadingBlockId(this.currentDocumentText,line):undefined;
    if(row){
      // Source is the only editing surface. Updating the AG cursor must NOT
      // call setFocusedCell: that would steal focus on CodeMirror mouseup and
      // make normal source typing appear broken (particularly in Safari).
      this.grid.revealRow(row.rowId??row.id,false);
      this.mdScrollSync.focusSourceLine(line+1);
    }
    this.onSourcePosition(file.path,from,to,"cursor",blockId);
  }
  private rememberHumanTextSelection():void{
    const file=this.current.file;
    if(!file||this.current.phase!=="ready"||this.current.truncated){
      this.lastHumanTextRange=undefined;return;
    }
    const sha256=this.mappedDocs.get(file.path);
    const range=this.editor.nativeSelectionOffsets();
    this.lastHumanTextRange=sha256 && range && range.to<=this.currentDocumentText.length
      ?{path:file.path,sha256,from:range.from,to:range.to}:undefined;
  }
  mappedSha(path:string):string|undefined{return this.mappedDocs.get(path);}
  async reviewFilesystem():Promise<WorkspaceFSV3>{return this.filesystem();}
  /** Provenance of an actual completely loaded source selection. */
  reviewSelection():{path:string;sha256:string;from:number;to:number}|undefined{
    const file=this.current.file;
    if(!file||this.current.phase!=="ready"||this.current.truncated)return undefined;
    const sha256=this.mappedDocs.get(file.path);
    if(!sha256)return undefined;
    const prior=this.lastHumanTextRange;
    if(!prior||prior.path!==file.path||prior.sha256!==sha256||
      prior.from<0||prior.to<=prior.from||prior.to>this.currentDocumentText.length)
      return undefined;
    // A click on a toolbar or expanding <details> can collapse DOM Selection.
    // Only the last *actual user text selection* survives that blur, never the
    // programmatic WP6 revealOffsets or a selection from another document.
    return {...prior};
  }

  /** Only a successfully verified Sidecar can add nested Markdown documents. */
  setMappedDocuments(map?:PdfMdMappingSidecarV1):void{
    this.mappedDocs.clear();
    const root=this.current.folder;
    if(map){
      if(map.workspaceId!==this.workspaceId||!root||!map.pdf.path.startsWith(root+"/"))
        throw new WorkspaceV3Error("EACCES","Mapping belongs to another book/workspace");
      for(const doc of sidecarMdDocuments(map)){
        if(!doc.path.startsWith(root+"/"))throw new WorkspaceV3Error("EACCES","Mapping document outside book");
        this.mappedDocs.set(doc.path,doc.sha256);
      }
    }
    const files=[...this.topLevelFiles,...this.chapterFiles.values()];
    const entries=new Set(files.map(f=>f.path));
    // The mapping's nested chapter document paths are exposed in the select,
    // but their contents are not fetched until the user navigates to them.
    for(const path of this.mappedDocs.keys()){
      if(!entries.has(path))files.push({workspaceId:this.workspaceId,path,nodeId:"mapped:"+path,kind:"file",revision:"unloaded",size:0});
    }
    files.sort((a,b)=>a.path.localeCompare(b.path,"zh-CN"));
    this.update({files});
  }
  revealOffsets(from:number,to:number):void{
    this.userSourceSelection=false;this.lastHumanTextRange=undefined;
    this.editor.revealOffsets(from,to,false);
  }
  snapshot(): WorkbenchView {return {...this.current,files:[...this.current.files],pdfs:[...this.current.pdfs],jsons:[...this.current.jsons]};}
  private update(next: Partial<WorkbenchView>): void {
    this.current={...this.current,...next};this.onState(this.snapshot());
  }
  async loadMapping(folder:string){
    if(folder!==this.current.folder||this.current.phase==="loading-directory")
      throw Error("所选书目录已切换");
    return loadPdfMdSidecar(await this.filesystem(),folder);
  }
  async pdfSource(path:string):Promise<{fs:WorkspaceFSV3;file:WorkspaceNode}> {
    const file=this.current.pdfs.find(node=>node.path===path);
    if(!file)throw Error("PDF 不属于当前工作目录");
    return {fs:await this.filesystem(),file};
  }
  private async filesystem(): Promise<WorkspaceFSV3> {
    return this.fs ?? (this.fs=await this.registry.open(this.workspaceId));
  }
  async openFolder(path: string): Promise<void> {
    const token=++this.token;
    this.mappedDocs.clear();this.topLevelFiles=[];this.chapterFiles.clear();
    this.chapterMode=false;this.chapterBase="";this.undoSteps=[];this.redoSteps=[];
    this.currentDocumentText="";this.editor.setEditable(false);
    this.mdScrollSync.clearChapterFocus();
    this.userSourceSelection=false;this.lastHumanTextRange=undefined;
    this.update({phase:"loading-directory",folder:path,file:undefined,files:[],pdfs:[],jsons:[],error:undefined,truncated:false});
    this.editor.setDocument("");this.preview.render("");this.grid.setContext([],"","文本块");
    try {
      const fs=await this.filesystem();
      const node=await fs.stat(location(this.workspaceId,path));
      if(node.kind!=="directory") throw Error("工作目录必须是文件夹");
      let cursor:string|undefined;
      const files:WorkspaceNode[]=[];
      const pdfs:WorkspaceNode[]=[];
      const jsons:WorkspaceNode[]=[];
      let capped=false;
      do {
        const page=await fs.list(location(this.workspaceId,path),cursor);
        for(const item of page.entries) {
          if(item.kind!=="file")continue;
          if(/\.md$/i.test(item.path))files.push(item);
          else if(/\.pdf$/i.test(item.path))pdfs.push(item);
          else if(/\.json$/i.test(item.path))jsons.push(item);
        }
        cursor=page.nextCursor;
        if(files.length+pdfs.length+jsons.length>=800){capped=true;break;}
      }while(cursor);
      if(token!==this.token)return;
      for(const list of [files,pdfs,jsons])list.sort((a,b)=>a.path.localeCompare(b.path,"zh-CN"));
      // Prefer an explicitly named original PDF, never silently merge PDFs.
      pdfs.sort((a,b)=>Number(/原文|原始|original|source/i.test(b.path))-Number(/原文|原始|original|source/i.test(a.path)) || a.path.localeCompare(b.path,"zh-CN"));
      this.topLevelFiles=[...files];
      this.update({phase:"ready",files,pdfs,jsons,truncated:capped||Boolean(cursor),error:undefined});
    }catch(e){if(token===this.token)this.update({phase:"error",error:String(e)});throw e;}
  }
  async openFile(path:string): Promise<void> {
    const mappedHash=this.mappedDocs.get(path);
    const selected=this.current.files.find(v=>v.path===path);
    const isChapter=this.chapterFiles.has(path);
    if(!selected||(!mappedHash&&!isChapter&&!this.topLevelFiles.some(f=>f.path===path)))
      throw Error("文件不属于当前工作目录或未获得映射授权");
    const token=++this.token;
    this.userSourceSelection=false;this.lastHumanTextRange=undefined;
    this.update({phase:"loading-file",file:undefined,error:undefined});
    try {
      const fs=await this.filesystem();
      const node=await fs.stat(location(this.workspaceId,path));
      if(node.kind!=="file")throw new WorkspaceV3Error("EISDIR","Markdown target is not a file");
      if(!mappedHash && (node.nodeId!==selected.nodeId||node.revision!==selected.revision))
        throw new WorkspaceV3Error("ESTALE","文件已由 Obsidian/iCloud 修改，请刷新工作目录");
      if(mappedHash && node.size>4*1024*1024)
        throw new WorkspaceV3Error("EQUOTA","Mapped Markdown exceeds navigation size limit");
      if(isChapter&&node.size>512*1024)throw new WorkspaceV3Error("EQUOTA","章节文件超过安全清洗大小");
      const limit=(mappedHash||isChapter)?node.size:Math.min(node.size,256*1024);
      const chunks:Uint8Array[]=[];
      let offset=0;
      while(offset<limit){
        const result=await fs.readRange(node,{offset,
          length:Math.min(64*1024,limit-offset),expectedRevision:node.revision});
        if(result.revision!==node.revision||result.totalBytes!==node.size||!result.bytes.length)
          throw new WorkspaceV3Error("ESTALE","Markdown changed during read");
        chunks.push(result.bytes);offset+=result.bytes.byteLength;
      }
      if(token!==this.token)return;
      const after=await fs.stat(location(this.workspaceId,path));
      if(after.nodeId!==node.nodeId||after.revision!==node.revision||after.size!==node.size)
        throw new WorkspaceV3Error("ESTALE","Markdown changed during read");
      const bytes=new Uint8Array(offset);let at=0;
      for(const chunk of chunks){bytes.set(chunk,at);at+=chunk.length;}
      if(mappedHash && sha256(bytes)!==mappedHash)
        throw new WorkspaceV3Error("ESTALE","Markdown bytes differ from Sidecar anchor hash");
      const text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);
      if(text.includes("\u0000"))throw Error("文件包含二进制数据，不能作为 Markdown 预览");
      this.currentDocumentText=text;
      this.mdScrollSync.clearChapterFocus();
      this.chapterBase=text;
      this.undoSteps=[];this.redoSteps=[];
      this.editor.setDocument(text);
      this.editor.setEditable(isChapter&&this.chapterMode);
      this.preview.render(renderFencedMathInPreview(renderFencedHtmlTablesInPreview(text)));
      this.update({phase:"ready",file:node,truncated:offset<node.size,error:undefined});
      this.refreshChapterGrid();
      this.onChapterEdit();
    }catch(e){if(token===this.token)this.update({phase:e instanceof WorkspaceV3Error&&e.code==="ESTALE"?"stale":"error",file:undefined,error:String(e)});throw e;}
  }
  async refresh():Promise<void>{
    const folder=this.current.folder;
    if(!folder)return;
    const was=this.current.file?.path;
    await this.openFolder(folder);
    if(was&&this.current.files.some(f=>f.path===was))await this.openFile(was);
  }
}
