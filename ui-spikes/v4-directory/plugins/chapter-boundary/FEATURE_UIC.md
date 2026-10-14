# OCR2MD V4.6.0 / 章节定界独立插件 · Feature & UIC（2026-10-13）

## Feature Contract

**目标**：把旧 V3 的章节定界完整控制器迁入独立 WCP 插件（`ocr2md:chapter-boundary`），保留原 DIRjson 算法和章节业务；新开发不得在 WCP 内核或其他 UI 插件添加章节特例。

1. 在工作目录选择一份**书籍根文件夹（直属 PDF）**后执行「设为工作目录」：`ocr2md:filesystem` 先按原方式验证并发布 `workspace.selected` CQE 事件；章节插件收到后交由 `plugin.json.activateOn` 声明的通用导航自动激活「章节定界」顶栏 Tab，整个交接不刷新页面。
2. **首次打开**：先检测已保存的 DIRjson，验证 generation 与原始 PDF/OCR 来源；仅在不存在有效快照时从 `json/` 的 MinerU OCR JSON 初始化。源数据严格只读。从 V3 固化到本插件的 `irWorkbenchPanel.ts`、`pdfPreview.ts` 和辅助文件，原业务算法未重新实现。共享的纯 DIRjson 转换库、V2 AG/WorkingEditor 继续直接复用，修改章节专属 UI 不再碰 V3 源码。多 PDF 可选择，读取支持分页，目录文件数量上限受控。
3. **三窗与旧样式**：WCP TriPane 唯一布局 AG、全书 CodeMirror 源码、MD/PDF.js 预览；标题列、独立成章（首章锁定）、章节文件名、只看一级标题、起始编号保留原样。V3 AG 列编辑/源码标题样式、深色 gutter、PDF.js viewer 样式由插件内 `legacy-theme.css`/`pdf-viewer.css` 提供，不向其他插件注入 V3 全局布局。
4. **校阅操作**：标题更改、源码增删改、行号补录／删除标题（PDF 页码证据必选）、独立成章合并、文件名修改、撤销重做与 PDF/MD 双向定位使用移植的原控制器。
5. **持久化边界**：工作目录与 PDF/OCR 永不因打开而写。保存需用户明确点击和确认，DIRjson 通过 CQE 以不超过 60 KiB 消息分段进入唯一授权文件服务，再由 Mac 旧专用 `ir/commit` 执行 CAS；保存后读取 generation 和 SHA-256 比对。发布必须先完成文件布局并保存，再次显式确认；由 Mac 旧 `ir/publish-chapters` 生成 Obsidian 兼容 MD，既有章节目录先备份。通用文件服务不开放任意文件写操作，V4 不修改 V3 凭据存储。
6. **生命周期**：所有标签切换使用 WCP ResidentHost；章节插件离屏驻留 AG、CodeMirror、PDF 和草稿，未经用户保存不得无提示销毁。默认开发内网 4292；公网稳定路径与 V3 不改。

## UI Interaction Contract

| ID | 初始 | 操作 | 预期 UI | 数据副作用 | 不变量 / 自动化 |
|---|---|---|---|---|---|
| BND-01 | 已连接 V4 Vault，AG 工作目录含 PDF | 双击进入书籍，点击设为工作目录 | 顶栏自动选中章节定界；AG+源码+PDF 三窗；无需刷新 | 读取、初始化内存 IR | 无 Vault 写；Chromium/WebKit `chapterBoundaryMigration.mjs` |
| BND-02 | 未保存 DIRjson | 再次打开书籍 | 优先读已保存快照；无快照才初始化 OCR | 无写入 | 来源与版本必须匹配，否则停止 |
| BND-03 | OCR 两个标题 | 勾选「只看一级标题」或修改独立成章 | 仅改变 AG 过滤或章节文件分组，不改 Markdown # 等级 | DIRjson 内存草稿 | 原始 PDF/OCR 不变；双浏览器自动 |
| BND-04 | 已载入 PDF，章节行可选 | 点击 AG／源码／PDF 原文 | PDF.js 对应页或 OCR 区域，源码定位块 | 无写入 | 唯一匹配才自动定位；浏览器和 iPad 手工审核 |
| BND-05 | 源码含块/标题 | 点击 CodeMirror 行号、补录标题、输入 PDF 页码并勾核对 | AG 和源码出现补录标题；可撤销重做；可删除 | 草稿变更 | 未选核对则不允许插入；双浏览器自动 |
| BND-06 | DIRjson 草稿待保存 | 点保存标定，并确认 | 保存成功、版本和 SHA 回读显示 | `boundary.ir.begin/append/commit` 专用 CQE → Mac `ir/commit` | 版本冲突不得覆盖；仅隔离模拟真实 Mac 后端跑自动化 |
| BND-07 | 已保存并完成章节文件边界 | 点发布章节并确认 | 新 `chapters/*.md` 可用于清洗，旧版按规则备份 | Mac `ir/publish-chapters` | 未保存或未定界时按钮禁用；仅隔离样本自动化 |
| BND-08 | 已载入源码 + 预览 | 进入工作目录，再返回章节定界 | AG、CodeMirror 和 PDF 继续保留原实例与状态 | 无写入，无重新初始化 | WCP ResidentHost，双浏览器自动；设置↔工作目录另由独立设置回归验证 |
| BND-09 | 物理 iPad 外网 | 多指触控、PDF 滚动、源码光标移动 | 无错误跳转或丢光标 | 仅明确保存写入 | `manual-external` 待用户审核，不冒充真机已通过 |

