const state = {
  manifest: null,
  selectedId: null,
  selectedIds: new Set(),
  anchorId: null,
  selectedContextLine: null,
  scanning: false,
  activeSourceFile: "",
  openedWorkspaceDir: "",
  expandedTree: {
    files: true,
    titles: false,
  },
};

const columnStorageKey = "ocr2md.columnWidths.v3";
const directoryHistoryKey = "ocr2md.scanDirectoryHistory.v1";
const lastWorkspaceDirKey = "ocr2md.lastWorkspaceDir.v1";
const paneLayoutStorageKey = "ocr2md.paneLayout.v1";
const minColumnWidths = [48, 120, 48, 54, 72, 140, 88, 140];
let workspaceStateTimer = null;

const el = {
  inputDir: document.querySelector("#inputDir"),
  scanBtn: document.querySelector("#scanBtn"),
  saveBtn: document.querySelector("#saveBtn"),
  exportBtn: document.querySelector("#exportBtn"),
  renumberBtn: document.querySelector("#renumberBtn"),
  setLocalNoBtn: document.querySelector("#setLocalNoBtn"),
  checkBtn: document.querySelector("#checkBtn"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  historyToggleBtn: document.querySelector("#historyToggleBtn"),
  message: document.querySelector("#message"),
  dirHistoryMenu: document.querySelector("#dirHistoryMenu"),
  onlyEnabled: document.querySelector("#onlyEnabled"),
  hideDisabled: document.querySelector("#hideDisabled"),
  filterText: document.querySelector("#filterText"),
  countInfo: document.querySelector("#countInfo"),
  headingRows: document.querySelector("#headingRows"),
  projectTitle: document.querySelector("#projectTitle"),
  projectMeta: document.querySelector("#projectMeta"),
  directoryTree: document.querySelector("#directoryTree"),
  mainSplitter: document.querySelector("#mainSplitter"),
  resultSplitter: document.querySelector("#resultSplitter"),
  consoleSplitter: document.querySelector("#consoleSplitter"),
  sideNoteInput: document.querySelector("#sideNoteInput"),
  contextTitle: document.querySelector("#contextTitle"),
  contextMeta: document.querySelector("#contextMeta"),
  contextLines: document.querySelector("#contextLines"),
  consoleOutput: document.querySelector("#consoleOutput"),
  addTitleBtn: document.querySelector("#addTitleBtn"),
  paneToggleBtns: document.querySelectorAll("[data-pane-toggle]"),
  paneHideBtns: document.querySelectorAll("[data-pane-hide]"),
  manualDialog: document.querySelector("#manualDialog"),
  manualTitle: document.querySelector("#manualTitle"),
  manualPosition: document.querySelector("#manualPosition"),
  confirmManualBtn: document.querySelector("#confirmManualBtn"),
  localNoDialog: document.querySelector("#localNoDialog"),
  localNoHint: document.querySelector("#localNoHint"),
  localNoInput: document.querySelector("#localNoInput"),
  confirmLocalNoBtn: document.querySelector("#confirmLocalNoBtn"),
};

el.scanBtn.addEventListener("click", chooseAndScanDirectory);
el.saveBtn.addEventListener("click", save);
el.exportBtn.addEventListener("click", exportMarkdown);
el.renumberBtn.addEventListener("click", renumber);
el.setLocalNoBtn.addEventListener("click", setSelectedLocalNo);
el.checkBtn.addEventListener("click", () => {
  recomputeStatuses();
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
  state.activeSourceFile = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
});
el.addTitleBtn.addEventListener("click", openManualDialog);
el.confirmManualBtn.addEventListener("click", addManualTitle);
el.confirmLocalNoBtn.addEventListener("click", applySelectedLocalNo);
el.sideNoteInput.addEventListener("input", updateCurrentNoteFromSide);

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
    state.openedWorkspaceDir = data.input_dir || dir;
    applyWorkspaceUiState(data.ui_state || {});
    addDirectoryHistory(data.input_dir);
    saveLastWorkspaceDir(data.input_dir);
    ensureSelectionAfterLoad();
    recomputeStatuses();
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
  if (!state.selectedIds.size) {
    setMessage("请先选择要导出的标题行", true);
    return;
  }
  recomputeStatuses();
  setMessage("导出中...");
  el.exportBtn.disabled = true;
  try {
    const payload = {
      ...state.manifest,
      export_selected_only: true,
      export_selected_ids: Array.from(state.selectedIds),
    };
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
  const rows = filteredHeadings();
  const exportNameByLogicNo = buildExportNameMap(rows);
  el.headingRows.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = [
      state.selectedIds.has(item.id) ? "selected" : "",
      item.enabled ? "" : "disabled-row",
    ].join(" ");
    tr.addEventListener("click", (event) => selectHeading(item.id, event));
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td></td>
      <td></td>
      <td></td>
      <td></td>
      <td title="${escapeHtml(exportNameByLogicNo.get(exportKey(item)) || "")}">${escapeHtml(exportNameByLogicNo.get(exportKey(item)) || "")}</td>
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

function renderProjectInfo() {
  if (!state.manifest) {
    el.projectTitle.textContent = "目录";
    el.projectMeta.textContent = "未加载";
    return;
  }
  const inputDir = state.manifest.input_dir || "";
  const dirName = inputDir.split("/").filter(Boolean).pop() || "source";
  el.projectTitle.textContent = dirName;
  el.projectMeta.textContent = `${state.manifest.files.length} files`;
}

function ensureSelectionAfterLoad() {
  const validIds = new Set((state.manifest?.headings || []).map((item) => item.id));
  state.selectedIds = new Set(Array.from(state.selectedIds).filter((id) => validIds.has(id)));
  if (!state.selectedId || !validIds.has(state.selectedId)) {
    state.selectedId = state.selectedIds.values().next().value || state.manifest?.headings[0]?.id || null;
  }
  if (state.selectedId) state.selectedIds.add(state.selectedId);
  state.anchorId = state.anchorId && validIds.has(state.anchorId) ? state.anchorId : state.selectedId;
}

function collectWorkspaceUiState() {
  return {
    active_source_file: state.activeSourceFile,
    selected_id: state.selectedId,
    selected_ids: Array.from(state.selectedIds),
    anchor_id: state.anchorId,
    selected_context_line: state.selectedContextLine,
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
  state.selectedId = uiState.selected_id || null;
  state.selectedIds = new Set(Array.isArray(uiState.selected_ids) ? uiState.selected_ids : []);
  state.anchorId = uiState.anchor_id || state.selectedId;
  state.selectedContextLine = uiState.selected_context_line || null;
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
    className: "folder clickable tree-indent-1",
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
    className: "folder clickable tree-indent-1",
    onClick: openTitlesGroup,
  }));
  if (state.expandedTree.titles) {
    renderHeadingTreeNodes(2);
  }
}

