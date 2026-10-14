# IR-WP5/8 · Document IR AG Grid 工作台、章节目录及 PDF 来源定位

日期：2026-10-09。状态：**代码已实现，运行中/以测试结果为准；人工书籍审核待完成。**

## Architecture / decision

- V3 工作台的 AG 表第三模式 `Document IR` 直接展示 `DocumentIrV1.blocks`，不是旧 `pdf-md-map.v1.json` 的单个 OCR 元素行，也不是读取 MinerU 官方 Markdown。原有“文本块”“关联审核”保留，选择 IR 模式不破坏旧的 CodeMirror、PDF.js 或人工审核草稿。
- 此阶段真实 Obsidian Vault `.ocr2md/` 目录**没有** `document-ir.v1.json`；Mac Vault 隐藏目录只允许旧的两种 sidecar，且每次 create/replace 上限 512 KiB，而 IR 真实书籍为 2.26 MB。不可未经独立安全验收就放大服务端隐藏路径允许名单和写入配额。
- 因此 V3 **经用户授权 WorkspaceFS** 从本书 `json/` 下读取 MinerU 原始 OCR JSON、从书目录读取已选 PDF（不读取原版/章节 MD 作为 IR 输入），在浏览器中运行纯函数：`importMineruDocumentIrFromBytes -> proposeIrReconstruction -> proposeIrChapters -> validateDocumentIrV1`。新 Document IR 只在浏览器内存驻留；发生目录刷新或来源变化需重新加载。使用 `expectedRevision` 完整分块读取及重新 stat 检查，PDF/JSON 的真实 SHA 绑定在 IR 中。
- 支持同目录**多份 OCR JSON**：在顶部选择明确的一份后才构建 IR；不静默选第一份造成数据串线。只有一份时自动载入。若没找到 OCR、来源变动或超出试验阈值则显示错误不做假渲染。
- WP5 是**可预览、可操作的原型**：编辑、拆分、合并、同章重排、移动章节起点只是内存草稿；改变逻辑块文本记录操作历史并保留不可变 OCR 原文，未假称已经“人工审核正确”。可用 **导出草稿** 由用户主动下载完整 JSON 文件。单击下载**不代表持久化成功**，不会把 `dirty` 清为已保存；不向 Vault 作 PUT/POST/commit。经 iCloud 安全 CAS 持久化留给 **IR-WP7**，不提前突破服务端原有保护边界。
- WP6 才开始从 IR 生成章节 Markdown。WP5 源码窗顶部清楚标识 `IR 原文草稿`，显示逻辑块 `blockId`、当前文本、章节和全部不可变 OCR `jsonPointer`、pdf page、bbox，而**不冒充已生成的 Markdown**。

## FC (操作／需要／效果)

- **FC-IR5-01：选择 IR 模式**。工作目录打开后按 Document IR，且已选 PDF 和 OCR；建立 224 块的临时 IR，AG Grid 显示 `PDF 页 / 审核 / 章节 / 类型 / 待核对 / OCR 文本草稿`。全部 `audit=unreviewed`，WP3 的 17 项结构疑点及 WP4 的 21 项标题分类继续作为待审候选；不修改 Vault。
- **FC-IR5-02：章节目录与列筛选**。顶部章节筛选含“全部章节”，层级目录在折叠 `目录/编辑` 中，以 `chapterId` 过滤章节及其子节。AG 列筛选继续使用现有 checkbox Enum All。列固定、不可拖动，工作台三窗格及 iPad 分栏逻辑原样保留。
- **FC-IR5-03：PDF ↔ IR 文本块**。点表行，源码窗查看文本+原始 OCR 证据，PDF.js `focusRegion` 显示第一来源 bbox，来源跨页时保留所有 `sources[]` 和页列表而非捏造一个同页来源。定位要求 PDF 与当前工作目录相符，不根据旧 Markdown 坐标推断。
- **FC-IR5-04：安全草稿操作**。选行并填写操作理由，可以暂存文本校正（`edit-text`）、拆分（UTF-16，精确 source slice）、合并相邻 text 块、同章内部非锚点块上下移、移动当前章起点。调用核心纯函数，每步全量校验 IR，原始 OCR 来源不可变；跨章节重排/锚点破坏被拒绝。状态继续未审核，日志记录显式意图，旧模式安全回退。
- **FC-IR5-05：导出与防误丢**。按“导出草稿”触发本地 JSON 下载；变更未确认写入 Vault，所以按钮不会表明已保存。离开/切换工作目录、刷新或切 PDF 时，如果草稿 dirty 必须显式确认放弃。`beforeunload` 提示未保存状态。
- **FC-IR5-06：版本安全**。每次 OCR/PDF 通过 WorkspaceFS 按旧 revision 读取，读取前后 stat 核验。若来源数量不唯一，先手动指定 OCR，拒绝猜测。数据不落 localStorage/IndexDB，不写原书、不部署任何新的服务端 API。

## UIC