**测试源**：`web-component-platform/tests/chapterBoundaryMigration.mjs` 使用一次性临时目录，真实生产 HTTP Handler + 隔离授权密钥 + 真实 PDF/MinerU OCR，Chromium/WebKit 端到端。原 V3 回归不会因为 V4 迁移而更改。

**用户审核状态**：待实体 iPad Safari 审核（未验收，非已经通过）。

### UIC BND-10 · 大型真实书籍内网恢复（失败案例 2026-10-13）

- 初始：iPad 内网打开 `4292`，书籍存在已有约 3 MB 的 DIRjson，工作目录已设定。
- 操作：自动进入章节定界；若临时网络失败，点击「重试加载」。
- 预期：书籍名称及时显示；恢复百分比随 DIRjson 分段读取推进；最终 AG／源码／PDF 展示原书，且不重新导入 OCR。不成功时显示明确的状态错误，而非只剩空白布局。
- 数据副作用：仅授权 GET，绝不因进入、失败或重试触发写入。
- 不变量：内网代理必须有 `GET /__v3/ir`，不继承 localhost 免鉴权；未保存状态不得无提示重试覆盖；Mac 原文、DIRjson、chapters 不被测试修改。
- 自动化：`web-component-platform/tests/fastdevLanChaptersProxy.py` 和 `tests/chapterBoundaryLive4292.mjs` 使用真实书籍只读，Chromium/WebKit 验收；实体 iPad 触摸仍待人工审核。


### UIC BND-11 · v3 外观及 AG → 源码 / PDF 三窗定位（2026-10-13）

- 初始：内网 v4.6.1 在 iPad/Chromium/WebKit 进入章节定界，已通过 CQE 只读恢复原书 DIRjson 和 PDF；用户把预览切到 MD。
- 操作：点击 AG 表中任意可见的 OCR 标题行（非勾选框），随后点击另一行，重复测试 PDF 不同页。
- 预期：AG 当前行持久高亮；CodeMirror 使用 DIRjson 精确 range 滚动到目标并显示金橙色持续高亮，不抢 iPad 光标焦点；预览自动切回 PDF 原文，跳到相同 OCR 页，并在真实 bbox 上画出 v3 3px 橙框和透明填充，旧框被清除。同页/跨页选择皆可正确更新，高亮不写入 DIRjson。
- v3 样式：章节筛选、起始编号、状态位于 AG 头，源码无多余标题栏，PDF/MD 预览及页面工具位于右侧下窗顶；三窗仍由 WCP TriPane 提供可拖动布局（不是新增布局框架），原 v3 暗色 PDF、CodeMirror 和 AG 风格限制在本插件。
- 数据副作用：仅只读网络请求和 UI DOM/CodeMirror 装饰；无文件写入，不改用户 DIRjson/章节数据。
- 不变量：CQE 文档块 ID 与源码 `data-ir-highlight-block-id` 一致；PDF overlay `data-element-id` 和页码匹配来源；即使 CodeMirror 无焦点也必须可见。勾选「独立成章」不应误触定位或改变 `#` 标题层级。
- 自动化：`web-component-platform/tests/chapterBoundaryAgPdfLink.mjs` 使用真实《Buffett’s Alpha》只读路径，阻断所有写请求；通过浏览器公开 DOM/稳定 testid 核对两个不同 AG 行、持续源高亮、原版 PDF bbox 样式、AG 当前行、v3 窗头布局。WebKit 测试模拟 iPad 尺寸；实体 iPad 触控高亮仍待用户最终审核。

