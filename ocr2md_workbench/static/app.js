const state = {
  manifest: null,
  selectedId: null,
  selectedIds: new Set(),
  anchorId: null,
  selectedAnnotationIds: new Set(),
  annotationAnchorId: null,
  selectedContextLine: null,
  scanning: false,
  activeSourceFile: "",
  activeAnnotationGroup: "",
  activeDataView: "headings",
  tableSort: {
    headings: { fields: [{ field: "index", direction: "asc" }] },
    annotations: { fields: [{ field: "index", direction: "asc" }] },
  },
  openedWorkspaceDir: "",
  expandedTree: {
    files: true,
    titles: false,
    annotations: false,
  },
};

const columnStorageKey = "ocr2md.columnWidths.v3";
const directoryHistoryKey = "ocr2md.scanDirectoryHistory.v1";
const lastWorkspaceDirKey = "ocr2md.lastWorkspaceDir.v1";
const paneLayoutStorageKey = "ocr2md.paneLayout.v1";
const minColumnWidths = [48, 120, 48, 54, 72, 140, 140, 88, 140];
let workspaceStateTimer = null;

const el = {
  inputDir: document.querySelector("#inputDir"),
  scanBtn: document.querySelector("#scanBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  renumberBtn: document.querySelector("#renumberBtn"),
  setLocalNoBtn: document.querySelector("#setLocalNoBtn"),
  setExportDirBtn: document.querySelector("#setExportDirBtn"),
  setAnnotationTypeBtn: document.querySelector("#setAnnotationTypeBtn"),
  setAnnotationGroupBtn: document.querySelector("#setAnnotationGroupBtn"),
  bindAnnotationHeadingsBtn: document.querySelector("#bindAnnotationHeadingsBtn"),
  checkBtn: document.querySelector("#checkBtn"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  historyToggleBtn: document.querySelector("#historyToggleBtn"),
  message: document.querySelector("#message"),
  dirHistoryMenu: document.querySelector("#dirHistoryMenu"),
  onlyEnabled: document.querySelector("#onlyEnabled"),
  hideDisabled: document.querySelector("#hideDisabled"),
  filterText: document.querySelector("#filterText"),
  sortControls: document.querySelector("#sortControls"),
  countInfo: document.querySelector("#countInfo"),
  headingRows: document.querySelector("#headingRows"),
  projectTitle: document.querySelector("#projectTitle"),
  projectMeta: document.querySelector("#projectMeta"),
  directoryTree: document.querySelector("#directoryTree"),
  mainSplitter: document.querySelector("#mainSplitter"),
  resultSplitter: document.querySelector("#resultSplitter"),
  consoleSplitter: document.querySelector("#consoleSplitter"),
  contextTitle: document.querySelector("#contextTitle"),
  contextMeta: document.querySelector("#contextMeta"),
  contextLines: document.querySelector("#contextLines"),
  consoleOutput: document.querySelector("#consoleOutput"),
  addTitleBtn: document.querySelector("#addTitleBtn"),
  paneToggleBtns: document.querySelectorAll("[data-pane-toggle]"),
  paneHideBtns: document.querySelectorAll("[data-pane-hide]"),
  moduleActionBtns: document.querySelectorAll("[data-module-action]"),
  manualDialog: document.querySelector("#manualDialog"),
  manualTitle: document.querySelector("#manualTitle"),
  manualPosition: document.querySelector("#manualPosition"),
  confirmManualBtn: document.querySelector("#confirmManualBtn"),
  localNoDialog: document.querySelector("#localNoDialog"),
  localNoHint: document.querySelector("#localNoHint"),
  localNoInput: document.querySelector("#localNoInput"),
  confirmLocalNoBtn: document.querySelector("#confirmLocalNoBtn"),
  exportDirDialog: document.querySelector("#exportDirDialog"),
  exportDirHint: document.querySelector("#exportDirHint"),
  exportDirInput: document.querySelector("#exportDirInput"),
  confirmExportDirBtn: document.querySelector("#confirmExportDirBtn"),
  annotationTypeDialog: document.querySelector("#annotationTypeDialog"),
  annotationTypeHint: document.querySelector("#annotationTypeHint"),
  annotationTypeInput: document.querySelector("#annotationTypeInput"),
  confirmAnnotationTypeBtn: document.querySelector("#confirmAnnotationTypeBtn"),
  annotationGroupDialog: document.querySelector("#annotationGroupDialog"),
  annotationGroupHint: document.querySelector("#annotationGroupHint"),
  annotationGroupInput: document.querySelector("#annotationGroupInput"),
  confirmAnnotationGroupBtn: document.querySelector("#confirmAnnotationGroupBtn"),
};

el.scanBtn.addEventListener("click", chooseAndScanDirectory);
el.saveBtn.addEventListener("click", save);
el.exportBtn.addEventListener("click", exportMarkdown);
el.renumberBtn.addEventListener("click", renumber);
el.setLocalNoBtn.addEventListener("click", setSelectedLocalNo);
el.setExportDirBtn.addEventListener("click", setSelectedExportDir);
el.setAnnotationTypeBtn.addEventListener("click", setSelectedAnnotationType);
el.setAnnotationGroupBtn.addEventListener("click", setSelectedAnnotationGroup);
el.bindAnnotationHeadingsBtn.addEventListener("click", bindAnnotationHeadings);
el.checkBtn.addEventListener("click", () => {
  recomputeStatuses();
  recomputeAnnotationStatuses();
  renderTable();
  renderSideEditor();
  setMessage("序号检查已更新");
});
el.clearHistoryBtn.addEventListener("click", clearDirectoryHistory);
el.historyToggleBtn.addEventListener("click", toggleDirectoryHistory);
document.addEventListener("click", closeDirectoryHistoryOnOutsideClick);
el.onlyEnabled.addEventListener("change", renderTable);
el.hideDisabled.addEventListener("change", renderTable);
el.filterText.addEventListener("input", () => {
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
});
el.sortControls.addEventListener("change", () => applySortControls());
el.addTitleBtn.addEventListener("click", openManualDialog);
el.confirmManualBtn.addEventListener("click", addManualTitle);
el.confirmLocalNoBtn.addEventListener("click", applySelectedLocalNo);
el.confirmExportDirBtn.addEventListener("click", applySelectedExportDir);
el.confirmAnnotationTypeBtn.addEventListener("click", applySelectedAnnotationType);
el.confirmAnnotationGroupBtn.addEventListener("click", applySelectedAnnotationGroup);

initPaneLayout();
initColumnWidths();
initColumnResizing();
renderDirectoryHistory();
renderProjectInfo();
renderDirectoryTree();
renderSideEditor();

const queryDir = new URLSearchParams(location.search).get("dir");
const initialDir = queryDir || loadLastWorkspaceDir();
if (initialDir) {
  el.inputDir.value = initialDir;
  scan();
}

async function scan() {
  if (state.scanning) return;
  const dir = resolveInputDirectory(el.inputDir.value.trim());
  if (!dir) {
    setMessage("请输入目录");
    return;
  }
  el.inputDir.value = dir;
  state.scanning = true;
  el.scanBtn.disabled = true;
  setMessage("扫描中...");
  try {
    const data = await fetchJson(`/api/scan?dir=${encodeURIComponent(dir)}`);
    if (data.error) {
      setMessage(data.error, true);
      return;
    }
    state.manifest = data;
    state.manifest.annotations = state.manifest.annotations || [];
    state.openedWorkspaceDir = data.input_dir || dir;
    applyWorkspaceUiState(data.ui_state || {});
    addDirectoryHistory(data.input_dir);
    saveLastWorkspaceDir(data.input_dir);
    ensureSelectionAfterLoad();
    normalizeRestoredViewState();
    recomputeStatuses();
    recomputeAnnotationStatuses();
    renderProjectInfo();
    renderDirectoryTree();
    renderTable();
    renderSideEditor();
    if (state.selectedId) {
      await loadContext(currentHeading());
    }
    setMessage(`${data.workspace_loaded ? "已读取工作空间" : "已添加工作目录"}：${data.files.length} 个 md，${data.headings.length} 个标题候选`);
  } finally {
    state.scanning = false;
    el.scanBtn.disabled = false;
  }
}

async function chooseAndScanDirectory() {
  if (state.scanning) return;
  setMessage("选择工作目录...");
  el.scanBtn.disabled = true;
  try {
    const data = await fetchJson("/api/choose-dir");
    if (data.cancelled) {
      setMessage("已取消选择工作目录");
      return;
    }
    if (data.error) {
      setMessage(data.error, true);
      return;
    }
    if (!data.path) {
      setMessage("没有选择目录", true);
      return;
    }
    el.inputDir.value = data.path;
    await scan();
  } finally {
    el.scanBtn.disabled = false;
  }
}

function resolveInputDirectory(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const history = loadDirectoryHistory();
  const exact = history.find((dir) => dir === trimmed);
  if (exact) return exact;
  const prefixMatches = history.filter((dir) => dir.startsWith(trimmed));
  if (prefixMatches.length === 1) return prefixMatches[0];
  return trimmed;
}

async function save() {
  if (!state.manifest) {
    setMessage("没有可保存的标定");
    return;
  }
  recomputeStatuses();
  recomputeAnnotationStatuses();
  state.manifest.ui_state = collectWorkspaceUiState();
  setMessage("保存中...");
  const data = await fetchJson("/api/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.manifest),
  });
  if (data.error) {
    setMessage(data.error, true);
    return;
  }
  state.manifest.headings = data.headings;
  state.manifest.annotations = data.annotations || state.manifest.annotations || [];
  state.manifest.ui_state = collectWorkspaceUiState();
  renderTable();
  renderSideEditor();
  setMessage(`已保存工作空间：${data.workspace_path || data.path}`);
}

async function exportMarkdown() {
  if (!state.manifest) {
    setMessage("没有可导出的标定");
    return;
  }
  recomputeStatuses();
  recomputeAnnotationStatuses();
  setMessage("导出中...");
  el.exportBtn.disabled = true;
  try {
    const payload = { ...state.manifest };
    const data = await fetchJson("/api/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (data.error) {
      setMessage(data.error, true);
      return;
    }
    state.manifest.headings = data.headings;
    state.manifest.annotations = data.annotations || state.manifest.annotations || [];
    renderTable();
    renderSideEditor();
    setMessage(`已导出 ${data.count} 个文件到 ${data.output_dir}`);
  } finally {
    el.exportBtn.disabled = false;
  }
}

function renderTable() {
  if (!state.manifest) {
    el.headingRows.innerHTML = "";
    el.countInfo.textContent = "";
    renderSideEditor();
    return;
  }
  if (state.activeDataView === "annotations") {
    renderAnnotationTable();
    return;
  }
  renderHeadingTable();
}

function renderHeadingTable() {
  const rows = sortedRows("headings", filteredHeadings());
  const exportNameByLogicNo = buildExportNameMap(rows);
  renderTableHeader("headings", [
    { field: "index", label: "index" },
    { field: "title", label: "标题" },
    { field: "level", label: "层级" },
    { field: "line_no", label: "行号" },
    { field: "local_no", label: "逻辑序号" },
    { field: "export_dir", label: "导出目录名" },
    { field: "export_name", label: "导出文件名" },
    { field: "status", label: "状态" },
    { field: "source_file", label: "源文件名" },
  ]);
  el.headingRows.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = [
      state.selectedIds.has(item.id) ? "selected" : "",
      item.enabled ? "" : "disabled-row",
    ].join(" ");
    tr.addEventListener("click", (event) => selectHeading(item.id, event));
    const exportName = displayExportName(item, exportNameByLogicNo);
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td title="${escapeHtml(item.export_dir || "")}">${escapeHtml(item.export_dir || "")}</td>
      <td title="${escapeHtml(exportName)}">${escapeHtml(exportName)}</td>
      <td class="${statusClass(item.status)}" title="${escapeHtml(item.status || "")}">${escapeHtml(item.status || "")}</td>
      <td title="${escapeHtml(item.source_file)}">${escapeHtml(shortFile(item.source_file))}</td>
    `;
    tr.children[1].appendChild(textInput(item, "title"));
    tr.children[2].appendChild(numberInput(item, "level", 1, 6));
    tr.children[3].textContent = item.line_no || "";
    tr.children[4].appendChild(textInput(item, "local_no"));
    el.headingRows.appendChild(tr);
  });
  el.countInfo.textContent = `${rows.length}/${state.manifest.headings.length}`;
  renderSideEditor();
}

function renderAnnotationTable() {
  const rows = sortedRows("annotations", filteredAnnotations());
  renderTableHeader("annotations", [
    { field: "index", label: "index" },
    { field: "group_no", label: "注释组" },
    { field: "note_no", label: "注释号" },
    { field: "type", label: "type" },
    { field: "line_no", label: "行号" },
    { field: "content", label: "内容" },
    { field: "heading_export_name", label: "导出文件名" },
    { field: "status", label: "状态" },
    { field: "source_file", label: "源文件名" },
  ]);
  el.headingRows.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = [
      state.selectedAnnotationIds.has(item.id) ? "selected" : "",
      item.type === "排除" ? "disabled-row" : "",
    ].join(" ");
    tr.addEventListener("click", (event) => selectAnnotation(item.id, event));
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(item.group_no || "")}</td>
      <td>${escapeHtml(item.note_no || "")}</td>
      <td>${escapeHtml(item.type || "引用")}</td>
      <td>${escapeHtml(item.line_no || "")}</td>
      <td title="${escapeHtml(item.content || "")}">${escapeHtml(item.content || "")}</td>
      <td title="${escapeHtml(annotationHeadingTitle(item))}">${escapeHtml(annotationHeadingExportName(item))}</td>
      <td class="${annotationStatusClass(item.status)}" title="${escapeHtml(item.status || "")}">${escapeHtml(annotationStatusText(item.status))}</td>
      <td title="${escapeHtml(item.source_file)}">${escapeHtml(shortFile(item.source_file))}</td>
    `;
    el.headingRows.appendChild(tr);
  });
  el.countInfo.textContent = `${rows.length}/${state.manifest.annotations?.length || 0}`;
  renderSideEditor();
}

