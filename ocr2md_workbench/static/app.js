const state = {
  manifest: null,
  selectedId: null,
  selectedIds: new Set(),
  anchorId: null,
  selectedAnnotationIds: new Set(),
  annotationAnchorId: null,
  selectedImageId: null,
  selectedIllegalBreakId: null,
  selectedIllegalBreakIds: new Set(),
  illegalBreakAnchorId: null,
  translationManifest: null,
  selectedTranslationId: null,
  selectedTranslationIds: new Set(),
  translationAnchorId: null,
  activeTranslationFile: "",
  selectedContextLine: null,
  scanning: false,
  translating: false,
  activeSourceFile: "",
  activeAnnotationGroup: "",
  activeWorkspaceTab: "ocr",
  activeDataView: "headings",
  translationSettingsOpen: false,
  translationSettings: {
    service: "DeepL",
    hasApiKey: false,
    maskedApiKey: "",
    endpointMode: "",
    apiKeyInput: "",
    apiKeyDirty: false,
    saveStatus: "",
    testText: "This is a test sentence.",
    testResult: "",
    testError: "",
    testing: false,
  },
  illegalBreakConfidenceFilter: "high",
  tableSort: {
    headings: { fields: [{ field: "index", direction: "asc" }] },
    annotations: { fields: [{ field: "index", direction: "asc" }] },
    imgs: { fields: [{ field: "index", direction: "asc" }] },
    illegal_breaks: { fields: [{ field: "source_file", direction: "asc" }, { field: "line_no", direction: "asc" }] },
    translations: { fields: [{ field: "source_file", direction: "asc" }, { field: "block_no", direction: "asc" }] },
  },
  openedWorkspaceDir: "",
  expandedTree: {
    files: true,
    titles: false,
    annotations: false,
    imgs: false,
    illegal_breaks: false,
    translations: false,
  },
};

const columnStorageKey = "ocr2md.columnWidths.v3";
const directoryHistoryKey = "ocr2md.scanDirectoryHistory.v1";
const lastWorkspaceDirKey = "ocr2md.lastWorkspaceDir.v1";
const paneLayoutStorageKey = "ocr2md.paneLayout.v1";
const minColumnWidths = [48, 120, 48, 54, 72, 140, 140, 88, 140];
let workspaceStateTimer = null;
let translationSettingsSaveTimer = null;
const mdRenderer = window.markdownit
  ? window.markdownit({
      html: true,
      linkify: true,
      typographer: true,
      breaks: false,
    })
  : null;
if (mdRenderer) {
  installMarkdownMath(mdRenderer);
  const defaultLinkOpen =
    mdRenderer.renderer.rules.link_open ||
    ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
  mdRenderer.renderer.rules.link_open = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const targetIndex = token.attrIndex("target");
    if (targetIndex < 0) token.attrPush(["target", "_blank"]);
    else token.attrs[targetIndex][1] = "_blank";
    const relIndex = token.attrIndex("rel");
    if (relIndex < 0) token.attrPush(["rel", "noreferrer"]);
    else token.attrs[relIndex][1] = "noreferrer";
    return defaultLinkOpen(tokens, idx, options, env, self);
  };
}

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
  downloadImagesBtn: document.querySelector("#downloadImagesBtn"),
  setIllegalBreakConfidenceBtn: document.querySelector("#setIllegalBreakConfidenceBtn"),
  scanTranslationBtn: document.querySelector("#scanTranslationBtn"),
  saveTranslationBtn: document.querySelector("#saveTranslationBtn"),
  runTranslationBtn: document.querySelector("#runTranslationBtn"),
  exportTranslationBtn: document.querySelector("#exportTranslationBtn"),
  setTranslationStatusBtn: document.querySelector("#setTranslationStatusBtn"),
  translationServiceSettingsBtn: document.querySelector("#translationServiceSettingsBtn"),
  checkBtn: document.querySelector("#checkBtn"),
  clearHistoryBtn: document.querySelector("#clearHistoryBtn"),
  historyToggleBtn: document.querySelector("#historyToggleBtn"),
  message: document.querySelector("#message"),
  dirHistoryMenu: document.querySelector("#dirHistoryMenu"),
  onlyEnabled: document.querySelector("#onlyEnabled"),
  hideDisabled: document.querySelector("#hideDisabled"),
  illegalBreakConfidenceFilter: document.querySelector("#illegalBreakConfidenceFilter"),
  illegalBreakConfidenceFilterBtns: document.querySelectorAll("[data-confidence-filter]"),
  filterText: document.querySelector("#filterText"),
  sortControls: document.querySelector("#sortControls"),
  countInfo: document.querySelector("#countInfo"),
  sourcePaneTitle: document.querySelector("#sourcePaneTitle"),
  headingRows: document.querySelector("#headingRows"),
  projectTitle: document.querySelector("#projectTitle"),
  projectMeta: document.querySelector("#projectMeta"),
  workspaceTabBtns: document.querySelectorAll("[data-workspace-tab]"),
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
  illegalBreakConfidenceDialog: document.querySelector("#illegalBreakConfidenceDialog"),
  illegalBreakConfidenceHint: document.querySelector("#illegalBreakConfidenceHint"),
  illegalBreakConfidenceInput: document.querySelector("#illegalBreakConfidenceInput"),
  confirmIllegalBreakConfidenceBtn: document.querySelector("#confirmIllegalBreakConfidenceBtn"),
  translationStatusDialog: document.querySelector("#translationStatusDialog"),
  translationStatusHint: document.querySelector("#translationStatusHint"),
  translationStatusInput: document.querySelector("#translationStatusInput"),
  confirmTranslationStatusBtn: document.querySelector("#confirmTranslationStatusBtn"),
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
el.downloadImagesBtn.addEventListener("click", downloadImages);
el.setIllegalBreakConfidenceBtn.addEventListener("click", setSelectedIllegalBreakConfidence);
el.scanTranslationBtn.addEventListener("click", () => scanTranslationFiles(true));
el.saveTranslationBtn.addEventListener("click", saveTranslation);
el.runTranslationBtn.addEventListener("click", runTranslation);
el.exportTranslationBtn.addEventListener("click", exportTranslation);
el.setTranslationStatusBtn.addEventListener("click", setSelectedTranslationStatus);
el.translationServiceSettingsBtn.addEventListener("click", openTranslationServiceSettings);
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
el.workspaceTabBtns.forEach((button) => {
  button.addEventListener("click", () => setWorkspaceTab(button.dataset.workspaceTab));
});
el.onlyEnabled.addEventListener("change", renderTable);
el.hideDisabled.addEventListener("change", renderTable);
el.illegalBreakConfidenceFilterBtns.forEach((button) => {
  button.addEventListener("click", () => setIllegalBreakConfidenceFilter(button.dataset.confidenceFilter));
});
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
el.confirmIllegalBreakConfidenceBtn.addEventListener("click", applySelectedIllegalBreakConfidence);
el.confirmTranslationStatusBtn.addEventListener("click", applySelectedTranslationStatus);

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
  const dir = resolveInputDirectory(el.inputDir.value.trim(), state.activeWorkspaceTab);
  if (!dir) {
    setMessage("请输入目录");
    return;
  }
  el.inputDir.value = displaySourcePathForTab(dir, state.activeWorkspaceTab);
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
    state.manifest.imgs = state.manifest.imgs || [];
    state.manifest.illegal_breaks = state.manifest.illegal_breaks || [];
    state.openedWorkspaceDir = data.input_dir || dir;
    applyWorkspaceUiState(data.ui_state || {});
    addDirectoryHistory(data.input_dir);
    saveLastWorkspaceDir(data.input_dir);
    ensureSelectionAfterLoad();
    normalizeRestoredViewState();
    recomputeStatuses();
    recomputeAnnotationStatuses();
    await scanTranslationFiles(false);
    syncDisplayedSourcePath();
    renderProjectInfo();
    renderDirectoryTree();
    renderTable();
    renderSideEditor();
    if (state.selectedId) {
      await loadContext(currentHeading());
    }
    setMessage(`${data.workspace_loaded ? "已读取工作空间" : "已添加工作目录"}：${data.files.length} 个 md，${data.headings.length} 个标题候选，${state.manifest.imgs.length} 个图片外链，${highConfidenceIllegalBreaks().length} 个高置信度非法断行，${state.translationManifest?.segments?.length || 0} 个翻译文本块`);
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
    state.translationManifest = null;
    el.inputDir.value = data.path;
    await scan();
  } finally {
    el.scanBtn.disabled = false;
  }
}

function resolveInputDirectory(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const normalized = trimmed.replace(/\/+$/, "");
  const repaired = repairDuplicatedAbsolutePath(normalized);
  if (repaired !== normalized) return resolveInputDirectory(repaired);
  if (state.activeWorkspaceTab === "translation" && normalized.endsWith("/output")) {
    return normalized.slice(0, -"/output".length) || "/";
  }
  const history = loadDirectoryHistory();
  const exact = history.find((dir) => dir === trimmed);
  if (exact) return exact;
  const prefixMatches = history.filter((dir) => dir.startsWith(trimmed));
  if (prefixMatches.length === 1) return prefixMatches[0];
  return trimmed;
}

function repairDuplicatedAbsolutePath(path) {
  const text = String(path || "");
  for (const marker of ["/Users/", "/private/", "/var/", "/Volumes/"]) {
    const first = text.indexOf(marker);
    if (first === -1) continue;
    const second = text.indexOf(marker, first + marker.length);
    if (second !== -1) return text.slice(second);
  }
  return text;
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
  state.manifest.imgs = data.imgs || state.manifest.imgs || [];
  state.manifest.illegal_breaks = data.illegal_breaks || state.manifest.illegal_breaks || [];
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
    state.manifest.imgs = data.imgs || state.manifest.imgs || [];
    renderTable();
    renderSideEditor();
    setMessage(`已导出 ${data.count} 个文件到 ${data.output_dir}`);
  } finally {
    el.exportBtn.disabled = false;
  }
}