### UIC BND-12 · 「独立成章」勾选快速反馈（v4.7.4，2026-10-13）

- **初始状态**：内网真实已保存 DIRjson 的书籍，AG 可见独立成章列，已恢复书籍 200+ 来源块，底部 PDF.js 可继续预览，用户正处于根目录章节定界。
- **操作**：先检查第一标题锁定；连续取消三行已勾选的非首标题，再重新勾选其中一行，随后使用顶栏全局撤销／重做。
- **预期界面**：首个标题始终锁定，其他标题加载后即能点击，不再沿用加载阶段 `busy=true` 创建的禁用状态。选中／取消在 AG 列立即可见；取消后对应章节文件名继承前一个勾选标题，恢复勾选后重新分配独立序号；原 Markdown 标题层级不变、全书 CodeMirror 源码文本/光标位置不被重建；PDF 不跳页。
- **性能不变量**：点击只执行已验证的 `v2IrSetStandalone` DIRjson 领域转换、内存 undo 快照、AG 有变化行的 `applyTransaction`，不生成完整 Markdown ZIP／全书映射，不重新加载 PDF。昂贵的 `generateIrMarkdownBundle` 推迟至需要实际保存／发布／导出／证据查询时，必须使用最新 doc 重新生成。浏览器处理完成（事件后 setTimeout）目标 <250ms；复杂 WebKit 页面下一帧延迟目标 <550ms，实体 iPad 仍需独立测试。
- **副作用**：仅内存 DIRjson 草稿变更与 AG 表行更新；不调用 Mac Vault 写接口、无自动保存，不修改原 PDF/OCR。仍保留明确保存前的 dirty 状态、撤销重做和首标题锁定。
- **自动化**：`web-component-platform/tests/chapterStandaloneLatency.mjs` 使用真实《Buffett’s Alpha》通过 Chromium/WebKit（所有 POST 阻断），记录每次业务完成/下一帧时间并验证文件名、勾选、首标题锁定和源码不变。隔离的 `workbenchV3SaveFixture.mjs` 在 Mac Fixture 中验证原 DIRjson 保存、发布、章节 CAS 保存及 SHA 读回。实体 iPad Safari 仍待用户审核。

**根因与保护措施**：原实现 `rebuild` 在 `busy=true` 期间创建 AG checkbox，结束加载仅更新控制按钮，不刷新 AG checkbox，导致可编辑行一直禁用。另原 checkbox 全量重建会生成约 3 MB 的 IR→MD 投影、重绘 AG 和 CodeMirror；局部修改后这类无关操作不再出现在点击热路径。专属改动限制在 `plugins/chapter-boundary/irWorkbenchPanel.ts`，WCP 不包含章节特例。

### UIC BND-13 · 小型章节标定增量保存（v4.7.5，2026-10-13）

**Feature Contract（操作／需要／效果）**：

- 操作：用户载入已有**持久化** DIRjson 后，仅修改「独立成章」勾选/分章文件名等标定数据，再点击顶栏「保存标定」。需要书籍 root 已授权、基准 `generation`、当前 `ir-markings.v1.json` revision。效果：通过 WCP 文件服务的**受约束 CQE** 路由 `/__v3/ir/markings/commit`，只提交 `chapterFileLayout`、`chapterNames` 与 `assign-sequence` 操作尾记录；不发送整个 PDF/OCR、DIRjson、Markdown ZIP，不触碰已发布 `chapters/`。
- 操作：再次编辑/重新打开页面。效果：CAS 替换极小 sidecar（原生协调写 + 读回 revision），或读取 immutable base IR 与适用于该 generation 的 sidecar 后进行合并。旧基准、重复文件名、错误 source、跨书籍、过期 revision 均拒绝；网络失败保留浏览器 dirty 草稿。
- 操作：用户明确按「发布章节」。需要标定记录已保存、完整文件边界合法、发布确认。效果：先**物化**标定到新一代可信 DIRjson ZIP，核对原 SHA 与本地 CAS 后再走现有章节生成与备份发布；发布后 sidecar 对旧 generation 失效。公开 v3 原本的完整快照保存/发布语义保留。
- 操作：编辑正文、人工补录标题/正文、改变 OCR 定界候选结构等非小型标定修改。效果：仍走原完整快照 CAS 保存；不得将正文混进只有边界数据的 sidecar，避免丢失内容。