function renderTableHeader(scope, columns) {
  const headerRow = document.querySelector("thead tr");
  const sort = sortState(scope);
  renderSortControls(scope, columns);
  headerRow.innerHTML = columns
    .map((column) => {
      const sortIndex = sort.fields.findIndex((entry) => entry.field === column.field);
      const active = sortIndex !== -1;
      const direction = active ? sort.fields[sortIndex].direction : "";
      const indicator = active ? `${direction === "desc" ? "↓" : "↑"}${sortIndex + 1}` : "";
      return `
        <th data-sort-field="${escapeHtml(column.field)}" aria-sort="${active ? (direction === "desc" ? "descending" : "ascending") : "none"}">
          <button class="sort-button" type="button" title="按${escapeHtml(column.label)}排序">
            <span>${escapeHtml(column.label)}</span>
            <span class="sort-indicator">${escapeHtml(indicator)}</span>
          </button>
        </th>
      `;
    })
    .join("");
  headerRow.querySelectorAll("th[data-sort-field]").forEach((th) => {
    th.addEventListener("click", () => changeSort(scope, th.dataset.sortField || "index"));
  });
  initColumnResizing();
}

function renderSortControls(scope, columns) {
  const sort = sortState(scope);
  const fieldOptions = (selected, includeNone) => [
    includeNone ? '<option value="">无</option>' : "",
    ...columns.map((column) => `<option value="${escapeHtml(column.field)}"${column.field === selected ? " selected" : ""}>${escapeHtml(column.label)}</option>`),
  ].join("");
  el.sortControls.innerHTML = [0, 1, 2].map((index) => {
    const entry = sort.fields[index] || { field: "", direction: "asc" };
    return `
      <label class="sort-key">
        <span>${index + 1}</span>
        <select data-sort-field-select>${fieldOptions(entry.field, index > 0)}</select>
        <select data-sort-direction-select>
          <option value="asc"${entry.direction === "asc" ? " selected" : ""}>升序</option>
          <option value="desc"${entry.direction === "desc" ? " selected" : ""}>降序</option>
        </select>
      </label>
    `;
  }).join("");
}

function renderProjectInfo() {
  if (!state.manifest) {
    el.projectTitle.textContent = "目录";
    el.projectMeta.textContent = "未加载";
    updateModuleActions();
    return;
  }
  const inputDir = state.manifest.input_dir || "";
  const dirName = inputDir.split("/").filter(Boolean).pop() || "source";
  el.projectTitle.textContent = dirName;
  el.projectMeta.textContent = `${state.manifest.files.length} files · ${currentModuleLabel()}`;
  updateModuleActions();
}

function currentModuleScope() {
  return state.activeDataView === "annotations" ? "annotations" : "headings";
}

function currentModuleLabel() {
  if (state.activeDataView === "annotations") {
    return state.activeAnnotationGroup ? `注释组 ${state.activeAnnotationGroup}` : "注释";
  }
  if (state.activeSourceFile) return `文件 ${shortFile(state.activeSourceFile)}`;
  return "标题";
}

function updateModuleActions() {
  const scope = currentModuleScope();
  for (const button of el.moduleActionBtns) {
    const scopes = String(button.dataset.moduleAction || "").split(/\s+/).filter(Boolean);
    button.hidden = !state.manifest || !scopes.includes(scope);
  }
}

function isTitleModuleActive() {
  return state.activeDataView === "headings" && !state.activeSourceFile;
}

function isAnnotationModuleActive() {
  return state.activeDataView === "annotations" && !state.activeAnnotationGroup;
}

function ensureSelectionAfterLoad() {
  const validIds = new Set((state.manifest?.headings || []).map((item) => item.id));
  const validAnnotationIds = new Set((state.manifest?.annotations || []).map((item) => item.id));
  state.selectedIds = new Set(Array.from(state.selectedIds).filter((id) => validIds.has(id)));
  state.selectedAnnotationIds = new Set(
    Array.from(state.selectedAnnotationIds).filter((id) => validAnnotationIds.has(id))
  );
  if (!state.selectedId || !validIds.has(state.selectedId)) {
    state.selectedId = state.selectedIds.values().next().value || state.manifest?.headings[0]?.id || null;
  }
  if (state.selectedId) state.selectedIds.add(state.selectedId);
  state.anchorId = state.anchorId && validIds.has(state.anchorId) ? state.anchorId : state.selectedId;
  state.annotationAnchorId =
    state.annotationAnchorId && validAnnotationIds.has(state.annotationAnchorId)
      ? state.annotationAnchorId
      : state.selectedAnnotationIds.values().next().value || null;
}

function normalizeRestoredViewState() {
  if (!state.manifest) return;
  const validFiles = new Set(state.manifest.files || []);
  if (state.activeSourceFile && !validFiles.has(state.activeSourceFile)) {
    state.activeSourceFile = "";
  }
  if (state.activeAnnotationGroup) {
    const validAnnotationGroups = new Set(
      (state.manifest.annotations || [])
        .map((item) => String(item.group_no || "").trim())
        .filter(Boolean)
    );
    if (!validAnnotationGroups.has(state.activeAnnotationGroup)) {
      state.activeAnnotationGroup = "";
    }
  }
}

