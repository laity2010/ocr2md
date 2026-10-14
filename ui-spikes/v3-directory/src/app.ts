import "./v2MarkdownPreview.css";
import {
  AllCommunityModule, ModuleRegistry, createGrid,
  type ColDef, type GridApi, type GridOptions, type ICellRendererParams,
  type RowClickedEvent,
} from "../../v2/node_modules/ag-grid-community";
import { MacVaultHttpRegistry, MacVaultAccessError } from "../../../src/v3HttpWorkspaceFs";
import { V3DirectoryController } from "../../../src/v3DirectoryController";
import type { WorkspaceNode } from "../../../src/workspaceFsV3";
import { TableConfigurationGrid, EnumCheckboxFilter } from "../../v2/src/tableConfigurationGrid";
import { JsonSettingsEditor } from "../../v2/src/jsonSettingsEditor";
import {calibrationTheme} from "../../v2/src/calibrationTheme";
import { v3DirectoryConfigRows } from "./v2SettingsAdapter";
import { WorkingEditor } from "../../v2/src/workingEditor";
import { WorkspaceSplitter } from "../../v2/src/workspaceSplitter";
import { EditorPreviewSplitter } from "../../v2/src/editorPreviewSplitter";
import { V3Workbench, type WorkbenchView } from "./workbench";
import {applyWorkbenchTypography} from "./workbenchPresentation";
import {ModuleActivitySummary,activityLevel,type ActivityModule,type ActivityLevel} from "./moduleActivitySummary";
import { V3PdfPreview, type PdfPreviewStatus } from "./pdfPreview";
import {AgSourcePair,pairAsSettings} from "./agSourcePair";
import "./agSourcePair.css";
import "./v3UnifiedTemplate.css";
import { PdfMdReviewPanel } from "./pdfMdReviewPanel";
import { IrWorkbenchPanel } from "./irWorkbenchPanel";
import {listPublishedChapterFiles} from "./modules/chapterBoundary";
import {applyChapterHeadingNumbering} from "./modules/chapterHeading";
import {ChapterMediaController} from "./modules/chapterMedia";
import {toolIdsForCleaning} from "./modules/registry";
import type {CleaningModuleId} from "./modules/contracts";
import { WorkspaceV3Error, location } from "../../../src/workspaceFsV3";
import type { PdfMdMappingSidecarV1, MappingRelationV1, MappingPdfRegion } from "../../../src/mineruMappingSidecar";
import {
  pdfElementAtPoint,mdElementAtOffset,mdElementsOverlappingRange,
  pdfElementMdTargets,type PdfMdTextTarget,
} from "../../../src/pdfMdBidirectional";
import {
  DIRECTORY_SETTINGS_KEY, DEFAULT_DIRECTORY_SETTINGS,
  loadDirectorySettings, parseDirectorySettings,
  type DirectorySettings,
} from "./settings";

ModuleRegistry.registerModules([AllCommunityModule]);

function el<T extends HTMLElement>(id: string): T {
  const item = document.getElementById(id);
  if (!item) throw new Error("Missing " + id);
  return item as T;
}
// The Mac Vault remains rooted at Obsidian/ocr2md for protocol/IR paths.
// The V3 directory HOME (its UI navigation floor) is the actual books folder.
function insideDirectoryHome(path:string):boolean{
  return path===DIRECTORY_HOME||path.startsWith(DIRECTORY_HOME+"/");
}
const pathLabel = el<HTMLElement>("directory-path");
const count = el<HTMLElement>("row-count");
const status = el<HTMLElement>("status");
const moduleActivity=new ModuleActivitySummary(el<HTMLElement>("v3-activity-summary"));
const updateActivity=(id:ActivityModule,message:string,level?:ActivityLevel,detail?:string)=>
  moduleActivity.update(id,message,level??activityLevel(message),detail??message);
const more = el<HTMLButtonElement>("more");
const registry = new MacVaultHttpRegistry();
// The underlying mount root remains Obsidian/ocr2md, but the directory
// workspace starts at its actual books folder from the first paint.
const DIRECTORY_HOME="/ocr2md";
const controller = new V3DirectoryController(registry, "obsidian-ocr2md",
  () => "wp3-v3-ag-" + crypto.randomUUID(),undefined,DIRECTORY_HOME);
let selected: WorkspaceNode | undefined;
let initialized = false;
let currentTab: "workspace" | "workbench" | "settings" = "workspace";
let settings = loadDirectorySettings(localStorage);
applyWorkbenchTypography(settings);
let autoRefreshTimer: number | undefined;
let canPairLocally = false;
// Same v2 source editor and movable splitter, dedicated v3 split preference.
const sourceEditor = new WorkingEditor(el<HTMLDivElement>("working-editor"),
  () => {}, () => {}, () => {},undefined,undefined,undefined,undefined,false,true);
sourceEditor.setEditable(false);
sourceEditor.setShowHardReturns(settings.mdShowHardReturns);
sourceEditor.setHardReturnColor(settings.mdHardReturnColor);
const directoryPair=new AgSourcePair(el<HTMLElement>("v3-workspace-split"),
  el<HTMLElement>("directory-list"),el<HTMLElement>("working-editor"),["directory"],sourceEditor);
directoryPair.apply(settings);
const workbenchPair=new AgSourcePair(el<HTMLElement>("workbench-layout"),
  el<HTMLElement>("workbench-calibration-grid"),el<HTMLElement>("workbench-source"),
  ["boundary","cleaning"]);
workbenchPair.bindSourceHost(el<HTMLElement>("workbench-ir-source"));
workbenchPair.apply(settings);
new WorkspaceSplitter(el<HTMLDivElement>("v3-workspace-split"),
  el<HTMLDivElement>("v3-workspace-splitter"), "ocr2md-v3-directory-split-v1");
new EditorPreviewSplitter(el<HTMLDivElement>("v3-workspace-split"),
  el<HTMLDivElement>("v3-workspace-mobile-splitter"), "ocr2md-v3-directory-mobile-ag-v1",
  el<HTMLDivElement>("directory-list").closest<HTMLElement>(".workbench-grid-pane")!,34);
// Reuse v2 splitters with independent v3 preference keys; never overwrite v2
// or the working-directory pane's saved proportions.
new WorkspaceSplitter(el<HTMLDivElement>("workbench-layout"),
  el<HTMLDivElement>("workbench-column-splitter"), "ocr2md-v3-workbench-columns-v1");
new EditorPreviewSplitter(el<HTMLDivElement>("workbench-right-pane"),
  el<HTMLDivElement>("workbench-row-splitter"), "ocr2md-v3-workbench-editor-preview-v2",
  el<HTMLDivElement>("workbench-source-pane"), 38);
new EditorPreviewSplitter(el<HTMLDivElement>("workbench-layout"),
  el<HTMLDivElement>("workbench-mobile-splitter"), "ocr2md-v3-workbench-mobile-grid-height-v1",
  el<HTMLDivElement>("workbench-calibration-grid").parentElement!, 34);
let inspectedDirectory = "";
let lastDirectoryGeneration = "";
let previewEpoch = 0;
let navigating = false;
let lastFolderTap: { path: string; at: number } | undefined;
let lastPointerType = "mouse";
function fileExtension(path: string): string {
  const filename = path.slice(path.lastIndexOf("/") + 1);
  const dot = filename.lastIndexOf(".");
  return dot > 0 && dot < filename.length - 1 ? filename.slice(dot).toLowerCase() : "无后缀";
}
function entryType(node: WorkspaceNode): string {
  return node.kind === "directory" ? "目录" : fileExtension(node.path);
}
function setNavigating(value: boolean): void {
  navigating = value;
  if(value)updateActivity("workspace","正在读取目录","busy");
  const grid = el<HTMLElement>("directory-list");
  grid.inert = value;
  el<HTMLElement>("directory-grid-shell").setAttribute("aria-busy", String(value));
  el<HTMLElement>("directory-loading").hidden = !value;
  el<HTMLButtonElement>("refresh").disabled = value;
  el<HTMLButtonElement>("more").disabled = value;
  // Avoid writing a file under the OLD folder while an async browse is pending.
  el<HTMLElement>("file-actions").inert = value;
  refreshWorkingDirectoryAction();
}

const TEXT_SOURCE_EXTENSIONS = /\.(?:md|markdown|txt|json|jsonl|yaml|yml|csv|ts|tsx|js|jsx|mjs|cjs|py|html|htm|css|xml|svg|log|ini|conf|toml|sql|sh|rs|go|java|tex|rst|css|scss|vue|svelte|swift)$/i;
/** Single source pane: row metadata and bounded text are rendered in v2 CodeMirror. */
function rowInfo(node: WorkspaceNode): Record<string, unknown> {
  return {
    名称: node.path.split("/").at(-1) ?? node.path,
    路径: "Obsidian/ocr2md" + node.path,
    类型: entryType(node),
    字节数: node.kind === "file" ? node.size : null,
    修改时间: node.modifiedAt ? new Date(node.modifiedAt).toLocaleString("zh-CN") : null,
    版本: node.revision,
    节点: node.nodeId,
  };
}
function showDirectorySource(node?: WorkspaceNode): void {
  ++previewEpoch;
  // The source pane represents ONE selected AG row, never a directory-wide
  // inventory snapshot. No row selected means no item details to show.
  sourceEditor.setDocument(node
    ? JSON.stringify(rowInfo(node), null, 2)
    : "单击 AG 表中的目录或文件行，查看该项的详细信息。\n双击目录名，进入子目录。");
}
async function showFileSource(node: WorkspaceNode): Promise<void> {
  const epoch = ++previewEpoch;
  const info = rowInfo(node);
  if (!TEXT_SOURCE_EXTENSIONS.test(node.path)) {
    sourceEditor.setDocument(JSON.stringify({
      ...info, 源码: "PDF、图片和二进制文件不按文本解析；仅显示选中行详细信息。",
    }, null, 2));
    return;
  }
  sourceEditor.setDocument(JSON.stringify({ ...info, 读取状态: "正在加载只读源码…" }, null, 2));
  try {
    const response = await controller.previewFile(node);
    if (epoch !== previewEpoch) return;
    const source = new TextDecoder("utf-8").decode(response.bytes);
    if (source.includes("\u0000")) {
      sourceEditor.setDocument(JSON.stringify({ ...info,
        源码: "检测到二进制字节；不作为 UTF-8 文本展示。" }, null, 2));
      return;
    }
    const details = JSON.stringify({
      ...info,
      正文状态: response.truncated ? "仅预览前 256KiB，其余内容未加载" : "完整",
      已读取字节: response.bytes.byteLength,
    }, null, 2);
    sourceEditor.setDocument("【选中行详细信息（非原文件内容）】\n" + details
      + "\n\n【原始文件源码（只读）】\n" + source);
  } catch (error) {
    if (epoch !== previewEpoch) return;
    sourceEditor.setDocument(JSON.stringify({
      ...info, 读取错误: error instanceof Error ? error.message : String(error),
      处理建议: "刷新左侧目录后重新选择该文件",
    }, null, 2));
    report(error);
  }
}

function setStatus(message: string): void {
  status.textContent=message;
  status.title=message;
}
/** Observe existing model-owned status nodes regardless of the active tab.
 * These are intentionally hidden from view: the top strip is their ONLY
 * rendered summary. This is event-driven, not background network polling.
 */