**UI Interaction Contract**：

| 编号 | 初始与用户操作 | 可见结果 | 数据副作用／不变量 | 自动化 |
|---|---|---|---|---|
| MARK-01 | 已存 DIRjson，连续切换非首独立成章后保存 | WCP 顶部状态显示 `已保存章节标定` 和实际字节数，按钮 dirty 清除 | 仅 POST `/__v3/ir/markings/commit`；无全量 `/commit` 或发布 | `workbenchMarkingsFixture.mjs` Chromium/WebKit |
| MARK-02 | 重新打开/刷新工作目录 | AG 中勾选、文件分组与编号恢复；源码、PDF 锚不变 | 读取 base ZIP + 符合基准 generation 的 sidecar；无写入 | 同上 |
| MARK-03 | 再次修改并保存 | 版本 revision 前进，仍为小型请求 | 原子 CAS 替换，只触及本书 `/.ocr2md/ir-markings.v1.json` | 同上 + `v3IrMarkingsSmoke.py` |
| MARK-04 | 两设备同一基准、旧 revision 提交 | 状态错误不提示保存成功，浏览器草稿仍可用于手动协调 | HTTP 409；不丢失后提交版本 | Python + Node isolated |
| MARK-05 | 用户明确点击「发布章节」 | 标定完整物化，再生成发布的章节 MD；若失败仍显示异常 | 先旧 base -> 新不可变 ZIP/pointer CAS，然后按原有发布、备份流程 | `workbenchMarkingsFixture.mjs` WebKit、原 `workbenchV3SaveFixture.mjs` |
| MARK-06 | 源 PDF/OCR 变更、恶意外部路径、未知章节 | 拒绝，保留原存档 | 检查来源 SHA、单书目录、标题 ID/顺序、文件名及容量限制 | `v3IrMarkingsSmoke.py` + 后端拒绝用例 |
| MARK-07 | iPad Safari 实体触控保存 | 不因 ZIP 分段卡住；顶部状态清晰显示完成／失败 | 真机网络延迟和 iCloud fsync 可能仍有差异 | `manual-external` 待用户确认 |

**计量**：实际 224 OCR 块的 2,575,431 字节完整快照，在隔离 Python Mac 存储测试下标定 sidecar 为 2,720 字节，约缩小 946.8 倍。浏览器隔离测试 Chromium 小请求 3,468 字节、WebKit 4,212 字节（示例标定内容略异）。这只是**上传/写入量**改善，不等于承诺单次保存墙钟耗时缩小同样倍数；本地 CAS、iCloud 文件协调器和校验仍会耗时。

**架构**：WCP 核心不加特殊处理，只扩充 `ocr2md:chapter-boundary` 负责的 CQE 契约，由 `ocr2md:filesystem` 受权处理、Mac 端使用原 `V3MacVault` CAS 与新受约束持久化模块；候选后端 `v4_lan_vault_backend.py` 仅环回监听及允许已列出的 V3 路由，避免热替换原公网 4176 服务。

### UIC BND-13 · 保存标定只提交微型 CAS Sidecar（v4.7.5，2026-10-13）

**Feature Contract**