async function scanTranslationFiles(showMessage = true) {
  if (!state.manifest?.input_dir) return;
  if (showMessage) setMessage("扫描导出文件中...");
  const data = await fetchJson(`/api/translation/scan?dir=${encodeURIComponent(state.manifest.input_dir)}`);
  if (data.error) {
    if (showMessage) setMessage(data.error, true);
    state.translationManifest = {
      input_dir: state.manifest.input_dir,
      files: [],
      segments: [],
      ui_state: {},
    };
    return;
  }
  state.translationManifest = data;
  state.translationManifest.segments = state.translationManifest.segments || [];
  applyTranslationUiState(data.ui_state || {});
  ensureTranslationSelection();
  renderDirectoryTree();
  if (state.activeDataView === "translations") renderTable();
  if (showMessage) {
    setMessage(`已扫描 ${data.files.length} 个导出文件，${data.segments.length} 个翻译文本块`);
  }
}

async function saveTranslation() {
  if (!state.translationManifest) {
    setMessage("没有可保存的翻译数据");
    return;
  }
  state.translationManifest.ui_state = collectTranslationUiState();
  setMessage("保存翻译中...");
  const data = await fetchJson("/api/translation/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state.translationManifest),
  });
  if (data.error) {
    setMessage(data.error, true);
    return;
  }
  state.translationManifest.segments = data.segments || state.translationManifest.segments || [];
  setMessage(`已保存翻译工作空间：${data.workspace_path || data.path}`);
}

async function runTranslation() {
  if (!state.translationManifest) {
    setMessage("没有可翻译的数据");
    return;
  }
  if (state.translating) {
    setMessage("翻译正在执行中");
    return;
  }
  const rows = filteredTranslations().filter((item) => shouldAutoTranslateRow(item));
  if (!rows.length) {
    setMessage("当前数据表没有未翻译行");
    return;
  }
  state.translating = true;
  setMessage(`开始翻译 ${rows.length} 行`);
  const progress = appendConsoleProgress("执行翻译", rows.length);
  let success = 0;
  let failed = 0;
  for (let index = 0; index < rows.length; index += 1) {
    const item = rows[index];
    updateConsoleProgress(
      progress,
      index,
      rows.length,
      `成功 ${success}/${rows.length}，失败 ${failed}，正在翻译 ${index + 1}/${rows.length} ${shortFile(item.source_file || "")}:${item.line_no || ""}`
    );
    const data = await fetchJson("/api/translation/translate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        service: state.translationSettings.service || "DeepL",
        text: translationSourceTextForService(item),
      }),
    });
    if (data.error) {
      failed += 1;
      appendConsoleLine(`翻译失败 ${shortFile(item.source_file || "")}:${item.line_no || ""} 句号 ${item.sentence_no || "-"}：${data.error}`, true);
    } else {
      item.translation = normalizeTranslationTextForRow(item, data.translated_text || "");
      item.status = item.translation ? "已翻译" : "未翻译";
      if (item.translation) success += 1;
      else failed += 1;
    }
    updateConsoleProgress(progress, index + 1, rows.length, `成功 ${success}/${rows.length}，失败 ${failed}`);
    if (index % 5 === 4) {
      renderTable();
    }
  }
  state.translating = false;
  renderTable();
  await saveTranslation();
  finishConsoleProgress(progress, failed ? "failed" : "done");
  setMessage(`翻译完成：成功 ${success}/${rows.length}，失败 ${failed}`, Boolean(failed));
}

function shouldAutoTranslateRow(item) {
  const status = String(item.status || "未翻译");
  if (status !== "未翻译") return false;
  if (String(item.translation || "").trim()) return false;
  if (status === "不翻译") return false;
  if (!String(item.source || "").trim()) return false;
  return true;
}

function translationSourceTextForService(item) {
  return String(item.source || "");
}

function normalizeTranslationTextForRow(item, text) {
  let value = String(text || "").trim();
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const quotePrefix = String(metadata.quote_prefix || "");
  const calloutPrefix = String(metadata.callout_prefix || "");
  if (quotePrefix) {
    value = stripLeadingQuotePrefix(value);
  }
  if (calloutPrefix && value.startsWith(calloutPrefix)) {
    value = value.slice(calloutPrefix.length).trimStart();
  }
  return value;
}

function stripLeadingQuotePrefix(value) {
  return String(value || "").replace(/^>+\s?/, "");
}

async function exportTranslation() {
  if (!state.translationManifest) {
    setMessage("没有可导出的翻译数据");
    return;
  }
  setMessage("导出译文中...");
  el.exportTranslationBtn.disabled = true;
  try {
    state.translationManifest.ui_state = collectTranslationUiState();
    const data = await fetchJson("/api/translation/export", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(state.translationManifest),
    });
    if (data.error) {
      setMessage(data.error, true);
      return;
    }
    setMessage(`已导出 ${data.count} 个译文文件到 ${data.output_dir}`);
  } finally {
    el.exportTranslationBtn.disabled = false;
  }
}

async function downloadImages() {
  if (!state.manifest) {
    setMessage("没有可下载的图片");
    return;
  }
  if (state.activeDataView !== "imgs") {
    setMessage("请先切换到图片表");
    return;
  }
  const imgs = state.manifest.imgs || [];
  if (!imgs.length) {
    setMessage("没有图片外链可下载");
    return;
  }
  state.manifest.ui_state = collectWorkspaceUiState();
  setMessage("下载图片中...");
  const progress = appendConsoleProgress("图片下载", imgs.length);
  el.downloadImagesBtn.disabled = true;
  let downloaded = 0;
  let skipped = 0;
  let failed = 0;
  try {
    for (let index = 0; index < imgs.length; index += 1) {
      const item = state.manifest.imgs[index];
      updateConsoleProgress(progress, index, imgs.length, `正在下载 ${index + 1}/${imgs.length} ${shortImageLabel(item)}`);
      const payload = { ...state.manifest, image_ids: [item.id], ui_state: collectWorkspaceUiState() };
      const data = await fetchJson("/api/download-images", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (data.error) {
        failed += 1;
        markImageDownloadFailure(item.id, data.error);
      } else {
        state.manifest.imgs = data.imgs || state.manifest.imgs || [];
        downloaded += data.downloaded || 0;
        skipped += data.skipped || 0;
        failed += data.failed || 0;
      }
      updateConsoleProgress(progress, index + 1, imgs.length, `已完成 ${index + 1}/${imgs.length}`);
      renderTable();
    }
    renderTable();
    renderDirectoryTree();
    finishConsoleProgress(progress, failed ? "failed" : "done");
    const message = `图片下载完成：新增 ${downloaded}，已存在 ${skipped}，失败 ${failed}`;
    setMessage(message, Boolean(failed));
  } finally {
    el.downloadImagesBtn.disabled = false;
  }
}

function markImageDownloadFailure(id, error) {
  const item = (state.manifest.imgs || []).find((candidate) => candidate.id === id);
  if (!item) return;
  item.download_status = "失败";
  item.download_error = error;
}

function shortImageLabel(item) {
  return shortFile(item?.local_path || item?.url || item?.source_file || "");
}

function renderTable() {
  updateTableToolVisibility();
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
  if (state.activeDataView === "imgs") {
    renderImageTable();
    return;
  }
  if (state.activeDataView === "illegal_breaks") {
    renderIllegalBreakTable();
    return;
  }
  if (state.activeDataView === "translations") {
    renderTranslationTable();
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

function renderImageTable() {
  const rows = sortedRows("imgs", filteredImages());
  renderTableHeader("imgs", [
    { field: "index", label: "index" },
    { field: "line_no", label: "行号" },
    { field: "alt", label: "alt" },
    { field: "url", label: "URL" },
    { field: "local_path", label: "本地路径" },
    { field: "download_status", label: "状态" },
    { field: "content", label: "原文" },
    { field: "source_file", label: "源文件名" },
  ]);
  el.headingRows.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = state.selectedImageId === item.id ? "selected" : "";
    tr.addEventListener("click", () => selectImage(item.id));
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(item.line_no || "")}</td>
      <td title="${escapeHtml(item.alt || "")}">${escapeHtml(item.alt || "")}</td>
      <td title="${escapeHtml(item.url || "")}"><a href="${escapeAttribute(item.url || "")}" target="_blank" rel="noreferrer">${escapeHtml(item.url || "")}</a></td>
      <td title="${escapeHtml(item.local_path || "")}">${escapeHtml(item.local_path || "")}</td>
      <td class="${imageStatusClass(item)}" title="${escapeHtml(item.download_error || "")}">${escapeHtml(imageStatusText(item))}</td>
      <td title="${escapeHtml(item.content || "")}">${escapeHtml(item.content || "")}</td>
      <td title="${escapeHtml(item.source_file)}">${escapeHtml(shortFile(item.source_file))}</td>
    `;
    el.headingRows.appendChild(tr);
  });
  el.countInfo.textContent = `${rows.length}/${state.manifest.imgs?.length || 0}`;
  renderSideEditor();
}

function renderIllegalBreakTable() {
  const rows = sortedRows("illegal_breaks", filteredIllegalBreaks());
  renderIllegalBreakConfidenceFilter();
  renderTableHeader("illegal_breaks", [
    { field: "index", label: "index" },
    { field: "line_no", label: "断行位置" },
    { field: "before", label: "上一行" },
    { field: "after", label: "下一行" },
    { field: "confidence", label: "置信度" },
    { field: "reason", label: "判定原因" },
    { field: "source_file", label: "源文件名" },
  ]);
  el.headingRows.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = state.selectedIllegalBreakIds.has(item.id) ? "selected" : "";
    tr.addEventListener("click", (event) => selectIllegalBreak(item.id, event));
    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${escapeHtml(`${item.line_no || ""} → ${item.next_line_no || ""}`)}</td>
      <td title="${escapeHtml(item.before || "")}">${escapeHtml(item.before || "")}</td>
      <td title="${escapeHtml(item.after || "")}">${escapeHtml(item.after || "")}</td>
      <td class="${item.confidence === "高" ? "status-bad" : "status-warn"}">${escapeHtml(item.confidence || "")}</td>
      <td title="${escapeHtml(item.reason || "")}">${escapeHtml(item.reason || "")}</td>
      <td title="${escapeHtml(item.source_file)}">${escapeHtml(shortFile(item.source_file))}</td>
    `;
    el.headingRows.appendChild(tr);
  });
  el.countInfo.textContent = `${rows.length}/${illegalBreaksForConfidenceFilter().length}`;
  renderSideEditor();
}