function installUnifiedStatus():void{
  const streams:readonly {node:string;module:ActivityModule;active:()=>boolean}[]=[
    {node:"ir-status",module:"dirjson",active:()=>currentTab==="workbench"&&
      (activeWorkMode==="chapters"||activeWorkMode==="ir")},
    {node:"workbench-pdf-status",module:"pdf",active:()=>currentTab==="workbench"&&previewMode==="pdf"},
    {node:"settings-parse-status",module:"settings",active:()=>currentTab==="settings"},
    {node:"workbench-status",module:"workbench",active:()=>currentTab==="workbench"&&activeWorkMode==="text"},
    {node:"clean-status",module:"workbench",active:()=>currentTab==="workbench"&&activeWorkMode==="cleaning"},
    {node:"pdf-md-review-status",module:"workbench",active:()=>currentTab==="workbench"&&activeWorkMode==="review"},
    {node:"workspace-connection",module:"workspace",active:()=>currentTab==="workspace"},
  ];
  for(const stream of streams){
    const node=el<HTMLElement>(stream.node);
    const observe=()=>{
      const message=node.textContent?.trim();
      if(!message)return;
      // The workspace connection field is too generic; actual directory
      // progress and result comes from controller.snapshot() in render().
      // Download progress owns the workbench status until its last item is
      // accounted for; the legacy clean-status says only "已保存" and would
      // otherwise erase the download's visible progress/failure.
      if(stream.node==="clean-status"&&chapterMedia?.task&&activeWorkMode==="cleaning"&&
         activeCleaningModule==="媒体"&&chapterMedia.task.chapter===workbench?.chapterState().path)return;
      if(stream.module!=="workspace")updateActivity(stream.module,message);
      // Never leave completed background work in the legacy one-line status.
      // The live strip already owns active/draft/error state.
      if(stream.active()){
        const level=activityLevel(message);
        if(level==="busy"||level==="dirty"||level==="error")setStatus(message);
        else setStatus("");
      }
    };
    new MutationObserver(observe).observe(node,{subtree:true,childList:true,characterData:true});
  }
}

function report(e: unknown): void {
  const code=e instanceof Error&&"code" in e?(e as {code?:string}).code:undefined;
  const message=code==="ESTALE"?
    "文件已被 Obsidian/iCloud 或其他页面更新。为防止覆盖，操作已拒绝；请刷新当前目录，重新选择后重试。":
    code==="EUNSUPPORTED"?
    "不支持覆盖已有文件、批量事务或递归删除；原文件没有被改动。":
    e instanceof Error?e.message:String(e);
  const module:ActivityModule=currentTab==="settings"?"settings":currentTab==="workspace"?"workspace":
    (activeWorkMode==="chapters"||activeWorkMode==="ir")?"dirjson":"workbench";
  updateActivity(module,"操作失败","error",message);
  setStatus(message);
}
async function run(action: () => Promise<unknown>, message = ""): Promise<void> {
  try { await action(); if (message) setStatus(message); }
  catch (e) { report(e); }
}
function syncTemplateActions():void{
  el<HTMLElement>("workspace-top-actions").hidden=currentTab!=="workspace";
  el<HTMLElement>("settings-top-actions").hidden=currentTab!=="settings";
  el<HTMLElement>("workbench-inactive-actions").hidden=
    currentTab!=="workbench"||activeWorkMode==="cleaning"||
    activeWorkMode==="chapters"||activeWorkMode==="ir";
}
function switchTab(tab: "workspace" | "workbench" | "settings"): void {
  // A disabled Settings tab cannot be activated via click or code until its
  // source/AG/preview/fonts are ready. Work directory remains usable.
  if (tab === "settings" && el<HTMLButtonElement>("tab-settings").disabled) return;
  currentTab = tab;
  syncTemplateActions();
  for (const key of ["workspace", "workbench", "settings"] as const) {
    el<HTMLButtonElement>("tab-" + key).setAttribute("aria-selected", String(tab === key));
    el<HTMLElement>("panel-" + key).hidden = tab !== key;
  }
  if (tab === "settings") window.requestAnimationFrame(()=>{
    sharedSettingsPanel?.refresh();
    window.dispatchEvent(new Event("resize"));
  });
  else if (tab === "workspace") window.requestAnimationFrame(() => gridApi?.sizeColumnsToFit());
  else window.dispatchEvent(new Event("resize"));

}
el<HTMLButtonElement>("tab-workspace").addEventListener("click", () => {
  if(currentTab==="workbench"&&!confirmDropDraft("离开工作台"))return;
  switchTab("workspace");
});
el<HTMLButtonElement>("tab-settings").addEventListener("click", () => switchTab("settings"));
el<HTMLButtonElement>("tab-workbench").addEventListener("click", () => switchTab("workbench"));

interface DirectoryRow {
  id: string;
  kind: "parent" | "directory" | "file";
  path: string;
  label: string;
  size: number;
  modifiedAt?: string;
  revision: string;
  node?: WorkspaceNode;
}
function rootParent(path: string): string {
  if(path===DIRECTORY_HOME||!insideDirectoryHome(path))return DIRECTORY_HOME;
  const parent=path.slice(0,path.lastIndexOf("/"))||"/";
  return insideDirectoryHome(parent)?parent:DIRECTORY_HOME;
}
function rowHeight(): number {
  return settings.gridDensity === "compact" ? 34 : settings.gridDensity === "comfortable" ? 49 : 40;
}
function withTheme() {
  // Use V2's single AG theme, with the directory-only font setting preserved.
  return calibrationTheme.withParams({fontSize: settings.gridFontSize});
}
function selectRow(node: WorkspaceNode): void {
  if (navigating) return;
  if (lastFolderTap?.path !== node.path) lastFolderTap = undefined;
  selected = node;
  refreshWorkingDirectoryAction();
  gridApi.redrawRows();
  if (node.kind === "directory") showDirectorySource(node);
  else {
    void showFileSource(node);
    if (settings.clickFileReads) void readSelectedFile();
  }
}
async function browseDirectory(path: string, detail?: WorkspaceNode): Promise<void> {
  if(!insideDirectoryHome(path))return; // UI cannot escape its default book root.
  if (navigating || controller.snapshot().busy) return;
  setNavigating(true);
  lastFolderTap = undefined;
  try {
    // Each folder owns its own column values; old filters must not leak.
    gridApi.setFilterModel(null);
    selected = undefined;
    await controller.browse(path);
    if (controller.snapshot().directory === path) {
      showDirectorySource(detail);
      setStatus(""); // Directory completed; summary automatically exits.
    }
  } catch (error) { report(error); }
  finally { setNavigating(false); }
}
function navigateRow(row: DirectoryRow): void {
  if (navigating) return;
  if (row.kind === "parent") {
    if (controller.snapshot().directory !== DIRECTORY_HOME) void browseDirectory(row.path);
  } else if (row.node) {
    selectRow(row.node);
  }
}
function openDirectory(row: DirectoryRow): void {
  if (navigating || row.kind !== "directory" || !row.node) return;
  void browseDirectory(row.path, row.node);
}
function renderName(params: ICellRendererParams<DirectoryRow>): HTMLElement {
  const row = params.data;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "directory-entry";
  if (!row) return btn;
  btn.textContent = row.kind === "parent" ? "↩ 返回上级目录" :
    (row.kind === "directory" ? "📁 " : "📄 ") + row.label;
  btn.title = row.path;
  btn.dataset.kind = row.kind;
  btn.dataset.openPath = row.path;
  if (row.node) btn.dataset.nodeId = row.node.nodeId;
  if (row.kind === "parent") btn.dataset.testid = "directory-parent";
  btn.disabled = row.kind === "parent" && controller.snapshot().directory === DIRECTORY_HOME;
  btn.addEventListener("pointerdown", ev => { lastPointerType = ev.pointerType; });
  btn.addEventListener("click", ev => {
    ev.stopPropagation();
    if (row.kind === "directory" && lastPointerType === "touch") {
      // Mobile Safari may deliver two touch clicks but no native dblclick.
      // Do NOT use the fallback for mouse: native dblclick must finish before
      // we make the grid inert (otherwise mouse dblclick can stall).
      const now = performance.now();
      const twice = lastFolderTap?.path === row.path && now - lastFolderTap.at < 650;
      lastFolderTap = { path: row.path, at: now };
      if (twice) { openDirectory(row); return; }
    }
    navigateRow(row);
  });
  if (row.kind === "directory") btn.addEventListener("dblclick", ev => {
    ev.stopPropagation();
    openDirectory(row);
  });
  return btn;
}
function formattedSize(size: number): string {
  if (size < 1024) return size + " B";
  return size < 1024 * 1024 ? (size / 1024).toFixed(1) + " KB" :
    (size / (1024 * 1024)).toFixed(1) + " MB";
}
function formattedModified(value: string | undefined): string {
  return value ? new Date(value).toLocaleString("zh-CN") : "—";
}
/** Reuse the v2 checkbox enum filter with All for every directory column. */
function columnDefs(): ColDef<DirectoryRow>[] {
  return [
    { field: "label", headerName: "名称", flex: 3, minWidth: 185,
      sortable: true, filter: EnumCheckboxFilter, cellRenderer: renderName,
      valueGetter: params => params.data?.label ?? "" },
    { colId: "kind", headerName: "类型", width: 105, minWidth: 84,
      hide: !settings.showTypeColumn, filter: EnumCheckboxFilter,
      valueGetter: params => params.data?.kind === "directory" ? "目录" :
        params.data?.kind === "file" && params.data.node ? fileExtension(params.data.path) : "上级" },
    { field: "size", headerName: "大小", width: 112,
      hide: !settings.showSizeColumn, filter: EnumCheckboxFilter,
      filterValueGetter: params => params.data?.kind === "file" ? formattedSize(params.data.size) : "—",
      valueFormatter: params => params.data?.kind === "file" ? formattedSize(Number(params.value ?? 0)) : "—" },
    { field: "modifiedAt", headerName: "修改时间", width: 192,
      hide: !settings.showModifiedColumn, filter: EnumCheckboxFilter,
      filterValueGetter: params => formattedModified(params.data?.modifiedAt),
      valueFormatter: params => formattedModified(params.value) },
    { field: "revision", headerName: "版本", minWidth: 200, flex: 1,
      hide: !settings.showRevisionColumn, filter: EnumCheckboxFilter },
  ];
}

let gridApi: GridApi<DirectoryRow>;
const gridOptions: GridOptions<DirectoryRow> = {
  theme: withTheme(),
  rowData: [],
  pinnedTopRowData: [{id:"__parent",kind:"parent",path:"/",label:"返回上级目录",size:0,revision:""}],
  columnDefs: columnDefs(),
  defaultColDef: { resizable:false, suppressMovable:true, sortable:true, filter:true, suppressHeaderMenuButton:false },
  suppressMovableColumns: true,
  suppressDragLeaveHidesColumns: true,
  rowHeight: rowHeight(),
  headerHeight: 42,
  animateRows: false,
  ensureDomOrder: true,
  getRowId: params => params.data.id,
  getRowClass: params => params.data?.kind === "parent" ? "directory-parent-row" :
    params.data?.node && selected?.nodeId === params.data.node.nodeId ? "directory-selected-row" : "",
  onRowClicked: (event: RowClickedEvent<DirectoryRow>) => {
    if (event.data) directoryPair.activateGridRow(()=>navigateRow(event.data!),"inspect");
  },
  onRowDoubleClicked: event => {
    // Only double-clicking the NAME column opens folders, never other columns.
    if (event.data?.kind === "directory" && event.column?.getColId() === "label") openDirectory(event.data);
  },
  onGridReady: event => { event.api.sizeColumnsToFit(); },
};
gridApi = createGrid(el<HTMLDivElement>("directory-list"), gridOptions);