- `章节定界`在已经存在完整 DIRjson 基准快照、且用户只改动**独立成章勾选/章文件名/起始序号**时，顶部「保存标定」只提交 `.ocr2md/ir-markings.v1.json`，不打包或重新上传 PDF/OCR、MD bundle、全书 DIRjson ZIP。
- 保存内容仅 `{layout,chapterNames,operations}`，基于原 DIRjson `generation` 和标定文件 `revision` 双重 CAS；服务器核实对应原始书籍、标题块顺序、章 ID、文件名白名单和操作类型，并核对 PDF/OCR 内容 SHA。每次提交后重新读取标定并比对，只有确认为当前版本才清除 dirty。
- 重新打开同一本书时，读取已保存的 immutable DIRjson + 小标定；仅对章文件切分与编号做覆盖，保留原 PDF、OCR、block text 和来源锚点。任何错配应拒绝加载/保存，不应悄悄退回旧版内容。
- **发布章节**才将已保存标定物化进新完整 ZIP，经原 `ir/commit` 的 SHA/CAS 保存再调用 `publish-chapters`；**源码正文编辑**仍沿用完整快照写入（同样须带最新 `expectedMarkingsRevision`），不与小标定操作混淆。
- 旧客户端若未提供正确标定 CAS revision，后端拒绝对活动标定所在书籍的完整覆盖，不允许旧 v3 代码将标定丢弃。读写 API 仅由 `ocr2md:filesystem` 提供，浏览器业务 UI 不直接访问新后端；非当前书籍、未授权 Origin/Key 被拒绝。

| UIC | 动作 | 预期 | 副作用 | 自动化 |
|---|---|---|---|---|
| BND13-A | 已有保存 DIRjson；取消「独立成章」后点全局保存 | 数 KB `/__v3/ir/markings/commit`，弹出框架状态表示 CAS 读回成功；不调用 `/__v3/ir/commit` | 仅小型 sidecar 写入 | `workbenchMarkingsFixture.mjs` Chromium/WebKit 隔离真实大小书 |
| BND13-B | 刷新/重开书籍 | 已保存 checkbox、文件名和章编号准确恢复 | 仅读 | 同上 |
| BND13-C | 连续第二次小标定、另一设备旧 revision 竞争写 | 第二次更新成功，旧版本返回 409 并保留页面草稿 | 小型 sidecar CAS | `v3IrMarkingsSmoke.py` |
| BND13-D | 改起始编号后保存 | `assign-sequence` 类型增量仍走小标定、不重写完整 ZIP | sidecar 更新 | `workbenchMarkingsFixture.mjs` 双浏览器 |
| BND13-E | 点「发布章节」 | 先合并 sidecar 生成新完整版本，再发布 `chapters/*.md`；新版本不再加载过期 sidecar | 发布用户确认的章节 | `workbenchMarkingsFixture.mjs` WebKit 隔离，原 chapter publish fixture |
| BND13-F | OCR/PDF 源文件被替换、章节布局不匹配、旧版客户端覆盖 | 拒绝保存，原 DIRjson 和小标定不被静默覆盖 | 无写入 | Mac 隔离后端 CAS/安全测试 |
| BND13-G | 真机 iPad 网络中断、连续触控、进度反馈 | 保存状态明确，故障保留 dirty 草稿，不自动发布 | 非自动写入 | `manual-external` 待用户审核 |

安全不变量：真实 Obsidian Vault 绝不由自动测试写入；隔离副本测量真实大书 ZIP 与小标定请求；全量发布仍按原 CAS/SHA 验证。性能改进针对**普通标定保存**，不承诺初次导入或正式发布的全量操作变成小请求。


### UIC BND-14 · 章节小标定修订号漂移安全恢复（2026-10-13）

- **初始状态**：书籍已有 DIRjson 与独立的 `.ocr2md/ir-markings.v1.json`；浏览器已记录上次成功读回的标定内容与 CAS 修订号。
- **用户操作**：同一页连续切换“独立成章”三次，再保存；随后刷新并修改另一行，再保存。隔离样例在第二次提交前仅更改 sidecar 的文件元数据修订号，内容不变。
- **预期界面**：勾选立即反馈、不自动保存；小标定首次与再次保存成功，显示已保存和实际字节量；再次重载仍正确。
- **数据副作用**：只写小型章节标定 JSON；PDF、OCR、不可变 DIRjson、已发布章节不受影响；发布才执行完整快照物化。
- **安全不变量**：服务器修订号过期时，只在同一代 DIRjson 且服务器最新标定内容**等于客户端上次已确认保存的标定**时允许读取最新修订号并重试一次；任何不同内容、不同 generation 或再次冲突，必须保留草稿并提示冲突。绝不因为“用户只用了一台设备”而无条件覆盖。
- **自动化证据**：`web-component-platform/tests/workbenchMarkingsFixture.mjs` 的 Chromium 中注入 metadata-only CAS 过期；WebKit 连续勾选、保存、刷新、编号、发布隔离样例；`ui-spikes/v2/tests/v3IrMarkingsSmoke.py` 继续核查真正过期修订号拒绝及原数据不变。真机 iPad Safari 仍待用户审核。