- **UIC-IR5-01**：选书 → `Document IR` → 若 1 个 OCR 自动加载；多个 OCR 明示候选下拉框。期望 AG 表显示真实 OCR 块、章节树可筛；所有原始数据读请求为 GET，0 Vault mutation。浏览器自动验收。
- **UIC-IR5-02**：点击 AG 行 → 上方 IR 源码 CodeMirror 展示文本/来源、下方官方 PDFViewer 定位到对应 PDF region，状态仍“待审核”。浏览器自动验收。
- **UIC-IR5-03**：选择行 → 展开“目录/编辑” → 填内容和依据 → 暂存 → AG 行与源码更新，操作日志含原 blockId，原始 JSON 不变，状态仍未审核。浏览器自动验收。
- **UIC-IR5-04**：导出草稿 → 用户实际下载 JSON，原始来源无写请求；未清理 dirty。浏览器自动验收。
- **UIC-IR5-05**：从 IR 切回“文本块”“关联审核”可用、再切回 IR 保留草稿；iPad 834×1194 不横向溢出。浏览器自动验收。
- **UIC-IR5-06**：人工目录/版式及所有候选的视觉准确性依赖真实 PDF 人工审核；不会因浏览器测试通过标成“已审”。此项 `manual-external`，交由 WP7/8 完成。

## Tests

- `npm --prefix ui-spikes/v3-directory run test:ir:ui`：本地授权 MacVault 测试夹具、PDF.js、真实 AG、CodeMirror、双份 OCR 显式选择、文本暂存、导出、回退、iPad、zero mutation。
- `npm --prefix ui-spikes/v3-directory run test:ir:ui:real`：本机真实 `Bufett’s Alpha`，验证 224 个块、19 个章节/小节、章节筛选、PDF 定位、iPad、源文件摘要不变。
- `npm --prefix ui-spikes/v3-directory run test:ir:structure`、`test:ir:chapters`：编辑源追溯及章节树基础回归。
- `npm --prefix ui-spikes/v3-directory run test:ui`、`test:review`、`test:bidirectional`：旧功能独立回归。

## Known limitations

- WP5 为内存编辑/显式下载，**不提供永久保存**。真实 IR 的 2MB+ 协同 CAS 写入与 Obsidian 回流、源更新后的迁移由 WP7 单独设计，不能因为 UI 有“导出”就称已写库。
- 当前真实 OCR 的章节划分、跨页候选和多栏顺序均是自动**暂定**，未人工核实；用户改正文也只是内存操作，不隐式批准。
- 尚无 IR 产出的最终章节 MD；WP6 才做。此时上方源码窗只显示来源文本及证据，故意明确标明不是正式 MD。
- 当前 WP5 读取 PDF 来绑定 SHA 有 128 MiB 限制，超大 PDF 需后续实现不全量载入的大文件 SHA 流式校验；浏览器 PDF.js 既有懒加载不受影响。
- 真实历史章节 MD 不参与新 IR 输入；旧审核板保持原机制，后续需制定旧人工审核向逻辑块的受控映射迁移，不能静默称已迁移。

## Final acceptance record (2026-10-09)

- ✅ `IR_WP5_BROWSER_FIXTURE_PASS`: fake authorized MacVault, **two OCR sources explicitly selected**, five AG blocks / two chapters, real PDF.js highlight, IR CodeMirror provenance, text correction + split → merge, operation-log download, iPad 834×1194, text/review mode fallback, **zero Vault writes**.
- ✅ `IR_WP5_REAL_BROWSER_PASS`: genuine `Bufett’s Alpha`: **224 blocks**, **19 chapters** (6 root + 13 subchapters), column filter and Appendix A branch yielding 11 rows, real PDF highlighted region, IR source element lookup, iPad fit, SHA unchanged, zero Vault writes.
- ✅ `IR_WP3_RECONSTRUCTION_UNIT_PASS`, `IR_WP4_CHAPTER_UNIT_PASS`: core provenance and chapter operations preserved.
- ✅ `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`, `WP7_REVIEW_CAS_UNIT_OK`, `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`: old browser workflow / CAS audit / PDF–MD navigation still work.
- ✅ `git diff --check`, PDF/JSON/old map SHA remain exact, no real Vault `document-ir.v1.json` created.
- ✅ Preview published to `https://ocr2md.laity.bid/v3-directory/` via existing `publish:preview`, **no Mac Vault server restart**, no privileged hidden-path expansion.
- ℹ️ Normal standalone IR core TypeScript tests passed. Repository-wide strict TypeScript still has **pre-existing unrelated** errors under `src/v3HttpWorkspaceFs.ts`, AG Grid double-click event typing, and PDF.js declarations; do not label full-repo type checking clean.
- ⚠️ Human visual confirmation of 21 title proposals and 17 structural candidates is still **pending**. User-facing UI has no final in-Vault save in WP5; download is not a CAS commit. Next formal persistence gate: IR-WP7.

Human status: **待用户审核**. Git intentionally uncommitted WIP preserved; no force operation performed.
