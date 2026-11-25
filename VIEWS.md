# OCR2MD · lab-ocr-v3 派生视图、公共组件与运行隔离契约（VIEWS.md）

> **本州第二层专项契约**，由本州 `AGENTS.md` 第 3 节显式登记，服从联邦四件套（尤其 `COMM.md`）与本州 `AGENTS.md`，负责约束 `lab-ocr-v3` 的 AG 派生视图、V1/Frame 公共组件复用、跨 Lab 运行隔离与验收门禁。修改本文件须经用户明确授权并留存本州 Git 记录。

## 1. 公共组件复用红线（承接联邦 `COMM.md`）

- **AG Grid 表头多值筛选**：复用与 V1 逐字节一致的 `EnumCheckboxFilter` 原生列头过滤组件与样式，严禁自制 `<select>` 表头或独立过滤状态；发布器 `scripts/v3_frame_publish.py` 自首次挂载起必须接入 `main/scripts/verify_cross_version_components.py --target lab-ocr-v3 --browser`（实现 AG Type 列前允许返回 `NOT_IMPLEMENTED`，实现后非零退出即阻断发布）。
- **Frame / V1 核心复用**：复用 Frame 全局设置、目录授权 F02、Dockview 壳层与全局状态栏；复用 V1 `mountLabOcrPdf`、`layoutPbsLabels` 动态多轨、手势与 `createMdLineGutter`；不另建平行设置、导航、状态栏、PDFViewer 或第二编辑器。
- **入口模块化**：业务入口按职责拆分为清晰模块（Session、AG Router、PDF Bridge、View Adapters），避免将所有视图逻辑堆入单一巨型入口文件。

## 2. 统一 AG Grid 双投影与派生视图边界

- **一表双投影**：全工作台共用同一 AG Grid 实例，提供逻辑块审阅（`PBS` 左固定、`Type` 原生多值筛选、`MD Block`、可见文本自适应列宽）与通用 `MD Line` 行级投影。
- **派生视图清单**：标题、注释配对、LaTeX、断块、媒体与 HTML 表格 View 均作为当前修订公共行索引的只读前端投影挂载；任何写回操作必须经 `CM.md` 定义的唯一 CM6 原生行事务执行，保留 Undo/Redo 与 SQL CAS。
- **焦点与列序护栏**：纯多窗焦点切换仅调用 AG 原生单行选中 API，禁止重设 `rowData` / `columnDefs` 或重绘整表；标题 View 严格保持 `MD Line`、`source_line`、`PBS` 前三列顺序并清除继承的固定列状态（`pinned: null`），验收须核查实际 DOM 表头顺序与 `ColumnState`。
- **默认三窗布局**：默认左 AG、右上源码约 1/3、右下 PDF 预览约 2/3；手动切分四窗与恢复均复用同一 PDFViewer 实例，不重新加载文档。

## 3. 跨 Lab 运行隔离（与 V2 零干扰并行）

- **前端状态隔离**：浏览器本地设置键名与 F03 自动更新版本源严格绑定 `lab-ocr-v3`（`ocr2md.lab-ocr-v3.settings.json.v1` 与 `/labs/lab-ocr-v3/release-version.json`），发布 V3 不触发 V2 或其他 Lab 重载。
- **后端独立命名空间**：V3 后端 Python 代码全部收拢在独立包目录（如 `scripts/lab_backend/` 或 `scripts/ocr2md_v3/`）并使用包内相对导入，**禁止**向共享统一网关的全局 `sys.path` 暴露与 V2/Frame 重名的顶层模块（如 `v6_media`、`v2_*`）。
- **共享网关免重启目标**：V3 后端保持无状态短连接设计，配合统一网关按 `(lab_id, sourceCommit)` 的局部热重载机制，力争 V3 后续前后端发布对 V2 保持零重启中断；严禁自建第二网关、私有监听端口或独立 Tunnel。
- **共享 `media/` 并发安全**：复用同一书籍目录下的内容寻址正式图片（`<hash>.<ext>`），V3 断点续传临时文件强制采用唯一命名（`.<hash>.v3.<pid>.part`），经完整校验后以原子 `os.replace()` 落盘，防止与 V2 并发下载互相破坏。

## 4. 发布与实机验收门禁

- **发布前门禁**：发布脚本在任何写操作前必须依次通过 `.ops/git-gate.py check-release`、`verify_cross_version_components.py --target lab-ocr-v3 --browser` 与 Frame 运行时核验，仅更新统一 `release/lab-ocr-v3/`、`release/release-manifest.json` 及首页对应卡片，发布前后核验其他已发布 Lab 哈希未变。
- **浏览器与实机口径**：自动化交互验收须覆盖 Chromium 与 Playwright iPad-WebKit，并捕获 CM6/浏览器 console 异常；自动化通过不冒充真机验收，凡未经用户物理 iPad Safari 核对的项必须显式标注 `尚未实机验证`。
