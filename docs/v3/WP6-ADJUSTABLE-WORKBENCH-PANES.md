# WP6 — v3 工作台复用 v2 可拖动三窗格（2026-10-08）

## 目标和 Feature Contract FC-V3-WP6-001

**操作：** 在 v3「工作目录」选择真实文件夹，点击「设为工作目录」进入「工作台」，拖动校对 AG Grid 与右侧源码/预览区域之间的竖向分割条，或拖动源码与 Markdown/PDF 预览之间的横向分割条；也可聚焦分割条用方向键微调。
**需要：** 已打开真实 Mac Vault 工作目录；工作台是 v2 `CalibrationGrid` + `WorkingEditor` + `BasicMarkdownPreview` + v3 PDF.js，不更改原文件。
**效果：** 真实左右窗宽度和右侧上下窗高度随鼠标/iPad 触摸拖动即时变化。位置分别记忆到 v3-only localStorage，下一次进入仍然生效；「工作目录」另有独立分割条及独立设置，不混用；v2 原来的存储键与功能不变。
**窄屏：** ≤760px 时布局纵向堆叠，AG/右侧区之间提供单独的横向高度调整条；右侧源码/预览分割条仍可调整；右窗 PDF Tab 可使用上一页/下一页，画布按新宽度自适应。窄屏调整比例也独立记忆。
**禁止：** 因拖动改变 AG 行数据、PDF 当前文档或原始文件；不能打开正文编辑/保存；不可覆盖 v2 或工作目录的分割比例；不可阻断表格、CodeMirror 或 PDF 的用户交互。
**固定样例：** 临时真实 Mac Vault 工作目录，含 Markdown、OCR JSON 和有效两页 PDF；点击「设为工作目录」后执行三组分割条键盘/鼠标拖动与切换 PDF/Markdown，再返回原目录。
**自动验证：** `npm --prefix ui-spikes/v3-directory run test:ui`；`npm --prefix ui-spikes/v2 run typecheck`，PDF 测试与 HTTP 文件安全回归。
**人工审核：** 待用户在 iPad Safari 实机审核。

## UIC-V3-WP6-001

- **初始：** v3 工作台显示左侧校对 AG 表、右上只读源码、右下 Markdown/PDF 预览，默认比例为左右 43/57、上下 55/45（v2 组件默认）。
- **操作：** 拖动 `#workbench-column-splitter`，左 AG 表相应变宽/变窄；拖动 `#workbench-row-splitter`，右上源码窗相应变高/变矮；方向键同样可调整。触屏 Pointer Events 与鼠标使用同一组件。
- **用户可见：** 分割条亮色悬停/拖动，实际元素边界随分割条更新；Markdown/PDF Tab 保持当前文档，CodeMirror 可继续滚动；AG Grid 仍可选择校对行。
- **状态/存储：** 工作台左右保存在 `ocr2md-v3-workbench-columns-v1`；右侧源码/预览保存在 `ocr2md-v3-workbench-editor-preview-v1`；窄屏 AG 高度保存在 `ocr2md-v3-workbench-mobile-grid-height-v1`。工作目录比例 `ocr2md-v3-directory-split-v1` 完全独立，v2 键也不变。
- **窄屏：** 视口 ≤760px，左/右变为上/下，原左右竖向分割条隐藏，`#workbench-mobile-splitter` 可调整 AG/右侧的纵向比例；源码/预览之间保留一条高度分割条。工作台三窗均至少保有有效可见区域。切回宽屏恢复左右分割比例。
- **数据副作用：** 仅页面 CSS 变量与 localStorage，零 Mac Vault 写请求，不碰 PDF 原文、OCR JSON 或 Markdown 内容。
- **不变量：** 工作目录分割条仍保持原有行为，AG 表固定列不可拖动的规则仍生效，PDF.js 仍按范围读取并只渲染当前页。v2 `EditorPreviewSplitter` 只新增可选存储键/顶部元素/默认比例参数，省略参数时 v2 原行为严格一致。
- **自动化等级：** real-temp-disk Chrome browser E2E 验证几何形变/键盘/独立存储/窄屏排列/PDF Page；公网 Chrome iPad/iPhone 尺寸烟雾测试；物理 Safari 手势仍为 `manual-external`。

## 验收记录（2026-10-08）

- `npm --prefix ui-spikes/v3-directory run test:ui`：**PASS**；真实临时磁盘 Chrome 验收了分割条 `ArrowLeft/Right/Up/Down`、桌面鼠标拖动可见几何变化、iPhone 390px 窄屏 AG 高度可变、每组本地存储隔离；并通过 Markdown、PDF、JSON、文件 CRUD 回归。
- `test:settings`、`test:network`、Mac Vault Python 7 项：**PASS**；`git diff --check` 通过。
- 本地 Mac 4176 和公网 `https://ocr2md.laity.bid/v3-directory/` 静态响应：**HTTP 200**；PDF.js Worker 和 `dist/app.js` 均为 HTTP 200；校验已发布文件与本地构建一致。
- 公网 Chrome 设备宽度自动测试：本轮 **BLOCKED**，浏览器 `page.goto` 等待 `domcontentloaded` 超过 30 秒（静态 curl HTTPS 200）；不是组件几何测试失败，不能标记为通过。
- 物理 iPad Safari：**待用户审核**。v2 整库 `typecheck` 这轮曾因命令执行超时而没有可靠的通过结果；新的 v3 esbuild 构建已通过。

本改动只修改 v3 静态布局和 v2 `EditorPreviewSplitter` 的可选构造参数（默认调用行为未改），没有写入或改变用户的 Obsidian 文件、Mac 服务、云 Tunnel 或 DNS。
