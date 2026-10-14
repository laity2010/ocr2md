> **下一阶段（2026-10-08）：** 工作台三个窗格已接入 v2 的可拖动左右/上下分割条，详见 `WP6-ADJUSTABLE-WORKBENCH-PANES.md`。

> **109 MB 实书分块实测（2026-10-08）：** PDF.js 解析该书（359页）首页，64 KiB 时需 361 次请求/约 23.6 MB；改为 128 KiB 时仍需 358 次/约 46.9 MB；512 KiB 则涉及整份 109 MB。故**保留 64 KiB**，对公网 PDF 原文限制最多 4 个并发读取，加上 idempotent GET 瞬时 5xx HTML 返回的安全重试，避免请求洪峰同时保护移动数据流量。

> **2026-10-08 实机缺陷与回归:** 公网 iPad Safari 打开真实 109,141,050 B《忏悔录》PDF 后报告 `Non-JSON server response`。同源 MacFS `stat` 与 3 段真实 PDF 64KiB 读取均为 HTTP 200 JSON；公网 Cloudflare 临时 530 可使 API 返回 HTML。v3 客户端现限定 GET 请求最多 3 次、延迟 320/640ms 重试瞬时 5xx/429/非 JSON，保留 401/403/409 不重试、POST 不重放，最终错误报告 HTTP 状态/响应类型而不暴露网关 HTML。PDF Tab 添加「重新加载 PDF」按钮。合同：真实浏览器通过模拟 530 再 200 测试 pdf 首页/翻页；`test:network` 覆盖权限与不重放。**物理 iPad Safari 的这份大 PDF 成功渲染仍需用户复验。**

# WP5 — 工作目录 PDF 原文与 OCR JSON 识别 → 工作台「PDF」预览（2026-10-08）

## Feature Contract FC-V3-WP5-001

**操作：** 在 v3「工作目录」选择包含一份 PDF 原文和若干 OCR JSON 的文件夹，点击「设为工作目录」。
**需要：** 授权访问的真实 Mac Obsidian Root，文件放在选定目录的第一层；文件可以很大，用户通常经公网 iPad Safari 浏览。
**效果：** 工作台在原 Markdown 预览区提供 `Markdown`/`PDF` 两个预览标签。发现 PDF 时默认切到 PDF 标签，在 PDF 原文选择器中优先选文件名含 `原文`/`原始`/`original`/`source` 的 PDF；有多份时可以切换。PDF.js 按页渲染第一页，显示上一页/下一页/页码/总页数。OCR JSON 只统计份数，**不解析内容、不建立页码匹配**。
**禁止：** 将 PDF Blob 一次性读入浏览器、自动渲染全部页面、绕过现有 Mac Vault 授权暴露公开 PDF URL、写入/覆盖任何 PDF 或 OCR JSON、把 OCR JSON 假装已完成校对。
**固定样例：** 临时真实磁盘工作目录 `/ocr2md/` 下放两页约 2 MiB 的 `原文.pdf`、另一份 `appendix.pdf`、`ocr-extract-001.json`、`workbench-example.md`；实际按 UI 流程打开。
**自动验证：** `npm --prefix ui-spikes/v3-directory run test:ui`，从文件系统 HTTP 真实性、授权、PDF Range 请求大小、PDF 第一页/第二页、文件切换、Markdown Tab、原有文件操作回归检查。
**人工审核：** 待用户在物理 iPad Safari 审核。

## UIC-V3-WP5-001

- **初始状态：** v3「工作目录」已打开根目录，用户已授权；预览区仍是工作台内组件，不新建窗口。
- **操作：** 选中工作文件夹并点击「设为工作目录」。
- **界面：** 新「工作台」Tab 激活，预览窗自动切换「PDF」，正在读取时有状态文字；首张实际 PDF 页面出现，页码 `1 / N`，可点「下一页」，不因翻页重新下载整份 PDF。
- **数据副作用：** 仅 `GET /__v3/fs?op=stat/list/read`，PDF.js 读取工作区文件时按 64KiB 左右申请范围并校验 nodeId/revision。没有其他 PDF 数据服务或保存调用。
- **不变量：** 所有源码和 PDF 的字节与原始文件一致；`.obsidian` 不可见；现有 v2 工作台 Markdown 预览仍可选择；预览页只渲染当前一页，Canvas 渲染像素上限 600 万。
- **异常路径：** 多份 PDF 可以切换；没有 PDF 显示安全空态；非 PDF/坏 PDF 报错误；文件被外部修改显示失败（不能用错误版本的原文）；分页请求失败或断网提示错误，不能静默混合不同修订的 PDF 块。
- **自动化：** Mac Chrome / iPad Chrome 模拟浏览器、真实临时文件夹 PDF 和 OCR JSON；公网设备宽度只读烟雾测试；**真实 iPad Safari** 标记 `manual-external`。

## 技术决策

- PDF Viewer：复用 v2 已安装 `pdfjs-dist@5.7.284` 的 `getDocument`、`PDFDataRangeTransport`、独立 `pdf.worker.min.mjs`。
- FS：继续 `MacVaultHttpFS.readRange`，同源 API/现有 X-OCR2MD-V3-Key，不新增公开 PDF 直链。Range transport 将后端小段读聚合成 **每个 PDF.js Range 请求一份完整响应**，避免 pdf.js 5 的 reader 提前关闭错误。
- PDF 只渲染当前页，使用 canvas DPR 上限和 6MP 面积上限；`disableAutoFetch=true`、`disableStream=true`。前后翻页使用 PDF.js Worker 缓存，不批量渲染。
- 文件夹列表将 `.md`、`.pdf`、`.json` 三类分开，后续 OCR JSON → 页号映射和差异校对单独推进；当前最小闭环是 **先能看原文 PDF**。
- v3 工作台的 `CalibrationGrid`/`WorkingEditor` 仍是只读迁移阶段，保存 CAS 与完整 v2 工作流不在此航点。
