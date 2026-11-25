/** WP06 · 统一 AG Grid 双投影路由器（逻辑块审阅 + 通用 MD Line 行级投影）。
 *
 * 严格遵循 VIEWS.md 第 1、2 节与 COMM.md：
 * 1. 全工作台共用同一 AG Grid 实例与 V1 原生 EnumCheckboxFilter；
 * 2. 纯焦点切换仅调用原生 focusRow() 单行选中 API，严禁重设 rowData / columnDefs；
 * 3. 可见文本自适应列宽（PBS、Type），尊重用户手动拖动列宽不被自动拟合覆盖。
 */
import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import {focusV3LogicalBlock} from './pane-focus.js';
import {createV3DerivedViewAdapters} from './view-adapters.js';

export const V3_LOGICAL_COLUMNS = Object.freeze([
  {
    field: 'pbs',
    headerName: 'PBS',
    pinned: 'left',
    width: 110,
    minWidth: 68,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'block_type',
    headerName: 'Type',
    width: 120,
    minWidth: 74,
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
  {
    field: 'logical_id',
    headerName: 'ID',
    width: 82,
    minWidth: 60,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
]);

export const V3_MDLINE_COLUMNS = Object.freeze([
  {
    field: 'mdLine',
    headerName: 'MD Line',
    flex: 1,
    minWidth: 180,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'sourceLine',
    headerName: '行号',
    width: 74,
    minWidth: 56,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'pbs',
    headerName: 'PBS',
    width: 96,
    minWidth: 68,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'lineOffset',
    headerName: '偏移',
    width: 68,
    minWidth: 52,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'blockType',
    headerName: 'Type',
    width: 116,
    minWidth: 74,
    sortable: false,
    filter: EnumCheckboxFilter,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: false,
  },
]);

function measureMaxTextWidth(values, font = '13px "OCR2MD Sarasa", monospace') {
  const canvas = measureMaxTextWidth._canvas || (measureMaxTextWidth._canvas = document.createElement('canvas'));
  const ctx = canvas.getContext('2d');
  if (!ctx) return 96;
  ctx.font = font;
  let max = 0;
  for (const val of values) {
    const w = ctx.measureText(String(val ?? '')).width;
    if (w > max) max = w;
  }
  return Math.ceil(max);
}

/** 挂载统一 AG Grid 双投影路由器至 #workspace .ocr-outline-pane。 */
export function mountV3AgRouter({gridHost, toolbarHost, getSourcePort}) {
  const port = gridHost?.v3GridPort;
  if (!port) return null;

  const derivedAdapters = createV3DerivedViewAdapters();
  let currentViewMode = 'logical'; // 'logical' | 'mdline' | 'headings' | 'footnotes'
  let showAllPages = false;
  let currentPage = 0;
  let activeColsKey = '';
  const userResizedCols = new Set();

  // 在 AG 工具栏中注入「全部」勾选与「视图模式」选择器，不破坏原有控件
  const controls = document.createElement('div');
  controls.className = 'ocr-v3-ag-controls';
  controls.style.cssText = 'display:inline-flex;align-items:center;gap:8px;margin-left:auto;';

  const allLabel = document.createElement('label');
  allLabel.className = 'ocr-v3-ag-all-toggle';
  allLabel.style.cssText = 'display:inline-flex;align-items:center;gap:4px;font-size:12px;cursor:pointer;';
  const allCheckbox = document.createElement('input');
  allCheckbox.type = 'checkbox';
  allCheckbox.checked = showAllPages;
  allCheckbox.setAttribute('aria-label', '显示全部逻辑页');
  allLabel.append(allCheckbox, document.createTextNode('全部'));

  const viewSelect = document.createElement('select');
  viewSelect.className = 'ocr-v3-ag-view-select';
  viewSelect.setAttribute('aria-label', 'AG 投影视图');
  viewSelect.add(new Option('逻辑块', 'logical'));
  viewSelect.add(new Option('MD Line', 'mdline'));
  for (const adapter of Object.values(derivedAdapters)) {
    viewSelect.add(new Option(adapter.label, adapter.id));
  }
  viewSelect.value = currentViewMode;

  controls.append(allLabel, viewSelect);
  toolbarHost?.append(controls);

  function fitVisibleColumns(rows, colDefs) {
    if (!port.setColumnWidths || !Array.isArray(rows) || rows.length === 0) return;
    const widths = [];
    for (const col of colDefs) {
      if (userResizedCols.has(col.field)) continue;
      if (col.field === 'pbs') {
        const w = measureMaxTextWidth(['PBS', ...rows.slice(0, 300).map((r) => r.pbs)]);
        widths.push({key: 'pbs', newWidth: Math.max(68, Math.min(148, w + 26))});
      } else if (col.field === 'block_type' || col.field === 'blockType' || col.field === 'pairStatus') {
        const w = measureMaxTextWidth([col.headerName || 'Type', ...rows.slice(0, 300).map((r) => r[col.field])]);
        // 额外预留原生过滤按钮宽度 38px
        widths.push({key: col.field, newWidth: Math.max(78, Math.min(200, w + 46))});
      }
    }
    if (widths.length > 0) {
      port.setColumnWidths(widths);
    }
  }

  function resolveViewSpec(mode) {
    if (mode === 'mdline') {
      return {id: 'mdline', columns: V3_MDLINE_COLUMNS, resetColumnState: true, focusBy: 'sourceLine'};
    }
    if (derivedAdapters[mode]) {
      return derivedAdapters[mode];
    }
    return {id: 'logical', columns: V3_LOGICAL_COLUMNS, resetColumnState: true, focusBy: 'logical_id'};
  }

  function buildRows() {
    const srcPort = getSourcePort();
    if (!srcPort) return [];
    const struct = srcPort.getStructure();
    if (!struct || struct.blocks.length === 0) return [];

    if (derivedAdapters[currentViewMode]) {
      return derivedAdapters[currentViewMode].buildRows(srcPort, {showAllPages, currentPage});
    }

    if (currentViewMode === 'mdline') {
      const lineRows = srcPort.getLineIndex().rows;
      return showAllPages ? lineRows : lineRows.filter((r) => r.p === currentPage);
    }

    const doc = srcPort.getDoc();
    const filtered = showAllPages ? struct.blocks : struct.blocks.filter((b) => b.p === currentPage);
    return filtered.map((b) => ({
      logical_id: b.logicalId,
      base_blockid: b.baseBlockId,
      parent_id: b.parentId,
      logical_order: b.logicalOrder,
      pbs: `p${b.p}b${b.b}s${b.s}`,
      block_type: b.blockType,
      md_block: doc.sliceString(b.from, b.to).replace(/\n+$/, ''),
      p: b.p,
      b: b.b,
      s: b.s,
    }));
  }

  function renderProjection({forceColumns = false} = {}) {
    const spec = resolveViewSpec(currentViewMode);
    const colDefs = spec.columns;
    if (forceColumns || activeColsKey !== currentViewMode) {
      // 先清空列定义，彻底销毁前一视图残留的列实例与 pinned/列序状态（符合 VIEWS.md 第 2 节）
      port.setColumns([]);
      port.setColumns(colDefs.map((c) => ({...c})));
      if (spec.resetColumnState) {
        port.resetColumnState?.();
        port.applyColumnState?.({
          state: colDefs.map((c) => ({colId: c.field, pinned: c.pinned ?? null})),
          applyOrder: true,
        });
      }
      activeColsKey = currentViewMode;
    }
    const rows = buildRows();
    port.setRows(rows);
    fitVisibleColumns(rows, colDefs);
  }

  function focusMatchingRow(logicalId, sourceLine) {
    const spec = resolveViewSpec(currentViewMode);
    if (spec.focusBy === 'sourceLine' && sourceLine != null) {
      if (port.focusRow('sourceLine', sourceLine)) return true;
      return port.focusRow('logicalId', logicalId);
    }
    return port.focusRow('logical_id', logicalId);
  }

  const unsubResize = port.onColumnResized?.((event) => {
    if (event?.finished && event?.source === 'uiColumnResized') {
      const colId = event.column?.getColId?.();
      if (colId) userResizedCols.add(colId);
    }
  });

  const unsubClick = port.onRowClicked?.((event) => {
    const data = event?.data;
    if (!data) return;
    const lid = data.logicalId ?? data.logical_id;
    const line = data.sourceLine ?? data.source_line ?? null;
    if (lid != null) {
      focusV3LogicalBlock(lid, {source: 'ag', sourceLine: line, reveal: true});
    }
  });

  const onAllToggle = () => {
    showAllPages = allCheckbox.checked;
    renderProjection();
  };
  const onViewChange = () => {
    const val = viewSelect.value;
    currentViewMode = val === 'mdline' || derivedAdapters[val] ? val : 'logical';
    renderProjection({forceColumns: true});
  };
  allCheckbox.addEventListener('change', onAllToggle);
  viewSelect.addEventListener('change', onViewChange);

  const onSourceUpdated = (event) => {
    const type = event.detail?.type;
    if (type === 'loaded') {
      const blocks = getSourcePort()?.getStructure()?.blocks;
      if (blocks?.length) {
        currentPage = blocks[0].p;
      }
      renderProjection({forceColumns: true});
    } else if (type === 'docChanged' || type === 'structureMoved') {
      renderProjection();
    }
  };

  // 纯焦点切换护栏：同页或全量模式下只调用 focusRow()，绝不重设 rowData/columnDefs
  const onFocusChanged = (event) => {
    const detail = event.detail;
    if (!detail || detail.source === 'ag') return;
    const block = getSourcePort()?.getStructure()?.blocks?.find((b) => b.logicalId === detail.logicalId);
    if (!block) return;
    if (!showAllPages && block.p !== currentPage) {
      currentPage = block.p;
      renderProjection();
    }
    focusMatchingRow(detail.logicalId, detail.sourceLine);
  };

  document.addEventListener('v3-source-updated', onSourceUpdated);
  document.addEventListener('v3-focus-changed', onFocusChanged);

  return Object.freeze({
    getState: () => ({viewMode: currentViewMode, showAllPages, currentPage, userResizedCols: Array.from(userResizedCols)}),
    setViewMode(mode) {
      viewSelect.value = mode === 'mdline' || derivedAdapters[mode] ? mode : 'logical';
      onViewChange();
    },
    setShowAll(enabled) {
      allCheckbox.checked = Boolean(enabled);
      onAllToggle();
    },
    refresh: () => renderProjection(),
    dispose() {
      unsubResize?.();
      unsubClick?.();
      allCheckbox.removeEventListener('change', onAllToggle);
      viewSelect.removeEventListener('change', onViewChange);
      document.removeEventListener('v3-source-updated', onSourceUpdated);
      document.removeEventListener('v3-focus-changed', onFocusChanged);
      controls.remove();
    },
  });
}
