import type { Candidate, ModuleName, SidebarState } from "./types";

const MODULES: ModuleName[] = ["章节定界", "章节标题", "注释", "图片"];
export const TABLE_COLUMNS = ["多选", "行号", "行类型", "预览"] as const;
export const ANNOTATION_EXTRA_COLUMNS = ["注释号"] as const;

export function renderSidebar(state: SidebarState): string {
  const encoded = escapeScriptJson(state);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root { color-scheme: light dark; }
    html, body { height: 100%; margin: 0; overflow: hidden; }
    body { padding: 12px; box-sizing: border-box; color: var(--vscode-foreground); font-family: var(--vscode-font-family); }
    #app { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    button, select, input, textarea {
      color: var(--vscode-input-foreground); background: var(--vscode-input-background);
      border: 1px solid var(--vscode-input-border, var(--vscode-panel-border));
      padding: 5px 7px; box-sizing: border-box;
    }
    button { cursor: pointer; background: var(--vscode-button-secondaryBackground); }
    button.primary { color: var(--vscode-button-foreground); background: var(--vscode-button-background); }
    button:disabled { opacity: .5; cursor: default; }
    .tabs, .toolbar, .regex-controls, .bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
    .tabs { margin-bottom: 10px; }
    .tab { border: 0; border-bottom: 2px solid transparent; background: transparent; }
    .tab.active { border-bottom-color: var(--vscode-focusBorder); color: var(--vscode-textLink-foreground); }
    .toolbar { margin: 8px 0; }
    .regex-card { display: grid; gap: 7px; margin: 10px 0; padding: 9px; border: 1px solid var(--vscode-panel-border); }
    textarea { width: 100%; min-height: 74px; resize: vertical; font-family: var(--vscode-editor-font-family); }
    .meta { color: var(--vscode-descriptionForeground); margin: 6px 0; overflow-wrap: anywhere; }
    .table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; border: 1px solid var(--vscode-panel-border); }
    table { border-collapse: collapse; min-width: 720px; width: 100%; }
    th, td { padding: 5px 7px; border-bottom: 1px solid var(--vscode-panel-border); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; z-index: 2; background: var(--vscode-sideBarSectionHeader-background); }
    tr:not(.deleted):hover { background: var(--vscode-list-hoverBackground); }
    tr.deleted { opacity: .58; background: rgba(128,128,128,.12); }
    tr.deleted .preview { text-decoration: line-through; }
    tr.added { box-shadow: inset 3px 0 rgba(72,184,255,.9); }
    tr.modified { box-shadow: inset 3px 0 rgba(255,193,7,.9); }
    tr.removed { box-shadow: inset 3px 0 rgba(244,67,54,.95); }
    .preview { overflow-wrap: anywhere; max-width: 760px; }
    .preview-content { white-space: pre-wrap; }
    .preview-detail { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 7px; color: var(--vscode-descriptionForeground); }
    .sort-hint { padding: 5px 7px; color: var(--vscode-descriptionForeground); border-bottom: 1px solid var(--vscode-panel-border); }
    .sort-header { display: inline-flex; gap: 5px; align-items: center; padding: 0; border: 0; color: inherit; background: transparent; font-weight: inherit; }
    .check-column { width: 54px; }
    .line-column { width: 92px; }
    .number-column { width: 118px; }
    .line-type { min-width: 118px; }
    .chapter-file { width: 210px; }
    .annotation-number { width: 88px; }
    tr.missing-number { box-shadow: inset 3px 0 #f1c40f; }
    input.annotation-number.missing {
      border-color: #f1c40f;
      background: rgba(241, 196, 15, .18);
    }
    .pair-status.missing { color: #f1c40f; }
    .pair-status.matched { color: var(--vscode-testing-iconPassed, #89d185); }
    .empty { padding: 24px; text-align: center; color: var(--vscode-descriptionForeground); }
    .progress { color: var(--vscode-descriptionForeground); }
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    const vscode = acquireVsCodeApi();
    const state = ${encoded};
    const MODULES = ${JSON.stringify(MODULES)};
    const ANNOTATION_EXTRA_COLUMNS = ${JSON.stringify(ANNOTATION_EXTRA_COLUMNS)};
    const DELETED = "已删除";
    const LINE_TYPES = {
      "章节定界": ["1 级标题", "新增", "修改", "删除", DELETED],
      "章节标题": ["1 级标题", "2 级标题", "3 级标题", "4 级标题", "5 级标题", "6 级标题", "非标题", DELETED],
      "注释": ["注释引用", "注释正文", "忽略", DELETED],
      "图片": ["图片标题", "图片链接", "图片文本", "图片HTML", DELETED],
    };
    const FILTER_OPTIONS = {
      "章节标题": ["层级标题行+增删改行", "全部", "层级标题行", "增删改行"],
      "注释": ["注释及引用+增删改行", "全部", "注释及引用", "增删改行"],
      "图片": ["图片相关+增删改行", "全部", "图片相关", "增删改行"],
    };
    const DEFAULT_FILTERS = {
      "章节标题": "层级标题行+增删改行",
      "注释": "注释及引用+增删改行",
      "图片": "图片相关+增删改行",
    };
    const DEFAULT_SORT_RULES = {
      "注释": [{ key: "number", direction: "asc" }, { key: "line", direction: "asc" }],
    };
    const selected = new Set();
    const persisted = vscode.getState() || {};
    const allowedSortKeys = ["line", "lineType", "preview", "number"];
    function sanitizeSortRules(rules) {
      return Array.isArray(rules)
        ? rules.filter((rule) => allowedSortKeys.includes(rule.key) && ["asc", "desc"].includes(rule.direction))
        : [];
    }
    function defaultSortRules(moduleName) {
      return DEFAULT_SORT_RULES[moduleName] || [{ key: "line", direction: "asc" }];
    }
    const sortRulesByModule = persisted.sortRulesByModule && typeof persisted.sortRulesByModule === "object" ? persisted.sortRulesByModule : {};
    let sortRules = sanitizeSortRules(sortRulesByModule[state.activeModule]);
    if (!sortRules.length) sortRules = defaultSortRules(state.activeModule);
    const moduleFilters = { ...(persisted.moduleFilters || {}) };
    if (Array.isArray(persisted.selectedIds)) {
      for (const id of persisted.selectedIds) selected.add(id);
    }
    const scrollByModule = persisted.scrollByModule && typeof persisted.scrollByModule === "object" ? persisted.scrollByModule : {};
    let focusTarget = persisted.focus && typeof persisted.focus.rowId === "string" ? persisted.focus : undefined;
    const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
    const app = document.getElementById("app");
    const post = (command, payload = {}) => vscode.postMessage({ command, ...payload });
    const el = (tag, text, className) => {
      const node = document.createElement(tag);
      if (text !== undefined) node.textContent = text;
      if (className) node.className = className;
      return node;
    };
    const button = (label, command, className = "") => {
      const node = el("button", label, className);
      node.addEventListener("click", () => command());
      return node;
    };

    function persistViewState() {
      sortRulesByModule[state.activeModule] = sortRules;
      persisted.sortRules = sortRules;
      persisted.sortRulesByModule = sortRulesByModule;
      persisted.moduleFilters = moduleFilters;
      persisted.selectedIds = [...selected];
      persisted.scrollByModule = scrollByModule;
      persisted.focus = focusTarget;
      vscode.setState(persisted);
    }

    function captureScroll() {
      const wrap = document.querySelector(".table-wrap");
      if (!wrap) return;
      scrollByModule[state.activeModule] = { top: wrap.scrollTop, left: wrap.scrollLeft };
    }

    function restoreScroll() {
      const wrap = document.querySelector(".table-wrap");
      if (!wrap) return;
      const saved = scrollByModule[state.activeModule] || { top: 0, left: 0 };
      wrap.scrollTop = saved.top || 0;
      wrap.scrollLeft = saved.left || 0;
    }

    function restoreFocus() {
      if (!focusTarget) return;
      const selector = '[data-row-id="' + cssEscape(focusTarget.rowId) + '"][data-field="' + cssEscape(focusTarget.field) + '"]';
      const node = document.querySelector(selector);
      if (node && node.focus) node.focus({ preventScroll: true });
    }

    function cssEscape(value) {
      return window.CSS && CSS.escape ? CSS.escape(String(value)) : String(value).replace(/["\\\\]/g, "\\\\$&");
    }

    function rememberFocus(rowId, field) {
      focusTarget = { rowId, field };
    }

    function postKeepView(command, payload, options) {
      captureScroll();
      if (options && options.clearSelection) {
        selected.clear();
        focusTarget = undefined;
      }
      persistViewState();
      post(command, payload);
    }

    function syncSelectionChrome() {
      persistViewState();
      const count = document.getElementById("selected-count");
      if (count) count.textContent = "已选 " + selected.size;
      const boxes = [...document.querySelectorAll("input.row-check")];
      const visibleIds = boxes.map((box) => box.getAttribute("data-row-id"));
      const selectAll = document.getElementById("select-all");
      if (selectAll) {
        selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
        selectAll.indeterminate = visibleIds.some((id) => selected.has(id)) && !selectAll.checked;
      }
    }

    function rowWasChanged(row, moduleName) {
      const chapterChange = row.lineType === DELETED
        || ["added", "modified", "deleted"].includes(row.chapterBoundaryState);
      if (moduleName === "章节标题") return chapterChange;
      return chapterChange || row.isWorkingCorrection === true;
    }

    function rowMatchesModuleFilter(row, moduleName, filter) {
      if (!filter || filter === "全部") return true;
      const changed = rowWasChanged(row, moduleName);
      const heading = /^[1-6] 级标题$/.test(row.lineType || "");
      const annotation = ["注释引用", "注释正文"].includes(row.lineType || "");
      const image = ["图片标题", "图片链接", "图片文本", "图片HTML"].includes(row.lineType || "");
      if (filter === "增删改行") return changed;
      if (filter === "层级标题行") return heading;
      if (filter === "注释及引用") return annotation;
      if (filter === "图片相关") return image;
      if (moduleName === "章节标题") return heading || changed;
      if (moduleName === "注释") return annotation || changed;
      if (moduleName === "图片") return image || changed;
      return true;
    }

    function rowsForModule() {
      const moduleName = state.activeModule;
      const filter = moduleFilters[moduleName] || DEFAULT_FILTERS[moduleName];
      return state.rows.filter((row) =>
        row.typeLabel === moduleName && rowMatchesModuleFilter(row, moduleName, filter)
      );
    }

    function previewText(row) {
      return Array.from(String(row.preview || row.raw || "")).slice(0, 255).join("");
    }

    function sortedRows(rows) {
      if (!sortRules.length) return rows;
      return rows.map((row, index) => ({ row, index })).sort((left, right) => {
        for (const rule of sortRules) {
          let compared = 0;
          if (rule.key === "line") compared = left.row.range.line - right.row.range.line;
          if (rule.key === "lineType") compared = collator.compare(left.row.lineType || "", right.row.lineType || "");
          if (rule.key === "preview") compared = collator.compare(previewText(left.row), previewText(right.row));
          if (rule.key === "number") compared = compareAnnotationNumbers(left.row, right.row);
          if (compared) return rule.direction === "asc" ? compared : -compared;
        }
        return left.index - right.index;
      }).map((entry) => entry.row);
    }

    function updateSort(event, key) {
      const index = sortRules.findIndex((rule) => rule.key === key);
      if (!event.shiftKey) {
        const direction = index === 0 && sortRules.length === 1 && sortRules[0].direction === "asc" ? "desc" : "asc";
        sortRules = [{ key, direction }];
      } else if (index < 0) {
        sortRules = [...sortRules, { key, direction: "asc" }];
      } else if (sortRules[index].direction === "asc") {
        sortRules = sortRules.map((rule, position) => position === index ? { ...rule, direction: "desc" } : rule);
      } else {
        sortRules = sortRules.filter((_, position) => position !== index);
      }
      persistViewState();
      render();
    }

    function sortableHeader(label, key, className) {
      const cell = el("th", undefined, className);
      const position = sortRules.findIndex((rule) => rule.key === key);
      const suffix = position < 0 ? "" : " " + (sortRules[position].direction === "asc" ? "↑" : "↓") + String(position + 1);
      const control = el("button", label + suffix, "sort-header");
      control.title = "单击设为主排序；Shift+单击追加、切换或移除排序键";
      control.addEventListener("click", (event) => updateSort(event, key));
      cell.append(control);
      return cell;
    }

    function compareAnnotationNumbers(left, right) {
      const leftNumber = String(left.annotationNumber || "").trim();
      const rightNumber = String(right.annotationNumber || "").trim();
      if (!leftNumber && rightNumber) return 1;
      if (leftNumber && !rightNumber) return -1;
      return collator.compare(leftNumber, rightNumber);
    }

    function selectedIds(fallbackId) {
      return selected.has(fallbackId) && selected.size ? [...selected] : [fallbackId];
    }

    function render() {
      captureScroll();
      app.replaceChildren();
      const tabs = el("div", undefined, "tabs");
      for (const moduleName of MODULES) {
        const count = moduleName === "注释" && state.annotationMatchSummary
          ? state.annotationMatchSummary.calibrated
          : state.rows.filter((row) => row.typeLabel === moduleName).length;
        const tab = button(moduleName + " (" + count + ")", () => postKeepView("setActiveModule", { moduleName }), "tab");
        if (moduleName === state.activeModule) tab.classList.add("active");
        tabs.append(tab);
      }
      app.append(tabs);

      const meta = el("div", state.selectedFile ? state.selectedFile.label : "请先在目录中选择 Markdown 文件", "meta");
      app.append(meta);
      app.append(moduleToolbar());
      if (state.activeModule === "注释" || state.activeModule === "图片") app.append(regexCard());
      if (FILTER_OPTIONS[state.activeModule]) app.append(filterToolbar());
      app.append(bulkToolbar());
      app.append(rowTable(rowsForModule()));
      requestAnimationFrame(() => {
        restoreScroll();
        restoreFocus();
      });
    }

    function filterToolbar() {
      const bar = el("div", undefined, "toolbar");
      const select = document.createElement("select");
      const options = FILTER_OPTIONS[state.activeModule] || [];
      const current = moduleFilters[state.activeModule] || DEFAULT_FILTERS[state.activeModule];
      for (const value of options) select.append(new Option(value, value, false, value === current));
      select.addEventListener("change", () => {
        moduleFilters[state.activeModule] = select.value;
        selected.clear();
        focusTarget = undefined;
        persistViewState();
        render();
      });
      bar.append(el("span", "显示"), select);
      return bar;
    }

    function moduleToolbar() {
      const toolbar = el("div", undefined, "toolbar");
      if (state.activeModule === "章节定界") {
        toolbar.append(
          button("创建/打开定界工作稿", () => postKeepView("openChapterBoundaryWork"), "primary"),
          button("导出章节", () => postKeepView("exportChapterBoundaryChapters")),
          button("保存标定", () => postKeepView("saveAnnotations")),
        );
      } else if (state.activeModule === "章节标题") {
        toolbar.append(
          button("创建/打开章节工作稿", () => postKeepView("openChapterWorkingCopy"), "primary"),
          button("保存标定", () => postKeepView("saveAnnotations")),
          button("重新加载标定", () => postKeepView("reloadAnnotations")),
        );
      } else if (state.activeModule === "注释") {
        const summary = state.annotationMatchSummary;
        toolbar.append(
          button("打开注释订正工作稿", () => postKeepView("openAnnotationWorkingCopy")),
          button("匹配注释对", () => {
            sortRules = defaultSortRules("注释");
            postKeepView("matchAnnotationPairs");
          }, "primary"),
          button("保存标定", () => postKeepView("saveAnnotations")),
          button("重新加载标定", () => postKeepView("reloadAnnotations")),
        );
        if (summary) {
          toolbar.append(el(
            "span",
            "配对 " + summary.paired + " · 待补正文 " + summary.missingBody + " · 待补引用 " + summary.missingRef + " · 缺注释号 " + summary.missingNumber,
            "progress",
          ));
        }
      } else {
        const running = state.imageDownloadProgress?.phase === "downloading";
        const download = button(running ? "正在下载" : "下载所选图片", () => postKeepView("downloadImages", { ids: [...selected] }));
        download.disabled = running;
        toolbar.append(
          download,
          button("保存标定", () => postKeepView("saveAnnotations"), "primary"),
          button("重新加载标定", () => postKeepView("reloadAnnotations")),
        );
        if (state.imageDownloadProgress) {
          toolbar.append(el("span", state.imageDownloadProgress.current || (state.imageDownloadProgress.completed + "/" + state.imageDownloadProgress.total), "progress"));
        }
      }
      return toolbar;
    }

    function regexCard() {
      const card = el("div", undefined, "regex-card");
      const presets = state.moduleRegexPresets[state.activeModule] || [];
      const controls = el("div", undefined, "regex-controls");
      const preset = document.createElement("select");
      preset.append(new Option("选择正则预设", ""));
      for (const item of presets) preset.append(new Option(item.label, item.pattern));
      const textarea = document.createElement("textarea");
      textarea.value = state.moduleRegexPatterns[state.activeModule] || "";
      preset.addEventListener("change", () => { if (preset.value) textarea.value = preset.value; });
      controls.append(preset, button("应用正则", () => postKeepView("scanModule", { moduleName: state.activeModule, pattern: textarea.value }), "primary"));
      card.append(controls, textarea);
      return card;
    }

    function bulkToolbar() {
      const bar = el("div", undefined, "bulk");
      const select = document.createElement("select");
      for (const value of LINE_TYPES[state.activeModule]) select.append(new Option(value, value));
      const count = el("span", "已选 " + selected.size);
      count.id = "selected-count";
      bar.append(
        count,
        select,
        button("应用到所选", () => {
          if (!selected.size) return;
          postKeepView("setRowsLineType", { ids: [...selected], lineType: select.value }, { clearSelection: true });
        }),
      );
      return bar;
    }

    function rowTable(rows) {
      const wrap = el("div", undefined, "table-wrap");
      wrap.addEventListener("scroll", () => {
        scrollByModule[state.activeModule] = { top: wrap.scrollTop, left: wrap.scrollLeft };
        persistViewState();
      }, { passive: true });
      if (!rows.length) {
        wrap.append(el("div", "当前模块没有记录。", "empty"));
        return wrap;
      }
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      const selectCell = el("th", undefined, "check-column");
      const selectAll = document.createElement("input");
      const visibleIds = rows.map((row) => row.id);
      selectAll.type = "checkbox";
      selectAll.id = "select-all";
      selectAll.title = "多选当前表格全部记录";
      selectAll.setAttribute("aria-label", "多选当前表格全部记录");
      selectAll.checked = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
      selectAll.indeterminate = visibleIds.some((id) => selected.has(id)) && !selectAll.checked;
      selectAll.addEventListener("change", () => {
        for (const id of visibleIds) selectAll.checked ? selected.add(id) : selected.delete(id);
        for (const box of document.querySelectorAll("input.row-check")) {
          box.checked = selected.has(box.getAttribute("data-row-id"));
        }
        syncSelectionChrome();
      });
      selectCell.append(selectAll, document.createTextNode(" 多选"));
      headRow.append(selectCell, sortableHeader("行号", "line", "line-column"));
      if (state.activeModule === "注释" && ANNOTATION_EXTRA_COLUMNS.includes("注释号")) {
        headRow.append(sortableHeader("注释号", "number", "number-column"));
      }
      headRow.append(
        sortableHeader("行类型", "lineType"),
        sortableHeader("预览", "preview"),
      );
      head.append(headRow);
      const body = document.createElement("tbody");
      const pairByRow = new Map();
      for (const pair of state.annotationPairs) {
        if (pair.refCandidateId) pairByRow.set(pair.refCandidateId, pair);
        if (pair.bodyCandidateId) pairByRow.set(pair.bodyCandidateId, pair);
      }
      sortedRows(rows).forEach((candidate) => body.append(candidateRow(candidate, pairByRow.get(candidate.id))));
      table.append(head, body);
      wrap.append(el("div", "单击列标题排序；Shift+单击可追加多列排序。", "sort-hint"), table);
      return wrap;
    }

    function candidateRow(candidate, pair) {
      const row = document.createElement("tr");
      if (candidate.lineType === DELETED) row.classList.add("deleted");
      if (candidate.chapterBoundaryState === "added") row.classList.add("added");
      if (candidate.chapterBoundaryState === "modified") row.classList.add("modified");
      if (candidate.chapterBoundaryState === "deleted") row.classList.add("removed");
      const missingNumber = state.activeModule === "注释"
        && (candidate.lineType === "注释引用" || candidate.lineType === "注释正文")
        && !String(candidate.annotationNumber || "").trim();
      if (missingNumber) row.classList.add("missing-number");

      const checkCell = document.createElement("td");
      const check = document.createElement("input");
      check.type = "checkbox";
      check.className = "row-check";
      check.checked = selected.has(candidate.id);
      check.setAttribute("data-row-id", candidate.id);
      check.setAttribute("data-field", "check");
      check.addEventListener("click", (event) => event.stopPropagation());
      check.addEventListener("focus", () => rememberFocus(candidate.id, "check"));
      check.addEventListener("change", () => {
        if (check.checked) selected.add(candidate.id); else selected.delete(candidate.id);
        syncSelectionChrome();
      });
      checkCell.append(check);
      row.append(checkCell, el("td", String(candidate.range.line + 1)));
      if (state.activeModule === "注释") {
        const numberCell = document.createElement("td");
        const numberInput = document.createElement("input");
        numberInput.className = "annotation-number" + (missingNumber ? " missing" : "");
        numberInput.value = candidate.annotationNumber || "";
        numberInput.placeholder = missingNumber ? "手工输入注释号" : "注释号";
        numberInput.title = missingNumber ? "未能提取注释号，请手工输入" : "注释号";
        numberInput.setAttribute("data-row-id", candidate.id);
        numberInput.setAttribute("data-field", "annotationNumber");
        numberInput.addEventListener("click", (event) => event.stopPropagation());
        numberInput.addEventListener("focus", () => rememberFocus(candidate.id, "annotationNumber"));
        numberInput.addEventListener("change", () => postKeepView("setAnnotationNumber", { id: candidate.id, annotationNumber: numberInput.value }));
        numberCell.append(numberInput);
        row.append(numberCell);
      }

      const typeCell = document.createElement("td");
      const typeSelect = document.createElement("select");
      typeSelect.className = "line-type";
      typeSelect.setAttribute("data-row-id", candidate.id);
      typeSelect.setAttribute("data-field", "lineType");
      for (const value of LINE_TYPES[state.activeModule]) typeSelect.append(new Option(value, value, false, value === candidate.lineType));
      typeSelect.addEventListener("click", (event) => event.stopPropagation());
      typeSelect.addEventListener("focus", () => rememberFocus(candidate.id, "lineType"));
      typeSelect.addEventListener("change", () => {
        postKeepView("setRowsLineType", { ids: selectedIds(candidate.id), lineType: typeSelect.value }, { clearSelection: true });
      });
      typeCell.append(typeSelect);
      const previewCell = el("td", undefined, "preview");
      previewCell.append(el("div", previewText(candidate), "preview-content"));
      row.append(typeCell, previewCell);

      if (state.activeModule === "章节定界") {
        const detail = el("div", undefined, "preview-detail");
        const input = document.createElement("input");
        input.className = "chapter-file";
        input.value = candidate.chapterFile || "";
        input.placeholder = "例如 11 Chapter.md";
        input.setAttribute("data-row-id", candidate.id);
        input.setAttribute("data-field", "chapterFile");
        input.addEventListener("click", (event) => event.stopPropagation());
        input.addEventListener("focus", () => rememberFocus(candidate.id, "chapterFile"));
        input.addEventListener("change", () => postKeepView("setChapterFile", { id: candidate.id, chapterFile: input.value }));
        detail.append(el("span", "章节文件"), input);
        previewCell.append(detail);
      }
      if (state.activeModule === "注释") {
        const status = pair
          ? pair.pairId + " · " + pair.status
          : (missingNumber ? "未配对，请输入注释号" : "未配对");
        const statusClass = missingNumber || (pair && (pair.status === "待补引用" || pair.status === "待补正文"))
          ? "pair-status missing"
          : pair ? "pair-status matched" : "pair-status";
        previewCell.append(el("div", status, statusClass + " preview-detail"));
      }
      if (state.activeModule === "图片" && candidate.localPath) {
        previewCell.append(el("div", "本地路径：" + candidate.localPath, "preview-detail"));
      }
      previewCell.addEventListener("click", () => post("locateRow", { id: candidate.id }));
      return row;
    }

    render();
  </script>
</body>
</html>`;
}

function escapeScriptJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(/>/g, "\\u003e")
    .replace(/&/g, "\\u0026")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function moduleRows(rows: Candidate[], moduleName: ModuleName): Candidate[] {
  return rows.filter((row) => row.typeLabel === moduleName);
}