function render(): void {
  const state = controller.snapshot();
  if (state.directory !== inspectedDirectory || (!selected && state.generation !== lastDirectoryGeneration)) {
    inspectedDirectory = state.directory;
    lastDirectoryGeneration = state.generation;
    // Never print the directory-wide inventory in the source pane.
    showDirectorySource();
  }
  // This is a real logical path within the mounted Mac Obsidian Vault.
  pathLabel.textContent = "Obsidian/ocr2md" + (state.directory === "/" ? "/" : state.directory);
  count.textContent = state.entries.length + " 项" + (state.nextCursor ? "（还有更多）" : "") +
    (state.stale ? " · 已变化" : "");
  more.hidden = !state.nextCursor;
  if (selected && !state.entries.some(n => n.nodeId === selected?.nodeId && n.path === selected.path)) {
    selected = undefined;
    showDirectorySource();
  }
  const entries = [...state.entries].sort((a,b) => {
    if (settings.foldersFirst && a.kind !== b.kind) return a.kind === "directory" ? -1 : 1;
    return a.path.localeCompare(b.path, "zh-CN");
  });
  const rows: DirectoryRow[] = entries.map(node => ({
    id: node.nodeId, kind:node.kind, path:node.path,
    label:node.path.split("/").at(-1) ?? node.path, size:node.size,
    modifiedAt:node.modifiedAt, revision:node.revision, node,
  }));
  gridApi.setGridOption("rowData", rows);
  gridApi.setGridOption("pinnedTopRowData", [{
    id:"__parent:" + state.directory, kind:"parent", path:rootParent(state.directory),
    label:"返回上级目录", size:0, revision:"",
  }]);
  el<HTMLElement>("workspace-connection").textContent = state.error ? "目录需要刷新" : "已连接";
  const directoryName=state.directory.split("/").filter(Boolean).at(-1)??"/";
  updateActivity("workspace",state.error?"目录读取失败":state.stale?"目录已变化":
    !initialized?"正在连接工作目录":state.busy||navigating?"正在读取 "+directoryName:
    `已就绪 · ${state.entries.length} 项`,
    state.error||state.stale?"error":!initialized||state.busy||navigating?"busy":"ready",
    state.error??`Obsidian/ocr2md${state.directory} · ${state.entries.length} 项`);
  refreshWorkingDirectoryAction();
}
controller.subscribe(render);

/** A selected directory wins; otherwise the displayed directory is eligible. */
function chosenWorkbenchFolder(): string {
  return selected?.kind === "directory" ? selected.path : controller.snapshot().directory;
}
function refreshWorkingDirectoryAction(): void {
  const button=el<HTMLButtonElement>("set-working-directory");
  button.disabled=!initialized || navigating || controller.snapshot().busy;
  button.title="Obsidian/ocr2md"+chosenWorkbenchFolder();
}
let pdfPreview: V3PdfPreview;
let lastPdfFolder = "";
let pdfSelectPath = "";
let previewMode: "pdf" | "markdown" = "markdown";
let reviewPanel: PdfMdReviewPanel;
let irPanel:IrWorkbenchPanel;
let activeWorkMode:"chapters"|"text"|"review"|"ir"|"cleaning"="chapters";
let currentChapterSelection="";
let chapterNavEpoch=0;
let chapterSaveStatus="";
let activeCleaningModule:CleaningModuleId="章节标题";
let chapterMedia:ChapterMediaController;
function showMediaTaskInTopBar():void{
  const chapter=workbench?.chapterState().path;
  const task=chapterMedia?.task;
  const status=chapterMedia?.status();
  const visible=activeWorkMode==="cleaning"&&activeCleaningModule==="媒体"&&
    !!task&&task.chapter===chapter;
  const item=el<HTMLElement>("v3-activity-summary").querySelector<HTMLElement>(
    '[data-module-status="workbench"]');
  if(item){
    if(visible)item.dataset.mediaDownload="true";else delete item.dataset.mediaDownload;
  }
  moduleActivity.retainCompleted("workbench",Boolean(visible&&task?.phase==="done"));
  if(!visible){
    if(item?.dataset.summary?.startsWith("图片下载"))
      updateActivity("workbench","章节清洗已就绪","ready");
    return;
  }
  if(!task)return;
  if(!status)return;
  updateActivity("workbench",status.summary,status.level,
    status.summary+"；各图片的失败原因在媒体 AG 表中");
}
function updateChapterActions():void{
  if(!workbench)return;
  const state=workbench.chapterState();
  chapterMedia?.updateTool(activeWorkMode==="cleaning"&&activeCleaningModule==="媒体");
  showMediaTaskInTopBar();
  el<HTMLButtonElement>("clean-undo").disabled=!state.editing||!state.canUndo||state.saving;
  el<HTMLButtonElement>("clean-redo").disabled=!state.editing||!state.canRedo||state.saving;
  const save=el<HTMLButtonElement>("clean-save");
  save.disabled=!state.editing||!state.dirty||state.saving;
  save.dataset.dirty=String(state.dirty);
  const label=el<HTMLElement>("clean-status");
  label.textContent=state.saving?"正在保存…":
    chapterSaveStatus.startsWith("保存失败")?chapterSaveStatus:
    state.dirty?"未保存":
    chapterSaveStatus||"已保存 / 未修改";
  const nav=el<HTMLSelectElement>("workbench-path-nav");
  if(state.saving)nav.disabled=true;
  else if(nav.options.length>0&&nav.value)nav.disabled=false;
}
async function loadChapterNavigator(book:string):Promise<void>{
  const epoch=++chapterNavEpoch;
  const nav=el<HTMLSelectElement>("workbench-path-nav");
  nav.replaceChildren(new Option("正在加载章节目录…",""));nav.disabled=true;
  let files:WorkspaceNode[]=[];
  try{
    files=await listPublishedChapterFiles(await registry.open("obsidian-ocr2md"),book);
  }catch(err){
    if(!(err instanceof WorkspaceV3Error&&err.code==="ENOENT"))
      chapterSaveStatus="章节目录不可用："+String(err);
  }
  if(epoch!==chapterNavEpoch||workbench.snapshot().folder!==book)return;
  workbench.setChapterFiles(files);
  nav.replaceChildren(new Option(book.split("/").at(-1)+" / · 章节定界",book));
  const group=document.createElement("optgroup");group.label="chapters/ · 章节清洗";
  for(const file of files)group.append(new Option("chapters/"+(file.path.split("/").at(-1)??""),file.path));
  nav.append(group);
  nav.value=book;
  currentChapterSelection=book;
  nav.disabled=false;
}
// Exact OCR PDF focus remains pending while the user chooses to read MD.
// Never require PDF.js page geometry while its tab is hidden.
type PendingPdfLocation={kind:"region";region:MappingPdfRegion;elementId:string;pdfPath:string}|
  {kind:"page";page:number;pdfPath:string};
