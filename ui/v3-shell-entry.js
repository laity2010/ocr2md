/** V3 工作台入口：挂载 AG 双投影路由、V1 原生 EnumCheckboxFilter 与 SQL 安全导入。
 * 保持 ui/frame/* 逐字节不变，遵循 VIEWS.md 第 1–2 节。
 */
import './ag-enum-filter-shared.css';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';
import {mountV3AgRouter} from './v3/ag-router.js';
import {mountV3SqlActions} from './v3/sql-actions.js';

export const V3_SHELL_COLUMNS = Object.freeze([
  {
    field: 'pbs',
    headerName: 'PBS',
    pinned: 'left',
    width: 110,
    minWidth: 72,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'block_type',
    headerName: 'Type',
    width: 120,
    minWidth: 78,
    sortable: false,
    filter: EnumCheckboxFilter,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: false,
  },
  {
    field: 'md_block',
    headerName: 'MD Block',
    flex: 1,
    minWidth: 180,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
]);

let agRouter = null;
let sqlActions = null;
let verifiedWorkspacePath = '';

function reportV3Status(message, kind = 'info') {
  document.dispatchEvent(new CustomEvent('v3-status', {detail: {message, kind}}));
}

function getSourcePort() {
  return document.querySelector('#workspace #editor')?.v3SourcePort || null;
}

function wireGrid(host) {
  const port = host?.v3GridPort;
  if (!port || host.dataset.v3ShellWired === '1') return;
  host.dataset.v3ShellWired = '1';
  port.setColumns(V3_SHELL_COLUMNS.map((col) => ({...col})));

  const toolbarHost = host.closest('.ocr-outline-pane')?.querySelector('.ocr-ag-toolbar');
  agRouter = mountV3AgRouter({
    gridHost: host,
    toolbarHost,
    getSourcePort,
  });
  host.v3AgRouter = agRouter;
}

function ensureSqlActions() {
  if (sqlActions) return sqlActions;
  const sourceToolbar = document.querySelector('#workspace .ocr-source-file-toolbar');
  if (!sourceToolbar) return null;
  sqlActions = mountV3SqlActions({
    toolbarHost: sourceToolbar,
    onStatus: reportV3Status,
    onLoaded: async (snapshot, workspace) => {
      const sourcePort = getSourcePort();
      if (sourcePort) {
        await sourcePort.loadSnapshot(snapshot, {workspace});
      }
      const pdfPort = document.querySelector('.ocr-preview-pdf-host')?.v3PDFPort;
      if (pdfPort) {
        void pdfPort.loadWorkspace(workspace);
      }
    },
  });
  return sqlActions;
}

function ensureSettingsBridge() {
  const settingsToolbar = document.querySelector('#settings-workspace .ocr-source-file-toolbar');
  if (!settingsToolbar || settingsToolbar.querySelector('.ocr-v3-enter-workspace-btn')) return;
  const enterBtn = document.createElement('button');
  enterBtn.type = 'button';
  enterBtn.className = 'ocr-v3-enter-workspace-btn';
  enterBtn.textContent = '进入 V3 工作台';
  enterBtn.title = '切换至 V3 工作台并查看/生成 ocr2md.v3.sqlite';
  enterBtn.style.cssText = 'margin-left:8px;padding:2px 10px;font-size:12px;cursor:pointer;';
  enterBtn.addEventListener('click', () => {
    document.dispatchEvent(new Event('v3-show-frame'));
    queueMicrotask(() => {
      const actions = ensureSqlActions();
      if (verifiedWorkspacePath && actions) {
        void actions.inspectAndLoad(verifiedWorkspacePath).catch(() => {});
      }
    });
  });
  const undoGroup = settingsToolbar.querySelector('.ocr-source-undo-redo');
  if (undoGroup) {
    settingsToolbar.insertBefore(enterBtn, undoGroup);
  } else {
    settingsToolbar.append(enterBtn);
  }
}

function scanAndWire() {
  const host = document.querySelector('#workspace .ocr-outline-grid');
  if (host?.v3GridPort) wireGrid(host);
  ensureSqlActions();
  ensureSettingsBridge();
}

document.addEventListener('v3-grid-ready', (event) => wireGrid(event.detail?.host));
document.addEventListener('v3-source-ready', () => {
  const actions = ensureSqlActions();
  if (verifiedWorkspacePath && actions && !actions.getState().workspace) {
    void actions.inspectAndLoad(verifiedWorkspacePath).catch(() => {});
  }
});
document.addEventListener('v3-workspace-verified', (event) => {
  verifiedWorkspacePath = String(event.detail?.path || '');
  ensureSettingsBridge();
  const actions = ensureSqlActions();
  if (verifiedWorkspacePath && actions) {
    void actions.inspectAndLoad(verifiedWorkspacePath).catch(() => {});
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scanAndWire, {once: true});
} else {
  queueMicrotask(scanAndWire);
}