### UIC BND-15 · 章节映射独立存储与无 DIRjson 重写发布

详见同插件目录 `CHAPTER_MAP_CONTRACT.md`。本轮新数据采用独立 `.ocr2md/chapters-map.v1.json`，仅含起止块与目标 MD 文件；旧 `ir-markings.v1.json` 只读兼容。发布只生成 `chapters/*.md`、保留原 DIRjson 指针不变，清洗成果在明确重发前完整备份。浏览器自动化与真实数据隔离，真机待用户审核。


### UIC BND-16 · 显式保存覆盖本书标定

详见 `CHAPTER_MAP_CONTRACT.md`：用户点击保存才发送覆盖指令；仅章节映射可被覆盖，原图文及 DIRjson 不变；被替换 JSON 保留精确字节备份；校验失败保留 dirty 草稿。

## BND-AG-CSS-01 · 模块 CSS 隔离与原章节 AG 深色主题（2026-10-14）

**初始**：WCP 工作目录、章节定界分别持有自己的 AG 实例及 Dockview 布局；工作目录为了修复 iPhone 空行需要先加载官方 `ag-grid-base.min.css` 结构样式，章节定界继续使用 v2 的 `calibrationTheme` 和原有标题着色。

**操作**：用户从工作目录进入章节定界，或先后以任意顺序加载工作目录 AG CSS 与章节插件 `legacy-theme.css`。

**效果**：章节 AG 的背景保持 `#2f383e`、正文 `#d3c6aa`、表头 `#272f34`，Sarasa 字体与章节标题原有专属色不被通用 AG CSS 覆盖；工作目录和设置 CSS 不变，不调整 WCP、ResidentHost、TriPane。

**不变量**：仅 `plugins/chapter-boundary/legacy-theme.css` 修改业务视觉变量；AG Grid 数据、筛选、选中行、编辑器状态、草稿、持久化、权限、布局和 PDF 不受影响。临时主题 CSS 不施加到其他业务模块。

**自动测试**：`node ui-spikes/v4-directory/tests/chapterBoundaryThemeIsolationBrowser.mjs` 在 Mac 运行真实 V4 章节控制器（无书籍数据、无 Vault 请求），WebKit/Chromium、结构 CSS 先后两种顺序，验证最终计算样式；另外必须通过原有 WP2/WP3 升级和工作目录 5 行暗色门禁。

**人工审核**：候选上线后由用户 iPad Safari 进入已保存书籍，确认 AG 标题颜色、字体、行高和深色外观；在完成真机验收前不自动发布正式版。

### BND-AG-CSS-01 验收结果 · 2026-10-14

- 真实 WebKit 隔离复现：未加载工作目录 AG 官方结构 CSS 时章节 AG 为深色，加载后同一 AG 变 `rgb(255,255,255)` 白底、黑字、Helvetica；确认样式表全局 token 争夺而非网络路由、Dockview、DIRjson。
- 只改 `plugins/chapter-boundary/legacy-theme.css`：给章节 AG 元素约束背景、文字、表头、行、交互色和 Sarasa 字体，不改变任何其他 AG、工作目录和设置模块。
- WebKit/Chromium 各自测试官方 AG 结构 CSS 在前、在后共 4 组，全部 `CHAPTER_AG_THEME_ISOLATION_PASS`，根背景 `rgb(47,56,62)`、文字 `rgb(211,198,170)`，字体 Sarasa、字号 14px。
- WP2 原有 6/6 升级／故障恢复门禁 PASS；WP3 WebKit/Chromium 真实 AG 5 行可见、暗色主题、218px 空占位故障注入恢复 PASS。
- 唯一运行时差异：相较候选 1453，除自动 stamp 的 HTML/app/build-info 外，仅章节 CSS 文件变更。通过 `--upgrade --theme-fix` 受限发布门禁，候选更新到 `v4-261014-1905`；原候选 1453 全量回退快照保留。公网、Mac 本机、局域网 HTTPS 端口 4443 版本一致；正式版仍 0816 未变。
- 实体 iPad Safari 当前章节 AG 深色视觉：**等待用户审核**（不会把模拟浏览器通过冒充为真实 iPad 验收）。
