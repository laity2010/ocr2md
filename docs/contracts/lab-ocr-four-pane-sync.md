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

## 源码行号按钮及删除当前行（2026-11-16）

- Lab Frame 的 CM6 源码行号 gutter 改成同位置的**行号按钮**（Main 基础 `lineNumbers()` 和 iOS 原生选择基底的首个扩展，仅替换这一个 gutter；不触碰折叠 gutter、CM6 其他编辑扩展、行号字号或四窗布局）。只有加载了可编辑 Markdown、对应物理行有稳定 LineID 时按钮可用；其他静态表模式不提供破坏性动作。点击该行号按钮弹出跟随位置的浮层菜单，**当前唯一菜单项「删除当前行」**。菜单不覆盖所点源码行、不移动 CM6 光标或清除选区；点击外部、Escape、源码滚动可关闭。
- 点击菜单项时用**打开菜单时捕获的 LineID**查找最新的物理行，避免期间其它操作引起行号变化而误删；不是删除 CM6 当前光标所在行。一次原生 CM6 文本事务删除当前行及其下一换行符；最后一行改为删除前一换行符。唯一剩余行不能再从 CodeMirror 消失，删除其文字后保留一个空物理行。所有操作通过原有 CM6 `StateField` → MD 行表重组 → AG/MD 预览 → Undo/Redo → SQL CAS 保存，不直接操作 AG 或 SQLite。
- 对删除的 MD 行同时携带原 `LineID`、`BlockID` 与相邻稳定 LineID，保存在**CM6 唯一运行态中的少量临时撤销候选**（最多 16 条，非新的存储/文档）；CM6 Undo 恢复相邻原始文本时重用原有 LineID/BlockID，不随意生成新 ID；其他未删除行的 ID 不变。Undo/Redo 本身仍由 CM6 历史管理。
- 验收：`tests/lab-ocr-source-line-menu.test.mjs` 检查五种物理行位置/SQL 剩余 ID 与单独最后一行；`tests/lab-ocr-md-runtime.test.mjs` 覆盖 Undo/Redo 复原 LineID；`tests/lab-ocr-md-full-source.browser.test.mjs` 在 Chromium/iPad WebKit 模拟行号点击、菜单仅一项、选区不变、Escape、删除首/中/空/末行、原生撤销恢复、保存后刷新重载与未受影响行稳定。

## 行号按钮仅随高亮焦点行显示（2026-11-16）

- 沿用 CM6 `mdFocusField` 中既有的**橙色高亮焦点行**作为唯一按钮位置，不新增独立焦点状态。只有这一行的 gutter 行号渲染为可点击按钮；其他所有可见行渲染为**普通数字文本**（不是禁用按钮）。没有高亮行或未加载可编辑 MD 时，不显示行号按钮；仍保留普通数字行号、标题折叠 gutter 和 iPad 原生文本选区。
- CM6 来源点击、AG 行选择、MD 预览点击、PDF 标签定位都由现有 `publishLabFocus` 更新 `mdFocusField`，行号按钮因此自动随焦点移动。焦点变化时关闭此前的行号菜单，防止菜单指向旧行。菜单仍只有「删除当前行」；打开菜单本身不清除选区，删除仍采用稳定 `LineID`、CM6 编辑历史及原有 CAS 保存。
- `focusedLineHasAction` 有单元断言；`tests/lab-ocr-md-full-source.browser.test.mjs` 在 Chromium/iPad WebKit 验证零/单个按钮、所有非焦点行普通数字、PDF/MD 预览/AG/源码四种焦点迁移、焦点切换关闭菜单，以及删除/撤销/保存回归。

## iPad 行号按钮的静态可见性（2026-11-16）

- 实际 iPad Safari 截图确认：此前虽然高亮焦点行已渲染 `<button>`，但它与普通行号共用 `background:transparent;border:0`，只在 `hover`/键盘聚焦时变色，所以触控用户无法辨认。**可点击元素存在不等于视觉验收通过。**
- 当前焦点行的行号按钮必须在**静止、未悬停、未聚焦**时就有明显底色、描边及下拉 `▾`，并有不低于 32×26 CSS 像素的可触区域；其他行仍显示无背景、无按钮的普通数字。焦点切换和删除菜单的事件与 LineID 规则不变。
- Chromium 和 iPad WebKit 的 `tests/lab-ocr-md-full-source.browser.test.mjs` 除了断言焦点行唯一 `<button>`，还必须断言真实浏览器 `getComputedStyle` 的常显背景与普通数字不同、实线边框、尺寸和 `::after` 下拉标识，避免仅通过 DOM 元素存在检查造成的回归漏检。
