# WP1/10 — Workspace FS v3 核心协议（2026-10-08）

状态：协议与前置条件门禁已实现；不代表任何生产 Adapter 已通过 v3 的 CAS/事务/跨设备同步验收。
关联：ADR-0001-LOCAL-FIRST-WORKSPACE.md；WP0-BASELINE.md。

## 1. 这一个航点交付什么

- 新增 `src/workspaceFsV3.ts`：版本化、可移植的**业务侧协议** `WorkspaceFSV3`，以及路径、工作区切换、危险写入的共享校验函数。
- 新增 `src/workspaceFsV3.test.ts`：无需 GD、iCloud 或 Mac/iPad 真机的契约正反向测试。
- **保持不变**：`src/workspaceStorage.ts`、`GoogleDriveWorkspaceStorage`、`VsCodeWorkspaceStorage`、`ChapterRepository`、v2 前端、Python 服务、PDF 渲染器及 Unison 配置。
- WP1 不迁移生产业务、不触碰正式文档库。只有在 WP2/WP3 后端适配器确实提供并经过测试的安全语义，才可以宣称支持 v3。

## 2. 两层接口，避免假兼容

`WorkspaceStorage`（旧）：低层 readFile/writeFile/list/rename/copy/delete/stat，旧调用方继续使用；其中 **writeFile 不带 expectedRevision，不能直接作为 v3 的安全保存入口**。

`WorkspaceFSV3`（新）：不继承 `WorkspaceStorage`，业务调用方只看 `list/stat/readRange/commit/subscribe/getCapabilities`，不接触底层无条件写入。一个新的 Adapter 可以在内部复用旧 `WorkspaceStorage`，但必须独立实现可靠的 CAS、幂等、事务、持久化，不得简单包装成 v3 即声称安全。

`WorkspaceMountRegistry`：只负责列出工作区并打开指定 workspaceId，不能让业务由宿主绝对路径猜测身份。工作区选择状态属于上层协调器；FS 本身不切换其他工作区。切换成功后才关闭旧 `WorkspaceFSV3.close()` 句柄，关闭必须只释放资源、不删除文件。

```text
v2 UI / ChapterRepository (仍在旧链路)
           |
       [WP2/WP4 逐步迁移]
           v
v3 Directory / Chapter / PDF business
           |
     WorkspaceFSV3 port
           |
    Storage Adapter (Mac/Browser/Native/Fixture)
           |
    device-local business files
           :
    background Sync Provider(s) -- separate, never block local IO
```

## 3. 路径、ID 和目录身份

- `workspaceId`：每个逻辑工作区唯一的持久 ID，必须跨设备保留，不使用 GD folderId、iCloud URL 或 APFS 绝对路径。v3 ID 只允许安全 ASCII 标识，建议生成 UUID 并以字符串提供。
- `path`：工作区根内的绝对 POSIX 逻辑路径，从 `/` 起；不使用 /Users/... 或 /data/... 作为协议路径。禁止空段、`.`/`..`、反斜杠、控制字符、越界；Unicode NFC 规范化；输入 commit 必须是规范化后的路径。
- `nodeId`：文件/目录的稳定逻辑身份；重命名和移动保持 nodeId，复制生成新的 nodeId；hash、mtime、filename 均不等同身份。
- `revision`：该节点在**当前工作副本**的可比较、不可伪造过期状态的 opaque token；不保证它等于 GD 版本号或 SHA。读取节点/范围时返回 revision，写入需要预期版本 CAS。
- `generation`：目录列表快照的失效令牌；不是节点 revision。分页 cursor 必须绑定 generation；变更导致旧游标失效时返回 ESTALE，不允许悄然漏项或重复项。
- Adapter 必须以文件句柄/打开目录后的真实物理位置约束 sandbox root，不跟随指向 root 外的 symlink，验证目录改动后的路径；仅字符串前缀检查不够。HTTP 传输 URL 解码一次后按逻辑路径再验证；`%2e%2e` 在核心函数内是普通文件名字符，不做第二次解码。
- Unicode NFC 与底层大小写不敏感文件系统产生同路径碰撞时返回 ECONFLICT/EEXIST，而不能合并不同文件。

## 4. 文件 IO 与目录命令

| 业务操作 | v3 协议入口 | 必要保护 |
| --- | --- | --- |
| 浏览目录 | `list(location,cursor?)` | generation + stable nodeId；可分页 |
| 查元数据 | `stat(location)` | 不暴露宿主 path；返回 revision |
| 读取大型 PDF/JSON | `readRange(nodeRef,{offset,length,expectedRevision?})` | 范围读取；版本连续性；不得无条件全量读 |
| 新建文件 | `commit(create-file)` | `ifAbsent:true`；不能无声覆盖 |
| 新建目录 | `commit(create-directory)` | `ifAbsent:true` |
| 修改文件 | `commit(replace-file)` | 强制 expectedRevision，原子 CAS |
| 改名/移动 | `commit(move)` | 同 workspace；旧 nodeId；新路径 `ifAbsent:true` |
| 复制单个文件 | `commit(copy)` | 来源 expectedRevision；目标新 nodeId；新路径不存在；目录树复制需单独事务规范 |
| 删除普通资源 | `commit(remove)` | expectedRevision；禁止根目录/隐式递归 |
| 递归删除目录 | `commit(remove-tree)` | expectedRevision + expectedTreeRevision + 显式 recursive:true |

