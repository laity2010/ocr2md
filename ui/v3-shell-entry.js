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

function scanAndWire() {
  const host = document.querySelector('#workspace .ocr-outline-grid');
  if (host?.v3GridPort) wireGrid(host);
  ensureSqlActions();
}

document.addEventListener('v3-grid-ready', (event) => wireGrid(event.detail?.host));
document.addEventListener('v3-source-ready', () => ensureSqlActions());
document.addEventListener('v3-workspace-verified', (event) => {
  const path = event.detail?.path;
  const actions = ensureSqlActions();
  if (path && actions) {
    void actions.inspectAndLoad(path).catch(() => {});
  }
});

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', scanAndWire, {once: true});
} else {
  queueMicrotask(scanAndWire);
}
