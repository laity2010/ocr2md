> **历史失效方案：与真正 V1 Lab-OCR 多轨不一致。以 WP04_V1_LABOCR_MULTILANE_SOURCE.md 为准。**

# OCR2MD V2 · WP04 增补：V1 PDF 原文、逻辑 PBS、覆盖框与四窗同步

基线 `65fcc2b`（AG/源码/Markdown 三窗已同步）。本任务继续在隔离 `experiment/lab-ocr-v2` 完成，不修改共享 Lab-Frame、Main、原始 MinerUJSON 或用户书籍数据；WP05 SQL 编辑持久化尚未开始。

## 唯一来源与两个不同身份

- `logical_block.logical_id` **稳定身份**，以 `parent_id`、`logical_order`、`base_blockid` 表示逻辑关系与来源；`block_type` 始终从当前逻辑表读取，不返回原始 OCR 判别作为“当前类型”。
- `PBS` 是随逻辑结构变化的**临时显示标签**，不是稳定 ID、不是 SQLite 新列。`pNbM`：逻辑根块的**原始归属 PDF 页** `N`，页内根块按当前 `logical_order` 紧凑编号 `M`；`sK` 是父块子序。跨页归入时子块显示父块 PBS 的子编号，但保留自身不可变 `base_blockid` 的 PDF 页+bbox，不挪动 OCR 覆盖框。当前扁平数据样本 224 块，自动生成 `p0b0` 起始到 `p21b20` 等标签。
- `scripts/v2_pdf_projection.py` 是纯只读证据投影，关联 `logical_block.base_blockid → mineru_base` 的 `page_index/page_block_index/bbox_json`；从 `mineru_base.blockid=0.original_bytes` 的来源档案逐字节/SHA 验证 `pdf_info[].page_size`。PDF 容器页码必须连续，与一份 MinerUJSON 的页数匹配。多源 PDF 分卷关联不明确时拒绝，不能把多个源文件假拼为同一本 PDF。
- 几何有效性：bbox 数值有限、正宽高且完整落在页面原始尺寸内；无 bbox 或空来源的逻辑块保留身份，列为 `unmappedLogicalIds` 而不绘制虚假框。空文本不等于无 PDF 坐标：保留原始框并用虚线 PBS 标签提示空内容。当前样本 22 页、539 基础块、224 逻辑块/224 有效覆盖框；有 9 个空逻辑块。**不新增第三应用物理表或向 Markdown 插入 CMD 标签。**

## V1 已验证部件的直接复用

- 真正页渲染：V1 使用的 `pdfjs-dist/build/pdf.mjs`、`pdf.worker.min.mjs`、`pdfjs-dist/web/pdf_viewer.mjs` 的 `EventBus/PDFViewer`、`pdf_viewer.css`；`ui/v2-pdf-viewer.js` 在 Frame 现有 `.ocr-preview-pdf-host` 装配这同一个官方 PDFViewer，不再挂第二个 PDF 文档实例。
- 复用 V1 `ui/pdf-preview.js` 导出的**实际 `pdfOverlayRect`** 坐标投影函数，拒绝 PDF 页面尺寸/旋转比例不符的 bbox。复用 V1 `ui/pdf-gutter-label-layout.js` 的**`layoutPDFEdgeRails`** 双侧固定避让+引线，复用 `ui/pdf-preview.css` 的深色页、画布及相应工具栏视觉语言。V2 专用 CSS 仅负责 PBS 标签、覆盖框及当前高亮样式，不移动/重算原始 bbox；PDF.js 换页、缩放、页 DOM 重建后重挂与对应 PDF 页相同的框。
- PDF 工具栏：缩小、适宽、放大、页码输入/总页数。PDF 文本提取、标签拖动/子块拆归等**修改结构的功能未在本航点开放**；PDF 原始文档只读。

## 权限、查找与真实 PDF

- `GET /labs/lab-ocr-v2/api/mineru-base/pdf-map?workspace=...` 只返回只读原始 bbox 与逻辑 PBS，走现有 Frame F02 Cookie、授权目录白名单、原有 V2 `checked_workspace`，不读取或改写用户文件。
- `GET .../api/mineru-base/pdf?workspace=...` 使用**同一业务网关与同一 F02 授权边界**，只读取已授权书籍目录根部或 `pdf/` 直接子目录下的**唯一 `.pdf`**，不接受任意用户文件名、祖先跳转或目录遍历。符号链接/硬链接、多个 PDF、非真实 PDF、超过 64 MiB 的 PDF 直接拒绝；无 PDF 返回明确 404，**不向 Main `/api/pdf` 偷取别人的文档**。不为 PDF 另外启动服务或端口。PDF Worker 直接接收经授权返回的原始字节；不经 F02 通用 8 MiB `readFile` 限额，也不绕开授权。
- 必须核实真实 PDF 页数与 MinerU 档案页数完全一致。PageView 的原始长宽比例不同（超过 V1 的 2% 门限）时只显示 PDF 页面，不画不可信的框。目录切换时旧 PDF、选中与授权上下文立即清理，不展示上一本文档。

## 四窗状态流

现有 V1 `view-store.js` + `scroll-sync.js` 是唯一临时事件主线。PDF 点击**当前 PBS 标签或框内**，解析到真实 `logical_id`，发布 `origin:'pdf'` 焦点，源码/AG/MD 同步；AG/源码/MD 明确点击时，PDF 通过同一 `v2-sync-focus` 按稳定逻辑 ID 找原始 bbox、同步页面及 PDF 高亮。滚动 PDF 触发 PDFViewer 原生 `pagechanging` 仅在用户手势有效时按当前页首个逻辑块更新其他窗口，程序导航不反向抢焦点。PDF 根/子块高亮通过逻辑父链组，而不是依赖 PBS 字符串前缀。普通 CM6 编辑/Undo/Redo 不重算原始 PDF bbox，数据状态依旧只在内存。

## 验收门禁与明确限制

- Python `tests/test_v2_pdf_projection.py`：原始 22 页/224 框、根/跨页子 PBS、空文本框不丢、非法 bbox 拒绝、PDF 文件/路径安全、两张表仍然不变。
- 浏览器：为与真实 MinerU 页面尺寸一致的 22 页**测试 PDF**使用标准 PDF.js 渲染，Chromium + iPad-WebKit：第一块 `p0b0`、PDF->源码/MD/AG，源码最后块→PDF 第22页、AG跳页、AG再次反向定位；PDF 缩放及覆盖框页重绘、V1 原有公式/表格等旧回归。
- 真正用户书籍 PDF 是否存在、是否单独一份、页面尺寸与原始 OCR 一致，必须在**用户授权浏览器**中检查；测试 PDF 成功不能冒充用户的实际书籍已验收。多源 OCR/多 PDF 尚需独立绑定，不允许盲目猜测。
- Frame 严格源码指纹与四窗布局、CM6/AG/MD 回归、Python33 与新增 PDF 用例、GitHub 提交/标签、统一V2门户公网静态资源 SHA256、授权临时书籍读写安全；Main/Frame/其他六个 Lab 不改。