- `commit({workspaceId,requestId,operations})` 返回确认表示**本地事务已完成且达到 Adapter 声明的持久化语义**；若网络超时重试，同一 requestId+同一请求须幂等返回相同结果；同一 requestId 对应不同请求必须冲突拒绝。
- `validateCommit` 是 Adapter 操作前共同校验，**不能代替** Adapter 自身的磁盘级 CAS 与原子事务。后端必须在同一提交锁或等价事务内重新核对 identity/revision。
- 文件组（例如 working.md + .ocr2md.json）必须作为 1 组操作。若 `atomicBatch=false`，多操作 `commit` 必须拒绝 EUNSUPPORTED，不允许尝试逐个写再宣称成功。
- `atomicBatch=true` 仅适用于确实有持久日志/事务清单、崩溃恢复或等价机制的实现；`os.replace` 两次本身不是跨文件原子事务。恢复时必须能区分未完成组并回滚/向前完成，不能留下半章工作稿。
- 能力声明 `casWrites/rangeRead/atomicBatch/notifications/durableLocal/fileCoordination` 必须来自后端可用能力的真实检测，而不是根据设备名称静态猜测。只读后端可用 `casWrites=false`，拒绝 commit。

## 5. 稳定身份元数据的同步草案（WP9 实现前不能宣称跨端稳定已验证）

推荐逻辑元数据空间：`/.ocr2md/fs-v3/`；由 Workspace FS 管理，不作为普通 OCR 文档向用户展示。规范建议：

- 持久化 `workspaceId`，每个条目持久化 `nodeId`、kind、当前逻辑路径与先前路径/变更历史。
- 多写端身份变更采用**每设备独立、不可变更事件记录**，例如 `identity-events/<deviceId>/<eventId>.json`。每条含 protocolVersion、workspaceId、nodeId、eventId、originDeviceId、action、path、previousPath（如有）、baseRevision/tombstone（如有）。避免多个设备覆盖同一热 manifest。
- 重命名/移动后跨云盘身份绑定必须验证事件因果与版本。两个设备同时创建同名文件、同时改名、删除与编辑交错时保留冲突分支并人工解决。
- 节点内容 hash 可辅助迁移/恢复，不可拿相同 hash 推断两个文件就是同一 nodeId。丢失 metadata 时标记 `identity-unresolved` 并执行受控导入；不能生成新 ID 伪装已无缝合并。
- 这是 **WP1 的协议草案和约束**。事件文件序列化、迁移旧数据、跨 Provider 合并算法与 tombstone GC 必须在 WP3/WP9 分别验证，不在 WP1 假装已经可用。

## 6. 工作区切换边界

`planWorkspaceSwitch(currentId,nextId,{dirty,saving,inFlightOperation})` 不触碰 UI，只产生决策：

- saving 或其他任务进行中：blocked；
- 相同 workspaceId 且空闲：no-op；
- dirty 且目标不同：resolve-draft（保存/放弃/取消由业务状态机处理）；
- 无未完成任务及修改：proceed。

执行 `proceed` 仍需 Adapter `open(nextId)` 成功，成功后才发 `workspace-selected`；失败时仍保持原工作区和草稿，不做页面重载。UI 可通过 `entries-changed/conflict/workspace-selected` 订阅变化；无通知能力的后端需要显示 stale/刷新机制。

## 7. 错误、同步状态与外部事实

统一错误码：`EINVAL ENOENT EEXIST EISDIR ENOTDIR ENOTEMPTY EAMBIGUOUS ESTALE EACCES EQUOTA EOFFLINE ECONFLICT EUNSUPPORTED EBUSY`。不向前端暴露私有磁盘绝对路径、GD token、完整文件夹授权句柄。

同步观察状态分层：
- `local-saved`：仅当前设备工作数据完成持久化；
- `queued`：后台计划投递特定 Provider；
- `provider-observed`：指定 Provider 真正看到了明确版本标识；
- `conflict`：已发现不同版本，阻止无声覆盖。

单个 Provider 的 observed 不表示其他设备都已同步，更不能凭本机写入就宣称 iCloud->Mac->GD 全链路完成。队列可离线积累；重连异步传播。

## 8. WP2/WP3 实现验收入口

WP2（独立目录组件与 Fake/Fixture Adapter）：
1. 在独立 fixture 中验证 list/create/rename/move/copy/remove、分页 generation 失效、非法路径、权限与目录越界。
2. 工作区切换 dirty/saving/inFlight 防线，打开失败原工作区保持不变；目录 UI 不触发全页 reload。
3. 旧版 `/__workspace/directories` / `project-directory` 暂留兼容桥，逐步切走对 `ChapterProjectStore` 的直接依赖。
4. 用实际 iPad Safari 测量网络延迟、目录渲染、切换初始化，而不是只优化 Mac `iterdir()`；WP0 基线显示本机目录 P50 3.81ms vs 公网 Mac 回环 P50 1.689s。

WP3（Mac Local + SQLite）：
1. 本地不受 iCloud/GD 缓存回收影响的真正 APFS 工作副本；Filesystem Adapter 的 root/软链接/竞态安全审计。
2. CAS 测试：两个编辑者相同基线不同修改，第二个必须 ESTALE；跨文件组模拟中断/崩溃并恢复一致性；requestId 幂等恢复。
3. SQLite 仅索引和加速检索，可删除后从工作副本重建，不将 SQLite/WAL 推送到同步链；系统文件变更监听漏事件时必须可扫描校验。
4. 通过 Mac Local 适配器后再考虑在 WP4 接入当前 PDF/章节业务。

备注：WP1 的运行时测试验证**协议校验函数**，不是磁盘 Adapter 的事务一致性，也不是 iPad 实机/全链路性能验收。WP2、WP3 未通过前不要修改生产路由。
