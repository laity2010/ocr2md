# lab-ocr · OCR 审阅实验起点

本实验从 `frame/base` 派生，并合并 `lab-frame@a8406e1`（2216 版）。
保持空白框架的 Dockview 多窗（Lab OCR 默认单窗 PDF 预览、可选切分为四窗）、AG Grid、CM6、设置和导航，复用 Frame 的授权目录树、整行选中、展开刷新、全局状态和文件保存。当前首阶段接入 1 份不足 200 页的 MinerU JSON + 1 份 PDF，首次导入 SQLite 单表 `minerujson`，AG 展示原始块；已提供独立 PDF.js 预览加载（默认页面内容深色、首页预热、页码及缩放下拉菜单），但尚未接入 OCR 校正编辑、PDF 块标定／定位或多 JSON 拼接。
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

PDF 覆盖框：单一 `setOverlays({level,loadPage})` API 支持 Block／Span／关闭。当前仅按 SQL bbox 显示只读覆盖层，原始页面几何经 `page_size_json` 归一化，无 PBS 标注、拖动、修改或回写。具体契约见 `docs/contracts/lab-ocr-pdf-overlays.md`。

公网目录授权：在「全局设置 → 资料目录 → 浏览目录」遇到 Main 目录 API 403 时，工作台会弹出 Main 的 12 位编辑授权码输入框；通过 Main 的 `/api/unlock` 与 `/api/session` 验证后自动重试原目录请求。授权码不写入设置，取消或验证失败不读取目录。契约与测试见 `docs/contracts/lab-ocr-main-editor-authorization.md`。

PDF 覆盖框跟随 AG 的 SQLite → block 表 **块组（block_group）** 多选筛选：空选隐藏，all 全部显示，多选取并集；不同块组中相同或近乎重合的框不会叠画，真正嵌套的结构框保留。Block、Span 两种 PDF 粒度均遵循块组筛选；**块类型（block_type）不参与 PDF 过滤**。筛选不触发 PDF/SQL 重载。

PBS 标签（只读）：PDF 的 Block 覆盖框显示来自 SQLite `block.pbs` 的页边标签（按 PBS 文字宽度紧包标签框、双侧避让、引线、子块色、密集区域逐标签横向多轨外移（无收纳，内轨空闲立即回归））；唯一定位键始终使用 `block.block_id`，同一几何框去重后保留不同块组的原始 Block ID 关联。PDF 点击标签 → AG 自动打开/选中对应 Block 行并送 CM6，AG 点击 Block 行 → PDF 自动跳页和高亮相应框/标签。Span 粒度不重复绘制 Block 标签。标签无拖动、编号编辑和数据回写。

PBS 防重叠修复：标签初绘与实际字体度量发生变化时都重新计算多轨位置，以真实 DOM 矩形避免包括 `p11b0`/`p11b01` 在内的同页标签交叠。第 11 页模拟专项截图位于 `.runtime/pbs-overlap-evidence/`，不修改 PDF 或 SQLite。

PBS 父子块显示/选中：父块深绿实线，子块同系浅绿虚线；选中父块后，同一可见块组内它的全部后代标签与 PDF 框同步高亮，后代高亮颜色较浅，选择子块不反向选择父块。关系按稳定 `block_id`→`parent_block_id`，PBS 仅为显示，不更改 SQL 或原文。
