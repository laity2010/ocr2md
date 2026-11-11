# Lab Frame · 空白四窗外壳

独立的无数据布局样板，起点为 Main Git `8cfba88`。不是带业务模块的 Main 镜像 Lab，不能作为 Main 的可晋升业务版本。

独立 API：`createFrameWorkspace`（四窗 Dockview / 切分）、`createFrameSettingsIO`（独立设置 IO 适配）、`startFrameAutoUpdate`（无未保存阻断的版本探测）；所有消息仅由装配根写入 `#status`。

复用 Main 的 `styles.css`、`workspace.css`、`outline-grid.css`、`settings-module.css`、`pdf-preview.css`、`obsidian-everforest.css` 和 Dockview / CM6 / AG Grid 库。数据源永不初始化；不请求 `/api/*`，不读写文档、SQL、设置或媒体。切分手势只改变 Dockview 布局。

构建：`npx vite build --config labs/lab-frame/vite.config.mjs`；产物 `labs/lab-frame/dist`，公开入口 `/labs/lab-frame/`。`release-version.json` 使用 Git 提交和构建时间标识；30 秒轮询和切回标签检测，发现版本变化直接重载，无需保存确认。

### 工具条位置

全局顶栏只显示 `OCR2MD lab-frame` 返回 `/labs/` 的链接、固定到分钟的版本号和全局状态。模块选择器及 AG 表工具条属于左窗；源码导航、Undo/Redo 属于右上源码窗。没有保存或撤销的业务后端时，Undo/Redo 保留但禁用；设置三窗亦遵循同一工具条位置。

### 全局字体设置（直接复用 Main 的 `ui/settings-module.js`）

直接调用 Main 的 `createSettingsModule`（AM S01）和 `openCMDJsonSource`（AM C24），不另建 AG、CM6 或参数控件。Lab 只注册 `globalUi.font.family = Sarasa`（只读）及 `globalUi.font.size = 16`（8–32，步长 1），并注入唯一环境适配 `ui/frame/settings-io.js`（F06）。设置编辑留在 Main 的 CM6 事务中，**点击顶栏「保存」时**才写入此 Lab 的独立浏览器 `localStorage` 设置文档；不接入 Main、MinerU、SQL 或媒体。旧版字号偏好只读迁移。

源码导航为 Shell 所有，包含「空白工作台」和「全局设置 / settings.json」，并通过 Settings 组件切换；返回工作台不丢编辑。自动更新不触发未保存提示。

字体沿用 Agent Link 约定的不可变 Sarasa Fixed SC GB2312 公共字体（约 1 MB；优先 local()，其余使用固定 URL），不在 Lab 复制或下发 17 MB 完整字体。Settings 依 Main 组件按需加载，非首屏强制模块。