let pendingPdfLocation:PendingPdfLocation|undefined;
let pdfLocationSerial=0;
let lastLocatedSerial=-1;
let lastPrewarmedSerial=-1;
let pdfFocusTimer:ReturnType<typeof setTimeout>|undefined;
function schedulePdfLocation(delay=130):void{
  if(pdfFocusTimer)clearTimeout(pdfFocusTimer);
  pdfFocusTimer=setTimeout(()=>{
    pdfFocusTimer=undefined;
    if(previewMode==="pdf")void applyPendingPdfLocation();
    else prewarmPendingPdfPage();
  },delay);
}
function prewarmPendingPdfPage():void{
  const pending=pendingPdfLocation,serial=pdfLocationSerial;
  if(!pending||serial===lastPrewarmedSerial||previewMode!=="markdown"||
    currentTab!=="workbench"||pdfPreview.snapshot().phase!=="ready"||
    pdfPreview.snapshot().file?.path!==pending.pdfPath)return;
  lastPrewarmedSerial=serial;
  try{pdfPreview.prewarmPage(pending.kind==="region"?pending.region.pdfPageNumber:pending.page);}
  catch(error){
    if(serial===pdfLocationSerial)
      updateActivity("pdf","预热目标页失败","error",String(error));
  }
}
function cancelPdfAutoFocusOnUserScroll():void{
  // User navigation wins, even while PDF.js is asynchronously fetching a
  // target page. Reopening the tab never replays an old title selection.
  pendingPdfLocation=undefined;
  ++pdfLocationSerial;
  lastLocatedSerial=pdfLocationSerial;
  if(pdfFocusTimer){clearTimeout(pdfFocusTimer);pdfFocusTimer=undefined;}
}
function queuePdfLocation(target:PendingPdfLocation):void{
  pendingPdfLocation=target;pdfLocationSerial++;
  // Several quick AG taps coalesce into one page warm/navigation, never
  // concurrently fetch a large scanned PDF on every hover or row click.
  schedulePdfLocation(previewMode==="pdf"?130:200);
}
async function applyPendingPdfLocation():Promise<void>{
  const pending=pendingPdfLocation;
  const serial=pdfLocationSerial;
  if(!pending||lastLocatedSerial===serial||previewMode!=="pdf"||
    pdfPreview.snapshot().phase!=="ready"||
    pdfPreview.snapshot().file?.path!==pending.pdfPath)return;
  try{
    if(previewMode!=="pdf"||serial!==pdfLocationSerial)return;
    // Claim before awaiting: pagechanging -> pdfStatusChanged can synchronously
    // recurse into this function while focusRegion is fetching the PDF page.
    lastLocatedSerial=serial;
    if(pending.kind==="region")await pdfPreview.focusRegion(pending.region,pending.elementId);
    else pdfPreview.focusPage(pending.page);
  }catch(error){
    if(serial===pdfLocationSerial)el<HTMLElement>("workbench-pdf-status").textContent=
      "PDF 定位失败（MD 预览保留）："+String(error);
  }
}
let irLoadEpoch=0;
let currentMapping:PdfMdMappingSidecarV1|undefined;
let mappingFolder="";
let mappingEpoch=0;
let highlightedElementId="";
let currentPdfMdTargets:PdfMdTextTarget[]=[];
let navEpoch=0;
const mdElementSelect=el<HTMLSelectElement>("md-element-select");
const mdStatus=el<HTMLElement>("md-pdf-status");
const pdfMdSelect=el<HTMLSelectElement>("pdf-md-target");
function renderMdElementSelect():void{
  const file=workbench?.snapshot().file;
  const records=file&&currentMapping?.relations.flatMap(r=>
    pdfElementMdTargets(currentMapping!,r.elementId).some(t=>t.path===file.path)?[r]:[]) || [];
  const old=mdElementSelect.value;
  mdElementSelect.replaceChildren(new Option(records.length?"选择或点击 MD 元素":"当前 MD 未找到唯一候选",""));
  for(const r of records){
    const page=r.pdfRegions[0]?.pdfPageNumber||0;
    mdElementSelect.append(new Option(`PDF ${page} 页 · ${r.type} · ${r.matchStatus} · ${r.elementId.split(":").at(-1)}`,r.elementId));
  }
  mdElementSelect.value=records.some(r=>r.elementId===old)?old:"";
  mdElementSelect.disabled=records.length===0;
  el<HTMLButtonElement>("md-jump-pdf").disabled=!records.length||!currentMapping;
}
function renderPdfMdTargets(relation?:MappingRelationV1):void{
  currentPdfMdTargets=relation&&currentMapping?pdfElementMdTargets(currentMapping,relation.elementId):[];
  const corrected=relation&&reviewPanel?.getCorrectedAnchor(relation.elementId);
  if(corrected){
    currentPdfMdTargets=[{elementId:relation!.elementId,...corrected,layer:"working"},
      ...currentPdfMdTargets.filter(x=>x.path!==corrected.path||x.from!==corrected.from||x.to!==corrected.to)];
  }
  pdfMdSelect.replaceChildren(new Option(currentPdfMdTargets.length?"选择 MD 版本":"该元素无唯一 MD 锚点",""));
  for(const [index,t] of currentPdfMdTargets.entries()){
    pdfMdSelect.append(new Option(`${corrected&&index===0?"人工校正":t.layer==="working"?"工作稿":t.layer==="chapter"?"章节原稿":"MinerU 原始 MD"} · ${t.path.split("/").at(-1)} · UTF-16 ${t.from}`,String(index)));
  }
  if(corrected)pdfMdSelect.value="0";
  // Automatic navigation is safe only if there is one uniquely anchored file
  // in the preferred layer. Multiple equally-ranked candidates need a choice.
  for(const layer of (corrected?[]:["working","chapter","original"]) as readonly ("working"|"chapter"|"original")[]){
    const match=currentPdfMdTargets.map((t,i)=>({t,i})).filter(x=>x.t.layer===layer);
    if(match.length===1){pdfMdSelect.value=String(match[0].i);break;}
    if(match.length>1)break;
  }
  pdfMdSelect.disabled=!currentPdfMdTargets.length;
  el<HTMLButtonElement>("pdf-jump-md").disabled=!currentPdfMdTargets.length || pdfMdSelect.value==="";
}
async function goPdfToMd():Promise<void>{
  const target=pdfMdSelect.value!==""?currentPdfMdTargets[Number(pdfMdSelect.value)]:undefined;
  if(!target||!currentMapping||!mappingFolder){
    setElementStatus("没有唯一可验证的 MD 锚点；请选择其他元素或人工审核。");return;
  }
  const epoch=++navEpoch,folder=mappingFolder,sourceMap=currentMapping;
  try{
    await workbench.openFile(target.path);
    if(navEpoch!==epoch||mappingFolder!==folder||currentMapping!==sourceMap)return;
    if(workbench.snapshot().file?.path!==target.path||workbench.snapshot().truncated)
      throw Error("MD 目标未完整读取；拒绝旧偏移定位");
    workbench.revealOffsets(target.from,target.to);
    // Public state used by accessibility diagnostics and stable DOM-based UI
    // contracts; records offsets only, never source text or secrets.
    const source=el<HTMLDivElement>("workbench-source");
    source.dataset.pdfMdElementId=target.elementId;
    source.dataset.pdfMdAnchorPath=target.path;
    source.dataset.pdfMdFrom=String(target.from);
    source.dataset.pdfMdTo=String(target.to);
    mdElementSelect.value=target.elementId;
    mdStatus.textContent=`已定位 ${target.layer} · ${target.path.split("/").at(-1)} · UTF-16 [${target.from}, ${target.to})；候选待审核`;
    setElementStatus(`PDF → MD · 章节源码已定位；原 PDF 框选保留，候选未人工核准。`);
  }catch(error){
    if(navEpoch===epoch){mdStatus.textContent="PDF → MD 失败："+String(error);
      setElementStatus("导航失效：MD 来源已变更或不可读取；重新加载 WP4 映射。");}
  }
}
async function goMdToPdf(relation:MappingRelationV1):Promise<void>{
  if(!currentMapping||currentMapping.pdf.path!==pdfSelectPath){
    mdStatus.textContent="MD → PDF 不可用：当前 PDF 与映射文件不同";return;
  }
  const region=relation.pdfRegions[0];
  if(!region){mdStatus.textContent="MD → PDF 缺少 bbox";return;}
  try{
    queuePdfLocation({kind:"region",region,elementId:relation.elementId,pdfPath:pdfSelectPath});
    highlightedElementId=relation.elementId;
    renderPdfElementSelect();renderPdfMdTargets(relation);
    elementSelect.value=relation.elementId;
    mdStatus.textContent=`MD → PDF · 第 ${region.pdfPageNumber} 页 ${relation.type} 已框选，仍待人工审核。`;
    setElementStatus(`MD → PDF 第 ${region.pdfPageNumber} 页 · ${relation.matchStatus}（待审核）`);
  }catch(error){mdStatus.textContent="MD → PDF 失败："+String(error);}
}
function onMdPosition(path:string,from:number,to:number,origin:"row"|"cursor",blockId?:string):void{
  if(workbench.snapshot().file?.path!==path)return;
  // Published DIRjson chapter markers are stronger evidence than legacy WP4
  // paths (which may not contain newly published chapters at all).
  if(activeWorkMode==="cleaning"&&blockId){
    const evidence=activeCleaningModule==="章节标题"?
      irPanel?.chapterHeadingEvidence(blockId,path,pdfSelectPath):
      irPanel?.chapterBlockEvidence(blockId,path,pdfSelectPath);
    if(evidence){
      highlightedElementId="";
      renderPdfElementSelect();
      if(evidence.kind==="regions"){
        const region=evidence.regions[0];
        queuePdfLocation({kind:"region",region,elementId:"ir:"+blockId,pdfPath:pdfSelectPath});
        mdStatus.textContent=`AG → DIRjson · 第 ${region.pdfPageNumber} 页 OCR 来源框已定位（待人工核对）。`;
      }else{
        queuePdfLocation({kind:"page",page:evidence.page,pdfPath:pdfSelectPath});
        mdStatus.textContent=`AG → DIRjson · 第 ${evidence.page} 页人工标注来源（无 OCR 边框）。`;
      }
      // A stable provenance id for browser review; do not persist it to MD.
      const host=el<HTMLElement>("workbench-source");
      host.dataset.irBlockId=blockId;
      host.dataset.irPages=evidence.kind==="regions"
        ? [...new Set(evidence.regions.map(r=>r.pdfPageNumber))].join(","):String(evidence.page);
      return;
    }
    mdStatus.textContent="本标题缺少已保存 DIRjson 的唯一来源证据；不猜测 PDF 位置。";
  }
  if(!currentMapping)return;
  const result=to>from?mdElementsOverlappingRange(currentMapping,path,from,to):
    mdElementAtOffset(currentMapping,path,from);
  if(result.kind==="unique"){
    mdElementSelect.value=result.value.elementId;
    void goMdToPdf(result.value);
  }else if(result.kind==="ambiguous"){
    mdStatus.textContent=`${origin==="row"?"AG 行":"MD 光标"}覆盖 ${result.count} 个候选元素；请选择“MD 对应元素”，不能自动猜测。`;
  }else{
    mdStatus.textContent="当前位置没有唯一 PDF 对应元素，请用 MD 候选下拉框选择或人工审阅。";
  }
}
function onPdfCanvasPoint(page:number,x:number,y:number):void{
  if(activeWorkMode==="cleaning"){
    const path=workbench.snapshot().file?.path;
    if(path){
      const anchors=activeCleaningModule==="章节标题"?
        workbench.chapterHeadingAnchors():workbench.cleaningElementAnchors();
      const matches=anchors.filter(blockId=>{
        const evidence=activeCleaningModule==="章节标题"?
          irPanel?.chapterHeadingEvidence(blockId,path,pdfSelectPath):
          irPanel?.chapterBlockEvidence(blockId,path,pdfSelectPath);
        return evidence?.kind==="regions"&&evidence.regions.some(region=>
          region.pdfPageNumber===page&&x>=region.normalizedBBox[0]&&
          x<=region.normalizedBBox[2]&&y>=region.normalizedBBox[1]&&
          y<=region.normalizedBBox[3]);
      });
      if(matches.length===1){
        const activated=activeCleaningModule==="章节标题"?
          workbench.activateHeadingBlock(matches[0]):workbench.activateCleaningBlock(matches[0]);
        if(!activated)return;
        setElementStatus(`PDF → ${activeCleaningModule} · 已回到 AG/源码/MD 预览（OCR 来源待审核）。`);
        return;
      }
      if(matches.length>1){
        setElementStatus(`PDF 点击位置覆盖 ${matches.length} 个本章标题来源框；不能自动猜测。`);
        return;
      }
    }
  }
  if(activeWorkMode==="ir"||activeWorkMode==="chapters"){
    irPanel.onPdfPoint(page,x,y);return;
  }
  if(!currentMapping||currentMapping.pdf.path!==pdfSelectPath)return;
  const result=pdfElementAtPoint(currentMapping,page,x,y);
  if(result.kind==="ambiguous"){
    setElementStatus(`PDF 点击位置覆盖 ${result.count} 个候选框；请在当前页 OCR 元素下拉框明确选择。`);return;
  }
  if(result.kind!=="unique")return;
  const relation=result.value,sourceMap=currentMapping,sourceFolder=mappingFolder;
  const region=relation.pdfRegions.find(r=>r.pdfPageNumber===page);
  if(!region)return;
  void (async()=>{
    // PDF → MD must keep the exact source marker visible as evidence.
    await pdfPreview.focusRegion(region,relation.elementId);
    if(sourceMap!==currentMapping||sourceFolder!==mappingFolder)return;
    highlightedElementId=relation.elementId;
    renderPdfElementSelect();elementSelect.value=relation.elementId;
    renderPdfMdTargets(relation);
    if(pdfMdSelect.value!=="")await goPdfToMd();
    else setElementStatus("PDF 元素已框选，但缺少唯一 MD 锚点；请手动选择对应版本。");
  })().catch(error=>setElementStatus("PDF 点击定位失败："+String(error)));
}

const elementSelect=el<HTMLSelectElement>("pdf-element-select");
const elementStatus=el<HTMLElement>("pdf-element-locator-status");
function setElementStatus(text:string):void{elementStatus.textContent=text;}
function elementsOnPage(page:number):MappingRelationV1[]{
  if(!currentMapping || currentMapping.pdf.path!==pdfSelectPath)return [];
  return currentMapping.relations.filter(relation=>relation.pdfRegions.some(r=>r.pdfPageNumber===page));
}
function renderPdfElementSelect():void{
  const ready=pdfPreview?.snapshot().phase==="ready";
  const page=pdfPreview?.snapshot().page??0;
  const elements=elementsOnPage(page);
  elementSelect.replaceChildren(new Option(elements.length?"选择当前页的元素":"当前页无可定位的元素",""));
  elements.forEach((relation,index)=>{
    const type=relation.type;
    const state=relation.matchStatus;
    elementSelect.append(new Option(`#${index+1} ${type} · ${state}`,relation.elementId));
  });
  elementSelect.value=elements.some(r=>r.elementId===highlightedElementId)?highlightedElementId:"";
  elementSelect.disabled=!ready||elements.length===0;
  el<HTMLButtonElement>("pdf-element-focus").disabled=!ready||!elements.length;
  el<HTMLButtonElement>("pdf-element-clear").disabled=!highlightedElementId;
}
async function loadFolderMapping(folder:string):Promise<void>{
  const epoch=++mappingEpoch;
  currentMapping=undefined;highlightedElementId="";
  reviewPanel?.reset();
  renderPdfMdTargets();renderMdElementSelect();
  setElementStatus("正在通过 WorkspaceFS 校验 PDF、OCR JSON 和章节 MD 来源…");
  renderPdfElementSelect();
  try{
    const loaded=await workbench.loadMapping(folder);
    if(epoch!==mappingEpoch||mappingFolder!==folder)return;
    if(!loaded.sourcesCurrent){
      setElementStatus("映射来源已变更（STALE）：禁止使用旧坐标，请重建 WP4 映射。");
      return;
    }
    currentMapping=loaded.sidecar;
    workbench.setMappedDocuments(loaded.sidecar);
    void workbench.reviewFilesystem().then(fs=>reviewPanel.open(
      fs,folder,loaded.sidecar,loaded.sidecarSha256));
    renderMdElementSelect();
    setElementStatus(`已校验映射 ${loaded.sidecar.relations.length} 项 · 全部仍为待审候选；先打开 PDF 页再选择框选。`);
    renderPdfElementSelect();
  }catch(error){
    if(epoch!==mappingEpoch||mappingFolder!==folder)return;
    setElementStatus(error instanceof WorkspaceV3Error&&error.code==="ENOENT"
      ?"未找到 .ocr2md/pdf-md-map.v1.json；可正常阅读 PDF，但不能使用 OCR 坐标定位。"
      :"映射不可用（禁止定位）："+String(error));
    renderPdfElementSelect();
  }
}
function clearPdfElementSelection():void{
  highlightedElementId="";
  pdfPreview.clearHighlight();
  renderPdfElementSelect();
  renderPdfMdTargets();
}

