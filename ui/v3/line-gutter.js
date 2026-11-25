/** WP05 · V3 CM6 行号焦点按钮与行级菜单（引用 >+/>- 与原生 PDF 提取文本插入/替换）。
 *
 * 遵循 CM.md 第 2、5 节与 VIEWS.md 第 1 节：
 * 1. 仅当前 CM6 光标所在物理行显示行号操作按钮，其余行保持普通数字；
 * 2. 所有引用增减、提取文本插入/替换均通过同一 CM6 原生行事务写回，保留 Undo/Redo 与 CAS。
 */
import {GutterMarker, gutter} from '@codemirror/view';

class V3LineNumberMarker extends GutterMarker {
  constructor(lineNo, active, onOpen) {
    super();
    this.lineNo = lineNo;
    this.active = active;
    this.onOpen = onOpen;
  }

  eq(other) {
    return (
      other instanceof V3LineNumberMarker &&
      this.lineNo === other.lineNo &&
      this.active === other.active
    );
  }

  toDOM() {
    if (!this.active) {
      const span = document.createElement('span');
      span.className = 'ocr-cm-line-number-label';
      span.textContent = String(this.lineNo);
      return span;
    }
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ocr-cm-line-action-btn';
    btn.textContent = String(this.lineNo);
    btn.setAttribute('aria-label', `第 ${this.lineNo} 行菜单`);
    btn.addEventListener('mousedown', (e) => e.preventDefault());
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.onOpen(btn, this.lineNo);
    });
    return btn;
  }
}

export function createV3LineGutter({getLineIndex, onQuoteAdjust, onExtractText}) {
  let menuEl = null;
  let cleanup = () => {};

  function closeMenu() {
    cleanup();
    cleanup = () => {};
    menuEl?.remove();
    menuEl = null;
  }

  async function openMenu(anchor, lineNo) {
    closeMenu();
    const index = getLineIndex();
    const row = index?.atSourceLine(lineNo);
    if (!row) return;

    const root = document.createElement('div');
    root.className = 'ocr-cm-line-menu';
    root.setAttribute('role', 'menu');
    root.setAttribute('aria-label', `第 ${lineNo} 行操作`);

    const header = document.createElement('div');
    header.className = 'ocr-cm-line-menu-meta';
    header.textContent = `${row.pbs} · L${lineNo}`;
    root.append(header);

    const addItem = (label, handler, disabled = false) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ocr-cm-line-menu-item';
      btn.setAttribute('role', 'menuitem');
      btn.textContent = label;
      btn.disabled = disabled;
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenu();
        handler(row);
      });
      root.append(btn);
      return btn;
    };

    addItem('引用 >+', () => onQuoteAdjust?.(row, 1));
    addItem('引用 >-', () => onQuoteAdjust?.(row, -1), !row.mdLine.startsWith('>'));

    const insertBtn = addItem('提取文本插入', () => onExtractText?.(row, 'insert'), true);
    const replaceBtn = addItem('提取文本替换', () => onExtractText?.(row, 'replace'), true);

    document.body.append(root);
    menuEl = root;

    const rect = anchor.getBoundingClientRect();
    const mRect = root.getBoundingClientRect();
    const left = Math.max(8, Math.min(rect.right + 8, window.innerWidth - mRect.width - 8));
    const below = rect.bottom + 4;
    const top =
      below + mRect.height + 8 <= window.innerHeight ? below : Math.max(8, rect.top - mRect.height - 4);
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;

    const dismiss = (e) => {
      if (!root.contains(e.target) && e.target !== anchor) closeMenu();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        closeMenu();
      }
    };
    document.addEventListener('pointerdown', dismiss, true);
    document.addEventListener('keydown', onKey, true);
    cleanup = () => {
      document.removeEventListener('pointerdown', dismiss, true);
      document.removeEventListener('keydown', onKey, true);
    };

    const pdfPort = document.querySelector('.ocr-preview-pdf-host')?.v3PDFPort;
    if (pdfPort?.readNativeTextForBlock) {
      const nativeText = await pdfPort.readNativeTextForBlock(row.logicalId).catch(() => '');
      const singleLine = String(nativeText || '').replace(/[ \t]*[\r\n]+[ \t]*/g, ' ').trim();
      if (singleLine && menuEl === root) {
        insertBtn.disabled = false;
        replaceBtn.disabled = false;
        insertBtn.onclick = (e) => {
          e.stopPropagation();
          closeMenu();
          onExtractText?.(row, 'insert', singleLine);
        };
        replaceBtn.onclick = (e) => {
          e.stopPropagation();
          closeMenu();
          onExtractText?.(row, 'replace', singleLine);
        };
      }
    }
  }

  return gutter({
    class: 'cm-lineNumbers ocr-v3-line-gutter',
    lineMarker(view, line) {
      const lineNo = view.state.doc.lineAt(line.from).number;
      const focusLineNo = view.state.doc.lineAt(view.state.selection.main.head).number;
      const idx = getLineIndex(view.state);
      const hasRow = Boolean(idx?.atSourceLine(lineNo));
      return new V3LineNumberMarker(lineNo, hasRow && lineNo === focusLineNo, openMenu);
    },
    lineMarkerChange(update) {
      return update.selectionSet || update.docChanged;
    },
  });
}