function renderTranslationTable() {
  const rows = sortedRows("translations", filteredTranslations());
  renderTableHeader("translations", [
    { field: "line_no", label: "行号" },
    { field: "source", label: "原文" },
    { field: "translation", label: "译文" },
    { field: "sentence_no", label: "句号" },
    { field: "block_no", label: "块号" },
    { field: "block_type", label: "块类型" },
    { field: "heading", label: "块章节" },
    { field: "source_file", label: "源文件" },
    { field: "status", label: "状态" },
  ]);
  el.headingRows.innerHTML = "";
  rows.forEach((item, index) => {
    const tr = document.createElement("tr");
    tr.dataset.id = item.id;
    tr.className = state.selectedTranslationIds.has(item.id) ? "selected" : "";
    tr.addEventListener("click", (event) => selectTranslation(item.id, event));
    tr.innerHTML = `
      <td>${escapeHtml(item.line_no || "")}</td>
      <td title="${escapeHtml(translationSourceText(item))}">${escapeHtml(translationSourceText(item))}</td>
      <td></td>
      <td>${escapeHtml(item.sentence_no || "")}</td>
      <td>${escapeHtml(translationBlockNo(item) || "")}</td>
      <td>${escapeHtml(translationBlockType(item))}</td>
      <td title="${escapeHtml(item.heading || "")}">${escapeHtml(item.heading || "")}</td>
      <td title="${escapeHtml(item.source_file || "")}">${escapeHtml(shortFile(item.source_file || ""))}</td>
      <td class="${translationStatusClass(item.status)}">${escapeHtml(item.status || "未翻译")}</td>
    `;
    tr.children[2].appendChild(translationInput(item));
    el.headingRows.appendChild(tr);
  });
  el.countInfo.textContent = `${rows.length}/${state.translationManifest?.segments?.length || 0}`;
  renderSideEditor();
}

function translationBlockType(item) {
  return item.block_type || "文本";
}

function translationBlockNo(item) {
  return item.block_no || item.paragraph_no || "";
}

function translationSourceText(item) {
  let source = String(item?.source || "");
  const metadata = item?.metadata && typeof item.metadata === "object" ? item.metadata : {};
  const sentenceNo = Number(item?.sentence_no || 0);
  const isSentenceContinuation = sentenceNo > 1;
  if (isSentenceContinuation) {
    return source;
  }
  const calloutPrefix = String(metadata.callout_prefix || "");
  if (calloutPrefix && !source.startsWith(calloutPrefix)) {
    source = `${calloutPrefix}${source}`;
  }
  const quotePrefix = String(metadata.quote_prefix || "");
  if (quotePrefix && !source.trimStart().startsWith(">")) {
    return source ? `${quotePrefix}${source}` : quotePrefix.trimEnd();
  }
  return source;
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
    if (el.sourcePaneTitle) el.sourcePaneTitle.textContent = "source";
    updateModuleActions();
    return;
  }
  const sourcePath = currentDisplayedSourcePath();
  const dirName = sourcePath.split("/").filter(Boolean).pop() || "source";
  el.projectTitle.textContent = dirName;
  el.projectMeta.textContent = `${currentSourceMeta()} · ${currentModuleLabel()}`;
  if (el.sourcePaneTitle) {
    el.sourcePaneTitle.textContent = state.activeWorkspaceTab === "translation" ? "translation source" : "source";
  }
  updateModuleActions();
}

function currentSourceMeta() {
  if (state.activeWorkspaceTab === "translation") {
    return `${state.translationManifest?.files?.length || 0} exported files`;
  }
  return `${state.manifest?.files?.length || 0} files`;
}

function updateTableToolVisibility() {
  if (!el.illegalBreakConfidenceFilter) return;
  el.illegalBreakConfidenceFilter.hidden = state.activeDataView !== "illegal_breaks";
}

function renderIllegalBreakConfidenceFilter() {
  const counts = illegalBreakConfidenceCounts();
  for (const button of el.illegalBreakConfidenceFilterBtns) {
    const filter = button.dataset.confidenceFilter || "high";
    const label = filter === "high" ? "高" : filter === "low" ? "低" : "全部";
    const count = filter === "high" ? counts.high : filter === "low" ? counts.low : counts.all;
    button.textContent = `${label} ${count}`;
    button.setAttribute("aria-pressed", String(state.illegalBreakConfidenceFilter === filter));
  }
}

function currentModuleScope() {
  if (state.activeDataView === "annotations") return "annotations";
  if (state.activeDataView === "imgs") return "imgs";
  if (state.activeDataView === "illegal_breaks") return "illegal_breaks";
  if (state.activeDataView === "translations") return "translations";
  return "headings";
}

function currentModuleLabel() {
  if (state.activeDataView === "annotations") {
    return state.activeAnnotationGroup ? `注释组 ${state.activeAnnotationGroup}` : "注释";
  }
  if (state.activeDataView === "imgs") return "图片";
  if (state.activeDataView === "illegal_breaks") return "非法断行";
  if (state.activeDataView === "translations") return "翻译";
  if (state.activeSourceFile) return `文件 ${shortFile(state.activeSourceFile)}`;
  return "标题";
}

function updateModuleActions() {
  const scope = currentModuleScope();
  for (const button of el.moduleActionBtns) {
    const scopes = String(button.dataset.moduleAction || "").split(/\s+/).filter(Boolean);
    button.hidden = !state.manifest || !scopes.includes(scope);
  }
  if (el.addTitleBtn) el.addTitleBtn.hidden = scope !== "headings";
}

function isTitleModuleActive() {
  return state.activeDataView === "headings" && !state.activeSourceFile;
}

function isAnnotationModuleActive() {
  return state.activeDataView === "annotations" && !state.activeAnnotationGroup;
}

function isImageModuleActive() {
  return state.activeDataView === "imgs";
}

function isIllegalBreakModuleActive() {
  return state.activeDataView === "illegal_breaks";
}

function isTranslationModuleActive() {
  return state.activeDataView === "translations";
}

