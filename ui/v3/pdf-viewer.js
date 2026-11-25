/** WP05 · V3 PDF 原文预览适配器：直接复用 V1 mountLabOcrPdf 与 layoutPbsLabels。
 *
 * 遵循 VIEWS.md 第 1、2 节：
 * 1. 绝不自建第二套 PDF.js 或覆写 V1 缩放/手势/多轨标签逻辑；
 * 2. 仅从 v3SourcePort.getStructure() 与 getDoc() 读取权威结构与空内容状态（Zero Shadow Cache）；
 * 3. 拖拽回调直接触发 v3SourcePort.applyStructureMove(intent)。
 */
import {mountLabOcrPdf} from '../lab-ocr/pdf-viewer.js';
import {focusV3LogicalBlock} from './pane-focus.js';

const API_BASE = '/labs/lab-ocr-v3/api/mineru-base/';

export function mountV3PDF(host, {toolbar, fetcher = fetch, onStatus} = {}) {
  toolbar ??= host.closest('.ocr-detached-pdf-pane')?.querySelector('.ocr-detached-pdf-tools');
  if (!toolbar) throw Error('V3 PDF 工具栏容器缺失');

  let native = null;
  let pdfMap = null;
  let byId = new Map();
  let workspacePath = '';
  let disposed = false;
  let ready = false;
  let generation = 0;
  let pendingMeasure = null;
  let currentSourceLine = null;

  const getSourcePort = () => document.querySelector('#workspace #editor')?.v3SourcePort || null;

  const publishStatus = (text, kind = 'info') => {
    if (typeof onStatus === 'function') {
      onStatus(text, kind);
    } else {
      document.dispatchEvent(new CustomEvent('v3-source-status', {detail: {message: text, kind}}));
    }
  };

  function clear() {
    ++generation;
    pendingMeasure?.(false);
    pendingMeasure = null;
    const old = native;
    native = null;
    pdfMap = null;
    byId = new Map();
    workspacePath = '';
    ready = false;
    old?.dispose();
    toolbar.replaceChildren();
    host.replaceChildren();
  }

  function measurable() {
    return new Promise((resolve) => {
      const scroller = host.querySelector('.lab-ocr-pdf-scroller');
      if (!scroller) {
        resolve(false);
        return;
      }
      if (scroller.clientWidth >= 80 && scroller.clientHeight >= 50) {
        resolve(true);
        return;
      }
      let observer = null;
      const finish = (ok) => {
        observer?.disconnect();
        if (pendingMeasure === finish) pendingMeasure = null;
        resolve(ok);
      };
      pendingMeasure = finish;
      observer = new ResizeObserver(() => {
        if (scroller.clientWidth >= 80 && scroller.clientHeight >= 50) finish(true);
      });
      observer.observe(scroller);
    });
  }

  function emptyLogicalIdsFromSource() {
    const port = getSourcePort();
    if (!port) return [];
    const doc = port.getDoc();
    const struct = port.getStructure();
    const emptyIds = [];
    for (const b of struct.blocks) {
      if (doc.sliceString(b.from, b.to).replace(/\n+$/, '') === '') {
        emptyIds.push(b.logicalId);
      }
    }
    return emptyIds;
  }

  function syncTextEmpty() {
    if (!ready || !native || !pdfMap) return false;
    native.setEmptyMdBlocks(emptyLogicalIdsFromSource());
    return true;
  }

  function buildOverlayForPage(pageNum) {
    if (!pdfMap) return null;
    const pageIndex = pageNum - 1;
    const pageSize = pdfMap.pageSizes?.[pageIndex];
    if (!Array.isArray(pageSize)) return null;
    const port = getSourcePort();
    const structBlocks = port?.getStructure()?.blocks;
    const structById = structBlocks ? new Map(structBlocks.map((b) => [b.logicalId, b])) : null;

    const boxes = [];
    for (const cover of pdfMap.covers || []) {
      if (cover.physicalPageIndex !== pageIndex) continue;
      const live = structById?.get(cover.logicalId);
      const pbs = live ? `p${live.p}b${live.b}s${live.s}` : cover.pbs;
      const parentId = live ? live.parentId : cover.parentId;
      boxes.push({
        blockId: String(cover.logicalId),
        parentId: parentId == null ? null : String(parentId),
        pbs,
        bbox: cover.bbox,
        empty: cover.empty,
      });
    }
    return {pageSize, boxes};
  }

  function syncBlockGroups() {
    if (!ready || !native) return;
    const port = getSourcePort();
    const blocks = port?.getStructure()?.blocks || [];
    const blockGroups = blocks.map((b) => ({
      blockId: String(b.logicalId),
      parentId: b.parentId == null ? null : String(b.parentId),
      pbs: `p${b.p}b${b.b}s${b.s}`,
      page: (byId.get(b.logicalId)?.physicalPageIndex ?? b.p) + 1,
    }));
    native.setOverlays({
      level: 'block',
      loadPage: async (pageNum) => buildOverlayForPage(pageNum),
      blockGroups,
      onBlockSelect: ({id}) => {
        const lid = Number(id);
        if (Number.isSafeInteger(lid)) {
          focusV3LogicalBlock(lid, {source: 'pdf', reveal: true});
        }
      },
      onBlockDragIntent: async (intent) => {
        const srcPort = getSourcePort();
        if (!srcPort?.applyStructureMove) return;
        try {
          const moved = srcPort.applyStructureMove({
            sourceBlockId: Number(intent.sourceBlockId),
            targetBlockId: Number(intent.targetBlockId),
            placement: intent.placement,
          });
          if (moved?.unchanged) {
            publishStatus('已在目标位置', 'info');
          } else {
            syncBlockGroups();
            syncTextEmpty();
          }
        } catch (err) {
          publishStatus('结构移动被拒绝：' + (err?.message || err), 'warning');
        }
      },
    });
  }

  async function readNativeTextForBlock(logicalId) {
    const id = Number(logicalId);
    if (!Number.isSafeInteger(id) || !ready || disposed || !native || !pdfMap) return '';
    const cover = byId.get(id);
    if (!cover) return '';
    const page = cover.physicalPageIndex + 1;
    const pageSize = pdfMap.pageSizes?.[cover.physicalPageIndex];
    if (!Array.isArray(pageSize)) return '';
    return native.readNativeTextInBox({page, bbox: cover.bbox, pageSize});
  }

  async function loadWorkspace(workspace) {
    if (!workspace || workspace === workspacePath) return;
    clear();
    workspacePath = workspace;
    const myGen = ++generation;

    native = mountLabOcrPdf({
      surface: host,
      toolbar,
      onStatus: publishStatus,
      onExtractText: ({id}) => {
        document.dispatchEvent(
          new CustomEvent('v3-pdf-extract-text', {detail: {logicalId: Number(id)}}),
        );
      },
    });

    const q = new URLSearchParams({workspace}).toString();
    const mapRes = await fetcher(`${API_BASE}pdf-map?${q}`, {
      credentials: 'same-origin',
      cache: 'no-store',
    });
    if (!mapRes.ok || disposed || myGen !== generation) return;
    pdfMap = await mapRes.json();
    byId = new Map((pdfMap.covers || []).map((c) => [c.logicalId, c]));

    const canMeasure = await measurable();
    if (!canMeasure || disposed || myGen !== generation) return;

    await native.loadPdf(`${API_BASE}pdf?${q}`);
    if (disposed || myGen !== generation) return;
    ready = true;
    syncBlockGroups();
    syncTextEmpty();
  }

  const onSourceUpdated = (event) => {
    const type = event.detail?.type;
    if (!ready) return;
    if (type === 'structureMoved') {
      syncBlockGroups();
    }
    syncTextEmpty();
  };

  const onFocusChanged = (event) => {
    const detail = event.detail;
    if (!ready || !native || !detail || detail.source === 'pdf') return;
    const cover = byId.get(detail.logicalId);
    if (!cover) return;
    native.focusBlock({
      id: String(detail.logicalId),
      page: cover.physicalPageIndex + 1,
      reveal: detail.reveal !== false,
    });
  };

  document.addEventListener('v3-source-updated', onSourceUpdated);
  document.addEventListener('v3-focus-changed', onFocusChanged);

  const port = Object.freeze({
    getState: () => ({ready, workspace: workspacePath, sourceLine: currentSourceLine}),
    loadWorkspace,
    readNativeTextForBlock,
    focusBlock(logicalId, reveal = true) {
      const cover = byId.get(Number(logicalId));
      if (!ready || !native || !cover) return false;
      return native.focusBlock({
        id: String(logicalId),
        page: cover.physicalPageIndex + 1,
        reveal,
      });
    },
    layout() {
      native?.layout?.();
    },
  });

  host.v3PDFPort = port;

  return {
    layout() {
      native?.layout?.();
    },
    dispose() {
      disposed = true;
      document.removeEventListener('v3-source-updated', onSourceUpdated);
      document.removeEventListener('v3-focus-changed', onFocusChanged);
      delete host.v3PDFPort;
      clear();
    },
  };
}
