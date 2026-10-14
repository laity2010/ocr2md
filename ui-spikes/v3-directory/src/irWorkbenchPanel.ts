/** IR-WP5 browser workbench: real authenticated OCR/PDF -> IR -> AG rows.
 * All edits remain in memory; exports are explicit local downloads, never Vault writes.
 */
import {createGrid,type GridApi,type ColDef,type RowClickedEvent,
  type ICellRendererComp,type ICellRendererParams} from "../../v2/node_modules/ag-grid-community";
import {calibrationTheme} from "../../v2/src/calibrationTheme";
import {EnumCheckboxFilter} from "../../v2/src/tableConfigurationGrid";
import {WorkingEditor} from "../../v2/src/workingEditor";
import type {AgSourcePair} from "./agSourcePair";
import {createHash} from "crypto";
import {applyDirSourceChange} from "../../../src/dirSourceEditing";
import type {DirectorySettings} from "./settings";
import {headingLineHeight,renderedHeadingLevel} from "./workbenchPresentation";
import {MacVaultHttpFS} from "../../../src/v3HttpWorkspaceFs";
import {BasicMarkdownPreview} from "../../v2/src/basicMarkdownPreview";
import {MdScrollSync} from "./mdScrollSync";
import {buildIrMarkdownArchive} from "../../../src/documentIrArchive";
import {generateIrMarkdownBundle,generateIrWholeBookMarkdown,
  isIrChapterDelimitationConfirmed,isIrChapterFileLayoutReady,
  DIR_WHOLE_BOOK_ID,irMarkdownSourceAtOffset,
  type IrMarkdownBundleV1,type IrMarkdownChapterFile} from "../../../src/documentIrMarkdown";
import {location,type WorkspaceFSV3,type WorkspaceNode} from "../../../src/workspaceFsV3";
import {importMineruDocumentIrFromBytes} from "../../../src/documentIrImport";
import {proposeIrReconstruction,explicitReplaceBlockText,
  explicitSplitBlockAtUtf16,explicitMergeAdjacentTextBlocks,explicitReorderBlocks} from "../../../src/documentIrReconstruction";
import {proposeIrChapters,listIrChapterTree,explicitMoveChapterBoundary,
  explicitClassifyOcrHeading,insertManualPdfHeading,deleteManualPdfHeading,v2IrChapterHeadings,v2IrAssignSequence,
  v2IrSetStandalone,v2IrSetChapterFile} from "../../../src/documentIrChapters";
import {chapterFileParts} from "../../../src/chapterFileAssign";
import {encodeDocumentIrV1,validateDocumentIrV1,
  type DocumentIrV1,type IrLogicalBlock} from "../../../src/documentIrV1";
import type {MappingPdfRegion} from "../../../src/mineruMappingSidecar";

const MAX_OCR=30*1024*1024,MAX_PDF=128*1024*1024;
const $=<T extends HTMLElement>(id:string):T=>{
  const value=document.getElementById(id);
  if(!value)throw Error("Missing IR control "+id);
  return value as T;
};
async function readVerified(fs:WorkspaceFSV3,node:WorkspaceNode,max:number):Promise<Uint8Array>{
  if(node.kind!=="file"||!Number.isSafeInteger(node.size)||node.size<=0||node.size>max)
    throw Error("IR 来源文件大小超出此阶段的安全读取限制："+node.path);
  const data=new Uint8Array(node.size);
  for(let pos=0;pos<node.size;){
    const chunk=await fs.readRange(node,{offset:pos,length:Math.min(256*1024,node.size-pos),expectedRevision:node.revision});
    if(chunk.revision!==node.revision||chunk.totalBytes!==node.size||chunk.bytes.length===0||
       pos+chunk.bytes.length>node.size)throw Error("IR 来源读取版本变化或不完整");
    data.set(chunk.bytes,pos);pos+=chunk.bytes.length;
  }
  const after=await fs.stat(location(fs.workspaceId,node.path));
  if(after.nodeId!==node.nodeId||after.revision!==node.revision||after.size!==node.size)
    throw Error("IR 来源在读取期间已变化，请刷新目录");
  return data;
}
async function scanOcrJson(fs:WorkspaceFSV3,folder:string):Promise<WorkspaceNode[]>{
  // Only within chosen authorized book; never scan arbitrary disk paths or hidden folders.
  const directories=[folder+"/json",folder];
  const found:WorkspaceNode[]=[];
  for(const directory of directories){
    let cursor:string|undefined;
    try{
      do {
        const response=await fs.list(location(fs.workspaceId,directory),cursor);
        found.push(...response.entries.filter(n=>n.kind==="file"&&/\.json$/iu.test(n.path)&&
          (directory!==folder||/MinerU/i.test(n.path))));
        cursor=response.nextCursor;
        if(found.length>40)throw Error("OCR 文件太多，请先整理工作目录");
      }while(cursor);
    }catch(error){if(directory!==folder)continue;throw error;}
  }
  return [...new Map(found.map(n=>[n.path,n])).values()];
}
export interface IrRow {id:string;order:number;page:string;chapter:string;type:string;
  text:string;audit:string;proposals:string;block:IrLogicalBlock;
  decision?:string;fileName?:string;ocrLevel?:string;headingLevel?:number|null;
  boundaryEligible?:boolean;standalone?:boolean;boundaryFirst?:boolean;}
