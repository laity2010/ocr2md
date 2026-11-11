# Lab Frame · 空白四窗外壳

独立的无数据布局样板，起点为 Main Git `8cfba88`。不是带业务模块的 Main 镜像 Lab，不能作为 Main 的可晋升业务版本。

独立 API：`createFrameWorkspace`（四窗 Dockview / 切分）、`createEmptySettings`（空白设置三窗）、`startFrameAutoUpdate`（无未保存阻断的版本探测）；所有消息仅由装配根写入 `#status`。

复用 Main 的 `styles.css`、`workspace.css`、`outline-grid.css`、`settings-module.css`、`pdf-preview.css`、`obsidian-everforest.css` 和 Dockview / CM6 / AG Grid 库。数据源永不初始化；不请求 `/api/*`，不读写文档、SQL、设置或媒体。切分手势只改变 Dockview 布局。

构建：`npx vite build --config labs/lab-frame/vite.config.mjs`；产物 `labs/lab-frame/dist`，公开入口 `/labs/lab-frame/`。`release-version.json` 使用 Git 提交和构建时间标识；30 秒轮询和切回标签检测，发现版本变化直接重载，无需保存确认。

### 工具条位置

全局顶栏只显示 `OCR2MD lab-frame` 返回 `/labs/` 的链接、固定到分钟的版本号和全局状态。模块选择器及 AG 表工具条属于左窗；源码导航、Undo/Redo 属于右上源码窗。没有保存或撤销的业务后端时，Undo/Redo 保留但禁用；设置三窗亦遵循同一工具条位置。