function collectWorkspaceUiState() {
  return {
    active_source_file: state.activeSourceFile,
    active_annotation_group: state.activeAnnotationGroup,
    selected_id: state.selectedId,
    selected_ids: Array.from(state.selectedIds),
    anchor_id: state.anchorId,
    selected_annotation_ids: Array.from(state.selectedAnnotationIds),
    annotation_anchor_id: state.annotationAnchorId,
    selected_context_line: state.selectedContextLine,
    active_data_view: state.activeDataView,
    table_sort: state.tableSort,
    filters: {
      only_enabled: el.onlyEnabled.checked,
      hide_disabled: el.hideDisabled.checked,
      text: el.filterText.value,
    },
    tree_expanded: state.expandedTree,
    layout: currentPaneLayout(),
    columns: currentColumnWidths(),
  };
}

function applyWorkspaceUiState(uiState) {
  const filters = uiState.filters || {};
  el.onlyEnabled.checked = Boolean(filters.only_enabled);
  el.hideDisabled.checked = filters.hide_disabled !== false;
  el.filterText.value = String(filters.text || "");
  state.activeSourceFile = String(uiState.active_source_file || "");
  state.activeAnnotationGroup = String(uiState.active_annotation_group || "");
  state.selectedId = uiState.selected_id || null;
  state.selectedIds = new Set(Array.isArray(uiState.selected_ids) ? uiState.selected_ids : []);
  state.anchorId = uiState.anchor_id || state.selectedId;
  state.selectedAnnotationIds = new Set(
    Array.isArray(uiState.selected_annotation_ids) ? uiState.selected_annotation_ids : []
  );
  state.annotationAnchorId = uiState.annotation_anchor_id || null;
  state.selectedContextLine = uiState.selected_context_line || null;
  state.activeDataView = uiState.active_data_view === "annotations" ? "annotations" : "headings";
  state.tableSort = {
    ...state.tableSort,
    ...normalizeTableSort(uiState.table_sort || {}),
  };
  state.expandedTree = {
    ...state.expandedTree,
    ...(uiState.tree_expanded || {}),
  };
  if (uiState.layout) applyPaneLayout(uiState.layout);
  if (uiState.columns) applyColumnWidths(uiState.columns);
}

function currentPaneLayout() {
  const computed = getComputedStyle(document.documentElement);
  return {
    sizes: {
      "--source-pane-width": computed.getPropertyValue("--source-pane-width").trim(),
      "--data-pane-height": computed.getPropertyValue("--data-pane-height").trim(),
      "--console-pane-height": computed.getPropertyValue("--console-pane-height").trim(),
    },
    hidden: ["source", "data", "preview", "console"].filter((pane) =>
      document.body.classList.contains(`pane-hidden-${pane}`)
    ),
  };
}

function applyPaneLayout(layout) {
  for (const [name, value] of Object.entries(layout.sizes || {})) {
    if (value) document.documentElement.style.setProperty(name, value);
  }
  for (const pane of ["source", "data", "preview", "console"]) {
    document.body.classList.toggle(`pane-hidden-${pane}`, (layout.hidden || []).includes(pane));
  }
  updatePaneToggles();
}

function currentColumnWidths() {
  const computed = getComputedStyle(document.documentElement);
  const widths = {};
  for (let i = 1; i <= 8; i += 1) {
    const parsed = Number.parseInt(computed.getPropertyValue(`--col-${i}-width`).trim(), 10);
    if (Number.isFinite(parsed)) widths[i] = parsed;
  }
  return widths;
}

function applyColumnWidths(widths) {
  for (const [index, width] of Object.entries(widths || {})) {
    setColumnWidth(Number(index), Number(width));
  }
}

function renderDirectoryTree() {
  if (!el.directoryTree) return;
  renderProjectInfo();
  if (!state.manifest) {
    el.directoryTree.innerHTML = '<div class="tree-empty">扫描后显示输入目录和源文件</div>';
    return;
  }

  const inputDir = state.manifest.input_dir || "";
  const rootName = inputDir.split("/").filter(Boolean).pop() || "source";
  el.directoryTree.innerHTML = "";
  el.directoryTree.appendChild(treeRow({
    icon: "▾",
    name: rootName,
    title: inputDir,
    count: "",
    className: "root clickable",
    onClick: () => clearSourceFilter(),
  }));

  el.directoryTree.appendChild(treeRow({
    icon: state.expandedTree.files ? "▾" : "▸",
    name: "files",
    title: "Markdown 源文件",
    count: `${state.manifest.files.length}`,
    className: `folder clickable ${state.activeSourceFile ? "active" : ""} tree-indent-1`,
    onClick: () => toggleTreeGroup("files"),
  }));
  if (state.expandedTree.files) {
    const tree = buildFileTree(state.manifest.files);
    renderFileTreeNodes(tree, 2);
  }

  el.directoryTree.appendChild(treeRow({
    icon: state.expandedTree.titles ? "▾" : "▸",
    name: "标题",
    title: "标题候选",
    count: `${state.manifest.headings.length}`,
    className: `folder clickable ${isTitleModuleActive() ? "active" : ""} tree-indent-1`,
    onClick: openTitlesGroup,
  }));
  if (state.expandedTree.titles) {
    renderHeadingTreeNodes(2);
  }

  el.directoryTree.appendChild(treeRow({
    icon: state.expandedTree.annotations ? "▾" : "▸",
    name: "注释",
    title: "注释匹配",
    count: `${(state.manifest.annotations || []).length}`,
    className: `folder clickable ${isAnnotationModuleActive() ? "active" : ""} tree-indent-1`,
    onClick: openAnnotationsGroup,
  }));
  if (state.expandedTree.annotations) {
    renderAnnotationTreeNodes(2);
  }
}

function toggleTreeGroup(group) {
  state.expandedTree[group] = !state.expandedTree[group];
  renderDirectoryTree();
  scheduleWorkspaceStateSave();
}

