> **2026-10-08 更新：** v3 的「设置」标签已从独立 HTML 表单升级为直接复用 v2 `TableConfigurationGrid` 及 CodeMirror 通用 JSON 编辑器。下文“设置”实现为历史结构说明，最新请参阅 `WP3-SHARED-V2-SETTINGS-COMPONENT.md`。

# v3-directory 双标签 AG Grid 目录（2026-10-08）

## 已部署（两个 Safari 入口，同一个真实 Mac Vault）

- Mac Safari：`http://127.0.0.1:4176/v3-directory/`
- 外网 iPad Safari：`https://ocr2md.laity.bid/v3-directory/`
- API 不变：同源 `GET /__v3/fs`, `POST /__v3/fs/commit`；根是真实 Mac `iCloud/Obsidian/ocr2md`。
- 本次修改**只有独立 v3 静态应用**；不更改 Mac 真库根、不修改 Tunnel/iCloud/DNS、不重启 4176。

## UI 定义

主界面仅两个 tag：`工作目录`（默认选中）与 `设置`，通过 aria tab/tabpanel 切换，不重载页面。

**工作目录：** AG Grid 36 社区版复用 v2 已安装依赖，暗色主题、行虚拟化、列排序、筛选、缩放。表上方显示当前真实逻辑路径 `Obsidian/ocr2md/`（Root）或 `Obsidian/ocr2md/ocr2md/书名` 等。**首行采用 pinnedTopRowData**，始终显示「↩ 返回上级目录」，不参与排序和筛选。Root 时此行禁用。点击任意目录所在 AG 行或名称按钮直接进入子目录；进入与返回时清除当前目录临时筛选，保留页面。名称筛选栏仅过滤**当前已加载页**，可点击「加载下一页」搜索更多。选择文件后可从下方文件操作折叠区读取，按需新建/复制/移动/重命名/删除单文件或空目录；原有服务器安全门禁不变。

**设置：** 参考 v2「配置」的单一配置源思想：表单与一份 JSON 共用配置，保存后即时生效，保存到本浏览器 localStorage，不会改变后端的硬安全限制。全部可调项：`gridFontSize`（12..20）、`gridDensity`（紧凑/标准/宽松）、`showTypeColumn`、`showSizeColumn`、`showModifiedColumn`、`showRevisionColumn`、`foldersFirst`、`autoRefreshSeconds`（0/30/60/300 秒）、`showFileOperations`、`clickFileReads`。用户可「恢复默认」。另有 Vault 远程授权、显示 Mac 本机密钥、保留授权和清除授权入口（**访问密钥不写入配置 JSON**）。目前不可调整服务端根目录、云同步策略或隐藏目录权限，这些是安全约束，不是界面偏好。

AG Grid 主题与表格字号、行高根据配置热更新；文件目录数据仍由 `V3DirectoryController` / `MacVaultHttpRegistry` 取得，不持久化到 IndexedDB。

## 验收

- `npm --prefix ui-spikes/v3-directory run test:settings`: 验证完整配置、未知配置项、范围校验、不包含密钥。
- `npm --prefix ui-spikes/v3-directory run test:ui`: 真正独立临时磁盘 + 生产后端相同 HTTP 处理器，经 Chrome Touch 模拟登录、Root/目录 AG Grid 浏览、首行父目录行为、文件创建读回重载、复制删除、设置保存和恢复；确保 `.obsidian` 未泄漏。
- `npm --prefix ui-spikes/v2 run typecheck`、`npm run compile`、`python3 ui-spikes/v2/tests/v3MacVaultSmoke.py`、`git diff --check` 通过。
- 公网 Chrome 触控尺寸模拟：iPad 834px / iPhone 390px 验证双标签、真实目录、已有真库验证文件读回、无横向溢出。不是物理 iPad Safari 实机验收。

静态客户端 minify 后打包约 1.1 MB。请在 iPad Safari 直接刷新打开公网 URL，已有配对密钥可沿用；未经授权时在「设置」中连接后返回「工作目录」。

**尚未实现：** PDF 预览/文档校对工作台整合、服务器范围的配置共享、Obsidian 移动端文件直连；v3 本阶段仍以 Mac Obsidian Vault 为唯一权威后端。
