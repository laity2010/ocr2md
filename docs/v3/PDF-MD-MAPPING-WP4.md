# PDF ↔ Markdown 元素映射 · WP4/8 Sidecar v1 持久化与 CAS 门禁（2026-10-08）

状态：**WP4 真实持久化已打通：隔离 CAS、授权 HTTP、实机 iCloud 首次创建、NSFileCoordinator 协调替换、旧版本冲突拒绝和完整重读均已通过；多端同时修改的压力验证尚未进行。**

## 1. 实施产物

- `src/mineruMappingSidecar.ts`：定义可重建、版本化的 `PdfMdMappingSidecarV1`、生成、编码/解码、来源清单和严格数据校验。
- `src/mineruMappingSidecarStore.ts`：纯 WorkspaceFSV3 持久化接口：`savePdfMdSidecar`、`loadPdfMdSidecar`、`verifySidecarSources`。不接触 Node 本机文件系统、不绕过浏览器/服务端授权；每个保存请求只允许一项 CAS mutation。
- `src/mineruMappingSidecar.test.ts`：真实的 `FixtureWorkspaceRegistry` 隔离测试：首次 `create-file ifAbsent`、带修订号 `replace-file expectedRevision`、无修改免写入、并发旧版本拒绝、输入文档修改后的失效、图片/公式/表格来源契约继承、未授权隐藏路径、无文件协调替换拒绝、跨书目录引用拒绝。
- `ui-spikes/v3-directory/tests/mineruSidecarWp4Real.mjs`：默认真实数据**只读演练**；增加 `--commit` 后，仅通过 Mac Vault 的授权 HTTP/WorkspaceFS 提交保存，并重新加载验证 15 份来源哈希及 17 份受保护文件。
- `ui-spikes/v2/v3_mac_vault.py` + `v3_sidecar_coordinator.swift`：服务端仅放行 `/ocr2md/<书目录>/.ocr2md/pdf-md-map.v1.json` 和其父目录的 `stat`，隐藏目录依然禁止列举；Swift `NSFileCoordinator` 只对该 Sidecar 执行经过二次 revision 检查的协调替换。普通 Markdown 等文件替换仍返回 `EUNSUPPORTED`。
- `ui-spikes/v2/tests/v3MacVaultSmoke.py`：新增隐藏路径权限、Sidecar 创建、协调替换与冲突回归。
- `src/v3HttpWorkspaceFs.ts`：实际读取后端 `/__v3/fs?op=capabilities`，不再硬编码 `fileCoordination=false`。
- `ui-spikes/v3-directory/package.json`：`test:mapping`、`test:mapping:real`。默认只读；只有明确增加 `--commit` 参数才允许真正写入 Sidecar。

## 2. Sidecar 设计

**目标逻辑路径：**
`/ocr2md/Bufett’s Alpha/.ocr2md/pdf-md-map.v1.json`。

仅将版本化的**派生证据**保存为以下类型：

- 头部：`kind="ocr2md/pdf-md-map"`、`schemaVersion=1`、`workspaceId`。
- 文档来源：PDF、MinerU JSON、MinerU 原始 MD、6 组正式章节 source + working 的 **Vault 逻辑路径及原始 UTF-8 SHA-256**。不保存物理 Mac/iCloud 路径，也不将本地 WorkspaceFS `revision` token 当作跨设备通用文件版本。
- `relations`：224 个正文 `elementId`、PDF `pageIndex/pageNumber/bbox/pageSize/normalizedBBox`、`matchStatus`、原始 MD 的文本证据状态、章节/working 独立的 UTF-16 半开位置与上下文哈希、人工状态 `manuallyVerified=false`。
- 统计：`candidate-complete=123`、`candidate-partial=47`、`ambiguous=9`、`unmatched=36`、`unavailable=9`、单独保留 `ignoredDiscardedCount=91`。
- Sidecar **不包含用户 PDF 字节、OCR JSON 全文、MD 正文**，不带隐藏编辑标签，不把候选标成已人工审核。
- 仅在本书 `workDirectory` 范围内允许来源链接；严禁跨书、其它 Obsidian 区域引用。

**生成字节数据实测：** `344,569 B`，SHA-256 `168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2`；低于现有 Mac Vault `create-file` 的 512 KiB 限制。原始 JSON 或 MD 任一字节发生变化，会产生新的映射输入版本，旧索引需要复核而不是静默套用。

## 3. WorkspaceFS 写入门禁

