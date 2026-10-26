# OCR2MD · V6 Lab LaTeX 审阅下拉原地刷新（2026-10-26）

## 定位
- 实验分支：`experiment/virtual-chapters-wp0-2`，功能提交 `b08b817`。
- 原因：`ui/latex-module.js` 的审阅单元格使用返回裸 `<select>` 的函数式 cellRenderer，AG Grid 在 `rowNode.updateData()` 导致 `status` 变动时销毁并重建该控件。选择值之后原控件失联、焦点消失，看起来像列表在异常刷新。
- 复现：`latex-review-refresh.browser.test.mjs` 在修改前实测 Chrome `sameDropdown=false`、`oldConnected=false`，而 `sameSibling=true`、`sameContainer=true`；证明只是当前控件被重建，不是整张 Grid 重建。

## 修复
- LaTeX 模块内部采用 AG Grid 实例式 `ReviewSelectRenderer` 的 `init`、`getGui`、`refresh`，由 `refresh` 就地更新 `value`、`data-review`、`disabled`、aria 标签并返回 `true`，保留原生下拉框 DOM。
- 审阅写入依然经过 `CMD.editAnnotations`，仍统一由 CM6 Undo/Redo/Save；保持三窗/四窗定位、行筛选和列序、独立的业务 AG。没有增加 WCP 路由、私有数据 API、跨模块访问或正式工程原则。

## 验收
- 隔离构建及公网发布：`v6-lab-cm-html-20261026-204656`，基于 `b08b817`，`https://ocr2md.laity.bid/labs/cm-html/`。
- Chrome 和 iPad WebKit Playwright（各自本地、Cloudflare 公网）：`latex-review-refresh.browser.test.mjs` 均 PASS：审阅值更新、当前控件及相邻控件 DOM identity 均保持，AG 容器没重建，42 个公式行不变，Undo 回到原母文档，零业务网络写入、零 page errors。这里的 iPad WebKit 是移动设备参数下的 WebKit 浏览器自动测试，并非声称人工实体 iPad 操作。
- Chrome 与 iPad WebKit（本地）：`ag-all-cross-chapter-focus.browser.test.mjs` 均 PASS，媒体/LaTeX/标题跨虚拟章节 AG 全部仍正常；没有读取实体章节或业务写入。
- 正式公网版本：`v6-20261026-102651` 未变；Lab 母文档 SHA-256 始终为 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`。

## 门禁
- 仅 Lab 试验修复和有界回归通过；不是全量 AM/Git 审计或 Grok/Muse 独立 WP8 签字，尚未获准合入正式主线。