function toggleTreeGroup(group) {
  state.expandedTree[group] = !state.expandedTree[group];
  renderDirectoryTree();
  scheduleWorkspaceStateSave();
}

function openTitlesGroup() {
  state.expandedTree.titles = true;
  state.activeSourceFile = "";
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
    row.onmousedown = handler;
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
  el.filterText.value = state.activeSourceFile ? shortFile(file) : "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

async function openSourceFile(file) {
  if (!state.manifest || !file) return;
  state.activeSourceFile = file;
  el.filterText.value = shortFile(file);
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
  await loadFilePreview(file);
}

function clearSourceFilter() {
  state.activeSourceFile = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function renderSideEditor() {
  const current = currentHeading();
  const disabled = !current;
  el.sideNoteInput.disabled = disabled;
  if (!current) {
    el.sideNoteInput.value = "";
    return;
  }

  el.sideNoteInput.value = current.metadata?.note || "";
}

function updateCurrentNoteFromSide() {
  const current = currentHeading();
  if (!current) return;
  current.metadata = current.metadata || {};
  current.metadata.note = el.sideNoteInput.value;
}

function buildExportNameMap(rows) {
  const result = new Map();
  for (const item of rows) {
    const key = logicKey(item);
    if (!key || result.has(key)) continue;
    result.set(key, defaultExportName(item.local_no, item.title));
  }
  for (const item of rows) {
    const key = exportKey(item);
    if (result.has(key)) continue;
    result.set(key, defaultExportName(item.local_no, item.title));
  }
  return result;
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
  for (const item of selectedItems) {
    item.local_no = normalized;
  }
  el.localNoDialog.close();
  recomputeStatuses();
  renderTable();
  renderSideEditor();
  setMessage(`已将 ${selectedItems.length} 行逻辑序号设为 ${normalized}`);
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