function ensureSelectionAfterLoad() {
  const validIds = new Set((state.manifest?.headings || []).map((item) => item.id));
  const validAnnotationIds = new Set((state.manifest?.annotations || []).map((item) => item.id));
  const validImageIds = new Set((state.manifest?.imgs || []).map((item) => item.id));
  const validIllegalBreakIds = new Set((state.manifest?.illegal_breaks || []).map((item) => item.id));
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
  state.selectedImageId =
    state.selectedImageId && validImageIds.has(state.selectedImageId)
      ? state.selectedImageId
      : state.manifest?.imgs?.[0]?.id || null;
  state.selectedIllegalBreakId =
    state.selectedIllegalBreakId && validIllegalBreakIds.has(state.selectedIllegalBreakId)
      ? state.selectedIllegalBreakId
      : highConfidenceIllegalBreaks()[0]?.id || null;
  state.selectedIllegalBreakIds = new Set(
    Array.from(state.selectedIllegalBreakIds).filter((id) => validIllegalBreakIds.has(id))
  );
  if (state.selectedIllegalBreakId) state.selectedIllegalBreakIds.add(state.selectedIllegalBreakId);
  state.illegalBreakAnchorId =
    state.illegalBreakAnchorId && validIllegalBreakIds.has(state.illegalBreakAnchorId)
      ? state.illegalBreakAnchorId
      : state.selectedIllegalBreakId;
  syncIllegalBreakSelectionToVisible();
  ensureTranslationSelection();
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
  if (state.activeDataView === "imgs" && !(state.manifest.imgs || []).length) {
    state.activeDataView = "headings";
  }
  if (state.activeDataView === "illegal_breaks" && !(state.manifest.illegal_breaks || []).length) {
    state.activeDataView = "headings";
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
    selected_image_id: state.selectedImageId,
    selected_illegal_break_id: state.selectedIllegalBreakId,
    selected_illegal_break_ids: Array.from(state.selectedIllegalBreakIds),
    illegal_break_anchor_id: state.illegalBreakAnchorId,
    selected_translation_id: state.selectedTranslationId,
    selected_translation_ids: Array.from(state.selectedTranslationIds),
    translation_anchor_id: state.translationAnchorId,
    active_translation_file: state.activeTranslationFile,
    selected_context_line: state.selectedContextLine,
    active_workspace_tab: state.activeWorkspaceTab,
    active_data_view: state.activeDataView,
    illegal_break_confidence_filter: state.illegalBreakConfidenceFilter,
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
  state.selectedImageId = uiState.selected_image_id || null;
  state.selectedIllegalBreakId = uiState.selected_illegal_break_id || null;
  state.selectedIllegalBreakIds = new Set(
    Array.isArray(uiState.selected_illegal_break_ids) ? uiState.selected_illegal_break_ids : []
  );
  state.illegalBreakAnchorId = uiState.illegal_break_anchor_id || state.selectedIllegalBreakId;
  state.selectedTranslationId = uiState.selected_translation_id || null;
  state.selectedTranslationIds = new Set(
    Array.isArray(uiState.selected_translation_ids) ? uiState.selected_translation_ids : []
  );
  state.translationAnchorId = uiState.translation_anchor_id || state.selectedTranslationId;
  state.activeTranslationFile = String(uiState.active_translation_file || "");
  state.selectedContextLine = uiState.selected_context_line || null;
  state.activeWorkspaceTab = uiState.active_workspace_tab === "translation" ? "translation" : "ocr";
  state.activeDataView = ["annotations", "imgs", "illegal_breaks", "translations"].includes(uiState.active_data_view)
    ? uiState.active_data_view
    : "headings";
  if (state.activeDataView === "translations") state.activeWorkspaceTab = "translation";
  if (state.activeWorkspaceTab === "translation") state.activeDataView = "translations";
  state.illegalBreakConfidenceFilter = ["high", "low", "all"].includes(uiState.illegal_break_confidence_filter)
    ? uiState.illegal_break_confidence_filter
    : "high";
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

function collectTranslationUiState() {
  return {
    active_data_view: state.activeDataView,
    selected_translation_id: state.selectedTranslationId,
    selected_translation_ids: Array.from(state.selectedTranslationIds),
    translation_anchor_id: state.translationAnchorId,
    active_translation_file: state.activeTranslationFile,
    filters: { text: el.filterText.value },
    table_sort: state.tableSort,
  };
}

function applyTranslationUiState(uiState) {
  if (uiState.selected_translation_id && !state.selectedTranslationId) {
    state.selectedTranslationId = uiState.selected_translation_id;
  }
  if (!state.selectedTranslationIds.size && Array.isArray(uiState.selected_translation_ids)) {
    state.selectedTranslationIds = new Set(uiState.selected_translation_ids);
  }
  if (uiState.translation_anchor_id && !state.translationAnchorId) {
    state.translationAnchorId = uiState.translation_anchor_id;
  }
  if (uiState.active_translation_file && !state.activeTranslationFile) {
    state.activeTranslationFile = String(uiState.active_translation_file);
  }
  state.tableSort = {
    ...state.tableSort,
    ...normalizeTableSort(uiState.table_sort || {}),
  };
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
  renderWorkspaceTabs();
  if (!state.manifest) {
    el.directoryTree.innerHTML = '<div class="tree-empty">扫描后显示输入目录和源文件</div>';
    return;
  }

  const sourcePath = currentDisplayedSourcePath();
  const rootName = sourcePath.split("/").filter(Boolean).pop() || "source";
  el.directoryTree.innerHTML = "";
  el.directoryTree.appendChild(treeRow({
    icon: "▾",
    name: rootName,
    title: sourcePath,
    count: "",
    className: "root clickable",
    onClick: () => state.activeWorkspaceTab === "translation" ? openTranslationsGroup() : clearSourceFilter(),
  }));

  if (state.activeWorkspaceTab === "translation") {
    renderTranslationModuleTree();
    return;
  }

  renderOcrModuleTree();
}

function renderOcrModuleTree() {
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

  el.directoryTree.appendChild(treeRow({
    icon: state.expandedTree.imgs ? "▾" : "▸",
    name: "图片",
    title: "图片外部连接",
    count: `${(state.manifest.imgs || []).length}`,
    className: `folder clickable ${isImageModuleActive() ? "active" : ""} tree-indent-1`,
    onClick: openImagesGroup,
  }));
  if (state.expandedTree.imgs) {
    renderImageTreeNodes(2);
  }

  el.directoryTree.appendChild(treeRow({
    icon: state.expandedTree.illegal_breaks ? "▾" : "▸",
    name: "非法断行",
    title: "疑似由 OCR 或排版造成的非法断行",
    count: `${highConfidenceIllegalBreaks().length}/${(state.manifest.illegal_breaks || []).length}`,
    className: `folder clickable ${isIllegalBreakModuleActive() ? "active" : ""} tree-indent-1`,
    onClick: openIllegalBreaksGroup,
  }));
  if (state.expandedTree.illegal_breaks) {
    renderIllegalBreakTreeNodes(2);
  }
}

function renderTranslationModuleTree() {
  el.directoryTree.appendChild(treeRow({
    icon: state.expandedTree.translations ? "▾" : "▸",
    name: "翻译",
    title: "针对 output 内已清洗导出文件的翻译模块",
    count: `${state.translationManifest?.segments?.length || 0}`,
    className: `folder clickable ${isTranslationModuleActive() ? "active" : ""} tree-indent-1`,
    onClick: openTranslationsGroup,
  }));
  if (state.expandedTree.translations) {
    renderTranslationTreeNodes(2);
  }
}

function renderWorkspaceTabs() {
  for (const button of el.workspaceTabBtns) {
    const active = button.dataset.workspaceTab === state.activeWorkspaceTab;
    button.classList.toggle("active", active);
    button.setAttribute("aria-pressed", String(active));
  }
  syncDisplayedSourcePath();
}

function currentDisplayedSourcePath() {
  return displaySourcePathForTab(state.manifest?.input_dir || el.inputDir.value.trim(), state.activeWorkspaceTab);
}

function displaySourcePathForTab(inputDir, tab) {
  const root = String(inputDir || "").replace(/\/+$/, "");
  if (!root) return "";
  if (tab === "translation") {
    const manifestInput = String(state.translationManifest?.input_dir || "").replace(/\/+$/, "");
    if (manifestInput === root && state.translationManifest?.output_dir) {
      return state.translationManifest.output_dir;
    }
    return `${root}/output`;
  }
  return root;
}

function syncDisplayedSourcePath() {
  if (!state.manifest?.input_dir) return;
  el.inputDir.value = currentDisplayedSourcePath();
  el.inputDir.placeholder = state.activeWorkspaceTab === "translation"
    ? "输入已导出 Markdown 的 output 目录"
    : "输入 OCR Markdown 目录";
}

function toggleTreeGroup(group) {
  state.expandedTree[group] = !state.expandedTree[group];
  renderDirectoryTree();
  scheduleWorkspaceStateSave();
}

function setWorkspaceTab(tab) {
  const nextTab = tab === "translation" ? "translation" : "ocr";
  if (state.activeWorkspaceTab === nextTab) return;
  state.activeWorkspaceTab = nextTab;
  if (nextTab === "translation") {
    openTranslationsGroup();
    return;
  }
  openTitlesGroup();
}

function openTitlesGroup() {
  state.activeWorkspaceTab = "ocr";
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
  state.activeWorkspaceTab = "ocr";
  state.expandedTree.annotations = true;
  state.activeDataView = "annotations";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function openImagesGroup() {
  state.activeWorkspaceTab = "ocr";
  state.expandedTree.imgs = true;
  state.activeDataView = "imgs";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function openIllegalBreaksGroup() {
  state.activeWorkspaceTab = "ocr";
  state.expandedTree.illegal_breaks = true;
  state.activeDataView = "illegal_breaks";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  el.filterText.value = "";
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function openTranslationsGroup() {
  state.activeWorkspaceTab = "translation";
  state.expandedTree.translations = true;
  state.activeDataView = "translations";
  state.activeSourceFile = "";
  state.activeAnnotationGroup = "";
  state.activeTranslationFile = "";
  el.filterText.value = "";
  ensureTranslationSelection();
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
  const item = currentTranslation();
  if (item) loadTranslationContext(item);
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

function renderImageTreeNodes(depth) {
  const imgs = state.manifest?.imgs || [];
  const byFile = new Map();
  for (const item of imgs) {
    byFile.set(item.source_file, (byFile.get(item.source_file) || 0) + 1);
  }
  for (const [file, count] of Array.from(byFile.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"))) {
    el.directoryTree.appendChild(treeRow({
      icon: "img",
      name: shortFile(file),
      title: file,
      count: String(count),
      className: `summary tree-indent-${Math.min(depth, 4)}`,
    }));
  }
  el.directoryTree.appendChild(treeRow({
    icon: "※",
    name: `${imgs.length} 个图片外链`,
    title: "图片外链总数",
    count: "",
    className: `summary tree-indent-${Math.min(depth, 4)}`,
  }));
}

function renderIllegalBreakTreeNodes(depth) {
  const breaks = illegalBreaksForConfidenceFilter();
  const byFile = new Map();
  for (const item of breaks) {
    byFile.set(item.source_file, (byFile.get(item.source_file) || 0) + 1);
  }
  for (const [file, count] of Array.from(byFile.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"))) {
    el.directoryTree.appendChild(treeRow({
      icon: "↵",
      name: shortFile(file),
      title: file,
      count: String(count),
      className: `summary tree-indent-${Math.min(depth, 4)}`,
    }));
  }
  el.directoryTree.appendChild(treeRow({
    icon: "※",
    name: `${breaks.length} 个${illegalBreakConfidenceFilterLabel()}断行候选`,
    title: `${illegalBreakConfidenceFilterLabel()}断行候选总数`,
    count: "",
    className: `summary tree-indent-${Math.min(depth, 4)}`,
  }));
}

function renderTranslationTreeNodes(depth) {
  const segments = state.translationManifest?.segments || [];
  const byFile = new Map();
  for (const item of segments) {
    byFile.set(item.source_file, (byFile.get(item.source_file) || 0) + 1);
  }
  for (const [file, count] of Array.from(byFile.entries()).sort((a, b) => a[0].localeCompare(b[0], "zh-Hans-CN"))) {
    el.directoryTree.appendChild(treeRow({
      icon: "tr",
      name: shortFile(file),
      title: file,
      count: String(count),
      className: `summary clickable ${state.activeTranslationFile === file ? "active" : ""} tree-indent-${Math.min(depth, 4)}`,
      onClick: () => openTranslationFile(file),
    }));
  }
  el.directoryTree.appendChild(treeRow({
    icon: "※",
    name: `${segments.length} 个文本块`,
    title: "翻译文本块总数",
    count: "",
    className: `summary tree-indent-${Math.min(depth, 4)}`,
  }));
}

function openTranslationFile(file) {
  state.activeWorkspaceTab = "translation";
  state.activeDataView = "translations";
  state.activeTranslationFile = file;
  el.filterText.value = "";
  const rows = filteredTranslations();
  const first = rows[0] || null;
  state.selectedTranslationId = first?.id || null;
  state.selectedTranslationIds = first ? new Set([first.id]) : new Set();
  state.translationAnchorId = state.selectedTranslationId;
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
  if (first) loadTranslationContext(first);
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
  state.activeWorkspaceTab = "ocr";
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
  state.activeWorkspaceTab = "ocr";
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
  state.activeWorkspaceTab = "ocr";
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
  for (const scope of ["headings", "annotations", "imgs", "illegal_breaks", "translations"]) {
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
  if (scope === "annotations") {
    return new Set(["index", "group_no", "note_no", "type", "line_no", "content", "heading_export_name", "status", "source_file"]);
  }
  if (scope === "imgs") {
    return new Set(["index", "line_no", "alt", "url", "local_path", "download_status", "content", "source_file"]);
  }
  if (scope === "illegal_breaks") {
    return new Set(["index", "line_no", "before", "after", "confidence", "reason", "source_file"]);
  }
  if (scope === "translations") {
    return new Set(["index", "source_file", "block_type", "heading", "block_no", "sentence_no", "paragraph_no", "line_no", "source", "translation", "status"]);
  }
  return new Set(["index", "title", "level", "line_no", "local_no", "export_dir", "export_name", "status", "source_file"]);
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
  if (scope === "translations" && (field === "block_no" || field === "sentence_no" || field === "paragraph_no")) return Number(item[field] || 0);
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

function filteredImages() {
  const text = el.filterText.value.trim().toLowerCase();
  const imgs = state.manifest.imgs || [];
  return imgs.filter((item) => {
    if (!text) return true;
    return [item.alt, item.url, item.local_path, item.download_status, item.download_error, item.content, item.source_file]
      .join(" ")
      .toLowerCase()
      .includes(text);
  });
}

function filteredIllegalBreaks() {
  const text = el.filterText.value.trim().toLowerCase();
  const breaks = illegalBreaksForConfidenceFilter();
  return breaks.filter((item) => {
    if (!text) return true;
    return [item.before, item.after, item.reason, item.confidence, item.source_file]
      .join(" ")
      .toLowerCase()
      .includes(text);
  });
}

function filteredTranslations() {
  const text = el.filterText.value.trim().toLowerCase();
  const segments = state.translationManifest?.segments || [];
  return segments.filter((item) => {
    if (state.activeTranslationFile && item.source_file !== state.activeTranslationFile) return false;
    if (!text) return true;
    return [item.source_file, translationBlockType(item), item.heading, item.source, item.translation, item.status]
      .join(" ")
      .toLowerCase()
      .includes(text);
  });
}

function ensureTranslationSelection() {
  const validIds = new Set((state.translationManifest?.segments || []).map((item) => item.id));
  state.selectedTranslationIds = new Set(
    Array.from(state.selectedTranslationIds).filter((id) => validIds.has(id))
  );
  if (!state.selectedTranslationId || !validIds.has(state.selectedTranslationId)) {
    state.selectedTranslationId = state.selectedTranslationIds.values().next().value
      || state.translationManifest?.segments?.[0]?.id
      || null;
  }
  if (state.selectedTranslationId) state.selectedTranslationIds.add(state.selectedTranslationId);
  state.translationAnchorId =
    state.translationAnchorId && validIds.has(state.translationAnchorId)
      ? state.translationAnchorId
      : state.selectedTranslationId;
}

function highConfidenceIllegalBreaks() {
  return (state.manifest?.illegal_breaks || []).filter((item) => item.confidence === "高");
}

function lowConfidenceIllegalBreaks() {
  return (state.manifest?.illegal_breaks || []).filter((item) => item.confidence === "低");
}

function illegalBreaksForConfidenceFilter() {
  if (state.illegalBreakConfidenceFilter === "low") return lowConfidenceIllegalBreaks();
  if (state.illegalBreakConfidenceFilter === "all") return state.manifest?.illegal_breaks || [];
  return highConfidenceIllegalBreaks();
}

function illegalBreakConfidenceCounts() {
  const high = highConfidenceIllegalBreaks().length;
  const low = lowConfidenceIllegalBreaks().length;
  return { high, low, all: high + low };
}

function illegalBreakConfidenceFilterLabel() {
  if (state.illegalBreakConfidenceFilter === "low") return "低置信度";
  if (state.illegalBreakConfidenceFilter === "all") return "全部";
  return "高置信度";
}

function setIllegalBreakConfidenceFilter(filter) {
  const normalized = ["high", "low", "all"].includes(filter) ? filter : "high";
  if (state.illegalBreakConfidenceFilter === normalized) return;
  state.illegalBreakConfidenceFilter = normalized;
  syncIllegalBreakSelectionToVisible();
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
}

function syncIllegalBreakSelectionToVisible() {
  const visibleIds = new Set(illegalBreaksForConfidenceFilter().map((item) => item.id));
  state.selectedIllegalBreakIds = new Set(
    Array.from(state.selectedIllegalBreakIds).filter((id) => visibleIds.has(id))
  );
  if (!state.selectedIllegalBreakId || !visibleIds.has(state.selectedIllegalBreakId)) {
    state.selectedIllegalBreakId = state.selectedIllegalBreakIds.values().next().value
      || illegalBreaksForConfidenceFilter()[0]?.id
      || null;
  }
  if (state.selectedIllegalBreakId) state.selectedIllegalBreakIds.add(state.selectedIllegalBreakId);
  state.illegalBreakAnchorId =
    state.illegalBreakAnchorId && visibleIds.has(state.illegalBreakAnchorId)
      ? state.illegalBreakAnchorId
      : state.selectedIllegalBreakId;
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

function imageStatusText(item) {
  if (item.download_status) return item.download_status;
  return item.local_path ? "已下载" : "";
}

function imageStatusClass(item) {
  const status = imageStatusText(item);
  if (status === "已下载" || status === "已存在") return "status-normal";
  if (status === "失败") return "status-bad";
  return status ? "status-warn" : "";
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

async function selectImage(id) {
  const item = state.manifest?.imgs?.find((candidate) => candidate.id === id);
  if (!item) return;
  state.selectedImageId = id;
  renderTable();
  scheduleWorkspaceStateSave();
  await loadImageContext(item);
}

async function selectIllegalBreak(id, event = null) {
  const item = state.manifest?.illegal_breaks?.find((candidate) => candidate.id === id);
  if (!item) return;
  applyIllegalBreakSelection(id, event);
  state.selectedIllegalBreakId = id;
  renderTable();
  scheduleWorkspaceStateSave();
  await loadIllegalBreakContext(item);
}

async function selectTranslation(id, event = null) {
  const item = state.translationManifest?.segments?.find((candidate) => candidate.id === id);
  if (!item) return;
  applyTranslationSelection(id, event);
  state.selectedTranslationId = id;
  renderTable();
  scheduleWorkspaceStateSave();
  await loadTranslationContext(item);
}

function applyIllegalBreakSelection(id, event = null) {
  const isRange = Boolean(event?.shiftKey);
  const isToggle = Boolean(event?.metaKey || event?.ctrlKey);
  const visibleIds = filteredIllegalBreaks().map((item) => item.id);

  if (isRange && state.illegalBreakAnchorId) {
    const anchorIndex = visibleIds.indexOf(state.illegalBreakAnchorId);
    const currentIndex = visibleIds.indexOf(id);
    if (anchorIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(anchorIndex, currentIndex);
      const end = Math.max(anchorIndex, currentIndex);
      const rangeIds = visibleIds.slice(start, end + 1);
      state.selectedIllegalBreakIds = isToggle
        ? new Set([...state.selectedIllegalBreakIds, ...rangeIds])
        : new Set(rangeIds);
    } else {
      state.selectedIllegalBreakIds = new Set([id]);
    }
  } else if (isToggle) {
    if (state.selectedIllegalBreakIds.has(id) && state.selectedIllegalBreakIds.size > 1) {
      state.selectedIllegalBreakIds.delete(id);
    } else {
      state.selectedIllegalBreakIds.add(id);
    }
  } else {
    state.selectedIllegalBreakIds = new Set([id]);
  }
  state.illegalBreakAnchorId = id;
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

function applyTranslationSelection(id, event = null) {
  const isRange = Boolean(event?.shiftKey);
  const isToggle = Boolean(event?.metaKey || event?.ctrlKey);
  const visibleIds = filteredTranslations().map((item) => item.id);

  if (isRange && state.translationAnchorId) {
    const anchorIndex = visibleIds.indexOf(state.translationAnchorId);
    const currentIndex = visibleIds.indexOf(id);
    if (anchorIndex !== -1 && currentIndex !== -1) {
      const start = Math.min(anchorIndex, currentIndex);
      const end = Math.max(anchorIndex, currentIndex);
      const rangeIds = visibleIds.slice(start, end + 1);
      state.selectedTranslationIds = isToggle
        ? new Set([...state.selectedTranslationIds, ...rangeIds])
        : new Set(rangeIds);
    } else {
      state.selectedTranslationIds = new Set([id]);
    }
  } else if (isToggle) {
    if (state.selectedTranslationIds.has(id) && state.selectedTranslationIds.size > 1) {
      state.selectedTranslationIds.delete(id);
    } else {
      state.selectedTranslationIds.add(id);
    }
  } else {
    state.selectedTranslationIds = new Set([id]);
  }
  state.translationAnchorId = id;
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
  el.contextLines.innerHTML = renderMarkdown(data.text, item.line_no, previewAssetContext(state.manifest.input_dir, item.source_file));
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
  el.contextLines.innerHTML = renderMarkdown(data.text, 1, previewAssetContext(state.manifest.input_dir, sourceFile));
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
  el.contextLines.innerHTML = renderMarkdown(data.text, targetLine, previewAssetContext(state.manifest.input_dir, item.source_file));
  wirePreviewBlocks();
  selectPreviewLine(targetLine);
  el.contextLines.querySelector(".md-block.selected")?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
}

async function loadImageContext(item) {
  const targetLine = Number(item.line_no || 1);
  el.contextTitle.textContent = item.alt ? `图片 ${item.alt}` : "图片外链";
  el.contextMeta.textContent = `${item.source_file}:${targetLine}`;
  const data = await fetchJson(
    `/api/file?dir=${encodeURIComponent(state.manifest.input_dir)}&file=${encodeURIComponent(item.source_file)}&line=${encodeURIComponent(targetLine)}`
  );
  if (data.error) {
    el.contextLines.textContent = data.error;
    return;
  }
  state.selectedContextLine = targetLine;
  el.contextLines.innerHTML = renderMarkdown(data.text, targetLine, previewAssetContext(state.manifest.input_dir, item.source_file));
  wirePreviewBlocks();
  selectPreviewLine(targetLine);
  el.contextLines.querySelector(".md-block.selected")?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
}

async function loadIllegalBreakContext(item) {
  const targetLine = Number(item.line_no || 1);
  el.contextTitle.textContent = "非法断行";
  el.contextMeta.textContent = `${item.source_file}:${targetLine} → ${item.next_line_no || targetLine + 1}`;
  const data = await fetchJson(
    `/api/file?dir=${encodeURIComponent(state.manifest.input_dir)}&file=${encodeURIComponent(item.source_file)}&line=${encodeURIComponent(targetLine)}`
  );
  if (data.error) {
    el.contextLines.textContent = data.error;
    return;
  }
  state.selectedContextLine = targetLine;
  el.contextLines.innerHTML = renderMarkdown(data.text, targetLine, previewAssetContext(state.manifest.input_dir, item.source_file));
  wirePreviewBlocks();
  selectPreviewLine(targetLine);
  el.contextLines.querySelector(".md-block.selected")?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
}

async function loadTranslationContext(item) {
  state.translationSettingsOpen = false;
  const targetLine = Number(item.line_no || 1);
  el.contextTitle.textContent = `翻译${translationBlockType(item)} ${translationBlockNo(item) || ""}`.trim();
  el.contextMeta.textContent = `${item.source_file}:${targetLine}`;
  const data = await fetchJson(
    `/api/file?dir=${encodeURIComponent(translationSourceDirectory())}&file=${encodeURIComponent(item.source_file)}&line=${encodeURIComponent(targetLine)}`
  );
  if (data.error) {
    el.contextLines.textContent = data.error;
    return;
  }
  state.selectedContextLine = targetLine;
  el.contextLines.innerHTML = `${renderMarkdown(
    data.text,
    targetLine,
    previewAssetContext(translationSourceDirectory(), item.source_file)
  )}${renderTranslationEditor(item)}`;
  wirePreviewBlocks();
  wireTranslationEditor(item.id);
  selectPreviewLine(targetLine);
  el.contextLines.querySelector(".md-block.selected")?.scrollIntoView({
    block: "center",
    inline: "nearest",
  });
}

async function openTranslationServiceSettings() {
  state.translationSettingsOpen = true;
  el.contextTitle.textContent = "翻译服务设置";
  el.contextMeta.textContent = "DeepL";
  el.contextLines.innerHTML = renderTranslationServiceSettings();
  wireTranslationServiceSettings();
  const data = await fetchJson("/api/translation/settings");
  if (data.error) {
    state.translationSettings.saveStatus = `读取失败：${data.error}`;
    renderTranslationServiceSettingsIntoContext();
    return;
  }
  state.translationSettings.service = data.service || "DeepL";
  state.translationSettings.hasApiKey = Boolean(data.has_api_key);
  state.translationSettings.maskedApiKey = data.masked_api_key || "";
  state.translationSettings.endpointMode = data.endpoint_mode || "";
  state.translationSettings.apiKeyInput = "";
  state.translationSettings.apiKeyDirty = false;
  state.translationSettings.saveStatus = state.translationSettings.hasApiKey
    ? `已保存：${state.translationSettings.maskedApiKey}`
    : "未保存 API key";
  renderTranslationServiceSettingsIntoContext();
}

function renderTranslationServiceSettingsIntoContext() {
  if (!state.translationSettingsOpen) return;
  el.contextLines.innerHTML = renderTranslationServiceSettings();
  wireTranslationServiceSettings();
}

function renderTranslationServiceSettings() {
  const settings = state.translationSettings;
  const keyHint = settings.hasApiKey
    ? `已保存 ${settings.maskedApiKey}`
    : "未保存 API key";
  const endpointText = settings.endpointMode ? `当前端点：DeepL ${settings.endpointMode}` : "当前端点：保存 API key 后自动判断";
  const statusClass = settings.saveStatus.includes("失败") || settings.saveStatus.includes("错误") ? "status-bad" : "muted";
  return `
    <section class="translation-service-settings">
      <div class="settings-grid">
        <label>
          <span>翻译服务</span>
          <select data-translation-service>
            <option value="DeepL" ${settings.service === "DeepL" ? "selected" : ""}>DeepL</option>
          </select>
        </label>
        <label>
          <span>API key</span>
          <div class="api-key-row">
            <input data-translation-api-key type="password" autocomplete="off" placeholder="${escapeAttribute(keyHint)}" value="${escapeAttribute(settings.apiKeyInput)}" />
            <button type="button" data-toggle-api-key>显示</button>
          </div>
        </label>
      </div>
      <div class="settings-status ${statusClass}">${escapeHtml(settings.saveStatus || keyHint)}</div>
      <div class="settings-status muted">${escapeHtml(endpointText)}</div>
      <div class="translation-test-panel">
        <label>
          <span>测试句子</span>
          <textarea data-translation-test-text>${escapeHtml(settings.testText)}</textarea>
        </label>
        <button type="button" data-translation-test ${settings.testing ? "disabled" : ""}>${settings.testing ? "测试中" : "测试"}</button>
      </div>
      ${settings.testResult ? `<div class="translation-test-result">${escapeHtml(settings.testResult)}</div>` : ""}
      ${settings.testError ? `<div class="translation-test-error">${escapeHtml(settings.testError)}</div>` : ""}
    </section>
  `;
}

function wireTranslationServiceSettings() {
  const service = el.contextLines.querySelector("[data-translation-service]");
  const apiKey = el.contextLines.querySelector("[data-translation-api-key]");
  const toggleApiKey = el.contextLines.querySelector("[data-toggle-api-key]");
  const testText = el.contextLines.querySelector("[data-translation-test-text]");
  const testButton = el.contextLines.querySelector("[data-translation-test]");
  service?.addEventListener("change", () => {
    state.translationSettings.service = service.value || "DeepL";
    scheduleTranslationSettingsSave(false);
  });
  apiKey?.addEventListener("input", () => {
    state.translationSettings.apiKeyInput = apiKey.value;
    state.translationSettings.apiKeyDirty = true;
    scheduleTranslationSettingsSave(true);
  });
  toggleApiKey?.addEventListener("click", () => {
    if (!apiKey) return;
    apiKey.type = apiKey.type === "password" ? "text" : "password";
    toggleApiKey.textContent = apiKey.type === "password" ? "显示" : "隐藏";
  });
  testText?.addEventListener("input", () => {
    state.translationSettings.testText = testText.value;
  });
  testButton?.addEventListener("click", testTranslationService);
}

function scheduleTranslationSettingsSave(includeApiKey) {
  state.translationSettings.saveStatus = "保存中...";
  window.clearTimeout(translationSettingsSaveTimer);
  translationSettingsSaveTimer = window.setTimeout(() => saveTranslationServiceSettings(includeApiKey), 500);
}

async function saveTranslationServiceSettings(includeApiKey) {
  const settings = state.translationSettings;
  const payload = { service: settings.service || "DeepL" };
  if (includeApiKey || settings.apiKeyDirty) payload.api_key = settings.apiKeyInput;
  const data = await fetchJson("/api/translation/settings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (data.error) {
    settings.saveStatus = `保存失败：${data.error}`;
    renderTranslationServiceSettingsIntoContext();
    return;
  }
  settings.service = data.service || "DeepL";
  settings.hasApiKey = Boolean(data.has_api_key);
  settings.maskedApiKey = data.masked_api_key || "";
  settings.endpointMode = data.endpoint_mode || "";
  settings.apiKeyInput = "";
  settings.apiKeyDirty = false;
  settings.saveStatus = settings.hasApiKey ? `已保存：${settings.maskedApiKey}` : "未保存 API key";
  renderTranslationServiceSettingsIntoContext();
}

async function testTranslationService() {
  const settings = state.translationSettings;
  window.clearTimeout(translationSettingsSaveTimer);
  if (settings.apiKeyDirty) await saveTranslationServiceSettings(true);
  settings.testing = true;
  settings.testResult = "";
  settings.testError = "";
  renderTranslationServiceSettingsIntoContext();
  const data = await fetchJson("/api/translation/test", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      service: settings.service || "DeepL",
      text: settings.testText || "This is a test sentence.",
    }),
  });
  settings.testing = false;
  if (data.error) {
    settings.testError = data.error;
  } else {
    settings.testResult = data.translated_text || "";
  }
  renderTranslationServiceSettingsIntoContext();
}

function renderTranslationEditor(item) {
  return `
    <section class="translation-editor" data-translation-editor="${escapeAttribute(item.id)}">
      <div class="translation-editor-head">
        <strong>译文</strong>
        <span class="${translationStatusClass(item.status)}">${escapeHtml(item.status || "未翻译")}</span>
      </div>
      <div class="translation-source">${escapeHtml(translationSourceText(item))}</div>
      <textarea data-translation-text>${escapeHtml(item.translation || "")}</textarea>
    </section>
  `;
}

function wireTranslationEditor(id) {
  const editor = el.contextLines.querySelector(`[data-translation-editor="${CSS.escape(id)}"]`);
  const textarea = editor?.querySelector("[data-translation-text]");
  if (!textarea) return;
  textarea.addEventListener("input", () => {
    const item = state.translationManifest?.segments?.find((candidate) => candidate.id === id);
    if (!item) return;
    item.translation = textarea.value.trim();
    if (item.translation.trim() && item.status === "未翻译") item.status = "已翻译";
    if (!item.translation.trim() && item.status === "已翻译") item.status = "未翻译";
    renderTable();
  });
  textarea.addEventListener("change", () => {
    saveTranslation();
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
      syncTranslationTableToPreviewBlock(block);
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

function syncTranslationTableToPreviewBlock(block) {
  if (state.activeWorkspaceTab !== "translation" || state.activeDataView !== "translations") return;
  const activeItem = currentTranslation();
  const sourceFile = activeItem?.source_file || state.activeTranslationFile || "";
  if (!sourceFile) return;
  const startLine = Number(block.dataset.line || 0);
  const endLine = Number(block.dataset.endLine || startLine);
  if (!startLine) return;
  const segments = state.translationManifest?.segments || [];
  const direct = segments.filter((item) =>
    item.source_file === sourceFile
    && Number(item.line_no || 0) >= startLine
    && Number(item.line_no || 0) <= endLine
  );
  if (!direct.length) return;
  const blockNo = direct[0].block_no || "";
  const selected = blockNo
    ? segments.filter((item) => item.source_file === sourceFile && item.block_no === blockNo)
    : direct;
  if (!selected.length) return;
  state.activeTranslationFile = sourceFile;
  state.selectedTranslationId = selected[0].id;
  state.selectedTranslationIds = new Set(selected.map((item) => item.id));
  state.translationAnchorId = state.selectedTranslationId;
  renderTable();
  scrollSelectedTranslationRowIntoView();
  renderSideEditor();
  scheduleWorkspaceStateSave();
}

function scrollSelectedTranslationRowIntoView() {
  if (!state.selectedTranslationId) return;
  const row = el.headingRows.querySelector(`tr[data-id="${CSS.escape(state.selectedTranslationId)}"]`);
  row?.scrollIntoView({ block: "center", inline: "nearest" });
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

function setSelectedIllegalBreakConfidence() {
  if (!state.manifest) {
    setMessage("没有可编辑的非法断行");
    return;
  }
  if (state.activeDataView !== "illegal_breaks") {
    setMessage("请先切换到非法断行表");
    return;
  }
  const selectedItems = state.manifest.illegal_breaks.filter((item) =>
    state.selectedIllegalBreakIds.has(item.id)
  );
  if (!selectedItems.length) {
    setMessage("请先选择断行行");
    return;
  }
  const currentValues = [...new Set(selectedItems.map((item) => item.confidence || "高"))];
  el.illegalBreakConfidenceHint.textContent = `将为 ${selectedItems.length} 行设置同一个置信度。可通过表格上方筛选重新查看。`;
  el.illegalBreakConfidenceInput.value = currentValues.length === 1 ? currentValues[0] : "高";
  el.illegalBreakConfidenceDialog.showModal();
}

function applySelectedIllegalBreakConfidence(event) {
  event.preventDefault();
  const selectedItems = state.manifest?.illegal_breaks.filter((item) =>
    state.selectedIllegalBreakIds.has(item.id)
  ) || [];
  if (!selectedItems.length) {
    setMessage("请先选择断行行", true);
    el.illegalBreakConfidenceDialog.close();
    return;
  }
  const confidence = el.illegalBreakConfidenceInput.value === "低" ? "低" : "高";
  for (const item of selectedItems) item.confidence = confidence;
  syncIllegalBreakSelectionToVisible();
  el.illegalBreakConfidenceDialog.close();
  renderDirectoryTree();
  renderTable();
  scheduleWorkspaceStateSave();
  setMessage(`已将 ${selectedItems.length} 行置信度设为${confidence}`);
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

function currentTranslation() {
  return state.translationManifest?.segments?.find((item) => item.id === state.selectedTranslationId);
}

function translationSourceDirectory() {
  return state.translationManifest?.output_dir || displaySourcePathForTab(state.manifest?.input_dir || "", "translation");
}

function setSelectedTranslationStatus() {
  if (state.activeDataView !== "translations") {
    setMessage("请先切换到翻译表");
    return;
  }
  const selectedItems = state.translationManifest?.segments.filter((item) =>
    state.selectedTranslationIds.has(item.id)
  ) || [];
  if (!selectedItems.length) {
    setMessage("请先选择翻译文本块");
    return;
  }
  const currentValues = [...new Set(selectedItems.map((item) => item.status || "未翻译"))];
  el.translationStatusHint.textContent = `将为 ${selectedItems.length} 个文本块设置同一个状态。`;
  el.translationStatusInput.value = currentValues.length === 1 ? currentValues[0] : "需校对";
  el.translationStatusDialog.showModal();
}

function applySelectedTranslationStatus(event) {
  event.preventDefault();
  const selectedItems = state.translationManifest?.segments.filter((item) =>
    state.selectedTranslationIds.has(item.id)
  ) || [];
  if (!selectedItems.length) {
    setMessage("请先选择翻译文本块", true);
    el.translationStatusDialog.close();
    return;
  }
  const status = el.translationStatusInput.value || "未翻译";
  for (const item of selectedItems) item.status = status;
  el.translationStatusDialog.close();
  renderTable();
  scheduleWorkspaceStateSave();
  setMessage(`已将 ${selectedItems.length} 个文本块状态设为 ${status}`);
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

function translationInput(item) {
  const input = document.createElement("input");
  input.value = item.translation || "";
  input.addEventListener("click", (event) => {
    event.stopPropagation();
    selectTranslation(item.id, event);
  });
  input.addEventListener("change", () => {
    item.translation = input.value.trim();
    if (item.translation && item.status === "未翻译") item.status = "已翻译";
    if (!item.translation && item.status === "已翻译") item.status = "未翻译";
    renderTable();
    scheduleWorkspaceStateSave();
  });
  return input;
}

function statusClass(status) {
  if (status === "正常" || status === "手动新增") return "status-normal";
  if (status === "已禁用") return "";
  if ((status || "").includes("重复") || (status || "").includes("漏号")) return "status-bad";
  return "status-warn";
}

function translationStatusClass(status) {
  if (status === "已确认" || status === "已翻译") return "status-normal";
  if (status === "需校对") return "status-warn";
  return "";
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

function renderMarkdown(text, targetLine, assetContext = null) {
  const lines = String(text || "").split(/\r?\n/);
  const html = markdownBlocks(lines).map((block) => renderMarkdownBlock(block, assetContext)).join("\n");
  return `<article class="markdown-preview" data-target-line="${targetLine}">${html}</article>`;
}

function markdownBlocks(lines) {
  const blocks = [];
  let current = [];
  let currentKind = "";
  let startLine = 1;
  let inFence = false;

  const flush = (endLine) => {
    if (!current.length) return;
    blocks.push({ startLine, endLine, text: current.join("\n") });
    current = [];
    currentKind = "";
  };

  lines.forEach((line, index) => {
    const lineNo = index + 1;
    const trimmed = line.trim();
    const fence = /^(```|~~~)/.test(trimmed);
    if (!current.length && trimmed) startLine = lineNo;

    if (fence) {
      if (!current.length) startLine = lineNo;
      currentKind = "fence";
      current.push(line);
      inFence = !inFence;
      if (!inFence) flush(lineNo);
      return;
    }

    if (inFence) {
      current.push(line);
      return;
    }

    if (!trimmed) {
      flush(lineNo - 1);
      return;
    }

    const kind = markdownLineKind(line);
    if (startsNewMarkdownBlock(kind, currentKind) && current.length) {
      flush(lineNo - 1);
      startLine = lineNo;
    }
    if (!currentKind) currentKind = kind;
    current.push(line);
  });

  flush(lines.length);
  return blocks;
}

function markdownLineKind(line) {
  if (isHtmlTableLine(line)) return "html_table";
  if (/^(#{1,6})\s+/.test(line)) return "heading";
  if (/^\s{0,3}(?:[-+*]\s+|\d+[.)]\s+)/.test(line)) return "list";
  if (/^\s{0,3}>\s?/.test(line)) return "quote";
  if (/^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line)) return "hr";
  if (isMarkdownTableLine(line)) return "table";
  if (/^\s{0,3}!\[[^\]]*]\([^)]*\)\s*$/.test(line)) return "image";
  return "paragraph";
}

function isHtmlTableLine(line) {
  return /<\/?(table|thead|tbody|tfoot|tr|th|td|caption|colgroup|col)\b/i.test(String(line || ""));
}

function isMarkdownTableLine(line) {
  const trimmed = String(line || "").trim();
  if (!trimmed.includes("|")) return false;
  if (/^\|/.test(trimmed)) return true;
  if (/^:?-{3,}:?(\s*\|\s*:?-{3,}:?)+\s*\|?$/.test(trimmed)) return true;
  return /^[^|]+?\s+\|\s+[^|]+/.test(trimmed);
}

function startsNewMarkdownBlock(kind, currentKind) {
  if (!currentKind) return false;
  if (["heading", "hr", "image"].includes(kind)) return true;
  if (currentKind === "paragraph" && kind !== "paragraph") return true;
  if (currentKind !== "paragraph" && kind === "paragraph") return true;
  if (["list", "quote", "table", "html_table"].includes(kind) && currentKind !== kind) return true;
  return false;
}

function renderMarkdownBlock(block, assetContext) {
  const prepared = preprocessObsidianMarkdown(block.text);
  const rendered = mdRenderer ? mdRenderer.render(prepared) : `<p>${escapeHtml(prepared)}</p>`;
  const clean = sanitizeMarkdownHtml(rendered, assetContext);
  return `<section class="md-block" data-line="${block.startLine}" data-end-line="${block.endLine}">${clean}</section>`;
}

function previewAssetContext(rootDir, sourceFile) {
  return {
    rootDir: String(rootDir || ""),
    sourceFile: String(sourceFile || ""),
  };
}

function preprocessObsidianMarkdown(value) {
  return String(value || "")
    .replace(/!\[\[([^\]]+)]]/g, (_match, target) => {
      const cleanTarget = String(target || "").trim();
      const [path, alias] = cleanTarget.split("|");
      const alt = alias || path.split("/").pop() || path;
      return `![${alt}](${encodeMarkdownDestination(path)})`;
    })
    .replace(/!\[([^\]]*)]\(([^)\n]+)\)/g, (_match, alt, destination) => {
      return `![${alt}](${encodeMarkdownDestination(destination)})`;
    });
}

function encodeMarkdownDestination(destination) {
  const value = String(destination || "").trim();
  if (!value || /^<.*>$/.test(value)) return value;
  return encodeURI(value).replace(/[()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`);
}

function sanitizeMarkdownHtml(html, assetContext = null) {
  const clean = window.DOMPurify ? window.DOMPurify.sanitize(html, {
    ADD_ATTR: ["target", "rel"],
  }) : html;
  return processPreviewHtml(clean, assetContext);
}

function processPreviewHtml(html, assetContext) {
  const template = document.createElement("template");
  template.innerHTML = html;
  rewritePreviewAssetUrls(template.content, assetContext);
  if (window.katex && /(\$|\\\(|\\\[)/.test(template.innerHTML)) {
    replaceMathTextNodes(template.content);
  }
  return template.innerHTML;
}

function rewritePreviewAssetUrls(root, assetContext) {
  if (!assetContext?.rootDir) return;
  root.querySelectorAll("img[src]").forEach((image) => {
    const src = image.getAttribute("src") || "";
    const rewritten = previewAssetUrl(src, assetContext);
    if (rewritten) image.setAttribute("src", rewritten);
  });
}

function previewAssetUrl(src, assetContext) {
  const value = String(src || "").trim();
  if (!value || isExternalPreviewAsset(value)) return "";
  const params = new URLSearchParams({
    dir: assetContext.rootDir,
    file: assetContext.sourceFile || "",
    src: value,
  });
  return `/api/asset?${params.toString()}`;
}

function isExternalPreviewAsset(src) {
  return /^(?:[a-z][a-z0-9+.-]*:|\/\/|#|\/api\/)/i.test(src) && !src.startsWith("file:");
}

function replaceMathTextNodes(root) {
  const children = Array.from(root.childNodes);
  for (const child of children) {
    if (child.nodeType === 3) {
      replaceMathTextNode(child);
      continue;
    }
    if (child.nodeType !== 1 || shouldSkipMathText(child)) continue;
    replaceMathTextNodes(child);
  }
}

function shouldSkipMathText(element) {
  return Boolean(element.closest("code, pre, script, style, .katex"));
}

function replaceMathTextNode(node) {
  const parts = splitLatexText(node.nodeValue || "");
  if (!parts.some((part) => part.math)) return;
  const fragment = document.createDocumentFragment();
  for (const part of parts) {
    if (!part.math) {
      fragment.appendChild(document.createTextNode(part.text));
      continue;
    }
    const template = document.createElement("template");
    template.innerHTML = renderLatex(part.text, part.display);
    fragment.appendChild(template.content.cloneNode(true));
  }
  node.parentNode.replaceChild(fragment, node);
}

function splitLatexText(text) {
  const parts = [];
  let index = 0;
  while (index < text.length) {
    const next = nextLatexStart(text, index);
    if (!next) {
      parts.push({ text: text.slice(index), math: false });
      break;
    }
    if (next.index > index) parts.push({ text: text.slice(index, next.index), math: false });
    const close = findLatexDelimiter(text, next.contentStart, next.close);
    if (close < 0) {
      parts.push({ text: text.slice(next.index), math: false });
      break;
    }
    const content = text.slice(next.contentStart, close);
    if (content.trim()) parts.push({ text: content, math: true, display: next.display });
    else parts.push({ text: text.slice(next.index, close + next.close.length), math: false });
    index = close + next.close.length;
  }
  return parts.filter((part) => part.text);
}

function nextLatexStart(text, from) {
  for (let index = from; index < text.length; index += 1) {
    if (text[index] === "$" && !isEscapedDelimiter(text, index)) {
      if (text[index + 1] === "$") {
        return { index, contentStart: index + 2, close: "$$", display: true };
      }
      if (!/\s/.test(text[index + 1] || "")) {
        return { index, contentStart: index + 1, close: "$", display: false };
      }
    }
    if (text.slice(index, index + 2) === "\\(" && !isEscapedDelimiter(text, index)) {
      return { index, contentStart: index + 2, close: "\\)", display: false };
    }
    if (text.slice(index, index + 2) === "\\[" && !isEscapedDelimiter(text, index)) {
      return { index, contentStart: index + 2, close: "\\]", display: true };
    }
  }
  return null;
}

function installMarkdownMath(md) {
  md.inline.ruler.before("escape", "math_inline", mathInlineRule);
  md.block.ruler.before("fence", "math_block", mathBlockRule, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });
  md.renderer.rules.math_inline = (tokens, idx) =>
    renderLatex(tokens[idx].content, tokens[idx].markup === "$$");
  md.renderer.rules.math_block = (tokens, idx) => `${renderLatex(tokens[idx].content, true)}\n`;
}

function mathInlineRule(state, silent) {
  const start = state.pos;
  const src = state.src;
  const marker = src[start];
  let closeMarker = "";
  let contentStart = start + 1;

  if (marker === "$") {
    if (src[start + 1] === "$") {
      closeMarker = "$$";
      contentStart = start + 2;
    } else {
      if (/\s/.test(src[start + 1] || "")) return false;
      closeMarker = "$";
    }
  } else if (src.slice(start, start + 2) === "\\(") {
    closeMarker = "\\)";
    contentStart = start + 2;
  } else {
    return false;
  }

  const close = findLatexDelimiter(src, contentStart, closeMarker);
  if (close < 0) return false;
  const content = src.slice(contentStart, close);
  if (!content.trim()) return false;
  if (closeMarker === "$" && /\s/.test(src[close - 1] || "")) return false;
  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.content = content;
    token.markup = marker === "$" ? closeMarker : "\\(";
  }
  state.pos = close + closeMarker.length;
  return true;
}

function mathBlockRule(state, startLine, endLine, silent) {
  const start = state.bMarks[startLine] + state.tShift[startLine];
  const max = state.eMarks[startLine];
  const firstLine = state.src.slice(start, max).trim();
  let open = "";
  let close = "";
  if (firstLine.startsWith("$$")) {
    open = "$$";
    close = "$$";
  } else if (firstLine.startsWith("\\[")) {
    open = "\\[";
    close = "\\]";
  } else {
    return false;
  }
  if (silent) return true;

  const firstContent = firstLine.slice(open.length);
  const lines = [];
  let nextLine = startLine;
  const sameLineClose = findLatexDelimiter(firstContent, 0, close);
  if (sameLineClose >= 0) {
    lines.push(firstContent.slice(0, sameLineClose));
  } else {
    if (firstContent) lines.push(firstContent);
    for (nextLine = startLine + 1; nextLine < endLine; nextLine += 1) {
      const lineStart = state.bMarks[nextLine] + state.tShift[nextLine];
      const lineMax = state.eMarks[nextLine];
      const line = state.src.slice(lineStart, lineMax);
      const closeIndex = findLatexDelimiter(line, 0, close);
      if (closeIndex >= 0) {
        lines.push(line.slice(0, closeIndex));
        break;
      }
      lines.push(line);
    }
    if (nextLine >= endLine) return false;
  }

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content = lines.join("\n").trim();
  token.map = [startLine, nextLine + 1];
  token.markup = open;
  state.line = nextLine + 1;
  return true;
}

function findLatexDelimiter(src, start, delimiter) {
  let index = start;
  while (index < src.length) {
    const found = src.indexOf(delimiter, index);
    if (found < 0) return -1;
    if (!isEscapedDelimiter(src, found)) return found;
    index = found + delimiter.length;
  }
  return -1;
}

function isEscapedDelimiter(src, index) {
  let slashCount = 0;
  for (let pos = index - 1; pos >= 0 && src[pos] === "\\"; pos -= 1) slashCount += 1;
  return slashCount % 2 === 1;
}

function renderLatex(content, displayMode) {
  if (!window.katex) {
    const escaped = escapeHtml(content);
    return displayMode ? `<pre><code>${escaped}</code></pre>` : `<code>${escaped}</code>`;
  }
  try {
    return window.katex.renderToString(content, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch (_error) {
    const escaped = escapeHtml(content);
    return displayMode ? `<pre><code>${escaped}</code></pre>` : `<code>${escaped}</code>`;
  }
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

function appendConsoleProgress(label, total) {
  if (!el.consoleOutput) return null;
  const row = document.createElement("div");
  row.className = "console-progress";
  const time = new Date().toLocaleTimeString("zh-CN", { hour12: false });
  row.innerHTML = `
    <div class="console-progress-head">
      <span class="console-time">${escapeHtml(time)}</span>
      <span class="console-progress-label">${escapeHtml(label)}</span>
      <span class="console-progress-count">0/${escapeHtml(total)}</span>
    </div>
    <div class="console-progress-track">
      <div class="console-progress-bar" style="width: 0%"></div>
    </div>
    <div class="console-progress-detail"></div>
  `;
  el.consoleOutput.appendChild(row);
  el.consoleOutput.scrollTop = el.consoleOutput.scrollHeight;
  return row;
}

function updateConsoleProgress(row, done, total, detail = "") {
  if (!row) return;
  const safeTotal = Math.max(1, Number(total || 0));
  const safeDone = Math.min(safeTotal, Math.max(0, Number(done || 0)));
  const percent = Math.round((safeDone / safeTotal) * 100);
  row.querySelector(".console-progress-count").textContent = `${safeDone}/${total}`;
  row.querySelector(".console-progress-bar").style.width = `${percent}%`;
  row.querySelector(".console-progress-detail").textContent = detail;
  el.consoleOutput.scrollTop = el.consoleOutput.scrollHeight;
}

function finishConsoleProgress(row, status) {
  if (!row) return;
  row.classList.toggle("done", status === "done");
  row.classList.toggle("failed", status === "failed");
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