export class IrWorkbenchPanel {
  private grid:GridApi<IrRow>;
  private presentation:DirectorySettings;
  private readonly editor:WorkingEditor;
  private readonly markdownPreview:BasicMarkdownPreview;
  private readonly previewHost=$<HTMLElement>("ir-markdown-preview");
  private readonly mdScrollSync:MdScrollSync;
  private bundle?:IrMarkdownBundleV1;
  private activeMd?:IrMarkdownChapterFile;
  private wholeBook?:IrMarkdownChapterFile;
  private readonly mdFile=$<HTMLSelectElement>("ir-md-file");
  private readonly exportMdButton=$<HTMLButtonElement>("ir-export-md");
  private readonly exportZipButton=$<HTMLButtonElement>("ir-export-zip");
  private fs?:WorkspaceFSV3;
  private folder="";
  private pdf?:WorkspaceNode;
  private ocr?:{path:string};
  private sourceEpoch=0;
  private doc?:DocumentIrV1;
  private baselineHash="";
  private generation:string|null=null;
  private persistenceReady=false;
  private readonly saveButton=$<HTMLButtonElement>("ir-save");
  private readonly publishButton=$<HTMLButtonElement>("ir-publish-chapters");
  private readonly undoButton=$<HTMLButtonElement>("ir-undo");
  private readonly redoButton=$<HTMLButtonElement>("ir-redo");
  private selectedId="";
  private filterChapter="";
  private dirty=false;
  private busy=false;
  private rows:IrRow[]=[];
  readonly status=$<HTMLElement>("ir-status");
  private readonly chapterTree=$<HTMLElement>("ir-chapter-tree");
  private readonly chapterFilter=$<HTMLSelectElement>("ir-chapter-filter");
  private readonly onlyH1=$<HTMLInputElement>("ir-only-h1");
  private readonly ocrSelect=$<HTMLSelectElement>("ir-ocr-select");
  private readonly editArea=$<HTMLTextAreaElement>("ir-edit-text");
  private readonly editOffset=$<HTMLInputElement>("ir-split-offset");
  private readonly reason=$<HTMLInputElement>("ir-edit-reason");
  private readonly exportButton=$<HTMLButtonElement>("ir-export");
  private readonly changeButtons=["ir-apply-text","ir-split","ir-merge","ir-move-up","ir-move-down","ir-boundary"];
  private stage:"chapters"|"blocks"="blocks";
  private sourcePending=false;
  // A short-lived, syntactically incomplete iOS edit must remain in CodeMirror
  // until the reviewer fixes or explicitly undoes it. Never undo keystrokes
  // behind Safari's native selection and move the caret to document start.
  private sourceInvalid=false;
  private editorEditable=false;
  private sourceTimer:ReturnType<typeof setTimeout>|undefined;
  private undoDocs:DocumentIrV1[]=[];
  private redoDocs:DocumentIrV1[]=[];
  private saveSourceCaret?:{anchor:number;head:number;scrollTop:number};
  private headingCell:(params:{data?:IrRow;value?:unknown})=>HTMLElement;
  private standaloneCell:new()=>ICellRendererComp<IrRow>;
  private chapterFileCell:(params:{data?:IrRow})=>HTMLElement;
  private readonly v2Start=$<HTMLInputElement>("ir-v2-sequence-start");
  private readonly v2Sequence=$<HTMLButtonElement>("ir-v2-sequence");
  private readonly lineMenu=$<HTMLElement>("ir-line-actions");
  private readonly lineForm=$<HTMLFormElement>("ir-line-title-form");
  private lineAfterBlockId="";
  private readonly chapterRole=$<HTMLSelectElement>("ir-chapter-role");
  private readonly chapterName=$<HTMLInputElement>("ir-chapter-file-name");
  private readonly chapterReason=$<HTMLInputElement>("ir-chapter-reason");
  private readonly chapterApply=$<HTMLButtonElement>("ir-chapter-apply");
  constructor(host:HTMLElement,sourceHost:HTMLElement,
    private readonly onLocate:(regions:readonly MappingPdfRegion[],blockId:string)=>Promise<void>,
    presentation:DirectorySettings,
    private readonly onLocateManualPage?:(page:number)=>Promise<void>,
    private readonly agSourcePair?:AgSourcePair){
    this.presentation=presentation;
    this.editor=new WorkingEditor(sourceHost,text=>this.onSourceChanged(text),
      ()=>this.undoSource(),()=>this.redoSource(),undefined,undefined,undefined,
      (line,position)=>this.openLineMenu(line,position),true,true);
    this.editor.setEditable(false);this.editor.setShowHardReturns(presentation.mdShowHardReturns);
    this.editor.setHardReturnColor(presentation.mdHardReturnColor);
    this.editor.setDocument("IR 尚未从 OCR JSON 生成章节 Markdown。");
    this.markdownPreview=new BasicMarkdownPreview($("ir-markdown-preview"));
    this.mdScrollSync=new MdScrollSync(this.editor,$("ir-markdown-preview"));
    $("ir-line-add-title").addEventListener("click",()=>{
      this.lineForm.hidden=false;
      $("ir-line-add-title").hidden=true;
      $<HTMLInputElement>("ir-line-title-text").focus();
    });
    $("ir-line-title-cancel").addEventListener("click",()=>this.closeLineMenu());
    $("ir-line-delete-title").addEventListener("click",()=>{
      this.perform(()=>this.deleteManualTitle());
    });
    this.lineForm.addEventListener("submit",event=>{
      event.preventDefault();
      this.perform(()=>this.commitManualTitle());
    });
    document.addEventListener("pointerdown",event=>{
      if(!this.lineMenu.hidden&&event.target instanceof Node&&
         !this.lineMenu.contains(event.target)&&
         !(event.target instanceof Element&&event.target.closest('#workbench-ir-source .cm-gutters')))
        this.closeLineMenu();
    });
    sourceHost.addEventListener("mouseup",(event:MouseEvent)=>{
      const native=this.editor.nativeCaretOffset();
      const hit=this.editor.offsetAtClientPoint(event.clientX,event.clientY);
      // CodeMirror read-only selection may lag one mouseup (Mac/iPad). When
      // a rendered source *line* uniquely names a block, navigate by its
      // exact IR Markdown content, not by stale DOM selection. Duplicates
      // always fall back to normal offset-based disambiguation.
      if(!this.sourcePending&&this.activeMd&&this.doc){
        const line=(event.target instanceof Element?event.target.closest('.cm-line'):null);
        const literal=line?.textContent?.replace(/↵$/u,'');
        if(literal?.trim()){
          const matches=this.activeMd.ranges.filter(r=>
            this.activeMd!.content.slice(r.contentFrom,r.contentTo).split('\n').includes(literal));
          if(matches.length===1){
            const row=this.rows.find(r=>r.id===matches[0].blockId);
            if(row&&row.id!==this.selectedId){this.select(row,true);return;}
          }
        }
      }
      this.fromMdCursor(hit??native);
    });
    sourceHost.addEventListener("keyup",()=>this.fromMdCursor());
    sourceHost.addEventListener("touchend",event=>{
      const touch=event.changedTouches[0];
      if(touch)this.fromMdCursor(this.editor.nativeCaretOffset()??
        this.editor.offsetAtClientPoint(touch.clientX,touch.clientY));
    });
    this.mdFile.addEventListener("change",()=>{
      if(!this.flushSource())return;
      this.showMarkdown(this.mdFile.value);
    });
    this.exportMdButton.addEventListener("click",()=>this.downloadCurrentMarkdown());
    this.exportZipButton.addEventListener("click",()=>this.downloadBundle());
    const titleCell=(params:{data?:IrRow;value?:unknown}):HTMLElement=>{
      const span=document.createElement("span");
      span.className="v3-heading-cell";
      const level=params.data?.headingLevel;
      if(level)span.dataset.headingLevel=String(level);
      const source=String(params.value??"");
      span.textContent=level?"#".repeat(level)+" "+source:source;
      return span;
    };
    this.headingCell=titleCell;
    // AG Grid reuses this renderer on refresh rather than disposing an active
    // checkbox on every DIRjson rebuild. This is important for iPad taps:
    // a destroyed cell between touchstart and click appears unresponsive.
    const panel=this;
    class StandaloneCellRenderer implements ICellRendererComp<IrRow> {
      private readonly root=document.createElement("label");
      private readonly input=document.createElement("input");
      private readonly lock=document.createElement("span");
      private rowId="";
      init(params:ICellRendererParams<IrRow>):void{
        this.root.className="chapter-standalone-cell";
        this.input.type="checkbox";
        this.input.className="chapter-standalone-input";
        this.input.dataset.testid="ir-v2-standalone";
        this.lock.className="chapter-standalone-lock";
        this.lock.textContent="🔒";
        this.lock.setAttribute("aria-hidden","true");
        this.root.append(this.input,this.lock);
        // A tap on the checkbox must not activate AG row selection, which in
        // turn redraws all cells and swallows the subsequent iOS click.
        for(const event of ["pointerdown","touchstart","mousedown","click","dblclick"])
          this.root.addEventListener(event,e=>e.stopPropagation());
        this.input.addEventListener("keydown",e=>e.stopPropagation());
        this.input.addEventListener("change",()=>{
          const doc=panel.doc;
          const row=panel.rows.find(r=>r.id===this.rowId);
          if(!doc||!row||panel.busy||panel.stage!=="chapters"||
            (row.boundaryFirst&&!this.input.checked)){
            this.input.checked=Boolean(row?.standalone);
            return;
          }
          const selected=this.input.checked;
          panel.perform(()=>panel.apply(v2IrSetStandalone(doc,this.rowId,selected),
            selected?"独立开启章节文件，编号已更新":
              "并入前一个勾选标题的章节文件，原 Markdown 标题等级不变",true));
          // On a rejected operation, restore the source-of-truth state.
          if(panel.doc===doc)this.input.checked=Boolean(row.standalone);
        });
        this.refresh(params);
      }
      getGui():HTMLElement{return this.root;}
      refresh(params:ICellRendererParams<IrRow>):boolean{
        const row=params.data;
        if(!row){this.root.hidden=true;return true;}
        this.root.hidden=false;
        this.rowId=row.id;
        this.input.dataset.blockId=row.id;
        this.input.checked=Boolean(row.standalone);
        const first=Boolean(row.boundaryFirst);
        this.input.disabled=panel.busy||first;
        this.input.setAttribute("aria-label",first?
          "独立成章：第一个标题必须开启文件，不能取消":
          "独立成章：勾选开启新章节文件，取消则并入上一个已勾选的文件");
        this.input.title=first?
          "首个标题是文件起点，没有前一个文件可合并":
          "只调整章节文件分组，不改变 Markdown 标题层级";
        this.root.title=this.input.title;
        this.root.dataset.fileCutLocked=String(first);
        this.lock.hidden=!first;
        return true;
      }
    }
    this.standaloneCell=StandaloneCellRenderer;
    this.chapterFileCell=(params:{data?:IrRow}):HTMLElement=>{
      const row=params.data,span=document.createElement("span");
      if(!row?.boundaryEligible){span.textContent="—";return span;}
      const input=document.createElement("input");
      input.type="text";input.className="chapter-file-input";
      input.dataset.testid="ir-v2-chapter-file";input.dataset.blockId=row.id;
      input.setAttribute("aria-label","章节文件");input.spellcheck=false;
      input.value=row.fileName??"";
      input.disabled=this.busy||!row.standalone;
      input.addEventListener("click",e=>e.stopPropagation());
      input.addEventListener("keydown",e=>e.stopPropagation());
      input.addEventListener("change",()=>{
        if(!this.doc)return;
        const doc=this.doc;
        const value=input.value.trim();
        if(value===row.fileName)return;
        this.perform(()=>this.apply(v2IrSetChapterFile(doc,row.id,value),
          "章节文件名已暂存，原 Markdown 标题等级不变",true));
        if(this.doc===doc)input.value=row.fileName??"";
      });
      span.append(input);return span;
    };
    const defs:ColDef<IrRow>[]=[
      {field:"page",headerName:"PDF 页",width:99,minWidth:85,pinned:"left",lockPinned:true,filter:EnumCheckboxFilter},
      {field:"audit",headerName:"审核",width:94,filter:EnumCheckboxFilter},
      {field:"chapter",headerName:"章节",minWidth:155,flex:1,filter:EnumCheckboxFilter},
      {field:"type",headerName:"类型",width:108,filter:EnumCheckboxFilter},
      {field:"proposals",headerName:"待核对",width:110,filter:EnumCheckboxFilter},
      {field:"text",headerName:"OCR 文本草稿",minWidth:240,flex:2,tooltipField:"text",cellRenderer:titleCell},
    ];
    this.grid=createGrid<IrRow>(host,{theme:calibrationTheme,rowData:[],columnDefs:defs,
      defaultColDef:{sortable:true,resizable:true,suppressMovable:true},
      suppressMovableColumns:true,animateRows:false,headerHeight:38,
      getRowHeight:p=>headingLineHeight(this.presentation,p.data?.headingLevel??0),
      getRowId:p=>p.data.id,
      isExternalFilterPresent:()=>this.stage==="chapters"&&this.onlyH1.checked,
      doesExternalFilterPass:node=>node.data?.headingLevel===1,
      onRowClicked:(event:RowClickedEvent<IrRow>)=>{
        if(event.data){
          const row=event.data;
          if(this.agSourcePair)this.agSourcePair.activateGridRow(()=>this.select(row),"inspect");
          else this.select(row);
        }
      }});
    this.chapterFilter.addEventListener("change",()=>{
      this.filterChapter=this.chapterFilter.value;this.rebuild();
    });
    this.onlyH1.addEventListener("change",()=>{
      // Display-only: AG's public external-filter API leaves the DIRjson,
      // all source rows and the CodeMirror caret completely untouched.
      this.grid.onFilterChanged();
    });
    this.ocrSelect.addEventListener("change",()=>{
      const chosen=this.ocrSelect.value,fs=this.fs,pdf=this.pdf,folder=this.folder;
      if(!chosen||!fs||!pdf||this.dirty)return;
      void this.open(fs,folder,pdf,chosen).catch(error=>{
        this.status.textContent="IR OCR 来源选择失败："+String(error);
      });
    });
    for(const [id,callback] of [
      ["ir-apply-text",()=>this.replaceText()],
      ["ir-split",()=>this.split()],
      ["ir-merge",()=>this.merge()],
      ["ir-move-up",()=>this.move(-1)],
      ["ir-move-down",()=>this.move(1)],
      ["ir-boundary",()=>this.changeBoundary()],
    ] as const)$(id).addEventListener("click",()=>this.perform(callback));
    this.chapterRole.addEventListener("change",()=>{
      this.chapterName.disabled=this.chapterRole.value!=="root";
    });
    this.chapterApply.addEventListener("click",()=>this.perform(()=>this.confirmChapter()));
    // One visible, self-committing start number; reuse the existing chapter
    // filename allocator and DIRjson undo history. Do NOT save to Vault here.
    const commitStart=()=>{
      if(!this.doc||this.busy||this.stage!=="chapters")return;
      const start=this.v2Start.value.trim();
      if(!/^\d{1,6}$/.test(start)){
        this.v2Start.setCustomValidity("起始序号须为 1–6 位数字");
        this.status.textContent="起始序号须为 1–6 位数字；未修改 DIRjson";
        this.v2Start.reportValidity();return;
      }
      this.v2Start.setCustomValidity("");
      if(!this.flushSource())return;
      this.perform(()=>this.apply(v2IrAssignSequence(this.doc!,start),
        `从 ${start} 起顺序编号已暂存 · 请检查章节文件名后保存`));
    };
    this.v2Start.addEventListener("input",()=>this.v2Start.setCustomValidity(""));
    this.v2Start.addEventListener("change",commitStart);
    this.v2Start.addEventListener("keydown",event=>{
      if(event.key==="Enter"){
        event.preventDefault();this.v2Start.blur();
      }
    });
    // Retain the hidden V2 button/handler for legacy IR tests/adapters.
    this.v2Sequence.addEventListener("click",()=>{
      if(!this.doc||this.busy||this.stage!=="chapters")return;
      if(!this.flushSource())return;
      this.perform(()=>this.apply(v2IrAssignSequence(this.doc!,this.v2Start.value.trim()),
        "V2 顺序编号已暂存"));
    });
    this.exportButton.addEventListener("click",()=>this.exportDraft());
    // Pointerdown still sees CodeMirror focused; the subsequent button click
    // and confirm dialog would otherwise discard the iOS native caret.
    this.saveButton.addEventListener("pointerdown",()=>{
      this.saveSourceCaret=this.editor.captureFocusedCaret();
    });
    this.saveButton.addEventListener("mousedown",event=>{
      if(this.saveSourceCaret)event.preventDefault();
    });
    this.saveButton.addEventListener("click",()=>{
      const caret=this.saveSourceCaret??this.editor.captureFocusedCaret();
      this.saveSourceCaret=undefined;
      void this.saveSnapshot(caret);
    });
    this.publishButton.addEventListener("click",()=>void this.publishChapters());
    this.undoButton.addEventListener("click",()=>this.undoSource());
    this.redoButton.addEventListener("click",()=>this.redoSource());
    this.reset();
  }
  updatePresentation(presentation:DirectorySettings):void{
    this.presentation=presentation;
    this.editor.setShowHardReturns(presentation.mdShowHardReturns);
    this.editor.setHardReturnColor(presentation.mdHardReturnColor);
    this.grid.resetRowHeights();
    this.grid.refreshCells({force:true});
  }
  setStage(stage:"chapters"|"blocks"):void{
    if(this.stage===stage)return;
    if(!this.flushSource())return;
    this.stage=stage;
    $("ir-heading-filters").hidden=stage!=="chapters";
    this.closeLineMenu();
    this.selectedId="";
    this.filterChapter="";
    this.grid.setGridOption("columnDefs",stage==="chapters"?[
      {field:"page",headerName:"PDF 页",width:92,pinned:"left",lockPinned:true,filter:EnumCheckboxFilter},
      {field:"ocrLevel",headerName:"OCR #",width:86,filter:EnumCheckboxFilter},
      {field:"text",headerName:"OCR 原文标题",minWidth:175,flex:2,tooltipField:"text",cellRenderer:this.headingCell},
      {field:"standalone",headerName:"独立成章",width:105,minWidth:94,
        cellRenderer:this.standaloneCell,sortable:false,filter:false},
      {field:"fileName",headerName:"章节文件",minWidth:185,flex:1,
        cellRenderer:this.chapterFileCell,tooltipField:"fileName",sortable:false},
      {field:"decision",headerName:"标题用途",minWidth:112,flex:1,filter:EnumCheckboxFilter},
      {field:"audit",headerName:"定界状态",width:102,filter:EnumCheckboxFilter},
    ]:[
      {field:"page",headerName:"PDF 页",width:99,minWidth:85,pinned:"left",lockPinned:true,filter:EnumCheckboxFilter},
      {field:"audit",headerName:"审核",width:94,filter:EnumCheckboxFilter},
      {field:"chapter",headerName:"章节",minWidth:155,flex:1,filter:EnumCheckboxFilter},
      {field:"type",headerName:"类型",width:108,filter:EnumCheckboxFilter},
      {field:"proposals",headerName:"待核对",width:110,filter:EnumCheckboxFilter},
      {field:"text",headerName:"OCR 文本草稿",minWidth:240,flex:2,tooltipField:"text",cellRenderer:this.headingCell},
    ]);
    if(this.doc)this.rebuild();
    else this.grid.setGridOption("rowData",[]);
    this.grid.onFilterChanged();
    this.renderControls();
  }
  private closeLineMenu():void{
    this.lineMenu.hidden=true;this.lineForm.hidden=true;
    $("ir-line-add-title").hidden=false;
    $("ir-line-delete-title").hidden=true;
    this.lineAfterBlockId="";
  }
  private openLineMenu(line:number,anchor:{x:number;y:number}):void{
    if(this.stage!=="chapters"||!this.doc||!this.activeMd||this.busy)return;
    if(!this.flushSource())return;
    const position=this.editor.offsetForLine(line);
    if(position===undefined)return;
    // Clicking marker lines is also valid: always insert AFTER that block.
    const range=this.activeMd.ranges.find(r=>position>=r.from&&position<r.to)||
      [...this.activeMd.ranges].reverse().find(r=>r.from<=position);
    if(!range)return;
    const block=this.doc.blocks.find(b=>b.blockId===range.blockId);
    if(!block)return;
    const page=range.manualPdfPage??range.pdfPages[0]??1;
    this.lineAfterBlockId=block.blockId;
    this.lineMenu.hidden=false;this.lineForm.hidden=true;
    $("ir-line-add-title").hidden=false;
    const manual=Boolean(this.doc.manualHeadings?.some(h=>h.blockId===block.blockId));
    $("ir-line-delete-title").hidden=!manual;
    $("ir-line-action-caption").textContent=manual?
      `第 ${line} 行 · 人工补录标题操作`:`第 ${line} 行 · 在本块之后插入标题`;
    const px=Math.max(8,Math.min(anchor.x,innerWidth-290));
    const py=Math.max(8,Math.min(anchor.y,innerHeight-340));
    this.lineMenu.style.left=px+"px";this.lineMenu.style.top=py+"px";
    $<HTMLInputElement>("ir-line-title-page").value=String(page);
    $<HTMLInputElement>("ir-line-title-page").max=String(this.doc.pages.length);
    $<HTMLInputElement>("ir-line-title-text").value="";
    $<HTMLSelectElement>("ir-line-title-level").value="1";
    $<HTMLInputElement>("ir-line-title-confirm").checked=false;
  }
  private deleteManualTitle():void{
    if(!this.doc||!this.lineAfterBlockId||this.stage!=="chapters"||this.busy)return;
    const id=this.lineAfterBlockId;
    const manual=this.doc.manualHeadings?.find(h=>h.blockId===id);
    if(!manual)throw Error("仅人工补录标题可以删除；原始 OCR 标题不可删除");
    const bodyCount=this.doc.manualTexts?.filter(t=>t.afterBlockId===id).length??0;
    if(!window.confirm(bodyCount?
      `删除人工补录标题？其下 ${bodyCount} 个补录正文块将保留，归入前一章节。`:
      "删除这条人工补录标题？可以通过撤销恢复。"))return;
    // The gutter menu can be opened without placing the caret on that line.
    // Save the deleted block's semantic location BEFORE its source marker
    // disappears; never rely on the (possibly stale) pre-click selection.
    const deletedOffset=this.activeMd?.ranges.find(range=>range.blockId===id)?.from;
    const changed=deleteManualPdfHeading(this.doc,id,"用户通过源码行号菜单删除人工补录标题");
    this.closeLineMenu();
    this.selectedId="";
    // Keep the existing CodeMirror view/scroll while the IR projection changes.
    // The ordinary rebuild() path calls showMarkdown() and resets the viewport.
    this.apply(changed,"已删除人工补录标题；正文及 PDF 页码证据保留（待保存）",true);
    if(deletedOffset!==undefined){
      const caret=Math.min(deletedOffset,this.activeMd?.content.length??0);
      this.editor.revealOffsets(caret,caret);
    }
  }
  private commitManualTitle():void{
    if(!this.doc||!this.lineAfterBlockId||this.stage!=="chapters"||this.busy)return;
    if(!this.lineForm.reportValidity())return;
    if(!$<HTMLInputElement>("ir-line-title-confirm").checked)
      throw Error("必须亲自对照 PDF 确认文字和页码");
    const title=$<HTMLInputElement>("ir-line-title-text").value.trim();
    const page=Number($<HTMLInputElement>("ir-line-title-page").value);
    const depth=Number($<HTMLSelectElement>("ir-line-title-level").value);
    const afterId=this.lineAfterBlockId;
    const current=this.doc;
    const changed=insertManualPdfHeading(current,afterId,title,depth as 1|2,page,
      `人工对照 PDF 第 ${page} 页补录 OCR 缺失标题`);
    const inserted=changed.manualHeadings?.at(-1)?.blockId;
    this.apply(changed,"PDF 页码证据已记录 · 新标题已补入 DIRjson / AG（待保存）");
    this.closeLineMenu();
    const row=this.rows.find(r=>r.id===inserted);
    if(row){
      this.select(row);
      const node=this.grid.getRowNode(row.id);
      if(node)this.grid.ensureNodeVisible(node);
    }
  }
  private onSourceChanged(text:string):void{
    if(this.stage!=="chapters"||!this.doc||!this.activeMd||this.busy)return;
    this.sourcePending=true;this.sourceInvalid=false;
    if(this.sourceTimer)clearTimeout(this.sourceTimer);
    this.status.textContent="正在同步源码改动至 DIRjson / AG…";
    // Batch rapid keystrokes; CodeMirror remains editable and selection is intact.
    this.sourceTimer=setTimeout(()=>this.flushSource(),220);
    this.renderControls();
  }
  private flushSource():boolean{
    if(this.sourceTimer){clearTimeout(this.sourceTimer);this.sourceTimer=undefined;}
    if(!this.sourcePending)return true;
    this.sourcePending=false;
    if(!this.doc||!this.activeMd)return false;
    const before=this.doc,source=this.editor.getText();
    try{
      const updated=applyDirSourceChange(before,this.activeMd,source);
      this.sourceInvalid=false;
      if(updated!==before)this.apply(updated,"源码修正已同步到 DIRjson 和 AG（待保存）",true);
      return true;
    }catch(error){
      // Do not overwrite an active native iPad contenteditable selection.
      // The draft is not in DIRjson yet, so saving and navigation are guarded.
      this.sourcePending=true;this.sourceInvalid=true;
      this.status.textContent="源码尚未同步，文字已保留；请修正后继续编辑或点「撤销」："+String(error);
      this.renderControls();
      return false;
    }
  }
  private undoSource():void{
    if(this.sourcePending){
      this.sourcePending=false;this.sourceInvalid=false;
      if(this.sourceTimer)clearTimeout(this.sourceTimer);
      this.sourceTimer=undefined;
      this.editor.setDocumentPreservingCursor(this.activeMd?.content??"");
      this.status.textContent="未同步源码编辑已撤销";
      this.renderControls();return;
    }
    const previous=this.undoDocs.pop();if(!previous||!this.doc)return;
    this.redoDocs.push(this.doc);
    this.doc=previous;this.dirty=createHash("sha256")
      .update(encodeDocumentIrV1(previous)).digest("hex")!==this.baselineHash;
    this.rebuild();this.status.textContent="已撤销 · DIRjson / AG / 源码同步";
  }
  private redoSource():void{
    if(!this.flushSource())return;
    const next=this.redoDocs.pop();if(!next||!this.doc)return;
    this.undoDocs.push(this.doc);
    this.doc=next;this.dirty=createHash("sha256")
      .update(encodeDocumentIrV1(next)).digest("hex")!==this.baselineHash;
    this.rebuild();
    this.status.textContent="已重做 · DIRjson / AG / 源码同步";
  }
  currentStage():"chapters"|"blocks"{return this.stage;}
  isDirty():boolean{return this.dirty||this.sourcePending;}
  snapshot():{rows:number;chapters:number;candidates:number;dirty:boolean;loaded:boolean;ocrPath?:string}{
    return {rows:this.rows.length,chapters:this.doc?.chapters.length??0,
      candidates:(this.doc?.reconstruction?.candidates.length??0)+(this.doc?.chapterStructure?.candidates.length??0),
      dirty:this.dirty||this.sourcePending,loaded:!!this.doc,ocrPath:this.ocr?.path};
  }
  reset():void{
    if(this.sourceTimer)clearTimeout(this.sourceTimer);
    this.sourceTimer=undefined;this.sourcePending=false;this.sourceInvalid=false;
    this.undoDocs=[];this.redoDocs=[];
    this.saveSourceCaret=undefined;
    ++this.sourceEpoch;this.doc=undefined;this.fs=undefined;this.pdf=undefined;this.ocr=undefined;
    this.wholeBook=undefined;this.closeLineMenu();
    this.bundle=undefined;this.activeMd=undefined;
    this.mdFile.replaceChildren(new Option("未生成 MD",""));this.mdFile.disabled=true;
    delete this.previewHost.dataset.irBlockId;
    this.editor.setDocument("正在读取工作目录，等待确认 PDF 原文和已保存 DIRjson…");
    delete $("workbench-ir-source").dataset.irRestoreSource;
    this.markdownPreview.render("");
    this.folder="";this.selectedId="";this.dirty=false;this.busy=false;this.baselineHash="";
    this.generation=null;this.persistenceReady=false;
    this.rows=[];this.grid.setGridOption("rowData",[]);
    this.chapterTree.replaceChildren();this.chapterFilter.replaceChildren(new Option("全部章节",""));
    this.ocrSelect.replaceChildren(new Option("选择 OCR JSON",""));this.ocrSelect.disabled=true;
    this.filterChapter="";this.onlyH1.checked=true;
    this.v2Start.value="01";this.v2Start.setCustomValidity("");
    this.editArea.value="";this.reason.value="";
    this.chapterRole.value="root";this.chapterName.value="";this.chapterReason.value="";
    this.status.textContent="IR 等待工作目录扫描…";this.renderControls();
  }
  /** Any chapter block, not just headings, may carry page+bbox evidence.
   * Only a PERSISTED DIRjson and an owner-verified published file can supply
   * the mapping; never invent a PDF rect from cleaned Markdown text. */
  chapterBlockEvidence(blockId:string,chapterPath:string,pdfPath:string):
    {kind:"regions";regions:MappingPdfRegion[]} | {kind:"page";page:number} | undefined {
    const doc=this.doc;
    if(!doc||!this.generation||this.busy||this.dirty||!this.pdf||
      this.pdf.path!==pdfPath||doc.pdf.path!==pdfPath||
      !chapterPath.startsWith(this.folder+"/chapters/")||
      !this.bundle?.files.some(f=>f.path.split("/").at(-1)===chapterPath.split("/").at(-1)))return;
    // A copied marker from another published chapter is NOT evidence that the
    // source block belongs to this file; membership must agree with the saved
    // chapter projection as well as with the exact Markdown marker.
    const owner=this.bundle?.files.find(f=>f.path.split("/").at(-1)===chapterPath.split("/").at(-1));
    if(!owner?.ranges.some(range=>range.blockId===blockId))return;
    const block=doc.blocks.find(b=>b.blockId===blockId);
    if(!block)return;
    const elements=new Map(doc.sourceElements.map(item=>[item.id,item]));
    const regions=block.sources.flatMap(ref=>{
      const source=elements.get(ref.elementId);
      return source?[{pageIndex:source.pageIndex,pdfPageNumber:source.pdfPageNumber,
        bbox:source.bbox,pageSize:source.pageSize,normalizedBBox:source.normalizedBBox}]:[];
    });
    if(regions.length)return {kind:"regions",regions};
    const manual=doc.manualHeadings?.find(item=>item.blockId===blockId);
    return manual?{kind:"page",page:manual.pdfPageNumber}:undefined;
  }
  chapterHeadingEvidence(blockId:string,chapterPath:string,pdfPath:string):
    {kind:"regions";regions:MappingPdfRegion[]} | {kind:"page";page:number} | undefined {
    if(this.doc?.blocks.find(block=>block.blockId===blockId)?.type!=="title")return;
    return this.chapterBlockEvidence(blockId,chapterPath,pdfPath);
  }
  /** Called only when directory enumeration completes with zero PDF files.
   * The V3 IR loader requires a PDF belonging to this exact book directory;
   * never strand the page in a fake 'checking saved DIRjson' loading state. */
  showMissingPdf(folder:string):void{
    if(this.doc||this.busy)return;
    const message=`当前目录 ${folder} 没有 PDF 原文。请点「切换目录」，双击进入具体书籍文件夹，再点「设为工作目录」。`;
    this.editor.setDocument(message);
    this.markdownPreview.render("");
    this.status.textContent=message;
    this.renderControls();
  }
  /** Explicitly bound to one book folder and its selected PDF; no hidden writes. */
  async open(fs:WorkspaceFSV3,folder:string,pdf:WorkspaceNode,selectedOcrPath?:string):Promise<void>{
    if(this.isDirty())throw Error("IR 草稿未导出；请先导出或明确放弃更改");
    this.reset();const epoch=++this.sourceEpoch;
    this.fs=fs;this.folder=folder;this.pdf=pdf;this.busy=true;this.renderControls();
    this.status.textContent="正在检查已保存 DIRjson；仅在首次使用时读取 OCR 生成…";
    try{
      if(!pdf.path.startsWith(folder+"/")||!/\.pdf$/iu.test(pdf.path))throw Error("PDF 必须属于当前书籍");
      // Critical recovery ordering: a verified saved DIRjson takes precedence
      // over source directory enumeration. iCloud can make nested OCR listing
      // temporarily unavailable even while the immutable snapshot is intact.
      // Never ask the user to regenerate a book that has a valid saved pointer.
      if(fs instanceof MacVaultHttpFS){
        try{
          const state=await fs.loadIrSnapshot(folder);
          if(epoch!==this.sourceEpoch)return;
          if(state.exists){
            if(!state.sourcesCurrent||!state.irBase64||!state.generation)
              throw Error("DIRjson 来源不一致或云端快照尚未同步完整");
            const raw=Uint8Array.from(atob(state.irBase64),c=>c.charCodeAt(0));
            const restored=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(raw)) as DocumentIrV1;
            validateDocumentIrV1(restored);
            if(restored.workspaceId!==fs.workspaceId||restored.pdf.path!==pdf.path||
               !restored.ocr.path.startsWith(folder+"/")||
               selectedOcrPath&&restored.ocr.path!==selectedOcrPath)
              throw Error("已保存 DIRjson 与当前 PDF/OCR 来源选择不一致，拒绝混用");
            this.persistenceReady=true;this.generation=state.generation;
            this.ocr={path:restored.ocr.path};
            this.ocrSelect.replaceChildren(new Option(
              restored.ocr.path.split("/").at(-1)??restored.ocr.path,restored.ocr.path));
            this.ocrSelect.disabled=true;
            this.doc=restored;
            this.baselineHash=createHash("sha256").update(encodeDocumentIrV1(restored)).digest("hex");
            this.dirty=false;this.rebuild();
            $("workbench-ir-source").dataset.irRestoreSource="saved-dirjson";
            this.status.textContent=`已恢复保存的 DIRjson · ${restored.blocks.length} 块 · `+
              `人工补录 ${restored.manualHeadings?.length??0} 标题 · 来源校验通过（未重复 OCR 初始化）`;
            return;
          }
          this.persistenceReady=true;
        }catch(error){
          this.persistenceReady=false;
          throw Error("DIRjson 快照加载失败，禁止绕过保存版本重新初始化："+String(error));
        }
      }
      // No saved version: only now enumerate OCR inputs and initialize IR.
      const options=await scanOcrJson(fs,folder);
      if(epoch!==this.sourceEpoch)return;
      this.ocrSelect.replaceChildren(new Option(options.length>1?"选择 OCR JSON":"OCR 来源",""));
      for(const file of options){
        this.ocrSelect.add(new Option(file.path.split("/").at(-1)??file.path,file.path));
      }
      this.ocrSelect.disabled=options.length<2;
      if(!options.length)throw Error("未找到 MinerU OCR JSON：请检查工作目录下的 json 子目录");
      $("workbench-ir-source").dataset.irRestoreSource="ocr-initialization";
      if(options.length>1&&!selectedOcrPath){
        this.status.textContent=`检测到 ${options.length} 份 OCR JSON，请选择一份作为当前 DIRjson 来源。`;
        return;
      }
      const ocr=selectedOcrPath?options.find(o=>o.path===selectedOcrPath):options[0];
      if(!ocr)throw Error("所选 OCR JSON 已不存在，请重新选择");
      this.ocrSelect.value=ocr.path;
      this.ocr=ocr;
      const [ocrBytes,pdfBytes]=await Promise.all([
        readVerified(fs,ocr,MAX_OCR),readVerified(fs,pdf,MAX_PDF),
      ]);
      if(epoch!==this.sourceEpoch)return;
      const provisional=importMineruDocumentIrFromBytes(fs.workspaceId,pdf.path,pdfBytes,ocr.path,ocrBytes);
      const next=proposeIrChapters(proposeIrReconstruction(provisional));
      validateDocumentIrV1(next);
      if(epoch!==this.sourceEpoch)return;
      const current=next;
      // First initialization creates a complete DIRjson working object in
      // memory, but does not silently write to the user's Obsidian book.
      // Explicit Save establishes the first durable CAS snapshot.
      this.doc=current;
      this.baselineHash=createHash("sha256").update(encodeDocumentIrV1(current)).digest("hex");
      this.dirty=false;this.rebuild();
      this.status.textContent=`IR 已加载 ${current.blocks.length} 块 · DIRjson 初始化完成 · ${current.chapters.length} 章节/小节 · 首次保存后可快速恢复`;
    }catch(error){if(epoch===this.sourceEpoch){this.status.textContent="IR 加载失败（未改原文件）："+String(error);throw error;}}
    finally{if(epoch===this.sourceEpoch){this.busy=false;this.renderControls();}}
  }
  private rebuild(preserveSource=false):void{
    const doc=this.doc;if(!doc)return;
    const previous=this.activeMd?.chapterId;
    this.bundle=generateIrMarkdownBundle(doc);
    // Show the actual first independent chapter number on load, undo, redo
    // or AG file-merge, preserving its zero-padding (01, 005, etc.).
    const first=v2IrChapterHeadings(doc).find(row=>row.standalone);
    const numbered=first?chapterFileParts(first.fileName):undefined;
    this.v2Start.value=numbered?String(numbered.number).padStart(numbered.width,"0"):"01";
    this.v2Start.setCustomValidity("");
    this.wholeBook=generateIrWholeBookMarkdown(doc,this.bundle);
    this.mdFile.replaceChildren();
    if(this.stage==="chapters"){
      this.mdFile.add(new Option(this.wholeBook.label,this.wholeBook.chapterId));
    }else{
      for(const file of this.bundle.files)this.mdFile.add(new Option(file.label,file.chapterId));
    }
    const chosen=this.stage==="chapters"?this.wholeBook:
      this.bundle.files.find(f=>f.chapterId===previous)??this.bundle.files[0];
    if(preserveSource&&this.activeMd?.chapterId===chosen.chapterId){
      // When a changed boundary also changes *other* OCR heading display
      // levels, reconcile the entire in-memory source without losing the
      // user's CodeMirror caret. Otherwise the next edit would parse stale MD.
      if(this.editor.getText()!==chosen.content){
        this.editor.setDocumentPreservingCursor(chosen.content);
      }
      this.activeMd=chosen;this.mdFile.value=chosen.chapterId;
      this.markdownPreview.render(chosen.content);
      const host=$("workbench-ir-source");host.dataset.irMdPath=chosen.path;host.dataset.irMdSha256=chosen.sha256;
    }else this.showMarkdown(chosen.chapterId);
    const elements=new Map(doc.sourceElements.map(e=>[e.id,e]));
    const manual=new Map([...(doc.manualHeadings??[]),...(doc.manualTexts??[])]
      .map(h=>[h.blockId,h]));
    const chapters=new Map(doc.chapters.map(c=>[c.chapterId,c]));
    const displayedLevels=new Map<string,number|null>();
    for(const file of this.bundle.files){
      for(const range of file.ranges){
        displayedLevels.set(range.blockId,
          renderedHeadingLevel(file.content.slice(range.contentFrom,range.contentTo)));
      }
    }
    const flags=new Map<string,Set<string>>();
    for(const candidate of [...(doc.reconstruction?.candidates??[]),...(doc.chapterStructure?.candidates??[])]){
      for(const id of candidate.sourceElementIds){
        if(!flags.has(id))flags.set(id,new Set());flags.get(id)!.add("待复核");
      }
    }
    this.rows=[...doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!)
      .filter(b=>!this.filterChapter||b.chapterId===this.filterChapter||
        this.isDescendant(b.chapterId,this.filterChapter,chapters))
      .map(b=>{
        const pg=[...new Set([...b.sources.map(s=>elements.get(s.elementId)!.pdfPageNumber),
          ...(manual.has(b.blockId)?[manual.get(b.blockId)!.pdfPageNumber]:[])])].sort((a,b)=>a-b);
        return {id:b.blockId,order:b.readingOrder??0,page:pg.join(","),
          chapter:chapters.get(b.chapterId??"")?.name??"未分类",type:b.type,
          text:b.text,audit:b.audit==="unreviewed"?"未审核":b.audit,
          proposals:manual.has(b.blockId)?"人工 PDF 页码证据":
            b.sources.some(r=>flags.has(r.elementId))?"待核对":"—",
          headingLevel:displayedLevels.get(b.blockId)??null,block:b};
      });
    if(this.stage==="chapters"){
      const v2=new Map(v2IrChapterHeadings(doc).map(row=>[row.blockId,row]));
      this.rows=(doc.chapterStructure?.candidates??[]).map(candidate=>{
        const block=doc.blocks.find(b=>b.blockId===candidate.headingBlockId)!;
        const parent=doc.chapters.find(c=>c.anchorBlockId===block.blockId);
        const source=elements.get(candidate.sourceElementIds[0]);
        const manualTitle=manual.get(block.blockId);
        const role=parent?.depth===1?"主章节":parent?"小节":
          candidate.status==="confirmed"?"非章节":"待判定";
        const boundary=v2.get(block.blockId);
        const fileName=boundary?.fileName??"";
        return {id:block.blockId,order:block.readingOrder??0,
          page:String(source?.pdfPageNumber??manualTitle?.pdfPageNumber??"?"),
          chapter:parent?.name??"非章节",type:"title",text:block.text,
          audit:manualTitle?"人工补录 · 已标定":
            candidate.status==="confirmed"?"已标定":"待审核",
          proposals:manualTitle?"人工补录 · PDF页码":"OCR 标题候选",
          block,headingLevel:displayedLevels.get(block.blockId)??null,
          ocrLevel:manualTitle?"人工":String(typeof source?.rawBlock.level==="number"?source.rawBlock.level:"?"),
          decision:role,fileName,boundaryEligible:!!boundary,
          standalone:boundary?.standalone??false,boundaryFirst:boundary?.first??false};
      }).sort((a,b)=>a.order-b.order);
    }
    this.grid.setGridOption("rowData",this.rows);
    this.grid.onFilterChanged();
    // AG's getRowId retains row renderers. Force live Markdown heading
    // decorations to track IR type/level changes even for unchanged IDs.
    this.grid.refreshCells({force:true});
    this.grid.resetRowHeights();
    this.chapterFilter.replaceChildren(new Option("全部章节",""));
    const render=(nodes:ReturnType<typeof listIrChapterTree>,prefix="")=>{
      for(const node of nodes){
        const opt=new Option(prefix+node.label+` (${node.subtreeBlocks})`,node.chapterId);
        this.chapterFilter.append(opt);render(node.children,prefix+"　");
      }
    };
    const tree=listIrChapterTree(doc);render(tree);
    this.chapterFilter.value=this.filterChapter;
    this.chapterTree.replaceChildren();
    const addNodes=(nodes:ReturnType<typeof listIrChapterTree>,depth=0)=>{
      for(const node of nodes){
        const button=document.createElement("button");button.type="button";
        button.className="ir-chapter-link";button.dataset.chapterId=node.chapterId;
        button.style.paddingLeft=`${10+depth*14}px`;
        button.textContent=`${node.label} · ${node.subtreeBlocks}`;
        button.addEventListener("click",()=>{
          this.filterChapter=node.chapterId;this.rebuild();
          $("wb-ir-details").removeAttribute("open");
        });
        this.chapterTree.append(button);addNodes(node.children,depth+1);
      }
    };addNodes(tree);
    this.renderControls();
  }
  private showMarkdown(chapterId:string):void{
    const file=chapterId===DIR_WHOLE_BOOK_ID?this.wholeBook:
      this.bundle?.files.find(f=>f.chapterId===chapterId);
    if(!file)return;
    this.activeMd=file;this.mdFile.value=chapterId;
    this.editor.setDocument(file.content);
    this.markdownPreview.render(file.content);
    const host=$("workbench-ir-source");host.dataset.irMdPath=file.path;
    host.dataset.irMdSha256=file.sha256;
    this.renderControls();
  }
  private fromMdCursor(cursor=this.editor.selectionOffsets().from):void{
    if(!this.doc||!this.activeMd||this.busy||this.sourcePending)return;
    const range=irMarkdownSourceAtOffset(this.activeMd,cursor);
    if(!range)return;
    const row=this.rows.find(r=>r.id===range.blockId);
    if(row && row.id!==this.selectedId)this.select(row,true);
  }
  /** PDF -> IR -> generated MD: only a unique OCR region is auto-followed. */
  onPdfPoint(page:number,x:number,y:number):void{
    if(!this.doc||!this.bundle)return;
    const physical=new Map(this.doc.sourceElements.map(s=>[s.id,s]));
    const candidates=this.doc.blocks.filter(b=>b.sources.some(ref=>{
      const src=physical.get(ref.elementId)!;
      const box=src.normalizedBBox;
      return src.pdfPageNumber===page&&x>=box[0]&&x<=box[2]&&y>=box[1]&&y<=box[3];
    }));
    if(candidates.length!==1){
      this.status.textContent=candidates.length>1?
        `PDF 点击范围存在 ${candidates.length} 个 IR 块，请在 AG 表中选择；不猜测对应。`:
        `PDF 第 ${page} 页当前点击处没有 OCR 文本块。`;
      return;
    }
    const block=candidates[0];
    let row=this.rows.find(r=>r.id===block.blockId);
    if(!row&&this.stage==="chapters"){
      // OCR may have missed this title entirely. A PDF click on an ordinary
      // text block must still reveal that anchored text in the WHOLE-book
      // editor so it can be promoted with # / ##, even without an AG row.
      const current=this.wholeBook?.ranges.find(r=>r.blockId===block.blockId);
      if(current&&this.activeMd?.chapterId===DIR_WHOLE_BOOK_ID){
        this.editor.revealOffsets(current.contentFrom,current.contentTo);
        this.status.textContent=`PDF 第 ${page} 页已定位 OCR 正文；可在全书源码前添加 # 或 ## 以补定界（原 OCR/PDF 不变）`;
      }
      return;
    }
    if(!row){this.filterChapter="";this.rebuild();row=this.rows.find(r=>r.id===block.blockId);}
    if(!row)return;
    this.select(row);
    const node=this.grid.getRowNode(row.id);
    if(node){this.grid.ensureNodeVisible(node);this.grid.setNodesSelected({nodes:[node],newValue:true,clearSelection:true});}
  }
  private async saveSnapshot(caret?:{anchor:number;head:number;scrollTop:number}):Promise<void>{
    if(!this.flushSource())return;
    if(!this.doc||!this.bundle||!this.fs||!this.persistenceReady||this.busy||
       (!this.dirty&&this.generation!==null))return;
    if(!(this.fs instanceof MacVaultHttpFS))return;
    const confirmed=isIrChapterDelimitationConfirmed(this.doc);
    if(!window.confirm(confirmed?
      "所有 OCR 标题已标定，保存 DIRjson 并生成已定界章节 Markdown 版本？\n原 PDF/OCR/旧 MD 不变。":
      "章节定界尚未全部确认：本次只保存 DIRjson + 全书连续待审核 MD，不生成按 OCR 猜测分章的文件。\n原 PDF/OCR/旧 MD 不变。确定保存草稿？")){
      if(caret)this.editor.restoreFocusedCaret(caret);
      return;
    }
    // Restore focus synchronously in the Save click's user activation. iOS
    // Safari may reject a programmatic focus attempted only after an await.
    if(caret)this.editor.restoreFocusedCaret(caret);
    const draft=this.doc;
    const expected=this.generation;
    const fingerprint=createHash("sha256").update(encodeDocumentIrV1(draft)).digest("hex");
    // Persist the immutable DIRjson untouched while its editable chapter
    // projection uses Obsidian-compatible math and safe HTML tables.
    const archive=buildIrMarkdownArchive(draft,
      generateIrMarkdownBundle(draft,{obCompatible:true}));
    const fs=this.fs,folder=this.folder;
    this.busy=true;this.status.textContent=`准备提交 ${archive.size} 字节 IR 快照，正在校验来源与当前版本…`;
    this.renderControls();
    try{
      const result=await fs.saveIrSnapshot(folder,archive.bytes,expected,crypto.randomUUID());
      if(!result.committed)throw Error("服务端没有确认提交");
      const verified=await fs.loadIrSnapshot(folder);
      if(!verified.exists||verified.generation!==result.generation||!verified.sourcesCurrent||!verified.irBase64)
        throw Error("保存后读回的版本或来源不匹配，草稿未清除");
      const readback=Uint8Array.from(atob(verified.irBase64),c=>c.charCodeAt(0));
      const readbackHash=createHash("sha256").update(readback).digest("hex");
      if(readbackHash!==fingerprint)throw Error("IR 读回 SHA-256 与本次草稿不符，仍待恢复");
      if(this.doc!==draft)throw Error("保存期间草稿已变化，需再次提交");
      this.generation=result.generation;
      this.baselineHash=readbackHash;
      this.dirty=false;
      this.status.textContent=`已保存到 Obsidian：${confirmed?"标题审核完成，章节可发布":
        isIrChapterFileLayoutReady(draft)?"章节文件已定界，可发布逐章清洗（OCR 标题仍待审核）":
        "DIRjson + 全书连续待定界草稿"} · ${result.generatedVersionPath.split("/ocr2md/").at(-1)??"版本目录"} · SHA 读回通过`;
    }catch(error){
      this.status.textContent=`IR 保存未完成或发生冲突，已保留浏览器草稿，禁止自动覆盖：${String(error)}`;
    }finally{
      this.busy=false;this.renderControls();
      if(caret && this.doc===draft && this.stage==="chapters")
        this.editor.restoreFocusedCaret(caret);
    }
  }
  /** Small authenticated commit: derive chapter MD from the SAVED DIRjson on
   * the Mac, avoiding large iPad upload truncation or partial JSON bodies. */
  private async publishChapters():Promise<void>{
    const fs=this.fs,doc=this.doc;
    if(!doc||!(fs instanceof MacVaultHttpFS)||!this.generation||this.busy)return;
    if(this.sourcePending||this.sourceInvalid||this.dirty){
      this.status.textContent="请先保存当前章节修改，再发布章节。";return;
    }
    if(!isIrChapterFileLayoutReady(doc)){
      this.status.textContent="请完成各章节文件边界和命名，再发布章节。";return;
    }
    if(!window.confirm("从当前已保存的 DIRjson 重新生成 Obsidian 兼容章节 MD 并发布？\n\n已有章节会被新版覆盖，旧 chapters/ 全目录（包含已清洗的修改及 imgs）先存入 .ocr2md/chapter-backups/ 备份。\n原 PDF/OCR 和 DIRjson 不变。确定继续？"))return;
    const book=this.folder,expectedGeneration=this.generation;
    const expectedIrSha256=createHash("sha256").update(encodeDocumentIrV1(doc)).digest("hex");
    this.busy=true;
    this.status.textContent="正在由 Mac 服务器生成并发布章节 MD（无需从 iPad 上传 ZIP）…";
    this.renderControls();
    try{
      const result=await fs.publishIrChapters(book,expectedGeneration,expectedIrSha256);
      if(!result.published)throw Error("服务端没有确认章节文件发布");
      // Upgrade the in-memory generation pointer only after verified server
      // publication; an immutable projection may have been created locally.
      const verified=await fs.loadIrSnapshot(book);
      if(!verified.exists||verified.generation!==result.generation||!verified.sourcesCurrent||!verified.irBase64)
        throw Error("章节已提交但无法读回版本，请刷新工作台检查 chapters/");
      const got=Uint8Array.from(atob(verified.irBase64),c=>c.charCodeAt(0));
      if(createHash("sha256").update(got).digest("hex")!==expectedIrSha256)
        throw Error("发布后 DIRjson 来源与当前页面不一致；请刷新页面");
      this.generation=result.generation;
      this.baselineHash=expectedIrSha256;
      const pending=doc.chapterStructure?.candidates.filter(c=>c.status!=="confirmed").length??0;
      this.status.textContent=result.alreadyPublished?
        `章节已经是当前 Obsidian 版本：${result.path}/，${result.count} 个 MD，无需覆盖。`:
        result.overwritten?
          `新版已覆盖旧章节：${result.path}/，共 ${result.count} 个 Obsidian MD。旧版备份：${result.backupPath}；${pending} 项 OCR 标题待清洗。`:
          `发布成功：${result.path}/，已生成 ${result.count} 个 Obsidian MD；${pending} 项 OCR 标题待清洗。`;
    }catch(error){
      this.status.textContent="分章发布失败（已保留/尽力恢复旧版）："+String(error);
    }finally{this.busy=false;this.renderControls();}
  }
  private static saveDownload(bytes:Uint8Array,name:string,mime:string):void{
    const blob=new Blob([new Uint8Array(bytes)],{type:mime});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");
    a.href=url;a.download=name;document.body.append(a);a.click();a.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  private downloadCurrentMarkdown():void{
    if(!this.activeMd)return;
    const canonical=this.doc?generateIrMarkdownBundle(this.doc,{obCompatible:true}).files
      .find(file=>file.path===this.activeMd!.path):undefined;
    IrWorkbenchPanel.saveDownload(new TextEncoder().encode(canonical?.content??this.activeMd.content),
      this.activeMd.path.split("/").at(-1)!,"text/markdown;charset=utf-8");
    this.status.textContent="已请求下载本地章节 MD；尚未写入 Obsidian，不代表审核通过。";
  }
  private downloadBundle():void{
    if(!this.doc||!this.bundle)return;
    const archive=buildIrMarkdownArchive(this.doc,
      generateIrMarkdownBundle(this.doc,{obCompatible:true}));
    IrWorkbenchPanel.saveDownload(archive.bytes,"ocr2md-ir-chapters-and-provenance.zip","application/zip");
    this.status.textContent=`已请求下载 ${archive.count} 个文件的 ZIP（含 DIRjson、来源索引、${isIrChapterDelimitationConfirmed(this.doc)?"标题已审章节 MD":
      isIrChapterFileLayoutReady(this.doc)?"按独立文件定界的章节 MD（OCR 待审核）":"全书连续待定界 MD"}）；未写入 Obsidian。`;
  }
  private isDescendant(id:string|null,parentId:string,chapters:Map<string,DocumentIrV1["chapters"][number]>):boolean{
    let cursor=id;
    while(cursor){if(cursor===parentId)return true;cursor=chapters.get(cursor)?.parentChapterId??null;}
    return false;
  }
  /** Source-origin selection may update AG details/PDF location but must NEVER
   * select/scroll source text; iOS touchend otherwise selects the whole title
   * just before native Backspace and turns a single # deletion into a rollback. */
  private select(row:IrRow,fromSource=false):void{
    if(!this.flushSource())return;
    this.selectedId=row.id;
    if(this.stage==="chapters"&&this.doc){
      const existing=this.doc.chapters.find(c=>c.anchorBlockId===row.id);
      const candidate=this.doc.chapterStructure?.candidates.find(c=>c.headingBlockId===row.id);
      this.chapterRole.value=existing?.depth===1?"root":existing?"section":"exclude";
      this.chapterName.value=existing?.fileName??"";
      this.chapterReason.value=candidate?.reviewReason??"";
      this.chapterName.disabled=this.chapterRole.value!=="root";
    }
    this.editArea.value=row.text;
    this.editOffset.value=String(Math.floor(row.text.length/2));
    this.reason.value="";
    const doc=this.doc;if(!doc)return;
    const elements=new Map(doc.sourceElements.map(e=>[e.id,e]));
    const manualTitle=[...(doc.manualHeadings??[]),...(doc.manualTexts??[])]
      .find(h=>h.blockId===row.id);
    const regions:MappingPdfRegion[]=row.block.sources.map(ref=>{
      const source=elements.get(ref.elementId)!;
      return {pageIndex:source.pageIndex,pdfPageNumber:source.pdfPageNumber,
        bbox:source.bbox,pageSize:source.pageSize,normalizedBBox:source.normalizedBBox};
    });
    const evidence=row.block.sources.map(ref=>{
      const s=elements.get(ref.elementId)!;
      return {page:s.pdfPageNumber,pointer:s.jsonPointer,sourceId:s.id,
        bbox:s.bbox,...(ref.segmentPointer?{segmentPointer:ref.segmentPointer}:{}),
        ...(ref.utf16Range?{utf16Range:ref.utf16Range}:{})};
    });
    $("ir-source-evidence").textContent=JSON.stringify(manualTitle?
      [{type:"人工 PDF 页码证据（无 OCR bbox）",pdfPageNumber:manualTitle.pdfPageNumber,
        afterBlockId:manualTitle.afterBlockId,detail:manualTitle.detail}]:evidence,null,2);
    // Never jump to OCR-inferred chapter files while a reviewer is deciding
    // chapter boundaries. AG/PDF selections always reveal the full-book text.
    const located=this.stage==="chapters"?this.wholeBook:
      this.bundle?.files.find(f=>f.ranges.some(r=>r.blockId===row.id));
    if(located){
      if(!fromSource){
        this.mdScrollSync.suspendForSemanticFocus();
        if(located.chapterId!==this.activeMd?.chapterId)this.showMarkdown(located.chapterId);
        const range=located.ranges.find(r=>r.blockId===row.id);
        if(range)this.editor.revealOffsets(range.contentFrom,range.contentTo,false);
      }
    }
    if(!fromSource)this.revealPreviewBlock(row.id);
    const host=$("workbench-ir-source");host.dataset.irBlockId=row.id;host.dataset.irPages=row.page;
    host.dataset.irMdPath=located?.path??"";
    this.renderControls();
    if(manualTitle){
      void this.onLocateManualPage?.(manualTitle.pdfPageNumber).catch(error=>{
        this.status.textContent="人工补录内容只能定位 PDF 页，不能框选 OCR："+String(error);
      });
    }else void this.onLocate(regions,row.id).catch(error=>{
      this.status.textContent="IR 行已选中，但 PDF 定位失败："+String(error);
    });
  }
  /** AG→MD preview uses the same validated DIRjson block range as source.
   * Never fuzzy-match OCR text: repeated headings could navigate incorrectly.
   * Scrolling this child host never focuses a textarea or switches preview tabs. */
  private revealPreviewBlock(blockId:string):void{
    const file=this.activeMd;
    const range=file?.ranges.find(r=>r.blockId===blockId);
    if(!file||!range)return;
    const line=1+file.content.slice(0,range.contentFrom).split("\n").length-1;
    const items=Array.from(this.previewHost.querySelectorAll<HTMLElement>("[data-source-line]"))
      .map(node=>({node,line:Number(node.dataset.sourceLine)}))
      .filter(item=>Number.isInteger(item.line));
    let target=items[0];
    for(const item of items){if(item.line>line)break;target=item;}
    for(const marker of this.previewHost.querySelectorAll<HTMLElement>(".v3-ir-preview-target")){
      marker.classList.remove("v3-ir-preview-target");delete marker.dataset.irBlockId;
    }
    if(!target)return;
    target.node.classList.add("v3-ir-preview-target");
    target.node.dataset.irBlockId=blockId;
    this.previewHost.dataset.irBlockId=blockId;
    const align=()=>this.mdScrollSync.alignNode(target.node);
    align();
    requestAnimationFrame(align);
    // iPad async scrolling/CodeMirror measured-line layout can finish after
    // requestAnimationFrame. A bounded late correction keeps the exact block
    // inside the preview viewport without moving the native insertion caret.
    setTimeout(()=>{if(this.selectedId===blockId)align();},160);
  }
  private renderControls():void{
    const enabled=Boolean(this.doc&&this.selectedId&&!this.busy);
    for(const id of this.changeButtons)($<HTMLButtonElement>(id)).disabled=!enabled;
    this.exportButton.disabled=!this.doc||this.busy;
    // First-time DIRjson can be explicitly persisted before any title edits;
    // subsequent snapshots still require a real change. Never auto-save on open.
    this.saveButton.disabled=!this.doc||!this.persistenceReady||this.busy||this.sourceInvalid||
      (!this.dirty&&this.generation!==null&&!this.sourcePending);
    this.saveButton.dataset.dirty=String(this.dirty||this.sourcePending);
    const publishReady=this.stage==="chapters"&&!!this.doc&&!!this.generation&&
      !this.busy&&!this.dirty&&!this.sourcePending&&!this.sourceInvalid&&
      isIrChapterFileLayoutReady(this.doc);
    this.publishButton.disabled=!publishReady;
    this.publishButton.title=publishReady?
      "已设置章节文件边界和名称。点击发布 chapters/*.md；未审核 OCR 标题留到逐章清洗。已存在的 chapters/ 不覆盖。":
      "须设置全部独立章节文件名并保存标定；无需先确认所有 OCR 标题。";
    this.undoButton.disabled=!this.doc||this.busy||(!this.sourcePending&&!this.undoDocs.length);
    this.redoButton.disabled=!this.doc||this.busy||this.sourcePending||!this.redoDocs.length;
    this.editArea.disabled=!enabled;this.reason.disabled=!enabled;this.editOffset.disabled=!enabled;
    this.chapterFilter.disabled=!this.doc||this.busy;
    this.v2Start.disabled=!this.doc||this.busy||this.stage!=="chapters"||
      !v2IrChapterHeadings(this.doc).length;
    $("ir-sequence-start-control").hidden=this.stage!=="chapters";
    this.v2Sequence.disabled=!this.doc||this.busy||this.stage!=="chapters"||
      !v2IrChapterHeadings(this.doc).length;
    const canMark=this.stage==="chapters"&&Boolean(this.doc&&this.selectedId&&!this.busy);
    this.chapterRole.disabled=!canMark;
    this.chapterName.disabled=!canMark||this.chapterRole.value!=="root";
    this.chapterReason.disabled=!canMark;
    this.chapterApply.disabled=!canMark;
    this.mdFile.disabled=!this.bundle||this.busy;
    this.exportMdButton.disabled=!this.activeMd||this.busy;
    this.exportZipButton.disabled=!this.bundle||this.busy;
    const canEditSource=this.stage==="chapters"&&!!this.doc;
    if(this.editorEditable!==canEditSource){
      this.editor.setEditable(canEditSource);this.editorEditable=canEditSource;
    }
    // A read-only transaction forbids mutations during the commit while
    // keeping contenteditable and the native insertion caret intact.
    this.editor.setReadOnly(this.busy);
    if(this.busy)this.ocrSelect.disabled=true;
    else if(this.ocrSelect.options.length>2)this.ocrSelect.disabled=!!this.doc&&this.dirty;
    // This control was an unexplained permanent dropdown in the chapter bar.
    // Show it only to resolve genuine ambiguity BEFORE the first DIRjson is
    // initialized. With one OCR source, or a restored/saved IR, it vanishes.
    $("ir-ocr-source-choice").hidden=!(this.stage==="chapters" && !this.doc &&
      !this.busy && this.ocrSelect.options.length>2);
    $("ir-dirty-indicator").textContent=this.sourceInvalid?"源码尚未同步 · 请修改或撤销":
      this.dirty||this.sourcePending?"未保存修改 · 请保存或导出":
      this.generation?"已保存快照 · 待审核":"尚未持久化 · 内存草稿";
  }
  private perform(action:()=>void):void{
    try{action();}
    catch(error){this.status.textContent="IR 操作被拒绝（未改原文件）："+String(error);}
  }
  private apply(doc:DocumentIrV1,description:string,fromSource=false):void{
    validateDocumentIrV1(doc);
    if(doc===this.doc)return;
    if(this.doc){this.undoDocs.push(this.doc);if(this.undoDocs.length>20)this.undoDocs.shift();}
    this.redoDocs=[];
    // Fully validate the updated projection before changing the active in-memory
    // draft: malformed/duplicate generated filenames must leave the old view intact.
    generateIrMarkdownBundle(doc);
    this.doc=doc;this.dirty=true;this.rebuild(fromSource);
    const row=this.rows.find(r=>r.id===this.selectedId);
    if(row&&!fromSource)this.select(row);
    this.status.textContent=`${description} · 尚未保存 · ${this.stage==="chapters"?"标题候选 "+this.rows.length+" 项":"正文 "+doc.blocks.length+" 块"}`;
    this.renderControls();
  }
  private editReason():string{
    const value=this.reason.value.trim();if(!value)throw Error("操作前必须填写修改依据");return value;
  }
  private confirmChapter():void{
    if(!this.doc||!this.selectedId||this.stage!=="chapters")return;
    const role=this.chapterRole.value as "root"|"section"|"exclude";
    if(!["root","section","exclude"].includes(role))throw Error("无效的章节标定类型");
    const reason=this.chapterReason.value.trim();
    if(!reason)throw Error("请先对照 PDF 填写定界依据");
    if(role==="root"&&!this.chapterName.value.trim())throw Error("主章节须填写唯一的 MD 文件名");
    const changed=explicitClassifyOcrHeading(this.doc,this.selectedId,role,
      role==="root"?this.chapterName.value.trim():undefined,reason);
    this.apply(changed,"章节定界已暂存（正文仍待校对）");
    $<HTMLDetailsElement>("ir-chapter-edit-details").open=false;
  }
  private replaceText():void{
    if(!this.doc||!this.selectedId)return;
    this.apply(explicitReplaceBlockText(this.doc,this.selectedId,this.editArea.value,this.editReason()),"文本修改已暂存");
  }
  private split():void{
    if(!this.doc||!this.selectedId)return;
    this.apply(explicitSplitBlockAtUtf16(this.doc,this.selectedId,Number(this.editOffset.value),this.editReason()),"拆分操作已暂存");
  }
  private merge():void{
    if(!this.doc||!this.selectedId)return;
    const sorted=[...this.doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
    const i=sorted.findIndex(b=>b.blockId===this.selectedId);
    if(i<0||i===sorted.length-1)throw Error("没有后继块可合并");
    this.apply(explicitMergeAdjacentTextBlocks(this.doc,sorted[i].blockId,sorted[i+1].blockId,this.editReason()),"合并操作已暂存");
  }
  private move(delta:-1|1):void{
    if(!this.doc||!this.selectedId)return;
    const ids=[...this.doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!).map(b=>b.blockId);
    const i=ids.indexOf(this.selectedId),j=i+delta;
    if(i<0||j<0||j>=ids.length)throw Error("超出可调整的文本块边界");
    [ids[i],ids[j]]=[ids[j],ids[i]];
    const blocks=[...this.doc.blocks].sort((a,b)=>a.readingOrder!-b.readingOrder!);
    const anchored=new Set(this.doc.chapters.map(c=>c.anchorBlockId));
    if(blocks[i].chapterId!==blocks[j].chapterId||
       anchored.has(blocks[i].blockId)||anchored.has(blocks[j].blockId))
      throw Error("不能跨章节或移动章节起始块；请先校正章节边界");
    this.apply(explicitReorderBlocks(this.doc,ids,this.editReason()),"阅读顺序调整已暂存");
  }
  private changeBoundary():void{
    if(!this.doc||!this.selectedId)return;
    const chosen=this.chapterFilter.value;
    if(!chosen)throw Error("请先在章节下拉框选择要移动其起点的章节");
    this.apply(explicitMoveChapterBoundary(this.doc,chosen,this.selectedId,this.editReason()),"章节边界已暂存");
  }
  private exportDraft():void{
    if(!this.doc)return;
    const data=encodeDocumentIrV1(this.doc);
    // Local explicit user download; no network PUT, no hidden Vault mutation.
    const blob=new Blob([new Uint8Array(data)],{type:"application/json"});
    const url=URL.createObjectURL(blob);
    const anchor=document.createElement("a");anchor.href=url;
    anchor.download="document-ir.wp5-draft.json";document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
    this.status.textContent=`已请求下载 IR 草稿（${data.byteLength} 字节）；不会更新 Obsidian。`;
    // A download is NOT durable confirmation; do not clear dirty on optimistic click.
  }
  baseHash():string{return this.baselineHash;}
}