function switchWorkbenchPreview(mode: "pdf" | "markdown"):void {
  // PDF.js must have completed pagesinit; opening a loading PDF tab gives an
  // empty pane and steals the reader's current Markdown position.
  if(mode==="pdf" && pdfPreview?.snapshot().phase!=="ready")mode="markdown";
  previewMode=mode;
  for(const key of ["pdf","markdown"] as const){
    el<HTMLButtonElement>("preview-tab-"+key).setAttribute("aria-selected",String(mode===key));
    el<HTMLElement>("preview-panel-"+key).hidden=mode!==key;
  }
  el<HTMLElement>("wb-pdf-tools").hidden=mode!=="pdf";
  if(mode==="pdf")window.requestAnimationFrame(()=>{
    // PDF.js was initialized/painted in the background. Only the latest
    // never-yet-applied heading is eligible; do not replay on tab switches.
    void pdfPreview.resize().then(()=>schedulePdfLocation(50));
  });
  else window.dispatchEvent(new Event("ocr2md:v3:md-preview-shown"));
}
function pdfStatusChanged(view: PdfPreviewStatus):void {
  if(highlightedElementId && view.page>0 &&
     !elementsOnPage(view.page).some(x=>x.elementId===highlightedElementId)){
    // Also covers manual wheel/trackpad scrolling, not just page toolbar.
    pdfPreview.clearHighlight();highlightedElementId="";
    setElementStatus("已离开框选所在页，旧高亮已清除；可选择本页元素重新定位。");
  }
  const total=el<HTMLElement>("pdf-page-total");
  total.textContent="/ "+view.pages;
  const number=el<HTMLInputElement>("pdf-page-number");
  number.value=String(view.page||1);
  number.max=String(Math.max(1,view.pages));
  const ready=view.phase==="ready";
  const pdfTab=el<HTMLButtonElement>("preview-tab-pdf");
  pdfTab.disabled=!ready;
  pdfTab.setAttribute("aria-disabled",String(!ready));
  pdfTab.title=ready?"PDF 已就绪，点击查看原文":
    view.phase==="error"?"PDF 载入失败，请重试":
    view.phase==="empty"?"请先加载 PDF 原文":"PDF 正在加载，完成后可点击";
  if(!ready&&previewMode==="pdf")switchWorkbenchPreview("markdown");
  if(ready&&previewMode==="pdf")void applyPendingPdfLocation();
  else if(ready&&previewMode==="markdown"&&pendingPdfLocation&&
    lastPrewarmedSerial!==pdfLocationSerial)schedulePdfLocation(60);
  const zoom=el<HTMLSelectElement>("pdf-zoom-value");
  zoom.disabled=!ready;
  const zoomKey=view.zoomMode==="custom"?String(view.zoomPercent):view.zoomMode;
  if(!Array.from(zoom.options).some(o=>o.value===zoomKey)&&view.zoomMode==="custom"){
    zoom.querySelector('[data-custom-zoom="true"]')?.remove();
    const custom=new Option(`${view.zoomPercent}%`,zoomKey);
    custom.dataset.customZoom="true";zoom.add(custom);
  }
  zoom.value=zoomKey;
  el<HTMLButtonElement>("pdf-zoom-out").disabled=!ready||pdfPreview.snapshot().zoomPercent<=50&&view.zoomMode==="custom";
  el<HTMLButtonElement>("pdf-zoom-in").disabled=!ready||pdfPreview.snapshot().zoomPercent>=300&&view.zoomMode==="custom";
  number.disabled=!ready;
  el<HTMLButtonElement>("pdf-reload").disabled=!view.file || view.phase==="loading" || view.phase==="rendering";
  el<HTMLButtonElement>("pdf-page-prev").disabled=!ready||view.page<=1;
  el<HTMLButtonElement>("pdf-page-next").disabled=!ready||view.page>=view.pages;
  const status=el<HTMLElement>("workbench-pdf-status");
  renderPdfElementSelect();
  status.textContent = view.phase==="empty"?"未加载 PDF 原文":
    view.phase==="loading"?"正在按需读取 PDF 原文…":
    view.phase==="rendering"?"正在预热 PDF 首屏…":
    view.phase==="ready"&&view.renderingPage?"正在渲染第 "+view.renderingPage+" 页…":
    view.phase==="ready"?"PDF 原文 · 第 "+view.page+" / "+view.pages+" 页 · 首屏已绘制":
    "PDF 加载失败："+(view.error??"未知错误");
  updateActivity("pdf",status.textContent,
    view.phase==="error"?"error":view.phase==="loading"||view.phase==="rendering"||
    !!view.renderingPage?"busy":view.phase==="ready"?"ready":"idle",
    (view.file?.path??"尚未选择 PDF")+" · "+status.textContent);
}
el<HTMLButtonElement>("pdf-zoom-out").addEventListener("click",()=>pdfPreview.zoomStep(-1));
el<HTMLButtonElement>("pdf-zoom-in").addEventListener("click",()=>pdfPreview.zoomStep(1));
el<HTMLSelectElement>("pdf-zoom-value").addEventListener("change",event=>{
  const value=(event.target as HTMLSelectElement).value;
  if(value==="page-width"||value==="page-fit")pdfPreview.setZoom(value);
  else pdfPreview.setZoom("custom",Number(value));
});
async function openSelectedPdf(path:string):Promise<void>{
  if(!path)return;
  try {
    pdfSelectPath=path;
    pendingPdfLocation=undefined;pdfLocationSerial++;
    if(pdfFocusTimer){clearTimeout(pdfFocusTimer);pdfFocusTimer=undefined;}
    clearPdfElementSelection();
    navEpoch++;renderPdfMdTargets();
    const {fs,file}=await workbench.pdfSource(path);
    if(pdfSelectPath!==path)return;
    await pdfPreview.open(fs,file);
  }catch(error){
    el<HTMLElement>("workbench-pdf-status").textContent="无法打开 PDF："+String(error);
    updateActivity("pdf","打开失败","error",String(error));
    renderPdfElementSelect();
  }
}
function workbenchDirectoryReady(view: WorkbenchView):void{
  el<HTMLElement>("workbench-ocr-json-status").textContent="OCR JSON：检测到 "+view.jsons.length+" 份（暂不解析校对）";
  const select=el<HTMLSelectElement>("workbench-pdf-file");
  select.replaceChildren(new Option(view.pdfs.length?"选择 PDF 原文":"当前目录没有 PDF",""));
  for(const pdf of view.pdfs)select.append(new Option(pdf.path.split("/").at(-1)??pdf.path,pdf.path));
  select.disabled=view.pdfs.length===0;
  const path=view.pdfs.some(v=>v.path===pdfSelectPath)?pdfSelectPath:view.pdfs[0]?.path??"";
  select.value=path;
  pdfSelectPath=path;
  if(view.phase==="ready"&&!path)irPanel?.showMissingPdf(view.folder);
  // Open once for each directory; file selection doesn't reload the PDF.
  if(lastPdfFolder!==view.folder){
    lastPdfFolder=view.folder;
    mappingFolder=view.folder;
    void loadFolderMapping(view.folder);
    switchWorkbenchPreview("markdown");
    if(path)void openSelectedPdf(path);
    else void pdfPreview.close();
  }
}
const workbench = new V3Workbench(registry, "obsidian-ocr2md", (view: WorkbenchView) => {
  const folder=el<HTMLElement>("workbench-folder");
  folder.textContent="Obsidian/ocr2md"+view.folder;
  const select=el<HTMLSelectElement>("workbench-file");
  const old=select.value;
  select.replaceChildren(new Option("请选择文件", ""));
  for (const file of view.files) select.append(new Option(file.path.split("/").at(-1) ?? file.path, file.path));
  select.value=view.file?.path ?? (view.files.some(v=>v.path===old)?old:"");
  select.disabled=view.phase==="loading-directory" || view.phase==="loading-file" || view.files.length===0;
  renderMdElementSelect();
  if(view.phase==="loading-directory" || view.phase==="loading-file"){
    const source=el<HTMLDivElement>("workbench-source");
    delete source.dataset.pdfMdElementId;delete source.dataset.pdfMdAnchorPath;
    delete source.dataset.pdfMdFrom;delete source.dataset.pdfMdTo;
    delete source.dataset.irBlockId;delete source.dataset.irPages;
  }
  if(view.phase==="loading-directory"){
    ++irLoadEpoch;irPanel?.reset();
    lastPdfFolder="";pdfSelectPath="";
    mappingFolder="";mappingEpoch++;navEpoch++;currentMapping=undefined;highlightedElementId="";
    pendingPdfLocation=undefined;pdfLocationSerial++;
    if(pdfFocusTimer){clearTimeout(pdfFocusTimer);pdfFocusTimer=undefined;}
    reviewPanel?.reset();
    renderPdfMdTargets();renderMdElementSelect();
    setElementStatus("工作目录正在加载；尚未验证 OCR 元素映射。");
    renderPdfElementSelect();
    switchWorkbenchPreview("markdown");
    void pdfPreview.close();
  } else if(view.phase==="ready" || view.phase==="loading-file") {
    workbenchDirectoryReady(view);
  }
  const labels: Record<string,string>={idle:"尚未选择目录", "loading-directory":"正在列出工作目录中的 Markdown 文件…",
    "loading-file":"正在读取文件与校对行…",ready:view.file?"已加载真实 Markdown（只读）":"目录已就绪，请选择 Markdown 文件",
    stale:"文件版本已变化，刷新后重新打开",error:"加载失败"};
  el<HTMLElement>("workbench-status").textContent=(labels[view.phase]??view.phase)
    + (view.truncated?" · 只加载部分内容":"")+(view.error?" · "+view.error:"");
  updateActivity("workbench",el<HTMLElement>("workbench-status").textContent??"",
    view.phase==="error"||view.phase==="stale"?"error":
      view.phase==="loading-directory"||view.phase==="loading-file"?"busy":view.phase==="ready"?"ready":"idle",
    (view.folder?"书籍 "+view.folder+" · ":"")+(el<HTMLElement>("workbench-status").textContent??""));
}, onMdPosition,el<HTMLDivElement>("workbench-calibration-grid"),
  el<HTMLDivElement>("workbench-source"), el<HTMLDivElement>("workbench-preview"),
  ()=>updateChapterActions(),workbenchPair);
workbench.setHeadingPresentation(pairAsSettings(settings,workbenchPair.resolved(settings,"cleaning")));
chapterMedia=new ChapterMediaController(workbench,updateChapterActions);
workbench.registerChapterGridView(chapterMedia.gridView);
chapterMedia.bindTool(el<HTMLButtonElement>("wb-clean-download-media"),
  ()=>workbench.snapshot().folder,error=>{
    const reason=error instanceof Error?error.message:String(error);
    setStatus(reason);updateActivity("workbench",reason,"error");
  });
pdfPreview = new V3PdfPreview(el<HTMLElement>("workbench-pdf-canvas"),pdfStatusChanged,
  onPdfCanvasPoint,cancelPdfAutoFocusOnUserScroll);
