# V6 Lab · LaTeX 审阅后下方行连锁刷新修复（2026-10-26）

## 根因（2046 前一版仍然存在）
- 原版 `refresh()` 每次审阅写入（CMD 源码插入或修改注释）后，虽然只修改了一条公式，但仍 `updateData()` **全部 42 行**。后方 LaTeX 的 `from/to` 和源码行号会随 HTML 注释位移，并不代表公式/KaTeX 语义变化。
- 2046 版只让原生 `<select>` 使用实例式 renderer 的 `refresh()` 保留 DOM，未处理其他列。`preview` 是函数 renderer，`updateData` 会销毁并重建后续公式 KaTeX 预览。
- 精确复现用 `latex-review-refresh.browser.test.mjs` 观察下方每个可见 AG 单元格首子节点的 DOM identity。2046 版 Chrome：**下方 16 个 `preview` 被重建**，其他细胞未重建；旧测试仅监测两枚下拉框，因而误判通过。

## 最小修复
- 提交 `aa342d0`：保留已存在的所有 AG RowNode 和未变化公式的 DOM。每次 CMD 注释变化仍从唯一 CM6 源码重扫描，但对公式内容及状态没有语义变化的行仅更新 `RowNode.data` 元数据，改变行号时只刷新 `line` 文本单元格。
- 仅当当前公式状态、原始公式文本、KaTeX HTML、检测/类型或错误信息真的变化时，才调用 **该行** 的 `updateData()`。保留原有 `onFilterChanged()` 与独立 AG 的筛选规则，不引入另一份可编辑数据或新业务 API。

## 验收
- 隔离构建与公网版本：`v6-lab-cm-html-20261026-205706`，基础提交 `aa342d0`；访问 `https://ocr2md.laity.bid/labs/cm-html/`。
- `latex-review-refresh.browser.test.mjs` 在 Chrome / iPad WebKit：本地以及 Cloudflare 公网全部 PASS。「待复核」→「latex」：Chrome 检查 **80 个**下方单元格，0 个重建；iPad WebKit 检查 **60 个**，0 个重建。当前审阅控件保持原实例，42 条 LaTeX 仍完整，撤销后源文原样恢复，零业务写入。
- 对「待复核」→「忽略」再次专项验证：Chrome 下方 80/80、iPad WebKit 下方 60/60 个单元格均保留 DOM，切换后撤销恢复母文档，没有错误或业务写入。
- `ag-all-cross-chapter-focus.browser.test.mjs` Chrome 和 iPad WebKit 本地 PASS：标题、媒体、LaTeX 跨章节导航和 PDF 高亮保持功能。
- Lab 母 Markdown SHA-256 前后一致：`33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`；正式公网主线构建 `v6-20261026-102651` 不变。

这是有界 Lab 定向验收，不代替 Grok/Muse WP8 独立审计，未批准合并正式主线。不新增 AGENTS.md 正式原则。
