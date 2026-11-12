# lab-ocr · OCR 审阅实验起点

本实验从 `frame/base` 派生，并合并 `lab-frame@a8406e1`（2216 版）。
保持空白框架的 Dockview 四窗、AG Grid、CM6、设置和导航，复用 Frame 的授权目录树、整行选中、展开刷新、全局状态和文件保存。当前首阶段接入 1 份不足 200 页的 MinerU JSON + 1 份 PDF，首次导入 SQLite 单表 `minerujson`，AG 展示原始块；已提供独立 PDF.js 预览加载（默认深色、首页预热、页码及缩放下拉菜单），但尚未接入 OCR 校正编辑、PDF 块标定／定位或多 JSON 拼接。
标牌为 `lab-ocr`，与 `lab-frame` 使用不同的发布路径和本地设置命名空间。
新业务逻辑仅在本实验分支开发，禁止直接修改空白框架基线。

开发入口：`ui/lab-ocr/entry.js` 仅导入共享 `ui/frame/frame.js`，避免 Vite 开发模式直接引用 `../frame/frame.js` 的路径 404。
构建：`npx vite build --config labs/lab-ocr/vite.config.mjs`
发布：`python3 scripts/v6_lab_ocr_publish.py --release-root /Users/daisor/AgentDock/ocr2md/release`
公开入口：`/labs/lab-ocr/`。发布沿用 Agent Link 单一 Lab 网关，禁止单独建 Tunnel。

## sample 单 JSON 导入（首阶段）

- 未保存 `workspace.dataDirectory` 时启动即打开全局设置。请选择书籍目录，例如 `sample/`（其下有 `mineru json/` 与 `pdf/`），点击「采用选中目录」后再点击顶栏「保存」。
- 只验收 `mineru json/` 中 1 个不足 200 页的 JSON 和 `pdf/` 中 1 个 PDF。检查通过自动首次导入书籍目录下的 `ocr2md.sqlite`，**唯一业务表**名为 `minerujson`。
- 原始 JSON 的字节保存在 SQL `row_kind=source` 行的 BLOB 中；`row_kind=block` 为原始 `preproc_blocks`、`discarded_blocks`、`para_blocks` 每次出现的一条块记录，不擅自去重。重导入不修改源 JSON 或 PDF；源 JSON 有变化时阻止自动覆盖。
- SQL 导入成功，导航下拉新增 `SQL → minerujson`；点击后 AG 表分页读取并显示原始行，原始块 JSON 另存列且默认隐藏。全局状态栏统一显示进度、失败和结果。
- 本阶段不自动识别多 JSON 拼接；遇到多个 JSON 或 200 页及以上时停止并提示，留待后续人工排序验收。
- API 服务是独立的 loopback `4416`，仅受统一 Agent Link `/labs/lab-ocr/api/ocr/*` 代理，**每个调用均由 Main 的编辑授权/允许根目录校验**；无新 Tunnel，不改 Main 的书籍数据。

## PDF 预览加载 V1

- 关联 PDF 取自已保存 `workspace.dataDirectory/pdf/` 中唯一一份 PDF；不增加重复 PDF 路径设置。
- 新 Viewer 以 PDF.js 单请求流式加载，首页实际绘制后才标记就绪，提供页码与缩放下拉、文字层、默认深色、切分时同一 Viewer 的无重载转移与单窗 MD/PDF 下拉切换。
- 后端新增已鉴权的只读 `/labs/lab-ocr/api/ocr/pdf?workspace=…`，不修改原始文件。
- API、直接测试、暂不包含的块交互见 `docs/contracts/lab-ocr-pdf-loader.md`。