pdfPreview.setTheme(settings.pdfTheme);
pdfStatusChanged(pdfPreview.snapshot());
const reviewChaptersButton=el<HTMLButtonElement>("workbench-mode-chapters");
const reviewTextButton=el<HTMLButtonElement>("workbench-mode-text");
const reviewAuditButton=el<HTMLButtonElement>("workbench-mode-review");
const reviewIrButton=el<HTMLButtonElement>("workbench-mode-ir");
function hasUnexportedWork():boolean{return reviewPanel?.isDirty()||irPanel?.isDirty()||workbench?.chapterState().dirty;}
function confirmDropDraft(action:string):boolean{
  return !hasUnexportedWork()||window.confirm(`人工审核或 IR 草稿存在未保存改动。${action}会丢弃草稿，确定继续？`);
}
function showReviewMode(mode:"chapters"|"text"|"review"|"ir"|"cleaning"):void{
  activeWorkMode=mode;
  el<HTMLElement>("panel-workbench").dataset.workMode=mode;
  syncTemplateActions();
  workbenchPair.setScene(mode==="cleaning"?"cleaning":"boundary");
  workbenchPair.apply(settings);
  const audit=mode==="review",chapters=mode==="chapters",ir=mode==="ir"||chapters;
  const cleaning=mode==="cleaning";
  el<HTMLSelectElement>("wb-clean-modules").hidden=!cleaning;
  el<HTMLElement>("wb-clean-module-tools").hidden=!cleaning;
  // The IR controller owns delimitation tools even when its AG pane is hidden.
  // Entering cleaning must clear its chapter stage, otherwise subsequent IR
  // renders revive "只看一级标题" / "起始序号" over cleaning-specific tools.
  if(irPanel)irPanel.setStage(chapters?"chapters":"blocks");
  if(cleaning){
    el<HTMLElement>("ir-heading-filters").hidden=true;
    el<HTMLElement>("ir-sequence-start-control").hidden=true;
  }
  workbench.setChapterMode(cleaning);
  if(cleaning){
    selectCleaningModule("章节标题");
    workbench.setTitleNumbers(el<HTMLInputElement>("wb-clean-heading-numbers").checked);
  }
  if(cleaning)setStatus(`章节清洗 · 编辑源码（AG 只读） · ${workbench.chapterState().dirty?"未保存":"已加载"}`);
  else if(chapters)setStatus("章节定界 · DIRjson");
  if(workbench.snapshot().phase==="ready"){
    updateActivity("workbench",cleaning?"章节清洗已就绪":chapters?"章节定界已就绪":
      ir?"IR 模块已就绪":audit?"关联审核已就绪":"文本模块已就绪","ready");
  }
  el<HTMLElement>("workbench-module-title").textContent=chapters?"章节定界":
    cleaning?"":mode==="ir"?"逻辑块清洗":mode==="review"?"关联审核":"文本块";
  el<HTMLElement>("workbench-module-title").hidden=cleaning;
  el<HTMLDetailsElement>("wb-module-menu").open=false;
  // Both the legacy text-block view and the new chapter-cleaning mode need
  // the *real* AG Grid. A hidden grid was previously generating rows while
  // leaving the cleaning module visually empty.
  el<HTMLButtonElement>("wb-clean-download-media").hidden=true;
  el<HTMLDivElement>("workbench-calibration-grid").hidden=mode!=="text"&&!cleaning;
  el<HTMLDivElement>("workbench-calibration-grid").setAttribute("aria-label",
    cleaning?"只读章节标题目录，点击仅定位；请在源码窗增删改":"文本块数据表");
  el<HTMLDivElement>("workbench-source").setAttribute("aria-label",
    cleaning?"章节 Markdown 源码编辑区，支持增删改":"Markdown 源码预览");
  // The current directory controls which editing stage is active. Avoid the
  // legacy Chapter Delimitation shortcut appearing beside '章节清洗'.
  reviewChaptersButton.hidden=chapters||cleaning;
  el<HTMLDetailsElement>("wb-module-menu").hidden=chapters||cleaning;
  el<HTMLDivElement>("workbench-review-panel").hidden=!audit;
  el<HTMLDivElement>("workbench-ir-panel").hidden=!ir;
  el<HTMLElement>("wb-review-actions").hidden=!audit;
  el<HTMLElement>("pdf-md-review-status").hidden=!audit;
  // Old V2 sequence/role/form menus duplicate AG-native file-cut controls.
  // Keep their nodes and handlers for legacy IR, but never clutter delimitation.
  el<HTMLElement>("wb-ir-actions").hidden=!ir||chapters;
  el<HTMLElement>("workbench-ir-header-actions").hidden=!ir;
  el<HTMLElement>("workbench-clean-actions").hidden=!cleaning;
  el<HTMLElement>("workbench-file").hidden=cleaning||ir;
  el<HTMLElement>("workbench-status").hidden=cleaning||ir;
  el<HTMLElement>("ir-status").hidden=!ir;
  el<HTMLElement>("ir-chapter-filter").hidden=!ir||chapters;
  el<HTMLElement>("wb-ir-details").hidden=!ir||chapters;
  el<HTMLElement>("ir-chapter-edit-details").hidden=true;
  el<HTMLElement>("ir-v2-assignment").hidden=true;
  el<HTMLElement>("ir-export").hidden=chapters;
  el<HTMLElement>("ir-dirty-indicator").hidden=chapters;
  el<HTMLButtonElement>("ir-save").textContent=chapters?"保存标定":"保存 IR";
  // Ambiguous OCR sources are prompted only when initialization needs a choice.
  // The panel owns the chooser's visibility; do not show an empty select here.
  el<HTMLElement>("workbench-source").hidden=ir;
  el<HTMLElement>("workbench-ir-source").hidden=!ir;
  el<HTMLSelectElement>("workbench-file").hidden=ir||cleaning;
  el<HTMLElement>("ir-source-label").hidden=!ir;
  el<HTMLSelectElement>("ir-md-file").hidden=!ir;
  el<HTMLButtonElement>("ir-export-md").hidden=!ir||chapters;
  el<HTMLButtonElement>("ir-export-zip").hidden=!ir||chapters;
  el<HTMLElement>("workbench-status").hidden=ir||cleaning;
  el<HTMLElement>("workbench-preview").hidden=ir;
  el<HTMLElement>("ir-markdown-preview").hidden=!ir;
  el<HTMLDetailsElement>("wb-md-details").hidden=ir;
  if(!audit)el<HTMLDetailsElement>("wb-review-details").open=false;
  if(!ir)el<HTMLDetailsElement>("wb-ir-details").open=false;
  reviewChaptersButton.setAttribute("aria-pressed",String(chapters));
  reviewTextButton.setAttribute("aria-pressed",String(mode==="text"));
  reviewAuditButton.setAttribute("aria-pressed",String(audit));
  reviewIrButton.setAttribute("aria-pressed",String(ir));
  if(ir){
    // Remain on the user's chosen preview; initial workbench prefers MD.
    // PDF is opened only by an explicit tab click or a PDF-element jump.
    // IR is reconstructed entirely from the one book's PDF and MinerU JSON.
    const current=workbench.snapshot();
    const activePdf=current.pdfs.find(p=>p.path===pdfSelectPath);
    if(!activePdf&&current.phase==="ready")
      irPanel.showMissingPdf(current.folder);
    if(activePdf&&!irPanel.snapshot().loaded && !irPanel.snapshot().dirty){
      const token=++irLoadEpoch;
      void workbench.reviewFilesystem().then(fs=>{
        if(token!==irLoadEpoch||workbench.snapshot().folder!==current.folder||
           (activeWorkMode!=="ir"&&activeWorkMode!=="chapters"))return;
        return irPanel.open(fs,current.folder,activePdf);
      }).catch(error=>{
        el<HTMLElement>("ir-status").textContent="IR 读取失败："+String(error);
      });
    }
  }else ++irLoadEpoch;
  window.dispatchEvent(new Event("resize"));
}
reviewPanel=new PdfMdReviewPanel(el<HTMLElement>("workbench-review-grid"),relation=>{
  void (async()=>{
    await goMdToPdf(relation);
    if(pdfMdSelect.value!=="")await goPdfToMd();
  })();
},()=>workbench.reviewSelection());
irPanel=new IrWorkbenchPanel(el<HTMLElement>("workbench-ir-grid"),
  el<HTMLElement>("workbench-ir-source"),async (regions,id)=>{
    if(activeWorkMode!=="ir"&&activeWorkMode!=="chapters")return;
    if(!regions.length||!pdfSelectPath)throw Error("当前书籍缺少对应 PDF 原文");
    queuePdfLocation({kind:"region",region:regions[0],elementId:id,pdfPath:pdfSelectPath});
    // The PDF focus is stored regardless of its loading state; only the user
    // controls which preview tab is displayed.
    if(!irPanel.isDirty())el<HTMLElement>("ir-status").textContent=`IR 块 ${id} · PDF 页 ${[...new Set(regions.map(r=>r.pdfPageNumber))].join(",")} · 同步定位已记录（未人工核准）`;
  },pairAsSettings(settings,workbenchPair.resolved(settings,"boundary")),async page=>{
    if(!pdfSelectPath)throw Error("当前书籍缺少 PDF 原文");
    queuePdfLocation({kind:"page",page,pdfPath:pdfSelectPath});
  },workbenchPair);
reviewChaptersButton.addEventListener("click",()=>showReviewMode("chapters"));
reviewTextButton.addEventListener("click",()=>showReviewMode("text"));
reviewAuditButton.addEventListener("click",()=>showReviewMode("review"));
reviewIrButton.addEventListener("click",()=>showReviewMode("ir"));
showReviewMode("chapters");
syncTemplateActions();

let pdfResizeTimer: number | undefined;
window.addEventListener("resize",()=>{
  if(currentTab!=="workbench" || previewMode!=="pdf" || pdfPreview.snapshot().phase!=="ready")return;
  if(pdfResizeTimer!==undefined)clearTimeout(pdfResizeTimer);
  pdfResizeTimer=window.setTimeout(()=>{
    pdfResizeTimer=undefined;
    if(currentTab==="workbench" && previewMode==="pdf")void pdfPreview.resize();
  },280);
});
el<HTMLButtonElement>("preview-tab-markdown").addEventListener("click",()=>switchWorkbenchPreview("markdown"));
el<HTMLButtonElement>("preview-tab-pdf").addEventListener("click",()=>switchWorkbenchPreview("pdf"));
el<HTMLSelectElement>("workbench-pdf-file").addEventListener("change",event=>{
  const path=(event.target as HTMLSelectElement).value;
  if(irPanel.isDirty()&&!confirmDropDraft("切换 PDF")){
    (event.target as HTMLSelectElement).value=pdfSelectPath;return;
  }
  if(path&&path!==pdfSelectPath){++irLoadEpoch;irPanel.reset();}
  if(path){switchWorkbenchPreview("markdown");}
  if(path)void openSelectedPdf(path).then(()=>{
    if(activeWorkMode==="ir"||activeWorkMode==="chapters")showReviewMode(activeWorkMode);
  });
});
el<HTMLButtonElement>("pdf-reload").addEventListener("click",()=>{
  const path=el<HTMLSelectElement>("workbench-pdf-file").value;
  if(path){switchWorkbenchPreview("markdown");}
  if(path)void openSelectedPdf(path).then(()=>{
    if(activeWorkMode==="ir"||activeWorkMode==="chapters")showReviewMode(activeWorkMode);
  });
});
elementSelect.addEventListener("change",()=>{
  const value=elementSelect.value;
  highlightedElementId="";pdfPreview.clearHighlight();renderPdfElementSelect();
  renderPdfMdTargets();
  elementSelect.value=value;
});
el<HTMLButtonElement>("pdf-element-focus").addEventListener("click",()=>{
  const id=elementSelect.value;
  const relation=currentMapping?.relations.find(r=>r.elementId===id);
  if(!relation||currentMapping?.pdf.path!==pdfSelectPath){
    setElementStatus("未选择有效的当前 PDF 元素，禁止定位。");return;
  }
  const region=relation.pdfRegions.find(r=>r.pdfPageNumber===pdfPreview.snapshot().page);
  if(!region){setElementStatus("该元素不属于当前页；请重新选择。");return;}
  void (async()=>{
    el<HTMLButtonElement>("pdf-element-focus").disabled=true;
    try{
      await pdfPreview.focusRegion(region,id);
      highlightedElementId=id;
      renderPdfMdTargets(relation);
      setElementStatus(`已框选 PDF 第 ${region.pdfPageNumber} 页 · ${relation.type} · ${relation.matchStatus}（仅候选，未人工核准）`);
    }catch(error){
      clearPdfElementSelection();
      setElementStatus("定位失败，未显示框选："+String(error));
    }finally{renderPdfElementSelect();}
  })();
});
mdElementSelect.addEventListener("change",()=>{
  const relation=currentMapping?.relations.find(r=>r.elementId===mdElementSelect.value);
  if(relation)mdStatus.textContent=`已选择 PDF 第 ${relation.pdfRegions[0]?.pdfPageNumber} 页候选，点击“定位到 PDF”。`;
});
el<HTMLButtonElement>("md-jump-pdf").addEventListener("click",()=>{
  const relation=currentMapping?.relations.find(r=>r.elementId===mdElementSelect.value);
  if(relation)void goMdToPdf(relation);
});
pdfMdSelect.addEventListener("change",()=>{
  el<HTMLButtonElement>("pdf-jump-md").disabled=pdfMdSelect.value==="";
});
el<HTMLButtonElement>("pdf-jump-md").addEventListener("click",()=>void goPdfToMd());
el<HTMLButtonElement>("pdf-element-clear").addEventListener("click",()=>{
  clearPdfElementSelection();setElementStatus("已清除候选高亮；映射仍保持只读。");
});
el<HTMLButtonElement>("pdf-page-prev").addEventListener("click",()=>void pdfPreview.showPage(pdfPreview.snapshot().page-1));
el<HTMLButtonElement>("pdf-page-next").addEventListener("click",()=>void pdfPreview.showPage(pdfPreview.snapshot().page+1));
el<HTMLInputElement>("pdf-page-number").addEventListener("change",event=>{
  const number=Number((event.target as HTMLInputElement).value);
  if(Number.isSafeInteger(number))void pdfPreview.showPage(number);
});

