# Lab OCR PDF 预览加载 V1 · 2026-11-12

## 范围

本次仅在 `experiment/lab-ocr` 装配一个新的 PDF.js 查看组件；Main 和独立的 `lab-pdf` 均不修改。不解析 PBS、CMD 或 MinerU JSON，不提供文本块结构编辑。Lab Frame 的通用四窗通过 `registerFramePdfPane(mount)` 可选注册扩展；空白 Frame 没有注册者时继续保持空白。扩展由 lab-ocr 入口懒加载，不让 PDF.js 增加无 PDF 工作区的初始化成本。

## 对外边界（公开 API）

- `registerFramePdfPane(mount)`: 帧框架可选扩展注册，仅启动前允许一次；挂载时传 `{surface, toolbar, onStatus}`，返回 `loadPdf` 与 `dispose` 生命周期端口。
- `frame.loadPdf(source)`: Lab 业务的 **唯一 PDF 加载操作 API**，`source` 为服务器生成的相对只读 URL；`null` 清空源。无需访问 Dockview DOM，同一个 Viewer 保留在 Markdown/PDF 预览窗口，由切分操作只迁移其 DOM 与菜单，无需重新读取 PDF。该 API 直接委托 Lab PDF Viewer 的 `loadPdf()`。
- `mountLabOcrPdf({surface,toolbar,onStatus})`: 独立 Viewer 实例工厂，公开操作仅 `loadPdf(source)`、布局重排 `relayout()` 和生命周期 `dispose()`。无全局 Store、SQL、CMD 或编辑器写权限。

## PDF 来源与性能

全局设置只保存 `workspace.dataDirectory`（书籍工作区根目录）。已有 OCR API 验证其下恰好有一个 `pdf/` 和一份 PDF；无需增加 `pdfDirectory` 平行设置。浏览器只构造 `GET /labs/lab-ocr/api/ocr/pdf?workspace=...`，绝不传文件名／绝对 PDF 路径。现有 loopback API 每次向 Main 校验会话授权及目录根，过滤 symlink，验证 PDF 头与大小，流式返回原始 PDF 字节；不会更改原 PDF 或 SQLite。

复用 Main 已验证的 PDF.js `getDocument` + `PDFViewer`：单次 streaming 请求（禁用 64KB range 往返）、iPad canvas 内存上限、文字层，`pagesinit` 设置适宽，**只有首页 `pagerendered` 成功才报告就绪**。重新打开同一 source 幂等，更换书籍或销毁 Viewer 时释放加载任务及页面资源；切分模式变化仅重定位已有 PDF.js DOM，禁止隐式读取原文内容。菜单仅保留当前页输入／总页，以及缩放下拉（适宽、25%、50%、75%、100%、125%、150%、200%、300%、400%）；默认深色界面。Lab OCR 默认不切分、预览直接显示 PDF 原文；可在 MD/PDF 下拉切换。手动切分时 PDF 在独立窗，预览下拉只显示 MD，不会重复装配 Viewer。深色不仅用于工具栏，PDF 页面 canvas 也采用与 Main 相同的反相/色相校正，额外使用 brightness(.82) 与 contrast(.84) 缓和黑底白字的极端对比（深灰纸面、柔和灰字）；该显示滤镜不改原 PDF 数据。Lab OCR 的全局顶栏接收状态消息。

## 验收

- `python3 tests/lab-ocr-pdf-http.test.py`：授权、只读字节、单文件、拒绝 symlink、HEAD；不会访问用户文档。
- `node tests/lab-ocr-pdf-viewer.browser.test.mjs`：Chromium 和 WebKit 真实 PDF.js 三页、文字层、首页预热、缩放下拉、页码、单窗预览切换、切分搬移复用零重复请求。
- `node tests/lab-ocr-sample-flow.browser.test.mjs`：现有 MinerU JSON/SQLite/AG 核心回归。
- `node tests/lab-ocr-frame-2216-integration.browser.test.mjs` 和 `node tests/lab-ocr-frame-2216.browser.test.mjs`：Frame 设置隔离与页面回归。

本版只做到 **高速加载与普通 PDF 阅读**，块覆盖框、类型、顺序、文本提取、父子关系均未进入本次范围。
