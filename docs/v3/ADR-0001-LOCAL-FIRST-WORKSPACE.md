# ADR-0001: ocr2md v3 Local-first Workspace FS（2026-10-08）

状态：WP0 架构方向冻结；WP1 细化接口，WP6/7 以 iPad 实机验证决定原生桥实施深度。
作用域：ocr2md v3 基础设施，不代表 v2 生产切换。

## 1. 决策

ocr2md 的工作数据读写采用 **local-first**：
- UI、OCR、注释审计、翻译、PDF 等业务仅通过 Workspace Service/FS 访问逻辑工作区；
- 工作区文件（MD、PDF、JSON、图片、sidecar）是持久化业务数据；SQLite 是设备私有的可重建索引，不与云盘同步；
- 每个设备使用适合它的本地 Storage Adapter；Mac 原生文件系统优先；iPad/iPhone 首先验证 Browser Storage（OPFS/IndexedDB + SQLite WASM），必要时使用薄的 Swift/WKWebView 文件桥；
- iCloud、Unison、Google Drive 是工作区外部的异步同步/镜像 Provider，不参与“目录加载/本机保存已成功”的判定；
- v2 业务 UI 和数据格式优先原样复用，不重写注释/PDF/翻译功能；v2 与 v3 并行验收，未经人工确认不替换生产入口。

## 2. 层次与单向依赖

Web UI/业务（ChapterRepository、PDF、审计）
  -> Workspace Service（选择/权限/事务/文档身份/事件）
  -> Workspace FS v3 接口（基于现有 src/workspaceStorage.ts 扩展）
  -> Storage Adapters（MacLocal、BrowserOPFS、未来 NativeBridge、只读测试 Fixture）
  -> 设备本地工作文件

Workspace Indexer（SQLite：目录、全文/注释、缓存索引）只订阅 Workspace FS 变更，始终可丢弃并重建。
Sync Provider（iCloud/Unison/GD）只与工作副本/受控 outbox 交换文件，不被业务请求同步调用。
可选的 GD API Storage Adapter 作为兼容/迁移路径存在，不能反向让业务依赖其 ID/OAuth/协议。

**禁止依赖**：UI -> Google Drive API、业务 -> 绝对 iCloud/GD 宿主路径、目录 UI -> ChapterProjectStore 内部字段、Sync Provider -> 编辑器内部状态。

## 3. 尽量复用 v2 已有资产

- src/workspaceStorage.ts：已有 readFile/writeFile/exists/readDirectory/createDirectory/copy/rename/delete/stat；v3 优先扩展，不复制一个不兼容的新协议。
- src/googleDriveWorkspaceStorage.ts + src/googleDriveApiGateway.ts：已有 GD Adapter/Gateway，留作兼容性对照与回归样本。
- ui-spikes/v2/src/chapterRepository.ts：业务入口契约保留；可从底层逐步替换 IO 实现。
- ui-spikes/v2/src/persistentChapterRepository.ts：保留现有 HTTP API 外形，按模块迁移。
- ui-spikes/v2/dev_server.py：目前直接承担目录、章节、保存和 PDF 文件定位；分阶段转为 API 薄适配层。

## 4. WP1 必须明确的协议（不得先实现再补设计）

- 工作区挂载与路径：workspaceId + logicalPath；路径标准化、Unicode、大小写、软链接、越界防护；不暴露物理路径。
- 资源身份：稳定 itemId，不以可变路径作为唯一身份；重命名/移动/跨端身份映射的元数据格式在 WP1 定义。
- IO：list/stat/read/write/create/move/rename/delete，含 readRange/stream 等大文件能力，避免全文加载 PDF。
- 安全写入：expectedRevision/CAS；原子提交边界、文件组（working+sidecar）回滚/恢复策略、fsync 与文件协调；区分浏览器临时草稿和工作区持久保存。
- 事件：workspaceChanged、entriesChanged、conflictDetected；工作区切换前保存/放弃/取消由上层状态机决定，不允许目录服务直接 reload 整个 UI。
- 错误：ENOENT/EEXIST/ENOTEMPTY/ESTALE/EACCES/QUOTA/OFFLINE/CONFLICT，跨 Adapter 保持同一业务语义。
- 同步：localSaved、queued、providerObserved、conflict；没有真实远端确认不能宣称整条链路完成。

WP1 要兼容现有 WorkspaceStorage，可通过附加接口/能力协商渐进迁移，不做破坏式改名。

## 5. 各设备存储假设与待验证风险

**Mac**：本地 APFS 工作副本，SQLite 本地索引；iCloud/Unison/GD 在外部异步进行。当前 4176 使用 iCloud Obsidian 容器目录，不能把它当作真正独立于云盘的 APFS 工作副本；WP3 要用普通本地目录验收并制定安全迁移过程。

**iPad/iPhone**：Safari PWA 可以测试 OPFS/IndexedDB，但私有空间不能等同于「文件」App 的 iCloud/Obsidian 文件夹，也不保证永不清理；不能把 OPFS 唯一副本当最终生产方案。WP6 评估 SQLite WASM、PDF WASM、断网、重新打开、内存与存储回收行为。

**Native Shell 仅在必要时启动**：WKWebView 保留 Web UI；Swift 文件桥访问授权的本地/iCloud 文件，必须受原生侧来源白名单、用户授权目录、文件协调和操作白名单约束。远端发布 Web 代码不能无限制调用本地磁盘。早期做 iCloud 目录授权、权限持久化与 Obsidian 目录双向写入的最小实机门禁，失败时先调整方案，不能视为已验证。

**同步拓扑**：iPad 本地 -> iCloud -> Mac -> Unison/GD -> 其他节点，反向也成立。设备独立可离线操作；多端修改可能冲突，绝不采用无条件最后写入覆盖。SQLite/WAL、PDF 预览页缓存、设备临时数据不跨云同步。

## 6. v3 航路的架构门禁

WP0 基线及 ADR -> WP1 接口 -> WP2 目录独立 -> WP3 Mac Local + SQLite -> WP4 章节/PDF 文件入口统一 -> WP5 Web 回归 -> WP6 iPad PWA 性能/权限先验验证 -> WP7 如需要开发 Native Shell -> WP8 离线持久化 -> WP9 iCloud/Mac/GD 双向同步冲突验收 -> WP10 三端上线/回滚。

不变量：
1. v2 未提交 WIP 不丢、不清理、不覆盖；禁止 reset/clean/rebase/force push。
2. 未通过 Feature Contract、UIC 和真实设备验收，不替换 v2 生产服务。
3. 工作区单次保存成功 ≠ 远端同步成功；不伪造云端同步状态。
4. 无声覆盖/静默丢弃用户修改视为阻断发布的 P0 缺陷。
5. 每个航点最小改动、独立可回退，v3 层不能要求 PDF 或翻译模块同步大改。

## 7. 延后决策

- 目录 SQLite 索引是否能带来用户可见收益：先用 WP0 测量与 WP2 网络/渲染剖析决定，不因架构流行盲目引入。
- iPad 是否必须安装 App：以 WP6 浏览器离线性能和 iCloud 授权门禁结果决定；若采用 Native Shell，也仅承担设备能力。
- 同步版本号、稳定 ID 元数据、跨设备文件组事务：WP1 定义协议并制定回归测试，再具体实现。
- 对既有 Unison 配置和 Agent Link/Tunnel 不做任何 WP0 改动。
