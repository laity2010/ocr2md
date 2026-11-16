# Lab OCR · four-pane location and scroll contract

Scope: experimental `lab-ocr`, not a Main feature or a second document store.

## Roles and single authority

- CM6 MD StateField owns the loaded Markdown document and its row identities. Block CM6 StateField owns reviewed block relationships. SQLite is persistence only.
- Main's `ui/view-store.js` Zustand Vanilla singleton transports one ephemeral `labFocusTarget` via `publishLabFocus`. It stores no document bytes, HTML, AG rows, PDF geometry or view instances.
- `ui/lab-ocr/four-pane-location.js:resolveReviewLocation` resolves stable `LineID` / `BlockID` into the current MD line, reviewed Block page and display-only PBS. Unmapped source lines never receive an invented page; PDF-only blocks never receive invented MD rows.

## Public messages

`publishLabFocus({origin, intent, lineId, blockId, lineNo, page, pbs})`

- `origin`: `ag`, `cm6`, `preview`, `pdf`.
- `intent`: `click` or `edit`. Click requests source/preview/PDF reveal; edit updates selection and highlights without stealing scroll from the editor.
- IDs: nullable stable LineID (string), BlockID (integer). `lineNo` (1-based) and `page` (1-based) are derived, not keys. PBS is mutable display text.
- `sequence`: strictly increasing in `viewStore.labFocusTarget`, including repeated clicks. Subscribers ignore messages whose object is unchanged.
- **Only user-originated interactions publish.** Applying a message may select, reveal or highlight panes, but MUST NOT publish a second event. CM6 programmatic dispatch is excluded from user-selection callbacks.

## Lab Frame public ports and subscriptions

- `setMdPreviewNavigation(callback)` accepts click-derived source lines and `null` on disposal.
- `highlightMdPreview(lineNo,{reveal})` marks precisely mapped rendered blocks; absent anchors receive no fabricated preview highlight.
- `highlightMdSource(lineNo,{reveal})` paints an orange CM6 line decoration without changing document content/selection.
- `selectMdLine(lineId)` selects the currently AG-visible row without clearing filters and marks the CM6 table-row selection without transferring keyboard focus.
- `setSqlPdfPage(page)` preserves the AG page checkbox and other active filters.
- `focusPdfBlock({id,page,reveal})` uses the PDF viewer's existing stable BlockID API and its parent/child highlights. `clearPdfFocus()` removes stale PDF highlight for unmapped MD rows; no overlay geometry or SQL changes.
- `clearMdAgSelection()` clears stale AG selection for hidden/absent rows while leaving the full filter model untouched.
- Main's `createScrollSync` continues to coordinate high-frequency CM6 and MD preview scroll using Markdown renderer `data-source-start/end` anchors, without broadcasting every scroll pixel to PDF or AG. PDF pagechanging already follows AG page filter through `onPageChange`.

## Shared review-focus presentation

The Lab OCR root `.ocr-review-focus-unified` opts into `ui/lab-ocr/focus-theme.css`.
Every directly focused object uses a solid 2px `#ffd46c` edge and `rgba(231,183,83,.20)` fill; the AG row, CM6 source line, Markdown block and PDF geometry use one pair of CSS custom properties. This is *not* hover or keyboard-cell focus. PDF family/descendant highlights retain their softer amber treatment, whereas unselected PDF geometry continues to honor the global overlay-opacity setting. The PDF selected geometry is outside that opacity fade, so its color is not artificially weaker than the other panes. PDF PBS labels retain the Main parent/child base palette.

## Acceptance / evidence

`tests/lab-ocr-four-pane-location.test.mjs`: pure mapping + message contract; `tests/lab-ocr-md-full-source.browser.test.mjs`: four directions in a real Chromium and iPad WebKit browser, persistent highlights, PDF page transition, AG filter preservation and CM6/SQLite save/reload. `tests/lab-ocr-ag-pbs-page.browser.test.mjs` protects existing Block AG page filtering and all-pages switch.

## 外部窗口定位时源码光标跟随块首（2026-11-16）

- 用户点击 AG 的 MD 行、PDF Block 标签、Markdown 预览的源元素后，仍使用既有 `publishLabFocus` 的单向事件和稳定 BlockID / LineID；消息处理器 `sourceBlockStartLine(target, mdRows)` 根据目标 BlockID 返回**该逻辑块第一条实际 MD 物理行**的 1-based 行号，光标移动到这行的 `from`（列 0）。AG 选中的可能是块内后续行，但源码光标统一归位块首。不改变原有其他三窗高亮、AG 当前过滤、PDF 块落点或 PDF 翻页。
- Frame 原有 `focusMdLine(lineNo,{focus})` 接口被复用（共享 Frame 只是透传 `focus:false`）；CM6 在 `programmaticMdSelection` 下派发只改变 `selection` 的事务、滚动使光标可见，**不编辑源码、不创建 Undo/Redo 历史、不写 SQLite、不再次发布导航事件**。`focus:false` 避免 PDF/AG 点击时抢占键盘焦点或唤起 iPad 软键盘。AG 的 MD 行先设置表格选中状态而不自行将光标移到任意选中行，统一由四窗语义定位执行块首光标。
- 源码窗自身的点击、键盘移动及文本编辑仍保留用户精确光标位置；非点击（如编辑后的持久化/结构历史）不自动重定位。PDF-only 或 OCR 已吸收等**没有对应 MD 物理行**的块不制造光标，保持原位置；没有 BlockID 的已存在手工 MD 行可以落回本行行首。
- PDF「提取文本」从原始 PDF 文字层读取的来源不变：PDF 标签点击会首先把源码光标带到已有块首；若用户之后手动调整 CM6 光标，提取文本则插入最新手动光标位置。仍使用现有 CM6 Undo/Redo/SQL 保存。直接函数测试 `tests/lab-ocr-four-pane-location.test.mjs`，Chromium+iPad WebKit `tests/lab-ocr-md-full-source.browser.test.mjs`、`tests/lab-ocr-pdf-extract.browser.test.mjs` 验证 PDF/预览/AG→源码块首、AG 后续物理行、来源为空的 PDF-only 块、源码自身键盘光标保持与 PDF 提取插入。
