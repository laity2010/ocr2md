import type { Candidate, ModuleName, SidebarState } from "./types";
import { REVIEW_MODULE_DEFINITIONS, REVIEW_MODULES } from "./reviewModuleDefinitions";
export const TABLE_COLUMNS = ["多选", "行号", "行类型", "预览"] as const;
export const ANNOTATION_EXTRA_COLUMNS = ["注释号"] as const;
export const CHAPTER_BOUNDARY_EXTRA_COLUMNS = ["章节文件"] as const;
export const EMBED_EXTRA_COLUMNS = ["序号"] as const;

export function renderReviewUi(state: SidebarState, platformBootstrap: string, platformThemeCss = ""): string {
  const encoded = escapeScriptJson(state);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <style>
    :root {
      color-scheme: light dark;
      --ocr-foreground: CanvasText;
      --ocr-background: Canvas;
      --ocr-input-foreground: CanvasText;
      --ocr-input-background: Field;
      --ocr-border: GrayText;
      --ocr-button-background: ButtonFace;
      --ocr-button-foreground: ButtonText;
      --ocr-button-secondary-background: ButtonFace;
      --ocr-description-foreground: GrayText;
      --ocr-editor-font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      --ocr-font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      --ocr-focus-border: Highlight;
      --ocr-hover-background: color-mix(in srgb, CanvasText 8%, Canvas);
      --ocr-header-background: Canvas;
      --ocr-failed: #f14c4c;
      --ocr-passed: #2e7d32;
      --ocr-link: LinkText;
    }
    html, body { height: 100%; margin: 0; overflow: hidden; }
    body { padding: 12px; box-sizing: border-box; color: var(--ocr-foreground); font-family: var(--ocr-font-family); }
    #app { display: flex; flex-direction: column; height: 100%; min-height: 0; }
    button, select, input, textarea {
      color: var(--ocr-input-foreground); background: var(--ocr-input-background);
      border: 1px solid var(--ocr-border);
      padding: 5px 7px; box-sizing: border-box;
    }
    button { cursor: pointer; background: var(--ocr-button-secondary-background); }
    button.primary { color: var(--ocr-button-foreground); background: var(--ocr-button-background); }
    button:disabled { opacity: .5; cursor: default; }
    .tabs, .toolbar, .regex-controls, .bulk { display: flex; flex-wrap: wrap; align-items: center; gap: 7px; }
    .tabs { margin-bottom: 10px; }
    .tab { border: 0; border-bottom: 2px solid transparent; background: transparent; }
    .tab.active { border-bottom-color: var(--ocr-focus-border); color: var(--ocr-link); }
    .toolbar { margin: 8px 0; }
    .toolbar-check { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
    .toolbar-check input { margin: 0; }
    .regex-card { display: grid; gap: 7px; margin: 10px 0; padding: 9px; border: 1px solid var(--ocr-border); }
    textarea { width: 100%; min-height: 74px; resize: vertical; font-family: var(--ocr-editor-font-family); }
    .meta { color: var(--ocr-description-foreground); margin: 6px 0; overflow-wrap: anywhere; }
    .table-wrap { flex: 1 1 auto; min-height: 0; overflow: auto; border: 1px solid var(--ocr-border); }
    table { border-collapse: collapse; min-width: 720px; width: 100%; }
    th, td { padding: 5px 7px; border-bottom: 1px solid var(--ocr-border); text-align: left; vertical-align: top; }
    th { position: sticky; top: 0; z-index: 2; background: var(--ocr-header-background); }
    tr:not(.deleted):hover { background: var(--ocr-hover-background); }
    tr.deleted { opacity: .58; background: rgba(128,128,128,.12); }
    tr.deleted .preview { text-decoration: line-through; }
    tr.added { box-shadow: inset 3px 0 rgba(72,184,255,.9); }
    tr.modified { box-shadow: inset 3px 0 rgba(255,193,7,.9); }
    tr.removed { box-shadow: inset 3px 0 rgba(244,67,54,.95); }
    .preview { overflow-wrap: anywhere; max-width: 760px; }
    .preview-content { white-space: pre-wrap; }
    .chapter-heading-preview {
      margin: 0;
      font-family: "PingFang SC", "Microsoft YaHei", "Inter", sans-serif;
      line-height: 1.7;
      overflow-wrap: anywhere;
    }
    h1.chapter-heading-preview {
      color: #ff5c57;
      font-size: 2.2em;
      border-bottom: 3px solid #ff5c57;
      padding-bottom: 0.25em;
    }
    h2.chapter-heading-preview {
      color: #ff9f43;
      font-size: 1.8em;
      border-bottom: 1px solid #d0d7de;
      padding-bottom: 0.2em;
    }
    h3.chapter-heading-preview { color: #feca57; font-size: 1.45em; }
    h4.chapter-heading-preview { color: #9ccc65; font-size: 1.25em; }
    h5.chapter-heading-preview { color: #55c6a9; font-size: 1.1em; }
    h6.chapter-heading-preview { color: #d77bbf; font-size: 1em; font-weight: 700; }
    .preview-detail { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; margin-top: 7px; color: var(--ocr-description-foreground); }
    .sort-hint { padding: 5px 7px; color: var(--ocr-description-foreground); border-bottom: 1px solid var(--ocr-border); }
    .sort-header { display: inline-flex; gap: 5px; align-items: center; padding: 0; border: 0; color: inherit; background: transparent; font-weight: inherit; }
    .check-column { width: 54px; }
    .line-column { width: 92px; }
    .number-column { width: 118px; }
    .line-type { min-width: 118px; }
    .chapter-file { width: 210px; }
    .chapter-file-column { width: 220px; }
    .annotation-number { width: 88px; }
    tr.missing-number, tr.missing-chapter-file { box-shadow: inset 3px 0 #f1c40f; }
    input.annotation-number.missing, input.chapter-file.missing {
      border-color: #f1c40f;
      background: rgba(241, 196, 15, .18);
    }
    .pair-status.missing { color: #f1c40f; }
    .pair-status.matched { color: var(--ocr-passed); }
    .empty { padding: 24px; text-align: center; color: var(--ocr-description-foreground); }
    .progress { color: var(--ocr-description-foreground); }
    .translation-progress { width: min(360px, 46vw); height: 14px; }
    .translation-text { white-space: pre-wrap; min-width: 220px; overflow-wrap: anywhere; }
    .translation-status { min-width: 86px; }
    tr.translation-failed { box-shadow: inset 3px 0 var(--ocr-failed); }
    .settings-panel { max-width: 760px; display: grid; gap: 14px; overflow: auto; padding-right: 4px; }
    .settings-card { display: grid; gap: 8px; padding: 14px; border: 1px solid var(--ocr-border); }
    .settings-card h2 { margin: 0 0 4px; font-size: 16px; }
    .settings-card label { font-weight: 600; }
    .settings-card input, .settings-card select, .settings-card textarea { width: 100%; }
    .settings-card textarea { min-height: 92px; }
    .settings-actions { display: flex; gap: 8px; flex-wrap: wrap; }
    .test-result { margin: 0; padding: 10px; border: 1px solid var(--ocr-border); white-space: pre-wrap; overflow-wrap: anywhere; font-family: var(--ocr-editor-font-family); }
    .test-result.success { border-color: var(--ocr-passed); }
    .test-result.error { border-color: var(--ocr-failed); }
    .modal-backdrop {
      position: fixed; inset: 0; z-index: 100;
      display: flex; align-items: flex-start; justify-content: center;
      padding-top: 72px; background: rgba(0, 0, 0, 0.45);
    }
    .modal {
      width: min(420px, calc(100vw - 32px));
      border: 1px solid var(--ocr-border); border-radius: 6px; padding: 14px;
      color: var(--ocr-foreground); background: var(--ocr-background);
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.35);
    }
    .modal h2 { margin-top: 0; font-size: 14px; }
    .modal p { margin: 6px 0; color: var(--ocr-description-foreground); }
    .modal input, .modal select {
      width: 100%; box-sizing: border-box; margin: 8px 0 12px; padding: 6px 8px;
      color: var(--ocr-input-foreground); background: var(--ocr-input-background);
      border: 1px solid var(--ocr-border);
    }
    .modal-actions { display: flex; justify-content: flex-end; gap: 8px; }
    ${platformThemeCss}
  </style>
</head>
<body>
  <div id="app"></div>
  <script>
    ${platformBootstrap}
    const host = window.ocr2mdHost;
    if (!host) throw new Error("ocr2md UI host bridge is missing");
    let state = ${encoded};
    const MODULES = ${JSON.stringify(REVIEW_MODULES)};
    const MODULE_DEFINITIONS = ${JSON.stringify(REVIEW_MODULE_DEFINITIONS)};
    const ANNOTATION_EXTRA_COLUMNS = ${JSON.stringify(ANNOTATION_EXTRA_COLUMNS)};
    const CHAPTER_BOUNDARY_EXTRA_COLUMNS = ${JSON.stringify(CHAPTER_BOUNDARY_EXTRA_COLUMNS)};
    const EMBED_EXTRA_COLUMNS = ${JSON.stringify(EMBED_EXTRA_COLUMNS)};
    const DELETED = "已删除";
    function moduleDefinition(moduleName = state.activeModule) {
      return MODULE_DEFINITIONS[moduleName];
    }
    const selected = new Set();
    const persisted = host.getState() || {};
    const allowedSortKeys = ["line", "lineType", "preview", "number", "chapterFile", "embedNumber"];
    function sanitizeSortRules(rules) {
      return Array.isArray(rules)
        ? rules.filter((rule) => allowedSortKeys.includes(rule.key) && ["asc", "desc"].includes(rule.direction))
        : [];
    }
    function defaultSortRules(moduleName) {
      return moduleDefinition(moduleName)?.defaultSort || [{ key: "line", direction: "asc" }];
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
    let webviewIsActive = document.hasFocus();
    window.addEventListener("pointerdown", () => { webviewIsActive = true; });
    window.addEventListener("focusin", () => { webviewIsActive = true; });
    window.addEventListener("focusout", () => { webviewIsActive = document.hasFocus(); });
    const collator = new Intl.Collator("zh-CN", { numeric: true, sensitivity: "base" });
    const app = document.getElementById("app");
    const post = (command, payload = {}) => host.postMessage({ command, ...payload });
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
      host.setState(persisted);
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
      if (!focusTarget || !webviewIsActive) return;
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

    function rowWasChanged(row, definition) {
      const chapterChange = row.lineType === DELETED
        || ["added", "modified", "deleted"].includes(row.chapterBoundaryState);
      return chapterChange || (definition?.includeWorkingCorrectionInChanged !== false && row.isWorkingCorrection === true);
    }

    function rowMatchesModuleFilter(row, definition, filterValue) {
      const filter = definition?.filter;
      if (!filter || !filterValue || filterValue === "全部") return true;
      const changed = rowWasChanged(row, definition);
      const primary = filter.primaryLineTypes.includes(row.lineType || "");
      if (filterValue === "增删改行") return changed;
      if (filterValue === filter.primaryOnlyLabel) return primary;
      if (filterValue === filter.combinedLabel) return primary || changed;
      return true;
    }

    function rowsForModule() {
      const definition = moduleDefinition();
      const moduleName = definition.name;
      const filterValue = moduleFilters[moduleName] || definition.filter?.defaultValue;
      return state.rows.filter((row) =>
        row.typeLabel === moduleName
        && row.lineType !== "已忽略"
        && !(definition.filter?.hideDeletedWorkingRows && row.chapterBoundaryState === "deleted")
        && rowMatchesModuleFilter(row, definition, filterValue)
      );
    }

    function previewText(row) {
      return Array.from(String(row.preview || row.raw || "")).slice(0, 255).join("");
    }

    function chapterHeadingOrdinal(row) {
      const headings = state.rows
        .filter((candidate) => candidate.typeLabel === "章节标题" && /^[1-6] 级标题$/.test(String(candidate.lineType || "")))
        .slice()
        .sort((left, right) => left.range.line - right.range.line || left.range.start - right.range.start);
      const index = headings.findIndex((candidate) => candidate.id === row.id);
      return index >= 0 ? index + 1 : undefined;
    }

    function chapterTitlePreview(row) {
      const match = /^([1-6]) 级标题$/.exec(String(row.lineType || ""));
      if (!match) return el("div", previewText(row), "preview-content");
      const level = Number(match[1]);
      const source = String(row.raw || row.preview || "");
      const content = source.replace(/^ {0,3}#{1,6}(?:\s+|$)/, "").trim();
      const ordinal = chapterHeadingOrdinal(row);
      const prefix = state.headingNumberingEnabled !== false && ordinal != null
        ? "(" + String(ordinal).padStart(3, "0") + ") "
        : "";
      return el("h" + level, prefix + content, "chapter-heading-preview");
    }

    function illegalBreakDisplay(row) {
      const previousFull = String(row.previousLineText || "").trimEnd();
      const nextFull = String(row.nextLineText || "").trimStart();
      const previousChars = Array.from(previousFull);
      const nextChars = Array.from(nextFull);
      const previous = previousChars.slice(-10).join("");
      const next = nextChars.slice(0, 10).join("");
      const splitWord = /[-‐‑]$/.test(previousFull) && nextChars.length > 0;
      const mergedFull = splitWord
        ? previousChars.slice(0, -1).join("") + nextFull
        : previousFull + " " + nextFull;
      const mergedChars = Array.from(mergedFull);
      const boundary = splitWord ? Math.max(0, previousChars.length - 1) : previousChars.length + 1;
      const start = Math.max(0, Math.min(boundary - 10, Math.max(0, mergedChars.length - 20)));
      const merged = mergedChars.slice(start, start + 20).join("");
      return { previous, next, merged };
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
          if (rule.key === "embedNumber") {
            const leftNumber = left.row.embedNumber;
            const rightNumber = right.row.embedNumber;
            if (leftNumber == null && rightNumber == null) compared = 0;
            else if (leftNumber == null) compared = 1;
            else if (rightNumber == null) compared = -1;
            else compared = leftNumber - rightNumber;
          }
          if (rule.key === "chapterFile") compared = collator.compare(left.row.chapterFile || "", right.row.chapterFile || "");
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

    function selectedLevelOneHeadings() {
      return sortedRows(rowsForModule()).filter((row) => selected.has(row.id) && row.lineType === "1 级标题");
    }

    function titleTextForChapterFile(candidate) {
      const source = String(candidate.raw || candidate.preview || "").trim();
      return source
        .replace(/^#{1,6}\\s+/, "")
        .replace(/<sup\\b[^>]*>[\\s\\S]*?<\\/sup>/gi, "")
        .replace(/<[^>]+>/g, "")
        .replace(/\\.md$/i, "")
        .replace(/[/\\\\:*?"<>|]/g, " ")
        .replace(/\\s+/g, " ")
        .trim() || "未命名章节";
    }

    function chapterFileParts(candidate) {
      const match = /^(\\d+)\\s+(.+?)(?:\\.md)?$/i.exec(String(candidate.chapterFile || "").trim());
      if (!match) return null;
      return { number: Number.parseInt(match[1], 10), width: match[1].length, title: match[2].replace(/\\.md$/i, "").trim() };
    }

    function recommendedChapterStartNumber() {
      let highest = -1;
      let width = 2;
      for (const row of rowsForModule()) {
        const match = /^(\\d+)\\s+/.exec(String(row.chapterFile || "").trim());
        if (!match) continue;
        highest = Math.max(highest, Number.parseInt(match[1], 10));
        width = Math.max(width, match[1].length);
      }
      if (highest < 0) return "01";
      return String(highest + 1).padStart(width, "0");
    }

    function closeChapterFileModal() {
      document.getElementById("chapter-number-modal")?.remove();
    }

    function setSelectedChapterBoundaryFile() {
      const selectedRows = selectedLevelOneHeadings();
      if (!selectedRows.length) {
        post("showWarning", { message: "请先勾选至少一个 1 级标题行。" });
        return;
      }
      closeChapterFileModal();
      const recommendedStart = recommendedChapterStartNumber();
      const backdrop = document.createElement("div");
      backdrop.className = "modal-backdrop";
      backdrop.id = "chapter-number-modal";
      const modal = document.createElement("div");
      modal.className = "modal";
      const title = el("h2", "设置章节文件");
      const description = el("p", "统一序号会归入同一章节；依次递增会创建独立章节；整体偏移会在现有章节序号上统一加减。");
      const mode = document.createElement("select");
      mode.append(new Option("统一序号", "same"), new Option("从起始序号依次递增", "sequence"), new Option("整体偏移", "offset"));
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "推荐起始编号：" + recommendedStart + "（可修改）";
      input.inputMode = "numeric";
      input.autocomplete = "off";
      const preview = el("p", "");
      const actions = el("div", undefined, "modal-actions");
      const confirm = button("确认", () => {
        input.setCustomValidity("");
        const isOffset = mode.value === "offset";
        const value = input.value.trim() || (isOffset ? "" : recommendedStart);
        if (isOffset && !/^[+-]\\d+$/.test(value)) {
          input.setCustomValidity("请输入 +数字 或 -数字，例如 +2、-3。");
          input.reportValidity();
          input.focus();
          return;
        }
        if (!isOffset && !/^\\d+$/.test(value)) {
          input.setCustomValidity("请输入数字章节序号。");
          input.reportValidity();
          input.focus();
          return;
        }
        if (isOffset) {
          const offset = Number.parseInt(value, 10);
          const invalid = selectedRows.some((row) => {
            const current = chapterFileParts(row);
            return !current || current.number + offset < 0;
          });
          if (invalid) {
            input.setCustomValidity("所选行必须已有数字章节序号，且偏移后序号不能小于 0。");
            input.reportValidity();
            input.focus();
            return;
          }
        }
        closeChapterFileModal();
        postKeepView("assignChapterFiles", {
          ids: selectedRows.map((row) => row.id),
          mode: mode.value,
          value,
        }, { clearSelection: true });
      }, "primary");
      const updatePreview = () => {
        input.setCustomValidity("");
        const isOffset = mode.value === "offset";
        input.placeholder = isOffset
          ? "+数字代表输出序号整体增加；-数字代表输出序号整体减少"
          : "推荐起始编号：" + recommendedStart + "（可修改）";
        input.inputMode = isOffset ? "text" : "numeric";
        const value = input.value.trim() || (isOffset ? "" : recommendedStart);
        if (mode.value === "same") {
          preview.textContent = "章节文件：" + value + " " + titleTextForChapterFile(selectedRows[0]) + ".md（全部选中行）";
          return;
        }
        if (isOffset) {
          if (!/^[+-]\\d+$/.test(value)) {
            preview.textContent = "请输入整体偏移量，例如 +2 或 -3。";
            return;
          }
          const offset = Number.parseInt(value, 10);
          const first = chapterFileParts(selectedRows[0]);
          const last = chapterFileParts(selectedRows[selectedRows.length - 1]);
          if (!first || !last || first.number + offset < 0 || last.number + offset < 0) {
            preview.textContent = "所选标题需要已有有效章节序号，且偏移后不能小于 0。";
            return;
          }
          const firstNumber = String(first.number + offset).padStart(first.width, "0");
          const lastNumber = String(last.number + offset).padStart(last.width, "0");
          preview.textContent = "章节文件：" + firstNumber + " " + first.title + ".md；...；" + lastNumber + " " + last.title + ".md";
          return;
        }
        const last = String(Number.parseInt(value, 10) + selectedRows.length - 1).padStart(value.length, "0");
        preview.textContent = "章节文件：" + value + " " + titleTextForChapterFile(selectedRows[0]) + ".md；...；" + last + " " + titleTextForChapterFile(selectedRows[selectedRows.length - 1]) + ".md";
      };
      input.addEventListener("input", updatePreview);
      mode.addEventListener("change", updatePreview);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          confirm.click();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeChapterFileModal();
        }
      });
      backdrop.addEventListener("click", (event) => {
        if (event.target === backdrop) closeChapterFileModal();
      });
      actions.append(button("取消", () => closeChapterFileModal()), confirm);
      modal.append(title, description, mode, input, preview, actions);
      backdrop.append(modal);
      document.body.append(backdrop);
      updatePreview();
      setTimeout(() => input.focus(), 0);
    }

    function render() {
      captureScroll();
      app.replaceChildren();
      if (state.viewMode === "translationService") {
        app.append(translationServiceSettings());
        return;
      }
      const tabs = el("div", undefined, "tabs");
      const visibleModules = state.selectedFile?.kind === "trans"
        ? ["文本块", "分句", "翻译"]
        : MODULES.filter((moduleName) => moduleName !== "文本块" && moduleName !== "分句" && moduleName !== "翻译");
      for (const moduleName of visibleModules) {
        const tabDefinition = moduleDefinition(moduleName);
        const count = tabDefinition.countKind === "annotationCalibrated" && state.annotationMatchSummary
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
      if (moduleDefinition().regexCard) app.append(regexCard());
      if (moduleDefinition().filter) app.append(filterToolbar());
      if (moduleDefinition().bulkEdit) app.append(bulkToolbar());
      app.append(rowTable(rowsForModule()));
      requestAnimationFrame(() => {
        restoreScroll();
        restoreFocus();
      });
    }

    function translationServiceSettings() {
      const settings = state.translationSettings || {
        service: "deepl",
        exportService: "deepl",
        services: [
          { id: "deepl", label: "DeepL", apiKeyConfigured: false },
          { id: "openai", label: "GPT", apiKeyConfigured: false, model: "gpt-5.4", prompt: "" },
        ],
        sampleText: "The company reported stronger earnings this quarter.",
        test: { phase: "idle", message: "尚未测试。" },
      };
      const services = settings.services || [];
      const panel = el("div", undefined, "settings-panel");
      const card = el("div", undefined, "settings-card");
      card.append(el("h2", "翻译服务"));

      const serviceLabel = el("label", "当前翻译服务");
      const service = document.createElement("select");
      for (const item of services) service.append(new Option(item.label, item.id, false, item.id === settings.service));

      const keyLabel = el("label", "API Key");
      const apiKey = document.createElement("input");
      apiKey.type = "password";
      apiKey.autocomplete = "off";
      const keyStatus = el("div", "", "meta");

      const modelLabel = el("label", "GPT 模型");
      const model = document.createElement("input");
      model.type = "text";
      const promptLabel = el("label", "GPT 翻译提示词");
      const prompt = document.createElement("textarea");

      const sampleLabel = el("label", "测试样本句子");
      const sample = document.createElement("textarea");
      sample.value = settings.sampleText || "The company reported stronger earnings this quarter.";

      const syncServiceFields = () => {
        const current = services.find((item) => item.id === service.value) || services[0] || { id: "deepl", label: "DeepL", apiKeyConfigured: false };
        keyLabel.textContent = current.label + " API Key";
        apiKey.value = "";
        apiKey.placeholder = current.apiKeyConfigured ? "已保存 API Key；留空可继续使用" : "输入 " + current.label + " API Key";
        keyStatus.textContent = current.apiKeyConfigured ? "API Key 已安全保存到宿主密钥存储。" : "尚未保存 API Key。";
        const isOpenAI = current.id === "openai";
        modelLabel.style.display = isOpenAI ? "" : "none";
        model.style.display = isOpenAI ? "" : "none";
        promptLabel.style.display = isOpenAI ? "" : "none";
        prompt.style.display = isOpenAI ? "" : "none";
        if (isOpenAI) {
          model.value = current.model || "gpt-5.4";
          prompt.value = current.prompt || "";
        }
      };
      service.addEventListener("change", syncServiceFields);
      syncServiceFields();

      const actions = el("div", undefined, "settings-actions");
      const payload = () => ({
        service: service.value,
        apiKey: apiKey.value,
        sampleText: sample.value,
        model: model.value,
        prompt: prompt.value,
      });
      const save = button("保存设置", () => post("saveTranslationSettings", payload()));
      const test = button(
        settings.test?.phase === "testing" ? "正在测试…" : "测试",
        () => post("testTranslationService", payload()),
        "primary",
      );
      test.disabled = settings.test?.phase === "testing";
      actions.append(save, test);

      const resultTitle = el("label", "服务器返回信息");
      const result = el("pre", undefined, "test-result " + (settings.test?.phase || "idle"));
      const resultLines = [];
      if (settings.test?.message) resultLines.push(settings.test.message);
      if (settings.test?.statusCode != null) resultLines.push("HTTP " + settings.test.statusCode);
      if (settings.test?.translatedText) resultLines.push("译文：" + settings.test.translatedText);
      if (settings.test?.rawResponse) resultLines.push("原始响应：\\n" + settings.test.rawResponse);
      result.textContent = resultLines.join("\\n\\n") || "尚未测试。";

      card.append(
        serviceLabel, service, keyLabel, apiKey, keyStatus,
        modelLabel, model, promptLabel, prompt,
        sampleLabel, sample, actions, resultTitle, result,
      );
      panel.append(card);
      return panel;
    }

    function filterToolbar() {
      const bar = el("div", undefined, "toolbar");
      const select = document.createElement("select");
      const definition = moduleDefinition();
      const options = definition.filter?.options || [];
      const current = moduleFilters[state.activeModule] || definition.filter?.defaultValue;
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
      const toolbarKind = moduleDefinition().toolbarKind;
      if (toolbarKind === "illegalBreak") {
        const count = state.rows.filter((row) => row.typeLabel === "非法断行").length;
        toolbar.append(
          button("保存标定", () => postKeepView("saveAnnotations"), "primary"),
          button("重新加载标定", () => postKeepView("reloadAnnotations")),
          el("span", "扫描完成 · " + count + " 条疑似 · 候选由正文段落边界自动派生 · 合并/已忽略写入标定", "progress"),
        );
        return toolbar;
      }
      if (toolbarKind === "textBlocks") {
        toolbar.append(el("span", "按 <br> 划分 · 只读派生表", "progress"));
        return toolbar;
      }
      if (toolbarKind === "sentences") {
        toolbar.append(el("span", "非内嵌文本块 · Intl.Segmenter + 例外合并 · 只读派生表", "progress"));
        return toolbar;
      }
      if (toolbarKind === "translation") {
        const settings = state.translationSettings || { service: "deepl", exportService: "deepl", services: [] };
        const services = settings.services || [];
        const progressState = state.translationProgress || { phase: "idle", completed: 0, total: 0, failed: 0 };
        const percent = progressState.total ? Math.round(progressState.completed * 100 / progressState.total) : 0;

        const translateSelect = document.createElement("select");
        for (const item of services) translateSelect.append(new Option(item.label, item.id, false, item.id === settings.service));
        translateSelect.disabled = progressState.phase === "running";
        translateSelect.addEventListener("change", () => postKeepView("setTranslationService", { service: translateSelect.value }));

        const run = button(
          progressState.phase === "running" ? "翻译中…" : progressState.phase === "complete" ? "该服务已完成" : progressState.completed ? "继续翻译" : "开始翻译",
          () => postKeepView("translateCurrentChapter"),
          "primary",
        );
        run.disabled = progressState.phase === "running" || progressState.phase === "complete" || progressState.total === 0;

        const exportSelect = document.createElement("select");
        const exportService = settings.exportService || settings.service || "deepl";
        for (const item of services) exportSelect.append(new Option(item.label, item.id, false, item.id === exportService));
        exportSelect.disabled = progressState.phase === "running";
        exportSelect.addEventListener("change", () => postKeepView("setExportTranslationService", { service: exportSelect.value }));
        const exportReady = progressState.total > 0 && state.rows
          .filter((row) => row.typeLabel === "翻译")
          .every((row) => row.translationResults?.[exportService]?.status === "已翻译");
        const exportCross = button("导出双向互译", () => postKeepView("exportCrossTranslation", { service: exportSelect.value }));
        exportCross.disabled = progressState.phase === "running" || !exportReady;
        exportCross.title = exportReady ? "按所选译文生成 org2trans / trans2org / trans" : "所选服务全部翻译单元完成后可导出";

        const meter = document.createElement("progress");
        meter.className = "translation-progress";
        meter.max = Math.max(progressState.total, 1);
        meter.value = progressState.completed;
        const currentLabel = services.find((item) => item.id === settings.service)?.label || settings.service || "翻译";
        const summary = currentLabel + " " + progressState.completed + "/" + progressState.total + " · " + percent + "%"
          + (progressState.failed ? " · 失败 " + progressState.failed : "")
          + (progressState.current ? " · 当前 " + progressState.current : "");
        toolbar.append(
          el("span", "翻译"), translateSelect, run,
          el("span", "导出译文"), exportSelect, exportCross,
          meter, el("span", summary, "progress"),
        );
        return toolbar;
      }
      if (toolbarKind === "chapterBoundary") {
        toolbar.append(
          button("创建/打开定界工作稿", () => postKeepView("openChapterBoundaryWork"), "primary"),
          button("设置章节文件", () => setSelectedChapterBoundaryFile()),
          button("导出章节", () => postKeepView("exportChapterBoundaryChapters")),
          button("保存标定", () => postKeepView("saveAnnotations")),
        );
      } else if (toolbarKind === "chapterTitle") {
        const numberingLabel = el("label", undefined, "toolbar-check");
        const numbering = document.createElement("input");
        numbering.type = "checkbox";
        numbering.checked = state.headingNumberingEnabled !== false;
        numbering.addEventListener("change", () => postKeepView("setHeadingNumbering", { enabled: numbering.checked }));
        numberingLabel.append(numbering, document.createTextNode("为标题编号"));
        toolbar.append(
          numberingLabel,
          button("创建/打开章节工作稿", () => postKeepView("openChapterWorkingCopy"), "primary"),
          button("按标定导出", () => postKeepView("exportByCalibration")),
          button("导出标定到trans", () => postKeepView("exportCalibrationToTrans")),
          button("保存标定", () => postKeepView("saveAnnotations")),
          button("重新加载标定", () => postKeepView("reloadAnnotations")),
        );
      } else if (toolbarKind === "annotation") {
        const summary = state.annotationMatchSummary;
        toolbar.append(
          button("打开注释订正工作稿", () => postKeepView("openAnnotationWorkingCopy")),
          button("匹配注释对", () => {
            sortRules = defaultSortRules("注释");
            postKeepView("matchAnnotationPairs");
          }, "primary"),
          button("按标定导出", () => postKeepView("exportByCalibration")),
          button("导出标定到trans", () => postKeepView("exportCalibrationToTrans")),
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
        const download = button(running ? "正在下载" : "下载图片到本地", () => postKeepView("downloadImages"));
        download.disabled = running;
        toolbar.append(
          download,
          button("按标定导出", () => postKeepView("exportByCalibration")),
          button("导出标定到trans", () => postKeepView("exportCalibrationToTrans")),
          button("保存标定", () => postKeepView("saveAnnotations"), "primary"),
          button("重新加载标定", () => postKeepView("reloadAnnotations")),
        );
        if (state.imageDownloadProgress) {
          const progress = state.imageDownloadProgress;
          toolbar.append(el("span", progress.current || (progress.completed + "/" + progress.total), "progress"));
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
      for (const value of moduleDefinition().lineTypes) select.append(new Option(value, value));
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
      const definition = moduleDefinition();
      const wrap = el("div", undefined, "table-wrap");
      wrap.addEventListener("scroll", () => {
        scrollByModule[state.activeModule] = { top: wrap.scrollTop, left: wrap.scrollLeft };
        persistViewState();
      }, { passive: true });
      if (!rows.length && definition.tableKind !== "illegalBreak") {
        wrap.append(el("div", "当前模块没有记录。", "empty"));
        return wrap;
      }
      const table = document.createElement("table");
      const head = document.createElement("thead");
      const headRow = document.createElement("tr");
      if (definition.selectable) {
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
        headRow.append(selectCell);
      }
      headRow.append(sortableHeader(definition.tableKind === "illegalBreak" ? "断行位置" : "行号", "line", "line-column"));
      if (definition.tableKind === "illegalBreak") {
        headRow.append(
          sortableHeader("行类型", "lineType"),
          el("th", "上一行"),
          el("th", "下一行"),
          sortableHeader("合并预览", "preview"),
          el("th", "判断"),
        );
      } else if (definition.tableKind === "sentenceDerived" || definition.tableKind === "translation") {
        headRow.append(
          el("th", "文本块"),
          el("th", definition.tableKind === "translation" ? "单元序号" : "句内序号"),
        );
      }
      if (definition.extraColumns.includes("annotationNumber") && ANNOTATION_EXTRA_COLUMNS.includes("注释号")) {
        headRow.append(sortableHeader("注释号", "number", "number-column"));
      }
      if (definition.extraColumns.includes("embedNumber") && EMBED_EXTRA_COLUMNS.includes("序号")) {
        headRow.append(sortableHeader("序号", "embedNumber", "number-column"));
      }
      if (definition.extraColumns.includes("chapterFile") && CHAPTER_BOUNDARY_EXTRA_COLUMNS.includes("章节文件")) {
        headRow.append(sortableHeader("章节文件", "chapterFile", "chapter-file-column"));
      }
      if (definition.tableKind === "illegalBreak") {
        // Dedicated derived-table columns were appended above.
      } else if (definition.tableKind === "translation") {
        headRow.append(sortableHeader("来源类型", "lineType"), sortableHeader("原文", "preview"));
        const services = state.translationSettings?.services || [];
        for (const item of services) headRow.append(el("th", item.label + "译文"));
      } else {
        headRow.append(
          sortableHeader(definition.typeColumnLabel, "lineType"),
          sortableHeader("预览", "preview"),
        );
      }
      head.append(headRow);
      const body = document.createElement("tbody");
      if (!rows.length && definition.tableKind === "illegalBreak") {
        const emptyRow = document.createElement("tr");
        const emptyCell = el("td", "扫描完成：当前章节未发现疑似非法断行。", "empty");
        emptyCell.colSpan = 7;
        emptyRow.append(emptyCell);
        body.append(emptyRow);
      }
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
      const definition = moduleDefinition();
      const row = document.createElement("tr");
      if (candidate.lineType === DELETED) row.classList.add("deleted");
      if (candidate.chapterBoundaryState === "added") row.classList.add("added");
      if (candidate.chapterBoundaryState === "modified") row.classList.add("modified");
      if (candidate.chapterBoundaryState === "deleted") row.classList.add("removed");
      if (definition.tableKind === "translation" && candidate.translationStatus === "失败") row.classList.add("translation-failed");
      const missingNumber = definition.extraColumns.includes("annotationNumber")
        && (candidate.lineType === "注释引用" || candidate.lineType === "注释正文")
        && !String(candidate.annotationNumber || "").trim();
      const missingChapterFile = definition.extraColumns.includes("chapterFile")
        && candidate.lineType === "1 级标题"
        && !String(candidate.chapterFile || "").trim();
      if (missingNumber) row.classList.add("missing-number");
      if (missingChapterFile) row.classList.add("missing-chapter-file");

      if (definition.selectable) {
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
        row.append(checkCell);
      }

      row.append(el("td", definition.tableKind === "illegalBreak"
        ? String(candidate.range.line + 1) + " → " + String((candidate.range.endLine ?? candidate.range.line) + 1)
        : String(candidate.range.line + 1)));

      if (definition.tableKind === "illegalBreak") {
        const typeCell = document.createElement("td");
        const typeSelect = document.createElement("select");
        typeSelect.className = "line-type";
        typeSelect.setAttribute("data-row-id", candidate.id);
        typeSelect.setAttribute("data-field", "lineType");
        for (const value of definition.lineTypes) typeSelect.append(new Option(value, value, false, value === candidate.lineType));
        typeSelect.addEventListener("click", (event) => event.stopPropagation());
        typeSelect.addEventListener("focus", () => rememberFocus(candidate.id, "lineType"));
        typeSelect.addEventListener("change", () => {
          postKeepView("setRowsLineType", { ids: selectedIds(candidate.id), lineType: typeSelect.value }, { clearSelection: true });
        });
        typeCell.append(typeSelect);
        const display = illegalBreakDisplay(candidate);
        const previousCell = el("td", display.previous, "preview");
        const nextCell = el("td", display.next, "preview");
        const mergedCell = el("td", display.merged, "preview");
        const judgement = (candidate.breakConfidence ? candidate.breakConfidence + " · " : "") + (candidate.breakReason || "疑似非法断行");
        const reasonCell = el("td", judgement, "preview-detail");
        mergedCell.addEventListener("click", () => post("locateRow", { id: candidate.id }));
        row.append(typeCell, previousCell, nextCell, mergedCell, reasonCell);
        return row;
      }

      if (definition.tableKind === "sentenceDerived" || definition.tableKind === "translation") {
        row.append(
          el("td", candidate.parentBlockIndex == null ? "" : "B" + String(candidate.parentBlockIndex).padStart(3, "0")),
          el("td", candidate.sentenceIndex == null ? "" : String(candidate.sentenceIndex)),
        );
      }

      if (definition.extraColumns.includes("embedNumber")) {
        row.append(el("td", candidate.embedNumber == null ? "" : String(candidate.embedNumber)));
      }
      if (definition.extraColumns.includes("annotationNumber")) {
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
      if (definition.extraColumns.includes("chapterFile")) {
        const fileCell = document.createElement("td");
        const fileInput = document.createElement("input");
        fileInput.className = "chapter-file" + (missingChapterFile ? " missing" : "");
        fileInput.value = candidate.chapterFile || "";
        fileInput.placeholder = missingChapterFile ? "请分配章节文件" : "章节名称";
        fileInput.title = missingChapterFile ? "一级标题尚未分配章节文件" : "章节文件";
        fileInput.setAttribute("data-row-id", candidate.id);
        fileInput.setAttribute("data-field", "chapterFile");
        fileInput.addEventListener("click", (event) => event.stopPropagation());
        fileInput.addEventListener("focus", () => rememberFocus(candidate.id, "chapterFile"));
        fileInput.addEventListener("change", () => postKeepView("setChapterFile", { ids: selectedIds(candidate.id), chapterFile: fileInput.value }));
        fileCell.append(fileInput);
        row.append(fileCell);
      }

      const typeCell = document.createElement("td");
      if (!definition.editableLineType) {
        typeCell.append(el("span", candidate.lineType || "文本"));
      } else {
        const typeSelect = document.createElement("select");
        typeSelect.className = "line-type";
        typeSelect.setAttribute("data-row-id", candidate.id);
        typeSelect.setAttribute("data-field", "lineType");
        for (const value of definition.lineTypes) typeSelect.append(new Option(value, value, false, value === candidate.lineType));
        typeSelect.addEventListener("click", (event) => event.stopPropagation());
        typeSelect.addEventListener("focus", () => rememberFocus(candidate.id, "lineType"));
        typeSelect.addEventListener("change", () => {
          postKeepView("setRowsLineType", { ids: selectedIds(candidate.id), lineType: typeSelect.value }, { clearSelection: true });
        });
        typeCell.append(typeSelect);
      }

      const previewCell = el("td", undefined, "preview");
      previewCell.append(definition.previewKind === "chapterHeading"
        ? chapterTitlePreview(candidate)
        : el("div", previewText(candidate), "preview-content"));

      if (definition.tableKind === "translation") {
        row.append(typeCell, previewCell);
        const services = state.translationSettings?.services || [];
        for (const item of services) {
          const result = candidate.translationResults?.[item.id];
          const cell = el("td", result?.translatedText || "", "translation-text");
          const status = result?.status || "待翻译";
          if (status === "失败") {
            cell.classList.add("translation-failed");
            cell.append(el("div", "失败", "translation-status preview-detail"));
            if (result?.error) cell.append(el("div", result.error, "preview-detail"));
          }
          row.append(cell);
        }
      } else {
        row.append(typeCell, previewCell);
      }

      if (definition.detailKind === "annotationPair") {
        const status = pair
          ? pair.pairId + " · " + pair.status
          : (missingNumber ? "未配对，请输入注释号" : "未配对");
        const statusClass = missingNumber || (pair && (pair.status === "待补引用" || pair.status === "待补正文"))
          ? "pair-status missing"
          : pair ? "pair-status matched" : "pair-status";
        previewCell.append(el("div", status, statusClass + " preview-detail"));
      }
      if (definition.detailKind === "embedDownload") {
        if (candidate.imageDownloadStatus === "done" && candidate.localPath) {
          previewCell.append(el("div", "下载：已保存 " + candidate.localPath, "preview-detail"));
        } else if (candidate.imageDownloadStatus === "failed") {
          previewCell.append(el("div", "下载失败：" + (candidate.imageDownloadError || "未知错误"), "preview-detail"));
        } else if (candidate.localPath) {
          previewCell.append(el("div", "导出：" + candidate.localPath, "preview-detail"));
        }
      }
      previewCell.addEventListener("click", () => post("locateRow", { id: candidate.id }));
      return row;
    }

    host.onState((nextState) => {
      if (!nextState) return;
      const previousModule = state.activeModule;
      state = nextState;
      if (state.activeModule !== previousModule) {
        sortRules = sanitizeSortRules(sortRulesByModule[state.activeModule]);
        if (!sortRules.length) sortRules = defaultSortRules(state.activeModule);
      }
      render();
    });
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