function openTitlesGroup() {
  state.expandedTree.titles = true;
  state.activeDataView = "headings";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function openAnnotationsGroup() {
  state.expandedTree.annotations = true;
  state.activeDataView = "annotations";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function buildFileTree(files) {
  const root = new Map();
  for (const file of files) {
    const parts = String(file).split("/").filter(Boolean);
    let node = root;
    parts.forEach((part, index) => {
      if (!node.has(part)) {
        node.set(part, { name: part, children: new Map(), file: index === parts.length - 1 ? file : "" });
      }
      const current = node.get(part);
      if (index === parts.length - 1) current.file = file;
      node = current.children;
    });
  }
  return root;
}

function renderFileTreeNodes(nodes, depth) {
  const entries = Array.from(nodes.values()).sort((a, b) => {
    if (Boolean(a.file) !== Boolean(b.file)) return a.file ? 1 : -1;
    return a.name.localeCompare(b.name, "zh-Hans-CN");
  });
  for (const node of entries) {
    const isFile = Boolean(node.file);
    const row = treeRow({
      icon: isFile ? "md" : "▾",
      name: node.name,
      title: node.file || node.name,
      count: isFile ? headingCountForFile(node.file) : "",
      className: `${isFile ? "file clickable" : "folder"} ${state.activeSourceFile === node.file ? "active" : ""} tree-indent-${Math.min(depth, 4)}`,
      onClick: isFile ? () => openSourceFile(node.file) : null,
    });
    el.directoryTree.appendChild(row);
    if (!isFile) renderFileTreeNodes(node.children, depth + 1);
  }
}

function renderHeadingTreeNodes(depth) {
  const headings = state.manifest?.headings || [];
  const summary = treeRow({
    icon: "#",
    name: `${headings.length} 个标题候选`,
    title: "标题候选总数",
    count: "",
    className: `summary tree-indent-${Math.min(depth, 4)}`,
  });
  el.directoryTree.appendChild(summary);
}

function renderAnnotationTreeNodes(depth) {
  const annotations = state.manifest?.annotations || [];
  el.directoryTree.appendChild(treeRow({
    icon: "▾",
    name: "注释组",
    title: "按注释组查看",
    count: String(annotationGroups().length),
    className: `folder tree-indent-${Math.min(depth, 4)}`,
  }));
  for (const group of annotationGroups()) {
    const row = treeRow({
      icon: "§",
      name: group.group_no,
      title: `注释组 ${group.group_no}`,
      count: String(group.count),
      className: `summary clickable ${state.activeAnnotationGroup === group.group_no ? "active" : ""} tree-indent-${Math.min(depth + 1, 4)}`,
      onClick: () => openAnnotationGroupNo(group.group_no),
    });
    el.directoryTree.appendChild(row);
  }
  el.directoryTree.appendChild(treeRow({
    icon: "※",
    name: `${annotations.length} 个注释候选`,
    title: "注释候选总数",
    count: "",
    className: `summary tree-indent-${Math.min(depth, 4)}`,
  }));
}

function annotationGroups() {
  const groups = new Map();
  for (const item of state.manifest?.annotations || []) {
    const groupNo = String(item.group_no || "").trim();
    if (!groupNo) continue;
    groups.set(groupNo, (groups.get(groupNo) || 0) + 1);
  }
  return Array.from(groups.entries())
    .map(([group_no, count]) => ({ group_no, count }))
    .sort((a, b) => noteSortValue(a.group_no) - noteSortValue(b.group_no) || a.group_no.localeCompare(b.group_no, "zh-Hans-CN"));
}

function openAnnotationGroupNo(groupNo) {
  state.expandedTree.annotations = true;
  state.activeDataView = "annotations";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = groupNo;
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function noteSortValue(value) {
  const text = String(value || "").trim();
  return /^\d+$/.test(text) ? Number(text) : Number.MAX_SAFE_INTEGER;
}

function treeRow({ icon, name, title, count, className, onClick }) {
  const row = document.createElement(onClick ? "button" : "div");
  if (onClick) row.type = "button";
  row.className = `tree-row ${className || ""}`;
  row.title = title || name;
  row.innerHTML = `
    <span class="tree-icon">${escapeHtml(icon || "")}</span>
    <span class="tree-name">${escapeHtml(name || "")}</span>
    <span class="tree-count">${escapeHtml(count || "")}</span>
  `;
  if (onClick) {
    const handler = (event) => {
      event.preventDefault();
      onClick();
    };
    row.onclick = handler;
  }
  return row;
}

function headingCountForFile(file) {
  const count = state.manifest?.headings.filter((item) => item.source_file === file).length || 0;
  return count ? String(count) : "";
}

function toggleSourceFilter(file) {
  state.activeSourceFile = state.activeSourceFile === file ? "" : file;
  state.activeDataView = "headings";
  state.activeAnnotationGroup = "";
  el.filterText.value = state.activeSourceFile ? shortFile(file) : "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

async function openSourceFile(file) {
  if (!state.manifest || !file) return;
  state.activeSourceFile = file;
  state.activeDataView = "headings";
  state.activeAnnotationGroup = "";
  el.filterText.value = shortFile(file);
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
  await loadFilePreview(file);
}

function clearSourceFilter() {
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function renderSideEditor() {
}

function buildExportNameMap(rows) {
  const result = new Map();
  for (const item of rows) {
    const key = logicKey(item);
    if (!key || result.has(key)) continue;
    result.set(key, exportNameForItem(item));
  }
  for (const item of rows) {
    const key = exportKey(item);
    if (result.has(key)) continue;
    result.set(key, exportNameForItem(item));
  }
  return result;
}

function exportNameForItem(item) {
  return String(item.export_name || "").trim() || defaultExportName(item.local_no, item.title);
}

function displayExportName(item, exportNameByLogicNo) {
  return String(item.export_name || "").trim() || exportNameByLogicNo.get(exportKey(item)) || "";
}

function exportKey(item) {
  return logicKey(item) || item.id;
}

function logicKey(item) {
  const localNo = String(item.local_no || "").trim();
  if (!localNo) return "";
  return `${item.book_id || ""}:${localNo}`;
}

function defaultExportName(localNo, title) {
  const cleanLocalNo = String(localNo || "").trim();
  const cleanTitle = String(title || "").trim();
  if (cleanLocalNo && cleanTitle && normalizeExportPart(cleanLocalNo) === normalizeExportPart(cleanTitle)) {
    return cleanLocalNo;
  }
  const parts = [cleanLocalNo, cleanTitle].filter(Boolean);
  return parts.join(" ");
}

function normalizeExportPart(value) {
  return String(value || "").trim().replace(/^0+(\d+)$/, "$1");
}

function sortState(scope) {
  const normalized = normalizeSortEntry(scope, state.tableSort[scope]);
  state.tableSort[scope] = normalized;
  return normalized;
}

function normalizeTableSort(saved) {
  const result = {};
  for (const scope of ["headings", "annotations"]) {
    result[scope] = normalizeSortEntry(scope, saved[scope]);
  }
  return result;
}

function normalizeSortEntry(scope, item = {}) {
  const entries = Array.isArray(item.fields)
    ? item.fields
    : [{ field: item.field || "index", direction: item.direction || "asc" }];
  const valid = validSortFields(scope);
  const used = new Set();
  const fields = [];
  for (const entry of entries) {
    const field = valid.has(entry?.field) ? entry.field : "";
    if (!field || used.has(field)) continue;
    used.add(field);
    fields.push({ field, direction: entry.direction === "desc" ? "desc" : "asc" });
  }
  if (!fields.length) fields.push({ field: "index", direction: "asc" });
  return { fields: fields.slice(0, 3) };
}

function validSortFields(scope) {
  return scope === "annotations"
    ? new Set(["index", "group_no", "note_no", "type", "line_no", "content", "heading_export_name", "status", "source_file"])
    : new Set(["index", "title", "level", "line_no", "local_no", "export_dir", "export_name", "status", "source_file"]);
}

function changeSort(scope, field) {
  const current = sortState(scope).fields[0] || { field: "index", direction: "asc" };
  const direction = current.field === field && current.direction === "asc" ? "desc" : "asc";
  state.tableSort[scope] = { fields: [{ field, direction }] };
  renderTable();
  scheduleWorkspaceStateSave();
}

function applySortControls() {
  const scope = currentModuleScope();
  const valid = validSortFields(scope);
  const used = new Set();
  const fields = Array.from(el.sortControls.querySelectorAll(".sort-key")).map((row) => {
    const field = row.querySelector("[data-sort-field-select]")?.value || "";
    const direction = row.querySelector("[data-sort-direction-select]")?.value === "desc" ? "desc" : "asc";
    return { field, direction };
  }).filter((entry) => {
    if (!valid.has(entry.field) || used.has(entry.field)) return false;
    used.add(entry.field);
    return true;
  });
  state.tableSort[scope] = { fields: fields.length ? fields : [{ field: "index", direction: "asc" }] };
  renderTable();
  scheduleWorkspaceStateSave();
}

function sortedRows(scope, rows) {
  const sortFields = sortState(scope).fields;
  return rows
    .map((item, index) => ({ item, index }))
    .sort((a, b) => {
      for (const sort of sortFields) {
        const compared = compareSortValues(
          sortValue(scope, a.item, sort.field, a.index),
          sortValue(scope, b.item, sort.field, b.index),
          sort.field
        );
        if (compared) return compared * (sort.direction === "desc" ? -1 : 1);
      }
      return a.index - b.index;
    })
    .map(({ item }) => item);
}

function sortValue(scope, item, field, index) {
  if (field === "index") return index + 1;
  if (scope === "headings" && field === "export_name") return exportNameForItem(item);
  if (scope === "annotations" && field === "type") return annotationTypeOrder(item.type);
  if (scope === "annotations" && field === "heading_export_name") return annotationHeadingExportName(item);
  if (field === "status") return statusSortValue(item.status);
  if (field === "note_no" || field === "local_no") return noteSortValue(item[field]);
  if (field === "level" || field === "line_no") return Number(item[field] || 0);
  return item[field] ?? "";
}

function compareSortValues(a, b, field) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (field === "note_no" || field === "local_no") {
    const aText = String(a ?? "");
    const bText = String(b ?? "");
    return noteSortValue(aText) - noteSortValue(bText) || aText.localeCompare(bText, "zh-Hans-CN", { numeric: true });
  }
  return String(a ?? "").localeCompare(String(b ?? ""), "zh-Hans-CN", { numeric: true, sensitivity: "base" });
}

function statusSortValue(status) {
  const order = ["正常", "已排除", "手动新增", "待确认", "缺少正文", "缺少引用", "疑似重复"];
  const index = order.indexOf(String(status || ""));
  return index === -1 ? String(status || "") : index;
}

function filteredHeadings() {
  const text = el.filterText.value.trim().toLowerCase();
  return state.manifest.headings.filter((item) => {
    if (el.onlyEnabled.checked && !item.enabled) return false;
    if (el.hideDisabled.checked && !item.enabled) return false;
    if (!text) return true;
    return [item.title, item.book_id, item.book_title, item.status, item.source_file]
      .join(" ")
      .toLowerCase()
      .includes(text);
  });
}

function filteredAnnotations() {
  const text = el.filterText.value.trim().toLowerCase();
  const annotations = state.manifest.annotations || [];
  return annotations.filter((item) => {
    if (state.activeAnnotationGroup && String(item.group_no || "") !== state.activeAnnotationGroup) return false;
    if (!text) return true;
    const heading = headingById(item.heading_id);
    return [
      item.group_no,
      item.note_no,
      item.marker,
      item.type,
      item.content,
      item.status,
      item.source_file,
      heading?.title,
      annotationHeadingExportName(item),
    ]
      .join(" ")
      .toLowerCase()
      .includes(text);
  }).sort(compareAnnotations);
}

function compareAnnotations(a, b) {
  if (!state.activeAnnotationGroup) {
    return (
      String(a.source_file || "").localeCompare(String(b.source_file || ""), "zh-Hans-CN") ||
      Number(a.line_no || 0) - Number(b.line_no || 0) ||
      noteSortValue(a.note_no) - noteSortValue(b.note_no) ||
      String(a.note_no || "").localeCompare(String(b.note_no || ""), "zh-Hans-CN") ||
      annotationTypeOrder(a.type) - annotationTypeOrder(b.type)
    );
  }
  return (
    noteSortValue(a.group_no) - noteSortValue(b.group_no) ||
    String(a.group_no || "").localeCompare(String(b.group_no || ""), "zh-Hans-CN") ||
    noteSortValue(a.note_no) - noteSortValue(b.note_no) ||
    String(a.note_no || "").localeCompare(String(b.note_no || ""), "zh-Hans-CN") ||
    annotationTypeOrder(a.type) - annotationTypeOrder(b.type) ||
    Number(a.line_no || 0) - Number(b.line_no || 0)
  );
}

function annotationTypeOrder(type) {
  if (isAnnotationRef({ type })) return 0;
  if (type === "正文") return 1;
  if (type === "排除") return 2;
  return 3;
}

function isAnnotationRef(item) {
  const type = String(item?.type || "引用").trim();
  return type === "引用" || type === "应用";
}

function headingById(id) {
  return state.manifest?.headings.find((item) => item.id === id);
}

function annotationHeadingIndex(item) {
  const rows = sortedRows("headings", headingRowsForExportIndex());
  const index = rows.findIndex((heading) => heading.id === effectiveAnnotationHeadingId(item));
  return index === -1 ? "" : String(index + 1);
}

function headingRowsForExportIndex() {
  return (state.manifest?.headings || []).filter((item) => {
    if (el.onlyEnabled.checked && !item.enabled) return false;
    if (el.hideDisabled.checked && !item.enabled) return false;
    return true;
  });
}

function annotationHeadingExportName(item) {
  const heading = headingById(effectiveAnnotationHeadingId(item));
  if (!heading) return "";
  const index = annotationHeadingIndex(item);
  return `${exportNameForItem(heading)}${index ? ` (index=${index})` : ""}`;
}

function annotationHeadingTitle(item) {
  const heading = headingById(effectiveAnnotationHeadingId(item));
  if (!heading) return "";
  return `${annotationHeadingExportName(item)} ${heading.title || ""}`.trim();
}

function effectiveAnnotationHeadingId(item) {
  if (item.type === "正文") {
    const ref = primaryAnnotationRef(annotationRefsForItem(item));
    if (ref) return String(ref.heading_id || "");
  }
  return String(item.heading_id || "");
}

function annotationRefsForItem(item) {
  const key = annotationBindingKey(item);
  if (!key) return [];
  return (state.manifest?.annotations || []).filter((candidate) =>
    candidate.id !== item.id &&
    isAnnotationRef(candidate) &&
    annotationBindingKey(candidate) === key
  );
}

async function selectAnnotation(id, event = null) {
  const item = state.manifest?.annotations?.find((candidate) => candidate.id === id);
  if (!item) return;
  applyAnnotationSelection(id, event);
  renderTable();
  scheduleWorkspaceStateSave();
  await loadAnnotationContext(item);
}

function applyAnnotationSelection(id, event = null) {
  const isRange = Boolean(event?.shiftKey);
  const isToggle = Boolean(event?.metaKey || event?.ctrlKey);
  const visibleIds = filteredAnnotations().map((item) => item.id);

  if (isRange && state.annotationAnchorId) {
    const anchorIndex = visibleIds.indexOf(state.annotationAnchorId);
    const currentIndex = visibleIds.indexOf(id);
    if (anchorIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(anchorIndex, currentIndex);
      const end = Math.max(anchorIndex, currentIndex);
      const rangeIds = visibleIds.slice(start, end + 1);
      if (isToggle) {
        for (const rangeId of rangeIds) state.selectedAnnotationIds.add(rangeId);
      } else {
        state.selectedAnnotationIds = new Set(rangeIds);
      }
    } else {
      state.selectedAnnotationIds = new Set([id]);
      state.annotationAnchorId = id;
    }
  } else if (isToggle) {
    if (state.selectedAnnotationIds.has(id) && state.selectedAnnotationIds.size > 1) {
      state.selectedAnnotationIds.delete(id);
    } else {
      state.selectedAnnotationIds.add(id);
    }
    state.annotationAnchorId = id;
  } else {
    state.selectedAnnotationIds = new Set([id]);
    state.annotationAnchorId = id;
  }
}

async function selectHeading(id, event = null) {
  applySelection(id, event);
  renderDirectoryTree();
  renderTable();
  renderSideEditor();
  scheduleWorkspaceStateSave();
  await loadContext(currentHeading());
}

async function activateHeading(id) {
  if (state.selectedId === id) return;
  state.selectedId = id;
  state.selectedIds = new Set([id]);
  state.anchorId = id;
  renderDirectoryTree();
  markSelectedRow();
  renderSideEditor();
  scheduleWorkspaceStateSave();
  await loadContext(currentHeading());
}

function markSelectedRow() {
  document.querySelectorAll("#headingRows tr").forEach((row) => {
    row.classList.toggle("selected", state.selectedIds.has(row.dataset.id));
  });
}

function applySelection(id, event = null) {
  const isRange = Boolean(event?.shiftKey);
  const isToggle = Boolean(event?.metaKey || event?.ctrlKey);
  const visibleIds = filteredHeadings().map((item) => item.id);

  if (isRange && state.anchorId) {
    const anchorIndex = visibleIds.indexOf(state.anchorId);
    const currentIndex = visibleIds.indexOf(id);
    if (anchorIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(anchorIndex, currentIndex);
      const end = Math.max(anchorIndex, currentIndex);
      const rangeIds = visibleIds.slice(start, end + 1);
      if (isToggle) {
        for (const rangeId of rangeIds) state.selectedIds.add(rangeId);
      } else {
        state.selectedIds = new Set(rangeIds);
      }
    } else {
      state.selectedIds = new Set([id]);
      state.anchorId = id;
    }
  } else if (isToggle) {
    if (state.selectedIds.has(id) && state.selectedIds.size > 1) {
      state.selectedIds.delete(id);
    } else {
      state.selectedIds.add(id);
    }
    state.anchorId = id;
  } else {
    state.selectedIds = new Set([id]);
    state.anchorId = id;
  }

  state.selectedId = id;
}

async function loadContext(item) {
  if (!item || !state.manifest) return;
  el.contextTitle.textContent = item.title || "原文定位";
  el.contextMeta.textContent = `${item.source_file}:${item.line_no}`;
  const data = await fetchJson(
    `/api/file?dir=${encodeURIComponent(state.manifest.input_dir)}&file=${encodeURIComponent(item.source_file)}&line=${encodeURIComponent(item.line_no)}`
  );
  if (data.error) {
    el.contextLines.textContent = data.error;
    return;
  }
  state.selectedContextLine = item.line_no;
  el.contextLines.innerHTML = renderMarkdown(data.text, item.line_no);
  wirePreviewBlocks();
  selectPreviewLine(item.line_no);
  el.contextLines.querySelector(".md-block.selected")?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
}

async function loadFilePreview(sourceFile) {
  if (!sourceFile || !state.manifest) return;
  el.contextTitle.textContent = shortFile(sourceFile);
  el.contextMeta.textContent = sourceFile;
  const data = await fetchJson(
    `/api/file?dir=${encodeURIComponent(state.manifest.input_dir)}&file=${encodeURIComponent(sourceFile)}&line=1`
  );
  if (data.error) {
    el.contextLines.textContent = data.error;
    return;
  }
  state.selectedContextLine = 1;
  el.contextLines.innerHTML = renderMarkdown(data.text, 1);
  wirePreviewBlocks();
  selectPreviewLine(1);
  el.contextLines.scrollTop = 0;
}

async function loadAnnotationContext(item) {
  const targetLine = Number(item.line_no || 1);
  el.contextTitle.textContent = `注释 ${item.note_no || ""} ${item.type || "引用"}`.trim();
  el.contextMeta.textContent = `${item.source_file}:${targetLine}`;
  const data = await fetchJson(
    `/api/file?dir=${encodeURIComponent(state.manifest.input_dir)}&file=${encodeURIComponent(item.source_file)}&line=${encodeURIComponent(targetLine)}`
  );
  if (data.error) {
    el.contextLines.textContent = data.error;
    return;
  }
  state.selectedContextLine = targetLine;
  el.contextLines.innerHTML = renderMarkdown(data.text, targetLine);
  wirePreviewBlocks();
  selectPreviewLine(targetLine);
  el.contextLines.querySelector(".md-block.selected")?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
}

function wirePreviewBlocks() {
  el.contextLines.querySelectorAll(".md-block").forEach((block) => {
    block.addEventListener("click", () => {
      const line = Number(block.dataset.line || 0);
      if (!line) return;
      state.selectedContextLine = line;
      el.contextLines.querySelectorAll(".md-block").forEach((node) => node.classList.remove("selected"));
      block.classList.add("selected");
    });
  });
}

function selectPreviewLine(lineNo) {
  const blocks = Array.from(el.contextLines.querySelectorAll(".md-block"));
  let selected = blocks.find((block) => Number(block.dataset.line) === Number(lineNo));
  if (!selected) {
    selected = blocks
      .filter((block) => Number(block.dataset.line) <= Number(lineNo))
      .sort((a, b) => Number(b.dataset.line) - Number(a.dataset.line))[0];
  }
  selected?.classList.add("selected");
}

function openManualDialog() {
  if (!currentHeading()) {
    setMessage("先选择一个原文位置");
    return;
  }
  el.manualTitle.value = "";
  el.manualDialog.showModal();
}

function addManualTitle(event) {
  event.preventDefault();
  const anchor = currentHeading();
  const title = el.manualTitle.value.trim();
  if (!anchor || !title) return;
  const line = Number(state.selectedContextLine || anchor.line_no);
  const item = {
    id: `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    enabled: true,
    book_id: anchor.book_id || "",
    book_title: anchor.book_title || "",
    level: anchor.level || 2,
    local_no: "",
    global_no: "",
    title,
    source_file: anchor.source_file,
    line_no: line,
    status: "手动新增",
    kind: "manual",
    confidence: "manual",
    raw_text: title,
    insert_before_line: el.manualPosition.value === "before" ? line : null,
    insert_after_line: el.manualPosition.value === "after" ? line : null,
    missing: false,
    metadata: {},
  };
  const idx = state.manifest.headings.findIndex((candidate) => candidate.id === anchor.id);
  state.manifest.headings.splice(idx + 1, 0, item);
  state.selectedId = item.id;
  state.selectedIds = new Set([item.id]);
  state.anchorId = item.id;
  el.manualDialog.close();
  recomputeStatuses();
  renderTable();
  renderSideEditor();
  loadContext(item);
  setMessage("已新增标题，保存后写入 manifest");
}

function renumber() {
  if (!state.manifest) return;
  let global = 1;
  const byBook = new Map();
  for (const item of state.manifest.headings) {
    if (!item.enabled || item.missing) continue;
    if (!item.book_id) continue;
    if (!byBook.has(item.book_id)) byBook.set(item.book_id, 1);
    item.local_no = String(byBook.get(item.book_id)).padStart(2, "0");
    item.global_no = String(global).padStart(3, "0");
    byBook.set(item.book_id, byBook.get(item.book_id) + 1);
    global += 1;
  }
  recomputeStatuses();
  renderTable();
  renderSideEditor();
  setMessage("已按当前有效标题和书籍归属重新编号");
}

function setSelectedLocalNo() {
  if (!state.manifest) {
    setMessage("没有可编辑的标题");
    return;
  }
  const selectedItems = state.manifest.headings.filter((item) => state.selectedIds.has(item.id));
  if (!selectedItems.length) {
    setMessage("请先选择标题行");
    return;
  }
  const currentValues = [...new Set(selectedItems.map((item) => item.local_no).filter(Boolean))];
  const defaultValue = currentValues.length === 1 ? currentValues[0] : "";
  el.localNoHint.textContent = `将为 ${selectedItems.length} 行设置同一个逻辑序号。`;
  el.localNoInput.value = defaultValue;
  el.localNoDialog.showModal();
  requestAnimationFrame(() => {
    el.localNoInput.focus();
    el.localNoInput.select();
  });
}

function applySelectedLocalNo(event) {
  event.preventDefault();
  const selectedItems = state.manifest?.headings.filter((item) => state.selectedIds.has(item.id)) || [];
  const visibleSelectedItems = filteredHeadings().filter((item) => state.selectedIds.has(item.id));
  const normalized = el.localNoInput.value.trim();
  if (!normalized) {
    setMessage("逻辑序号不能为空", true);
    return;
  }
  if (!selectedItems.length) {
    setMessage("请先选择标题行", true);
    el.localNoDialog.close();
    return;
  }
  const firstSelected = visibleSelectedItems[0] || selectedItems[0];
  const exportName = defaultExportName(normalized, firstSelected?.title || "");
  for (const item of selectedItems) {
    item.local_no = normalized;
    item.export_name = exportName;
  }
  el.localNoDialog.close();
  recomputeStatuses();
  renderTable();
  renderSideEditor();
  setMessage(`已将 ${selectedItems.length} 行逻辑序号设为 ${normalized}，导出文件名设为 ${exportName}`);
}

function setSelectedExportDir() {
  if (!state.manifest) {
    setMessage("没有可编辑的标题");
    return;
  }
  if (state.activeDataView !== "headings") {
    setMessage("请先切换到标题表");
    return;
  }
  const selectedItems = state.manifest.headings.filter((item) => state.selectedIds.has(item.id));
  if (!selectedItems.length) {
    setMessage("请先选择标题行");
    return;
  }
  const currentValues = [...new Set(selectedItems.map((item) => String(item.export_dir || "").trim()))];
  el.exportDirHint.textContent = `将为 ${selectedItems.length} 行设置同一个导出目录名。留空可清空。`;
  el.exportDirInput.value = currentValues.length === 1 ? currentValues[0] : "";
  el.exportDirDialog.showModal();
  requestAnimationFrame(() => {
    el.exportDirInput.focus();
    el.exportDirInput.select();
  });
}

function applySelectedExportDir(event) {
  event.preventDefault();
  const selectedItems = state.manifest?.headings.filter((item) => state.selectedIds.has(item.id)) || [];
  if (!selectedItems.length) {
    setMessage("请先选择标题行", true);
    el.exportDirDialog.close();
    return;
  }
  const exportDir = el.exportDirInput.value.trim();
  for (const item of selectedItems) {
    item.export_dir = exportDir;
  }
  el.exportDirDialog.close();
  renderTable();
  renderSideEditor();
  scheduleWorkspaceStateSave();
  setMessage(exportDir ? `已将 ${selectedItems.length} 行导出目录名设为 ${exportDir}` : `已清空 ${selectedItems.length} 行导出目录名`);
}

function setSelectedAnnotationType() {
  if (!state.manifest) {
    setMessage("没有可编辑的注释候选");
    return;
  }
  if (state.activeDataView !== "annotations") {
    setMessage("请先切换到注释表");
    return;
  }
  const selectedItems = state.manifest.annotations.filter((item) => state.selectedAnnotationIds.has(item.id));
  if (!selectedItems.length) {
    setMessage("请先选择注释行");
    return;
  }
  const currentValues = [...new Set(selectedItems.map((item) => item.type || "引用"))];
  el.annotationTypeHint.textContent = `将为 ${selectedItems.length} 行设置同一个注释类型。`;
  el.annotationTypeInput.value = currentValues.length === 1 ? currentValues[0] : "引用";
  el.annotationTypeDialog.showModal();
}

function applySelectedAnnotationType(event) {
  event.preventDefault();
  const selectedItems = state.manifest?.annotations.filter((item) => state.selectedAnnotationIds.has(item.id)) || [];
  if (!selectedItems.length) {
    setMessage("请先选择注释行", true);
    el.annotationTypeDialog.close();
    return;
  }
  const nextType = el.annotationTypeInput.value;
  for (const item of selectedItems) {
    item.type = nextType;
  }
  el.annotationTypeDialog.close();
  recomputeAnnotationStatuses();
  renderTable();
  scheduleWorkspaceStateSave();
  setMessage(`已将 ${selectedItems.length} 行注释类型设为 ${nextType}`);
}

function setSelectedAnnotationGroup() {
  if (!state.manifest) {
    setMessage("没有可编辑的注释候选");
    return;
  }
  if (state.activeDataView !== "annotations") {
    setMessage("请先切换到注释表");
    return;
  }
  const selectedItems = state.manifest.annotations.filter((item) => state.selectedAnnotationIds.has(item.id));
  if (!selectedItems.length) {
    setMessage("请先选择注释行");
    return;
  }
  const currentValues = [...new Set(selectedItems.map((item) => item.group_no).filter(Boolean))];
  el.annotationGroupHint.textContent = `将为 ${selectedItems.length} 行设置同一个注释组号。`;
  el.annotationGroupInput.value = currentValues.length === 1 ? currentValues[0] : state.activeAnnotationGroup || "";
  el.annotationGroupDialog.showModal();
  requestAnimationFrame(() => {
    el.annotationGroupInput.focus();
    el.annotationGroupInput.select();
  });
}

function applySelectedAnnotationGroup(event) {
  event.preventDefault();
  const selectedItems = state.manifest?.annotations.filter((item) => state.selectedAnnotationIds.has(item.id)) || [];
  const groupNo = el.annotationGroupInput.value.trim();
  if (!selectedItems.length) {
    setMessage("请先选择注释行", true);
    el.annotationGroupDialog.close();
    return;
  }
  if (!groupNo) {
    setMessage("注释组号不能为空", true);
    return;
  }
  for (const item of selectedItems) {
    item.group_no = groupNo;
  }
  state.activeAnnotationGroup = groupNo;
  el.annotationGroupDialog.close();
  recomputeAnnotationStatuses();
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
  setMessage(`已将 ${selectedItems.length} 行注释组号设为 ${groupNo}`);
}

function bindAnnotationHeadings() {
  if (!state.manifest) {
    setMessage("没有可绑定的注释候选");
    return;
  }
  if (state.activeDataView !== "annotations") {
    setMessage("请先切换到注释表");
    return;
  }
  const annotations = state.manifest.annotations || [];
  if (!annotations.length) {
    setMessage("没有可绑定的注释候选");
    return;
  }
  const headingsByFile = buildHeadingLineIndex();
  const refHeadingIds = new Map();
  const refsByKey = new Map();
  let matched = 0;
  let unmatched = 0;
  let changed = 0;
  for (const item of annotations.filter((candidate) => isAnnotationRef(candidate))) {
    const heading = headingForAnnotation(item, headingsByFile);
    refHeadingIds.set(item.id, heading?.id || "");
    const key = annotationBindingKey(item);
    if (key) {
      if (!refsByKey.has(key)) refsByKey.set(key, []);
      refsByKey.get(key).push(item);
    }
  }
  for (const item of annotations) {
    let nextHeadingId = String(item.heading_id || "");
    if (item.type === "排除") {
      nextHeadingId = "";
    } else {
      const key = annotationBindingKey(item);
      const refs = refsByKey.get(key) || [];
      const ref = annotationHasGroup(item) ? primaryAnnotationRef(refs) : nearestAnnotationRef(item, refs);
      if (ref) nextHeadingId = refHeadingIds.get(ref.id) || "";
      else if (isAnnotationRef(item)) nextHeadingId = refHeadingIds.get(item.id) || "";
      else if (!isAnnotationRef(item)) nextHeadingId = "";
    }
    if (String(item.heading_id || "") !== nextHeadingId) {
      item.heading_id = nextHeadingId;
      changed += 1;
    }
    if (item.type !== "排除") {
      if (nextHeadingId) matched += 1;
      else unmatched += 1;
    }
  }
  renderTable();
  renderDirectoryTree();
  scheduleWorkspaceStateSave();
  setMessage(`已绑定导出文件名：同注释组同注释号统一导出文件名；匹配 ${matched} 行，未匹配 ${unmatched} 行，更新 ${changed} 行`);
}

function annotationBindingKey(item) {
  const noteNo = String(item.note_no || "").trim();
  if (!noteNo) return "";
  const groupNo = String(item.group_no || "").trim();
  if (groupNo) return `group:${groupNo}:${noteNo}`;
  return `file:${item.source_file || ""}:${noteNo}`;
}

function annotationHasGroup(item) {
  return Boolean(String(item.group_no || "").trim());
}

function primaryAnnotationRef(refs) {
  if (!refs.length) return null;
  return [...refs].sort((a, b) =>
    String(a.source_file || "").localeCompare(String(b.source_file || ""), "zh-Hans-CN") ||
    Number(a.line_no || 0) - Number(b.line_no || 0)
  )[0];
}

function nearestAnnotationRef(item, refs) {
  if (!refs.length) return null;
  const sourceFile = String(item.source_file || "");
  const lineNo = Number(item.line_no || 0);
  return refs
    .filter((ref) => !sourceFile || String(ref.source_file || "") === sourceFile)
    .sort((a, b) => Math.abs(Number(a.line_no || 0) - lineNo) - Math.abs(Number(b.line_no || 0) - lineNo))[0] || refs[0];
}

function buildHeadingLineIndex() {
  const result = new Map();
  const headings = (state.manifest?.headings || [])
    .filter((item) => item.enabled && !item.missing && item.source_file && Number(item.line_no || 0) > 0)
    .sort((a, b) =>
      String(a.source_file || "").localeCompare(String(b.source_file || ""), "zh-Hans-CN") ||
      Number(a.line_no || 0) - Number(b.line_no || 0)
    );
  for (const heading of headings) {
    const sourceFile = String(heading.source_file || "");
    if (!result.has(sourceFile)) result.set(sourceFile, []);
    result.get(sourceFile).push(heading);
  }
  return result;
}

function headingForAnnotation(item, headingsByFile) {
  const headings = headingsByFile.get(String(item.source_file || "")) || [];
  const lineNo = Number(item.line_no || 0);
  let current = null;
  for (const heading of headings) {
    if (Number(heading.line_no || 0) > lineNo) break;
    current = heading;
  }
  return current;
}

function recomputeStatuses() {
  if (!state.manifest) return;
  const enabled = state.manifest.headings.filter((item) => item.enabled && !item.missing);
  const globalDupes = duplicates(enabled.map((item) => item.global_no).filter(Boolean));
  const localDupes = new Set();
  const byBook = new Map();
  for (const item of enabled) {
    if (!item.book_id) continue;
    if (!byBook.has(item.book_id)) byBook.set(item.book_id, []);
    byBook.get(item.book_id).push(item);
  }
  for (const [bookId, items] of byBook.entries()) {
    for (const no of duplicates(items.map((item) => item.local_no).filter(Boolean))) {
      localDupes.add(`${bookId}:${no}`);
    }
  }
  for (const item of state.manifest.headings) {
    if (item.missing) {
      item.status = "待确认";
      continue;
    }
    if (!item.enabled) {
      item.status = "已禁用";
      continue;
    }
    const statuses = [];
    if (!item.book_id) statuses.push("未归书");
    if (!item.local_no || !item.global_no) statuses.push("未编号");
    if (globalDupes.has(item.global_no) || localDupes.has(`${item.book_id}:${item.local_no}`)) {
      statuses.push("疑似重复");
    }
    item.status = statuses.length ? statuses.join("、") : item.kind === "manual" ? "手动新增" : "正常";
  }
  markGaps(enabled, "global_no");
  for (const items of byBook.values()) markGaps(items, "local_no");
}

function recomputeAnnotationStatuses() {
  if (!state.manifest) return;
  const annotations = state.manifest.annotations || [];
  const grouped = new Map();
  for (const item of annotations) {
    if ((item.type || "引用") === "排除") {
      item.status = "已排除";
      continue;
    }
    const groupNo = String(item.group_no || "").trim();
    if (!groupNo) {
      item.status = "待确认";
      continue;
    }
    const key = `${groupNo}:${item.note_no || ""}`;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  }
  for (const items of grouped.values()) {
    const refs = items.filter((item) => isAnnotationRef(item));
    const bodies = items.filter((item) => item.type === "正文");
    const hasAssignedBody = bodies.length > 0;
    const hasRef = refs.length > 0;
    const duplicate = refs.length > 1 || bodies.length > 1;
    for (const item of items) {
      if (duplicate) {
        item.status = "疑似重复";
      } else if (isAnnotationRef(item)) {
        item.status = hasAssignedBody ? "正常" : "缺少正文";
      } else if (item.type === "正文") {
        item.status = hasRef ? "正常" : "缺少引用";
      } else {
        item.status = "待确认";
      }
    }
  }
}

function annotationStatusText(status) {
  if (["缺少正文", "缺少引用"].includes(status)) return "X";
  return status || "待确认";
}

function annotationStatusClass(status) {
  if (["正常", "已排除"].includes(status)) return "status-normal";
  if (["缺少正文", "缺少引用", "疑似重复"].includes(status)) return "status-bad";
  return "status-warn";
}

function markGaps(items, field) {
  const nums = items.map((item) => Number(item[field])).filter((num) => Number.isInteger(num) && num > 0).sort((a, b) => a - b);
  if (!nums.length) return;
  const unique = new Set(nums);
  for (let i = nums[0]; i <= nums[nums.length - 1]; i += 1) {
    if (!unique.has(i)) {
      for (const item of items) {
        if (item.status === "正常" || item.status === "手动新增") item.status = "疑似漏号";
        else if (!item.status.includes("疑似漏号")) item.status += "、疑似漏号";
      }
      return;
    }
  }
}

function duplicates(values) {
  const seen = new Set();
  const dupes = new Set();
  for (const value of values) {
    if (seen.has(value)) dupes.add(value);
    seen.add(value);
  }
  return dupes;
}

function currentHeading() {
  return state.manifest?.headings.find((item) => item.id === state.selectedId);
}

function checkbox(item, field) {
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = Boolean(item[field]);
  input.addEventListener("click", (event) => {
    event.stopPropagation();
    selectHeading(item.id, event);
  });
  input.addEventListener("change", () => {
    item[field] = input.checked;
    recomputeStatuses();
    renderTable();
  });
  return input;
}

function textInput(item, field) {
  const input = document.createElement("input");
  input.value = item[field] || "";
  input.addEventListener("click", (event) => {
    event.stopPropagation();
    selectHeading(item.id, event);
  });
  input.addEventListener("change", () => {
    item[field] = input.value.trim();
    recomputeStatuses();
    renderTable();
  });
  return input;
}

function numberInput(item, field, min, max) {
  const input = textInput(item, field);
  input.type = "number";
  input.min = min;
  input.max = max;
  return input;
}

function statusClass(status) {
  if (status === "正常" || status === "手动新增") return "status-normal";
  if (status === "已禁用") return "";
  if ((status || "").includes("重复") || (status || "").includes("漏号")) return "status-bad";
  return "status-warn";
}

async function fetchJson(url, options = {}) {
  try {
    const response = await fetch(url, options);
    return await response.json();
  } catch (error) {
    return { error: String(error) };
  }
}

function scheduleWorkspaceStateSave() {
  if (!state.manifest?.input_dir) return;
  state.manifest.ui_state = collectWorkspaceUiState();
  window.clearTimeout(workspaceStateTimer);
  workspaceStateTimer = window.setTimeout(saveWorkspaceStateOnly, 500);
}

async function saveWorkspaceStateOnly() {
  if (!state.manifest?.input_dir) return;
  const data = await fetchJson("/api/workspace-state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      input_dir: state.manifest.input_dir,
      ui_state: collectWorkspaceUiState(),
    }),
  });
  if (data.error) appendConsoleLine(`工作空间状态保存失败：${data.error}`, true);
}

function shortFile(path) {
  return String(path || "").split("/").pop();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function renderMarkdown(text, targetLine) {
  const lines = String(text || "").split(/\r?\n/);
  const html = [];
  let paragraph = [];
  let paragraphStart = 1;
  let listItems = [];
  let listStart = 1;
  let inCode = false;
  let codeLines = [];
  let codeStart = 1;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    html.push(
      `<p class="md-block" data-line="${paragraphStart}">${paragraph.map(renderInline).join("<br>")}</p>`
    );
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    html.push(`<ul class="md-block" data-line="${listStart}">${listItems.join("")}</ul>`);
    listItems = [];
  };

  const flushCode = (endLine) => {
    html.push(
      `<pre class="md-block" data-line="${codeStart}"><code>${escapeHtml(codeLines.join("\n"))}</code></pre>`
    );
    codeLines = [];
    inCode = false;
  };

  lines.forEach((rawLine, idx) => {
    const lineNo = idx + 1;
    const line = rawLine;
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      flushParagraph();
      flushList();
      if (inCode) {
        flushCode(lineNo);
      } else {
        inCode = true;
        codeStart = lineNo;
        codeLines = [];
      }
      return;
    }

    if (inCode) {
      codeLines.push(line);
      return;
    }

    if (!trimmed) {
      flushParagraph();
      flushList();
      return;
    }

    const heading = /^(#{1,6})\s+(.+?)\s*$/.exec(line);
    if (heading) {
      flushParagraph();
      flushList();
      const level = heading[1].length;
      html.push(
        `<h${level} class="md-block" data-line="${lineNo}">${renderInline(heading[2])}</h${level}>`
      );
      return;
    }

    const image = /^!\[([^\]]*)\]\(([^)]+)\)\s*$/.exec(trimmed);
    if (image) {
      flushParagraph();
      flushList();
      html.push(
        `<figure class="md-block" data-line="${lineNo}"><img src="${escapeAttribute(image[2])}" alt="${escapeAttribute(image[1])}" loading="lazy"><figcaption>${escapeHtml(image[1])}</figcaption></figure>`
      );
      return;
    }

    const quote = /^>\s?(.*)$/.exec(line);
    if (quote) {
      flushParagraph();
      flushList();
      html.push(`<blockquote class="md-block" data-line="${lineNo}">${renderInline(quote[1])}</blockquote>`);
      return;
    }

    const list = /^\s*[-*+]\s+(.+)$/.exec(line);
    if (list) {
      flushParagraph();
      if (!listItems.length) listStart = lineNo;
      listItems.push(`<li data-line="${lineNo}">${renderInline(list[1])}</li>`);
      return;
    }

    const ordered = /^\s*\d+[.)]\s+(.+)$/.exec(line);
    if (ordered) {
      flushParagraph();
      flushList();
      html.push(`<p class="md-block" data-line="${lineNo}">${renderInline(line)}</p>`);
      return;
    }

    if (!paragraph.length) paragraphStart = lineNo;
    paragraph.push(line);
  });

  if (inCode) flushCode(lines.length);
  flushParagraph();
  flushList();

  return `<article class="markdown-preview" data-target-line="${targetLine}">${html.join("\n")}</article>`;
}

function renderInline(value) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noreferrer">$1</a>');
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("'", "&#39;");
}

function setMessage(text, isError = false) {
  if (el.message) {
    el.message.textContent = text;
    el.message.style.color = isError ? "#b42318" : "";
  }
  appendConsoleLine(text, isError);
}

function appendConsoleLine(text, isError = false) {
  if (!el.consoleOutput || !text) return;
  const line = document.createElement("div");
  line.className = `console-line ${isError ? "error" : ""}`;
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  line.innerHTML = `<span class="console-time">${escapeHtml(time)}</span><span>${escapeHtml(text)}</span>`;
  el.consoleOutput.appendChild(line);
  el.consoleOutput.scrollTop = el.consoleOutput.scrollHeight;
}

function loadDirectoryHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(directoryHistoryKey) || "[]");
    return Array.isArray(history) ? history.filter(Boolean) : [];
  } catch {
    localStorage.removeItem(directoryHistoryKey);
    return [];
  }
}

function addDirectoryHistory(dir) {
  const normalized = String(dir || "").trim();
  if (!normalized) return;
  const history = loadDirectoryHistory().filter((item) => item !== normalized);
  history.unshift(normalized);
  localStorage.setItem(directoryHistoryKey, JSON.stringify(history.slice(0, 12)));
  renderDirectoryHistory();
}

function renderDirectoryHistory() {
  const history = loadDirectoryHistory();
  el.dirHistoryMenu.innerHTML = "";
  if (!history.length) {
    const empty = document.createElement("div");
    empty.className = "history-empty";
    empty.textContent = "暂无历史目录，扫描成功后会自动保存";
    el.dirHistoryMenu.appendChild(empty);
    return;
  }
  for (const dir of history) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.textContent = dir;
    item.title = dir;
    item.addEventListener("click", () => {
      el.inputDir.value = dir;
      hideDirectoryHistory();
      scan();
    });
    el.dirHistoryMenu.appendChild(item);
  }
}

function clearDirectoryHistory() {
  localStorage.removeItem(directoryHistoryKey);
  localStorage.removeItem(lastWorkspaceDirKey);
  renderDirectoryHistory();
  hideDirectoryHistory();
  setMessage("扫描目录历史已清空");
}

function loadLastWorkspaceDir() {
  return localStorage.getItem(lastWorkspaceDirKey) || "";
}

function saveLastWorkspaceDir(dir) {
  const normalized = String(dir || "").trim();
  if (!normalized) return;
  localStorage.setItem(lastWorkspaceDirKey, normalized);
}

function toggleDirectoryHistory(event) {
  event.preventDefault();
  event.stopPropagation();
  renderDirectoryHistory();
  el.dirHistoryMenu.hidden = !el.dirHistoryMenu.hidden;
}

function hideDirectoryHistory() {
  el.dirHistoryMenu.hidden = true;
}

function closeDirectoryHistoryOnOutsideClick(event) {
  if (event.target.closest(".path-combo")) return;
  hideDirectoryHistory();
}

function initPaneLayout() {
  const saved = loadPaneLayout();
  applyPaneLayout(saved);

  el.paneToggleBtns.forEach((button) => {
    button.addEventListener("click", () => togglePane(button.dataset.paneToggle));
  });
  el.paneHideBtns.forEach((button) => {
    button.addEventListener("click", () => togglePane(button.dataset.paneHide, true));
  });
  el.mainSplitter?.addEventListener("mousedown", (event) => startPaneResize(event, "main"));
  el.resultSplitter?.addEventListener("mousedown", (event) => startPaneResize(event, "result"));
  el.consoleSplitter?.addEventListener("mousedown", (event) => startPaneResize(event, "console"));
}

function loadPaneLayout() {
  try {
    const parsed = JSON.parse(localStorage.getItem(paneLayoutStorageKey) || "{}");
    return {
      sizes: parsed && typeof parsed.sizes === "object" ? parsed.sizes : {},
      hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
    };
  } catch {
    localStorage.removeItem(paneLayoutStorageKey);
    return { sizes: {}, hidden: [] };
  }
}

function savePaneLayout() {
  const { sizes, hidden } = currentPaneLayout();
  if (state.manifest) state.manifest.ui_state = collectWorkspaceUiState();
  localStorage.setItem(paneLayoutStorageKey, JSON.stringify({ sizes, hidden }));
  scheduleWorkspaceStateSave();
}

function togglePane(pane, forceHidden = null) {
  if (!pane) return;
  const className = `pane-hidden-${pane}`;
  const willHide = forceHidden === null ? !document.body.classList.contains(className) : forceHidden;
  document.body.classList.toggle(className, willHide);

  if (pane === "data" && willHide && document.body.classList.contains("pane-hidden-preview")) {
    document.body.classList.remove("pane-hidden-preview");
  }
  if (pane === "preview" && willHide && document.body.classList.contains("pane-hidden-data")) {
    document.body.classList.remove("pane-hidden-data");
  }

  updatePaneToggles();
  savePaneLayout();
}

function updatePaneToggles() {
  el.paneToggleBtns.forEach((button) => {
    const pane = button.dataset.paneToggle;
    const visible = !document.body.classList.contains(`pane-hidden-${pane}`);
    button.classList.toggle("active", visible);
    button.setAttribute("aria-pressed", String(visible));
  });
}

function startPaneResize(event, kind) {
  event.preventDefault();
  const splitter = event.currentTarget;
  splitter?.classList.add("active");
  const startX = event.clientX;
  const startY = event.clientY;
  const root = document.documentElement;
  const main = document.querySelector(".workbench-main");
  const result = document.querySelector(".result-pane");
  const currentConsoleHeight = parseCssPx("--console-pane-height", 120);
  document.body.classList.add("resizing-panes");
  document.body.dataset.resizeAxis = kind === "main" ? "x" : "y";

  const onMove = (moveEvent) => {
    if (kind === "main") {
      const rect = main.getBoundingClientRect();
      const width = clamp(moveEvent.clientX - rect.left, 240, Math.max(260, rect.width - 320));
      root.style.setProperty("--source-pane-width", `${Math.round(width)}px`);
      return;
    }
    if (kind === "result") {
      const rect = result.getBoundingClientRect();
      const height = clamp(moveEvent.clientY - rect.top, 150, Math.max(180, rect.height - 180));
      root.style.setProperty("--data-pane-height", `${Math.round(height)}px`);
      return;
    }
    if (kind === "console") {
      const nextHeight = clamp(currentConsoleHeight - (moveEvent.clientY - startY), 48, Math.max(80, window.innerHeight - 180));
      root.style.setProperty("--console-pane-height", `${Math.round(nextHeight)}px`);
    }
  };

  const onUp = () => {
    splitter?.classList.remove("active");
    document.body.classList.remove("resizing-panes");
    delete document.body.dataset.resizeAxis;
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    savePaneLayout();
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function parseCssPx(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function initColumnWidths() {
  try {
    const saved = JSON.parse(localStorage.getItem(columnStorageKey) || "{}");
    applyColumnWidths(saved);
  } catch {
    localStorage.removeItem(columnStorageKey);
  }
}

function initColumnResizing() {
  document.querySelectorAll("thead th").forEach((th, zeroIndex) => {
    th.style.position = "sticky";
    const handle = document.createElement("span");
    handle.className = "resize-handle";
    handle.title = "拖拽调整列宽";
    handle.addEventListener("mousedown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      startColumnResize(event, zeroIndex + 1, th);
    });
    th.appendChild(handle);
  });
}

function startColumnResize(event, columnIndex, th) {
  const startX = event.clientX;
  const startWidth = th.getBoundingClientRect().width;
  document.body.classList.add("resizing-columns");

  const onMove = (moveEvent) => {
    const minWidth = minColumnWidths[columnIndex - 1] || 48;
    const nextWidth = Math.max(minWidth, Math.round(startWidth + moveEvent.clientX - startX));
    setColumnWidth(columnIndex, nextWidth);
  };

  const onUp = () => {
    document.body.classList.remove("resizing-columns");
    document.removeEventListener("mousemove", onMove);
    document.removeEventListener("mouseup", onUp);
    saveColumnWidths();
  };

  document.addEventListener("mousemove", onMove);
  document.addEventListener("mouseup", onUp);
}

function setColumnWidth(columnIndex, width) {
  if (!Number.isFinite(width)) return;
  const minWidth = minColumnWidths[columnIndex - 1] || 48;
  document.documentElement.style.setProperty(`--col-${columnIndex}-width`, `${Math.max(minWidth, width)}px`);
}

function saveColumnWidths() {
  const widths = currentColumnWidths();
  if (state.manifest) state.manifest.ui_state = collectWorkspaceUiState();
  localStorage.setItem(columnStorageKey, JSON.stringify(widths));
  scheduleWorkspaceStateSave();
}
