/** WP07 · 派生审阅视图适配器注册表（标题 View + 注释配对 View）。
 *
 * 严格遵循 VIEWS.md 第 1–2 节：
 * 1. 所有派生 View 均只读消费轻量行索引与语法派生层，不拥有独立数据真相；
 * 2. 标题 View 严格保持 MD Line、source_line、PBS 前三列顺序，显式 pinned: null；
 * 3. 枚举筛选列统一复用 V1 原生 EnumCheckboxFilter。
 */
import {EnumCheckboxFilter} from '../enum-checkbox-filter.js';
import {createV3SyntaxDerived} from './syntax-derived.js';

export const V3_HEADINGS_COLUMNS = Object.freeze([
  {
    field: 'mdLine',
    headerName: 'MD Line',
    pinned: null,
    flex: 1,
    minWidth: 200,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'source_line',
    headerName: 'source_line',
    pinned: null,
    width: 96,
    minWidth: 72,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'pbs',
    headerName: 'PBS',
    pinned: null,
    width: 96,
    minWidth: 68,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'level',
    headerName: '层级',
    pinned: null,
    width: 74,
    minWidth: 56,
    sortable: false,
    filter: EnumCheckboxFilter,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: false,
  },
  {
    field: 'block_type',
    headerName: 'Type',
    pinned: null,
    width: 112,
    minWidth: 74,
    sortable: false,
    filter: EnumCheckboxFilter,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: false,
  },
]);

export const V3_FOOTNOTES_COLUMNS = Object.freeze([
  {
    field: 'noteId',
    headerName: '注释',
    pinned: null,
    width: 88,
    minWidth: 66,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'roleLabel',
    headerName: '角色',
    pinned: null,
    width: 78,
    minWidth: 60,
    sortable: false,
    filter: EnumCheckboxFilter,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: false,
  },
  {
    field: 'pairStatus',
    headerName: '配对状态',
    pinned: null,
    width: 124,
    minWidth: 92,
    sortable: false,
    filter: EnumCheckboxFilter,
    suppressHeaderMenuButton: true,
    suppressHeaderFilterButton: false,
  },
  {
    field: 'peerSummary',
    headerName: '对端行',
    pinned: null,
    width: 110,
    minWidth: 76,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'source_line',
    headerName: 'source_line',
    pinned: null,
    width: 96,
    minWidth: 72,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'pbs',
    headerName: 'PBS',
    pinned: null,
    width: 96,
    minWidth: 68,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
  {
    field: 'mdLine',
    headerName: 'MD Line',
    pinned: null,
    flex: 1,
    minWidth: 180,
    sortable: false,
    suppressHeaderMenuButton: true,
  },
]);

/** 创建 WP07 派生视图适配器映射（每个路由器实例独立持有修订缓存）。 */
export function createV3DerivedViewAdapters() {
  const syntax = createV3SyntaxDerived();

  return Object.freeze({
    headings: Object.freeze({
      id: 'headings',
      label: '标题',
      columns: V3_HEADINGS_COLUMNS,
      resetColumnState: true,
      focusBy: 'sourceLine',
      buildRows(srcPort, {showAllPages, currentPage}) {
        const lineIndex = srcPort?.getLineIndex?.();
        if (!lineIndex) return [];
        const all = syntax.getHeadings(lineIndex);
        return showAllPages ? [...all] : all.filter((r) => r.p === currentPage);
      },
    }),
    footnotes: Object.freeze({
      id: 'footnotes',
      label: '注释配对',
      columns: V3_FOOTNOTES_COLUMNS,
      resetColumnState: true,
      focusBy: 'sourceLine',
      buildRows(srcPort, {showAllPages, currentPage}) {
        const lineIndex = srcPort?.getLineIndex?.();
        if (!lineIndex) return [];
        const all = syntax.getFootnotes(lineIndex);
        return showAllPages ? [...all] : all.filter((r) => r.p === currentPage);
      },
    }),
  });
}