el<HTMLButtonElement>("set-working-directory").addEventListener("click", () => {
  if (!initialized || navigating) return;
  if(!confirmDropDraft("切换目录"))return;
  const folder=chosenWorkbenchFolder();
  // Switch to the workbench only when the actual Mac Vault folder opens.
  void run(async()=>{
    await workbench.openFolder(folder);
    const opened=workbench.snapshot();
    if(opened.phase==="error")return;
    if(!opened.pdfs.length)throw Error(
      `不能进入章节工作台：${folder} 没有直接存放的 PDF 原文。请在工作目录双击进入具体书籍文件夹（例如 Bufett’s Alpha），再点「设为工作目录」。`);
    el<HTMLButtonElement>("tab-workbench").disabled=false;
    el<HTMLButtonElement>("tab-workbench").title="进入当前书籍工作台";
    switchTab("workbench");
    showReviewMode("chapters");
    await loadChapterNavigator(folder);
  },"工作目录已挂载：书籍根目录进行章节定界，chapters/ 各 MD 进行章节清洗");
});
el<HTMLSelectElement>("workbench-path-nav").addEventListener("change",event=>{
  const nav=event.target as HTMLSelectElement;
  const path=nav.value;
  const folder=workbench.snapshot().folder;
  if(!path||!folder)return;
  if(path!==currentChapterSelection&&!confirmDropDraft("切换章节")){
    nav.value=currentChapterSelection;return;
  }
  // The directory dropdown is the navigation control itself: selecting a
  // book/MD from Settings or Workspace opens Workbench automatically.
  if(currentTab!=="workbench")switchTab("workbench");
  const serial=++chapterNavEpoch;
  nav.disabled=true;chapterSaveStatus="";
  void (async()=>{
    try{
      if(path===folder){
        showReviewMode("chapters");
        currentChapterSelection=folder;
        nav.value=folder;
        switchWorkbenchPreview("markdown");
      }else{
        if(!path.startsWith(folder+"/chapters/")||!path.endsWith(".md"))
          throw Error("只能通过当前书籍的章节文件进入清洗");
        showReviewMode("cleaning");
        await workbench.openFile(path);
        if(serial!==chapterNavEpoch)return;
        currentChapterSelection=path;
        nav.value=path;
        switchWorkbenchPreview("markdown");
      }
    }catch(error){
      report(error);
      if(serial===chapterNavEpoch){nav.value=currentChapterSelection;
        showReviewMode(currentChapterSelection===folder?"chapters":"cleaning");}
    }finally{if(serial===chapterNavEpoch)nav.disabled=false;}
  })();
});
el<HTMLInputElement>("wb-clean-heading-numbers").addEventListener("change",event=>{
  const enabled=(event.target as HTMLInputElement).checked;
  applyChapterHeadingNumbering(enabled,value=>workbench.setTitleNumbers(value),setStatus);
});
function selectCleaningModule(name:CleaningModuleId):void{
  activeCleaningModule=name;
  workbench.setCleaningModule(name);
  el<HTMLSelectElement>("wb-clean-modules").value=name;
  for(const id of ["wb-clean-heading-numbers-label","wb-clean-download-media"])
    el<HTMLElement>(id).hidden=!toolIdsForCleaning(name).includes(id);
  updateChapterActions();
  setStatus(`章节清洗 · ${name} · AG 选择条目后在源码窗修正并对照 PDF`);
}
el<HTMLSelectElement>("wb-clean-modules").addEventListener("change",event=>
  selectCleaningModule((event.target as HTMLSelectElement).value as CleaningModuleId));
el<HTMLButtonElement>("clean-undo").addEventListener("click",()=>workbench.undoChapter());
el<HTMLButtonElement>("clean-redo").addEventListener("click",()=>workbench.redoChapter());
el<HTMLButtonElement>("clean-save").addEventListener("click",()=>{
  if(!workbench.chapterState().dirty)return;
  const folder=workbench.snapshot().folder;
  chapterSaveStatus="正在验证并保存章节…";updateChapterActions();
  void workbench.saveChapter(folder).then(()=>{
    chapterSaveStatus="章节已保存（CAS 校验通过）";updateChapterActions();
  }).catch(error=>{
    chapterSaveStatus="保存失败，编辑仍保留："+String(error);updateChapterActions();
  });
});
el<HTMLSelectElement>("workbench-file").addEventListener("change", event=>{
  const path=(event.target as HTMLSelectElement).value;
  if (path) {navEpoch++;void run(()=>workbench.openFile(path));}
});
window.addEventListener("beforeunload",event=>{
  if(hasUnexportedWork()){event.preventDefault();event.returnValue="";}
});

async function readSelectedFile(): Promise<void> {
  const node = selected;
  if (!node || node.kind !== "file") { setStatus("请先选中一个文件"); return; }
  await run(async () => {
    const bytes = await controller.readFile(node);
    el<HTMLTextAreaElement>("file-content").value = new TextDecoder().decode(bytes);
    el<HTMLDetailsElement>("file-actions").querySelector("details")!.open = true;
  }, "已从 Mac Obsidian 库读回文件正文");
}
el<HTMLButtonElement>("refresh").addEventListener("click", () => {
  selected = undefined; void run(() => controller.refresh(), "真实目录已刷新");
});
more.addEventListener("click", () => { void run(() => controller.loadMore(), "下一页已加载"); });
el<HTMLButtonElement>("mkdir").addEventListener("click", () => {
  selected = undefined;
  void run(() => controller.createDirectory(el<HTMLInputElement>("create-name").value), "目录已创建");
});
el<HTMLButtonElement>("mkfile").addEventListener("click", () => {
  const bytes = new TextEncoder().encode(el<HTMLTextAreaElement>("file-content").value);
  selected = undefined;
  void run(() => controller.createFile(el<HTMLInputElement>("create-name").value, bytes), "文件已写入 Mac 真实 Obsidian 库");
});
el<HTMLButtonElement>("read-file").addEventListener("click", () => { void readSelectedFile(); });
el<HTMLButtonElement>("rename").addEventListener("click", () => {
  if (!selected) { setStatus("请先选中项目"); return; }
  const node = selected; selected = undefined;
  void run(() => controller.rename(node, el<HTMLInputElement>("target").value), "重命名成功");
});
el<HTMLButtonElement>("copy").addEventListener("click", () => {
  if (!selected) { setStatus("请先选中文件"); return; }
  const node = selected; selected = undefined;
  void run(() => controller.copyFile(node, el<HTMLInputElement>("target").value), "复制成功");
});
el<HTMLButtonElement>("move").addEventListener("click", () => {
  if (!selected) { setStatus("请先选中项目"); return; }
  const node = selected; selected = undefined;
  void run(() => controller.move(node, el<HTMLInputElement>("destination").value), "移动成功");
});
el<HTMLButtonElement>("remove").addEventListener("click", () => {
  if (!selected) { setStatus("请先选中项目"); return; }
  const node = selected;
  const question = node.kind === "directory" ?
    "只能删除空目录。确认删除 " + node.path + "？" : "确认删除 " + node.path + "？";
  if (!window.confirm(question)) return;
  selected = undefined;
  void run(() => controller.remove(node), node.kind === "directory" ? "空目录已删除" : "文件已删除");
});

