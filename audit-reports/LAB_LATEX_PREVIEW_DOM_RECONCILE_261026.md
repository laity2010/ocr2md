# V6 Lab LaTeX 审阅 `latex` 后预览闪烁：局部 DOM 刷新（2026-10-26）

## 复现与根因
- 用户：LaTeX「审阅」列切换为 `latex` 时，预览闪烁。与先前的 AG 全部过滤 42→1→42 属于两个不同缺陷。
- Chrome 未修复基线：`labs/cm-html/wp0-2/latex-preview-flicker.browser.test.mjs` 选源码行约 240 的公式，审阅 `待复核`→`latex`。AG 当前公式 KaTeX `innerHTML` 702 字节完全相同，但预览 DOM `samePreview=false`；右下 Markdown `innerHTML` 约 297348 字符，审阅导致整个 Article 子节点被替换 `sameMdFirst=false`, `mdChildChanges=1`。
- 旧 `latex-module.refresh()` 的 `rowNode.updateData()` 即便仅审阅 `status` 改变，也刷新当前行中与状态无关的函数式公式 `preview` cellRenderer；旧 `workspace.PreviewPanel.render()` 每次 `this.body.innerHTML=...` 全量替换，令整个右下 Markdown 闪烁。

## 解决
- 功能提交 `37d50e1`，单独实验 worktree `experiment/virtual-chapters-wp0-2`。
- LaTeX 只更新有视觉变化的列，保留同一 AG 行的预览 DOM；仍重扫描最新 CMD 原文，行号、状态、源码、过滤都通过既有独立 AG 逻辑同步。实际 KaTeX 内容有变化时仍允许重绘该列。
- Markdown 渲染器、Sanitizer 和 WCP 范围原封不动，只在 Lab 构建适配层把 Markdown 的整篇 `innerHTML` 替换改为局部 DOM reconciliation。`labs/cm-html/modules/preview-dom-patch.js` 使用 **morphdom 2.7.8（MIT）**，保留未变 DOM/事件与源码范围属性，更新改变的内容，不修改主线 `ui/workspace.js`。

## 验收
- Lab 构建/发布：`v6-lab-cm-html-20261026-215137`，`https://ocr2md.laity.bid/labs/cm-html/`。
- 新浏览器专项：本地与公网 Chrome、iPad WebKit 全 PASS。`samePreview=true`、`sameMdFirst=true`、首层 Markdown 子节点移除数 0、原 702 字节公式预览一致；同一次审阅正常修改 CMD 文本并通过 Undo 原样恢复，没有业务网络写入。
- 本地 `latex-review-refresh.browser.test.mjs` Chrome/WebKit PASS：下方 80 / 60 个可见 AG cell 未重建；`md-virtual-preview.browser.test.mjs` Chrome/WebKit PASS：WCP 虚拟章节、跨窗焦点、原 PDF.js 映射未退化；`ag-all-cross-chapter-focus.browser.test.mjs` Chrome/WebKit PASS：媒体、LaTeX、标题跨章节定位及 Markdown 焦点；`latex-review-filter-timeline.browser.test.mjs` Chrome/WebKit PASS：「全部」42 行无瞬时丢行。
- 自动化移动 WebKit 非实体 iPad Safari 的人工手感验收；没有把定向测试说成 WP8 独立审计，未合入正式主线。
- 实验母 Markdown SHA-256 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc` 未改变；正式公网根版本 `v6-20261026-102651` 未改变。
