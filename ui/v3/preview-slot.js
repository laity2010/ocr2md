/** WP05 · V3 共用预览槽位与四窗切分生命周期（单一 PDFViewer 实例不重建）。
 *
 * 遵循 VIEWS.md 第 2 节：
 * 默认三窗下预览下拉默认选中 PDF；手动勾选「切分」仅把同一 PDF DOM 与工具栏
 * 搬移至独立四窗，取消勾选后无损迁回，绝不重建 PDFViewer 或重新下载 PDF。
 */
import {mountV3PDF} from './pdf-viewer.js';

export function mountV3PreviewSlot({pane, mdScroller, modeSelect, pdfSurface, pdfTools, pdfSlot}) {
  if (pdfSlot.preview) throw Error('V3 PDF 预览槽位已挂载');
  const pdf = mountV3PDF(pdfSurface, {toolbar: pdfTools});
  const pdfOption = modeSelect.querySelector('option[value="pdf"]');
  const toolbar = pane.querySelector('.ocr-preview-switchbar');
  let disposed = false;

  function setMode(next) {
    if (disposed) return false;
    if (next === 'pdf' && (pdfSlot.detached || !pdfSurface.v3PDFPort)) {
      modeSelect.value = 'md';
      return false;
    }
    if (next !== 'md' && next !== 'pdf') return false;
    pane.dataset.previewMode = next;
    modeSelect.value = next;
    pdfTools.hidden = next !== 'pdf';
    pdfSurface.setAttribute('aria-hidden', String(next !== 'pdf' && !pdfSlot.detached));
    if (next === 'pdf') pdf.layout();
    return true;
  }

  function setSplit(enabled) {
    if (pdfOption) pdfOption.disabled = Boolean(enabled);
    if (enabled) {
      setMode('md');
      if (pdfSlot.detached) {
        pdfTools.hidden = false;
        pdfSurface.setAttribute('aria-hidden', 'false');
      }
    } else {
      setMode(modeSelect.value);
    }
  }

  const preview = Object.freeze({
    surface: pdfSurface,
    tools: pdfTools,
    restore() {
      pane.append(pdfSurface);
      toolbar.append(pdfTools);
      pdf.layout();
    },
    setSplit,
    setMode,
  });

  const onChange = () => setMode(modeSelect.value);
  modeSelect.addEventListener('change', onChange);
  pdfSlot.preview = preview;
  pdfSlot.current = pdf;
  setSplit(false);

  return Object.freeze({
    layout() {
      pdf.layout();
    },
    dispose() {
      disposed = true;
      modeSelect.removeEventListener('change', onChange);
      if (pdfSlot.detached) {
        pdfSlot.detached = null;
        preview.restore();
      }
      pdfSlot.preview = null;
      pdfSlot.current = null;
      pdf.dispose();
    },
  });
}

export function mountV3DetachedPDF({surface, actions, pdfSlot}) {
  const preview = pdfSlot.preview;
  if (!preview || pdfSlot.detached) throw Error('V3 独立 PDF 切分槽位不可用');
  surface.replaceWith(preview.surface);
  actions.replaceChildren(preview.tools);
  pdfSlot.detached = {surface: preview.surface, actions};
  preview.setSplit(true);
  pdfSlot.current?.layout();

  return Object.freeze({
    layout() {
      pdfSlot.current?.layout();
    },
    dispose() {
      if (pdfSlot.detached?.surface !== preview.surface) return;
      pdfSlot.detached = null;
      preview.restore();
      preview.setSplit(false);
      pdfSlot.current?.layout();
    },
  });
}