// V2 standard components: AG table browses/locates configuration items,
// Settings UI is centrally owned by Agent Link / Shared App Settings.
// OCR2MD supplies ONLY the schema, validated values, and runtime save adapter.
const SHARED_SETTINGS_ENTRY="https://agent-link.laity.bid/shared-settings/v1/settings-panel.js";
interface SharedSettingsPanel extends HTMLElement{
  settingsSchema:unknown;
  initialValues:DirectorySettings;
  validateValues:(value:Record<string,unknown>)=>DirectorySettings;
  save:()=>Promise<void>;
  reset:()=>Promise<void>;
  undo:()=>Promise<boolean>;
  redo:()=>Promise<boolean>;
  readonly canUndo:boolean;
  readonly canRedo:boolean;
  selectSetting:(key:string)=>void;
  values:Record<string,unknown>;
  refresh:()=>void;
}
let sharedSettingsPanel:SharedSettingsPanel|null=null;
let settingsIdleQueued=false;
function settingsGate(state:"pending"|"loading"|"ready"|"error",message:string):void{
  const tab=el<HTMLButtonElement>("tab-settings");
  tab.dataset.settingsState=state;
  tab.disabled=state!=="ready";
  tab.setAttribute("aria-disabled",String(tab.disabled));
  tab.title=message;
  updateActivity("settings",state==="pending"?"等待空闲加载":
    state==="loading"?"正在后台加载":state==="ready"?"AG / 源码已就绪":"加载失败",
    state==="error"?"error":state==="ready"?"ready":state==="loading"?"busy":"idle",message);
}
// The shared component reports AG readiness independently from CodeMirror.
// Both are required, and the parameter preview must be mounted as well.
function waitForSettingsComponents(host:SharedSettingsPanel):Promise<void>{
  return new Promise((resolve,reject)=>{
    let settled=false;
    const stop=(error?:Error)=>{
      if(settled)return;
      settled=true;observer.disconnect();clearTimeout(watchdog);
      if(error)reject(error);else resolve();
    };
    const check=()=>{
      if(host.dataset.ready==="error"||host.dataset.sourceReady==="fallback"){
        stop(new Error("AG 或源码组件加载失败"));return;
      }
      if(host.dataset.ready==="true"&&host.dataset.sourceReady==="true"&&
         host.querySelector(".las-preview")&&host.querySelector("laity-source-surface"))stop();
    };
    const observer=new MutationObserver(check);
    const watchdog=window.setTimeout(()=>stop(new Error("设置组件加载超时")),45000);
    observer.observe(host,{attributes:true,attributeFilter:["data-ready","data-source-ready"]});
    check();
  });
}
// The font is a version-pinned shared asset. Its failure is a graceful
// monospace fallback, not a reason to make Settings permanently inaccessible.
async function waitForSettingsFont():Promise<void>{
  const link=document.getElementById("laity-sarasa-ui-font-v1") as HTMLLinkElement|null;
  if(!link)return;
  await new Promise<void>(resolve=>{
    if(link.sheet){resolve();return;}
    let finished=false;
    const done=()=>{if(finished)return;finished=true;clearTimeout(timer);resolve();};
    const timer=window.setTimeout(done,12000);
    link.addEventListener("load",done,{once:true});
    link.addEventListener("error",done,{once:true});
  });
  try{
    await Promise.race([
      document.fonts.load('400 13px "Laity Sarasa Fixed SC"',"设置参数值 中文 English"),
      new Promise(resolve=>window.setTimeout(resolve,12000)),
    ]);
  }catch{/* Font fallback is deliberately usable. */}
}
// The first directory paint is more important than importing settings.
function scheduleSettingsAfterDirectoryPaint():void{
  if(settingsIdleQueued)return;
  settingsIdleQueued=true;
  window.requestAnimationFrame(()=>window.requestAnimationFrame(()=>{
    const startSettings=()=>{
      settingsGate("loading","设置后台加载中：AG、源码、预览和字体");
      void mountSharedSettings();
    };
    if(typeof window.requestIdleCallback==="function"){
      window.requestIdleCallback(startSettings,{timeout:7000});
    }else window.setTimeout(startSettings,80);
  }));
}
function sharedSettingsSchema(){
  const defaults=parseDirectorySettings(structuredClone(DEFAULT_DIRECTORY_SETTINGS));
  return v3DirectoryConfigRows(defaults).map(row=>{
    const value=defaults[row.key as keyof DirectorySettings];
    const type=Array.isArray(value)?"array":value!==null&&typeof value==="object"?"object":
      typeof value==="boolean"?"boolean":typeof value==="number"?(Number.isInteger(value)?"integer":"number"):"string";
    return {id:row.key,label:row.key,theme:"ocr2md",category:row.functionGroup,
      group:row.descriptor.control,description:row.description,type,
      editor:type==="array"||type==="object"?"source":undefined,
      defaultValue:structuredClone(value),readOnly:false};
  });
}
async function mountSharedSettings():Promise<void>{
  try{
    // Shared Settings validates its own manifest and offers upgrade notice.
    // Import the no-store ESM asset directly: eliminates the serial
    // manifest → module request waterfall on a cold settings load.
    await import(/* @vite-ignore */ SHARED_SETTINGS_ENTRY);
    const host=document.createElement("laity-settings-panel") as SharedSettingsPanel;
    host.id="settings-shared";
    host.setAttribute("app-id","ocr2md-v3");
    host.setAttribute("title","ocr2md 设置");
    host.setAttribute("layout","horizontal");
    host.setAttribute("source-editor","codemirror");
    host.setAttribute("source-comments","true");
    host.setAttribute("storage","none");
    host.setAttribute("commit-mode","explicit");
    host.setAttribute("chrome","external");
    host.setAttribute("data-testid","shared-settings-panel");
    host.settingsSchema=sharedSettingsSchema();
    host.initialValues=structuredClone(settings);
    host.validateValues=value=>parseDirectorySettings(value);
    host.addEventListener("laity-settings-ready",()=>{
      const style=settings.agSourceScenes.settings;
      host.style.setProperty("--las-source-font-size",`${style.sourceFontSize??settings.mdSourceFontSize}px`);
      host.style.setProperty("--las-source-line-height",String(style.sourceLineHeight??settings.mdSourceLineHeight));
      host.refresh();
      el<HTMLElement>("settings-parse-status").textContent="AG 已连接，等待源码及字体…";
      window.dispatchEvent(new Event("resize"));
    });
    host.addEventListener("laity-settings-history",event=>{
      const {canUndo,canRedo}=(event as CustomEvent<{canUndo:boolean;canRedo:boolean}>).detail;
      el<HTMLButtonElement>("settings-undo").disabled=!canUndo;
      el<HTMLButtonElement>("settings-redo").disabled=!canRedo;
      // The shared source editor also reports '未保存' during its initial
      // preview. Trust a real edit-history transition instead of that log.
      if(canUndo)updateActivity("settings","草稿待保存","dirty");
      else if(canRedo)updateActivity("settings","草稿已撤销","ready");
    });
    host.addEventListener("laity-settings-saved",event=>{
      try{
        const detail=(event as CustomEvent).detail as {values:unknown};
        const validated=parseDirectorySettings(detail.values);
        localStorage.setItem(DIRECTORY_SETTINGS_KEY,JSON.stringify(validated));
        settings=validated;
        applySettings();
        updateActivity("settings","配置已保存","ready");
        setStatus("共享设置已保存并应用（当前浏览器）");
      }catch(error){
        updateActivity("settings","保存失败","error",String(error));
        report(error);
      }
    });
    host.addEventListener("laity-settings-load-error",event=>{
      updateActivity("settings","配置操作失败","error",String((event as CustomEvent<{message?:string}>).detail?.message??"设置错误"));
      const detail=(event as CustomEvent).detail as {message:string};
      setStatus("共享设置加载失败："+detail.message);
    });
    // Only actual settings belong in the shared AG/source component.
    // Vault auth is an independent sibling panel owned entirely by OCR2MD.
    el<HTMLElement>("shared-settings-mount").append(host);
    sharedSettingsPanel=host;
    const settingsStatus=host.querySelector<HTMLElement>(".las-status");
    if(settingsStatus)new MutationObserver(()=>{
      const message=settingsStatus.textContent?.trim();
      if(message&&/失败|未应用/.test(message))
        updateActivity("settings",message,"error");
    }).observe(settingsStatus,{childList:true,characterData:true,subtree:true});
    await Promise.all([waitForSettingsComponents(host),waitForSettingsFont()]);
    // Only a fully initialized settings view can be selected. Never switch
    // away from the user's working directory automatically.
    el<HTMLButtonElement>("settings-save").disabled=false;
    el<HTMLButtonElement>("settings-reset").disabled=false;
    el<HTMLButtonElement>("settings-undo").disabled=!host.canUndo;
    el<HTMLButtonElement>("settings-redo").disabled=!host.canRedo;
    el<HTMLElement>("settings-parse-status").textContent="AG、源码及参数预览已就绪";
    settingsGate("ready","设置组件已加载完成");
  }catch(error){
    settingsGate("error","设置未加载完成，请刷新页面重试");
    setStatus("统一设置组件不可用："+String(error));
  }
}

function configureRefresh(): void {
  if (autoRefreshTimer !== undefined) clearInterval(autoRefreshTimer);
  if (!settings.autoRefreshSeconds) return;
  autoRefreshTimer = window.setInterval(() => {
    if (!initialized || currentTab !== "workspace" || document.hidden || controller.snapshot().busy) return;
    void run(() => controller.refresh());
  }, settings.autoRefreshSeconds * 1000);
}
function applySettings(): void {
  applyWorkbenchTypography(settings);
  pdfPreview.setTheme(settings.pdfTheme);
  directoryPair.apply(settings);
  workbenchPair.apply(settings);
  if(sharedSettingsPanel){
    const local=settings.agSourceScenes.settings;
    sharedSettingsPanel.style.setProperty("--las-source-font-size",`${local.sourceFontSize??settings.mdSourceFontSize}px`);
    sharedSettingsPanel.style.setProperty("--las-source-line-height",String(local.sourceLineHeight??settings.mdSourceLineHeight));
    sharedSettingsPanel.refresh();
  }
  irPanel?.updatePresentation(pairAsSettings(settings,workbenchPair.resolved(settings,"boundary")));
  workbench.setHeadingPresentation(pairAsSettings(settings,workbenchPair.resolved(settings,"cleaning")));
  gridApi.setGridOption("theme", withTheme());
  gridApi.setGridOption("rowHeight", rowHeight());
  gridApi.setGridOption("columnDefs", columnDefs());
  gridApi.resetRowHeights();
  el<HTMLElement>("file-actions").hidden = !settings.showFileOperations;
  configureRefresh();
  render();
  window.requestAnimationFrame(() => gridApi.sizeColumnsToFit());
}
sourceEditor.setShowHardReturns(settings.mdShowHardReturns);
sourceEditor.setHardReturnColor(settings.mdHardReturnColor);
el<HTMLButtonElement>("settings-save").disabled=true;
el<HTMLButtonElement>("settings-reset").disabled=true;
el<HTMLButtonElement>("settings-undo").disabled=true;
el<HTMLButtonElement>("settings-redo").disabled=true;
el<HTMLButtonElement>("settings-undo").addEventListener("click",()=>void sharedSettingsPanel?.undo());
el<HTMLButtonElement>("settings-redo").addEventListener("click",()=>void sharedSettingsPanel?.redo());
el<HTMLButtonElement>("settings-save").addEventListener("click",()=>{
  if(!sharedSettingsPanel){setStatus("共享设置尚未加载");return;}
  updateActivity("settings","正在保存配置","busy");
  void sharedSettingsPanel.save();
});
el<HTMLButtonElement>("settings-reset").addEventListener("click",()=>{
  if(!sharedSettingsPanel){setStatus("共享设置尚未加载");return;}
  void sharedSettingsPanel.reset();
});

el<HTMLButtonElement>("connect-vault").addEventListener("click", () => {
  registry.setKey(el<HTMLInputElement>("vault-key").value,
    el<HTMLInputElement>("remember-device").checked);
  void connectVault();
});
el<HTMLButtonElement>("pair-code").addEventListener("click", () => {
  void run(async () => {
    const pairing = await registry.pairOnMac();
    const field = el<HTMLInputElement>("vault-key");
    field.type = "text";
    field.value = pairing.accessKey;
    setStatus("配对密钥已填入。请在可信的 iPad Safari 设置页输入并授权，勿公开分享。");
  });
});
el<HTMLButtonElement>("forget-key").addEventListener("click", () => {
  registry.setKey("");
  el<HTMLInputElement>("vault-key").value = "";
  el<HTMLInputElement>("remember-device").checked = false;
  setStatus("已清除此浏览器的访问密钥；本机 localhost 仍可直接访问");
});

async function connectVault(): Promise<void> {
  try {
    await registry.listMounts();
    if (!initialized) {
      await controller.initialize();
      initialized = true;
    } else await controller.refresh();
    el<HTMLElement>("access-panel").hidden = true;
    el<HTMLElement>("storage-kind").textContent =
      "已连接 Mac 本机 iCloud/Obsidian/ocr2md（真实文件，iCloud 负责与 iPad Obsidian 同步）";
    el<HTMLElement>("workspace-connection").textContent = "已连接";
    const current=controller.snapshot();
    updateActivity("workspace",`已就绪 · ${current.entries.length} 项`,"ready",
      `Obsidian/ocr2md${current.directory} · ${current.entries.length} 项`);
    refreshWorkingDirectoryAction();
    setStatus(""); // Do not pin completed Vault connection in the top bar.
  } catch (error) {
    if (error instanceof MacVaultAccessError) {
      // Surface the independent access controls automatically when needed;
      // keep AG and CodeMirror entirely untouched.
      el<HTMLDetailsElement>("settings-connection-details").open = true;
      el<HTMLElement>("access-panel").hidden = false;
      el<HTMLElement>("workspace-connection").textContent = "需在设置中授权连接";
      updateActivity("workspace","等待授权","error","需要在设置中完成 Mac Vault 授权");
      setStatus("公网访问需要授权：打开「设置」输入 Mac 配对密钥，库文件不会匿名暴露。");
    } else {
      updateActivity("workspace","连接失败","error",String(error));
      report(error);
    }
  }
}
async function start(): Promise<void> {
  applySettings();
  const statusRequest = registry.status().catch(() => null);
  await connectVault();
  // Directory has initialized (or exposed its access prompt) and can paint.
  // Only now may the browser start the idle settings-loading work.
  scheduleSettingsAfterDirectoryPaint();
  const info = await statusRequest;
  canPairLocally = Boolean(info?.canPairLocally);
  el<HTMLButtonElement>("pair-code").hidden = !canPairLocally;
  if ("serviceWorker" in navigator) {
    // The Mac Vault API is NOT cached; only this versioned static app shell is.
    navigator.serviceWorker.register("./sw.js?rev=v3-media-module-ag-owned-20261012br", { scope:"./", updateViaCache:"none" }).catch(console.warn);
  }
}
installUnifiedStatus();
void start().catch(report);