1. `getCapabilities()` 必须报告 `casWrites=true`。文件写入不得绕过 `WorkspaceFSV3.commit`。
2. `stat` 证实目标父目录已存在且已授权；不自行建立隐藏目录、不绕过 `.obsidian` 保护策略。
3. `stat` 检查目标文件：不存在 → `create-file ifAbsent`；存在 → **必须**提供调用方实际读到的 `expectedSidecarRevision`；修订过期则拒绝。完全相同的内容可免写，但仍须重新验证来源。
4. 已有文件需要变化且 `fileCoordination=false`、`atomicBatch=false` 时阻止替换。服务端还需真正实现原子 `replace-file expectedRevision`，不能仅修改前端能力声明。
5. 保存前对 15 个来源进行 **`stat(nodeId, revision)` + 64KiB readRange expectedRevision + 完整 SHA-256 + 再次 stat**；任何输入变更返回 `ESTALE`，拒绝保存。读取内容允许最大 256MiB，超限直接报错，不能宣称已验证。
6. `commit` 后按真实 WorkspaceFS 重读 Sidecar，校验 SHA-256，随后重新检验来源；如果来源在竞态窗口里变化，返回 `sourcesStillCurrent=false`，前端不得启用定位。一次 POST 不自动重放；无法确认提交结果时必须先重新读取。
7. `loadPdfMdSidecar` 检查 schema/范围和来源全量 SHA；`sourcesCurrent=false` 时只能显示失效待刷新，绝不可按旧 UTF-16 offset 导航或写回。

**限制说明**：WorkspaceFSV3 当前没有跨 PDF/JSON/15 个文件的统一原子快照。保存前后检查能够发现变化，但不能提供真正的多文件事务；当文档在检查与提交间发生竞态时可能留下**已保存但已失效**的索引，必须通过加载时再核验拒绝使用。不要把单文件 CAS 当成多文件事务。

## 4. Mac Vault 真实解锁与端到端验收（2026-10-08）

**原先的两个阻断均已解除，但只针对 Sidecar，不扩张至其他用户文件：**

1. Mac Vault 的 `logical()` 仅对白名单逻辑路径 `/ocr2md/<书目录>/.ocr2md/pdf-md-map.v1.json` 及其父目录开放 `stat/read/create-file/replace-file` 所需访问。隐藏目录不能列举；`.obsidian`、`.ocr2md/chapter-boundary`、`.ocr2md/table-presentation.json` 等其它配置仍返回 `EACCES`。不可通过该入口删除、移动或复制 Sidecar。
2. 新增 `v3_sidecar_coordinator.swift`。其 `NSFileCoordinator(.forReplacing)` block **在协调边界内再次检查原文件 `st_dev:st_ino:mtime_ns:ctime_ns:size` 与 `expectedRevision` 相同后**，对同目录经 `fsync` 的临时文件执行原子 `rename`；版本变化返回 `ESTALE`。仅这个 Sidecar 路径允许该操作。普通 MD 的 `replace-file` 仍是 `EUNSUPPORTED`。
3. 服务端 `capabilities.fileCoordination` 在本 Mac Swift 协调器可用时为 `true`，但**只说明有限范围能力**：此后端仍不支持通用文件安全替换、批量原子提交，也不能保证多个源文件的全局事务。客户端由 `src/v3HttpWorkspaceFs.ts` 动态读取能力标志。
4. `com.daisor.ocr2md` 服务曾单独重载一次以应用代码。未触碰 AgentDock、Tunnel、DNS、Unison 或其他服务。

**真实 iCloud 目录（通过授权本机 HTTP/WorkspaceFS，绝非直接用 Python/Node 覆盖用户文件）：**

- 首次创建 `/ocr2md/Bufett’s Alpha/.ocr2md/pdf-md-map.v1.json` ✅
- 保存后重新加载并验证 Sidecar 完整结构、224 个 `relations`、15 份来源文件 SHA、状态分布 ✅
- 真实 iCloud 文件协调替换（相同内容字节校验）✅；Sidecar SHA-256 保持 `168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2`。
- 使用过期 `expectedRevision` 再次提交 → `ESTALE`，未覆盖最新版本 ✅
- 对普通 Markdown 发起 `replace-file` → `EUNSUPPORTED`，文件不变 ✅
- 服务实机检查其它隐藏 JSON 及 `.ocr2md` 目录列表 → `EACCES` ✅
- 所有 17 份被跟踪的 PDF/JSON/MD/working/副本原文件 SHA 运行前后相同 ✅。

**尚未宣称完成的验证：** iCloud 跨 Mac/iPad 同时写入竞争、断电/崩溃恢复压测、与外部编辑器多进程极端竞争，以及 WP5 PDF 实际像素定位。这些并非当前实机单次替换测试能证明；源文件失效仍依赖再次加载时的完整 SHA 检查。

## 5. 复验命令

在仓库根目录：

```bash
npm --prefix ui-spikes/v3-directory run test:mapping
npm --prefix ui-spikes/v3-directory run test:mapping:real -- \
  "/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha"
```

按需显式执行**真实写入**（默认命令仍为只读）：

```bash
node ui-spikes/v3-directory/tests/mineruSidecarWp4Real.mjs \
  "/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha" --commit
```

真实写入只使用授权的本机 Mac Vault HTTP/WorkspaceFS，提交时验证版本并进行保存后完整重读；在没有 `--commit` 时不接触 Sidecar。接口不会自动执行写入。

**航点状态：WP4 真实 Sidecar 创建、读取及协调 CAS 替换已通过。WP5 可以继续开发 PDF 元素定位层；真实滚动与 bbox 像素对齐仍需在 WP5 实机验收。**
