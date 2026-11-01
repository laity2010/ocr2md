# OCR2MD V6 独立审计报告（Linux / Muse）

- 审计员：**Meta Muse**（独立审计）
- 日期：2026-11-01（Asia/Shanghai）
- 原始源码 SHA（结论绑定）：`75e055988df73d3d3899036f6a62ce1e851f2d15`
- 审计包 SHA：`6aa7acd0c64a4ae6cc54ffdce76acd7b3bfa592f`（分支 `audit-public-75e05598`，父提交恰为冻结 SHA；与冻结的差异仅 `.gitattributes`、审计 PDF 夹具、`audit.sh` 三个交付文件，逐项核验）
- 报告分支：`audit/muse-75e05598-report`；修复补丁随本报告交付（本地分支 `fix/muse-75e05598`，提交 `dfe1a05e5078ae2998ba405f22d9a89f074aad82`；因 GitHub 连接器 push-files 只能在默认分支基底上建分支、无 create-ref-at-SHA 工具，修复以 format-patch 序列交付，`git am` 到冻结 SHA 可逐字节复现修复树——此通道限制如上如实说明）
- 距上轮基线 9b211638：132 个提交。

## 环境（实测）

Ubuntu 24.04.5 LTS x86_64；git 2.43.0；node v24.22.1；npm 10.9.4；python 3.12.3；Playwright 1.64.1；Chrome for Testing 156；WebKit 27.2（Playwright webkit-2370）。夹具哈希全部与冻结值一致：PDF `be12aa25…e41ab`、MD `d86508f6…3b764`、reviewed gz（解压）`c998da7a…3e19`。git fsck rc=0，克隆与双 worktree 干净。

## 结论

**FAIL — 冻结快照 75e05598 未获 AM_FULL_TABLE_CERTIFIED。**

两簇独立的问题：

- **甲簇（登记完整性，P1）**：快照按其自身标准流程无法认证——`am.py build` 引用核验即失败（6 处），Python 门禁另有 4 处失败（含 10 个生产文件无 AM 归属）。全部源于近期「文本块 / PDF 文字插入 / 章节事件」功能的 AM 登记未做完。**已由本审计在 `fix/muse-75e05598` 按源码事实补全修复，修复树门禁全绿**（详见 fix-report.md）。
- **乙簇（产品行为，P1/P2）**：登记修复后全量行为面为 **77/91 套件通过、14 套件在 Linux 确定性失败**，集中在新 WCP 虚拟章节 / 文本块 /  PDF 交互层；其中「启动状态永不就绪」一项已定位机制（见 F-B1）。乙簇属产品行为缺陷，本审计未擅自修改产品代码（理由见各条），留待主线处置。

SOURCE_MERGE = **建议合并**（仅指甲簇登记修复补丁）；PRODUCTION_CUTOVER = **NO**。

## 标准入口实测（冻结树）

`bash audit.sh` 退出码 1。标准报告 FAIL：runner 在 `am.py build` 阶段中止（`AM_ERROR: missing AM references` ×6），未进入 Python 门禁与 run-all；标准工具自带结论 `am.status=MISSING（isolated AM DB not created; no test results may be claimed）`、`static_findings=10`、`unregistered_event_sites=0`、`runtime_review=62`。

审计方手动补齐后续阶段（冻结树、只读）：Python 门禁 37 项中 3 FAIL + 1 ERROR；行为面以直跑补测（结果见乙簇与复验节）。

冻结登记规模（sqlite 直读 registry 核实）：**[12 模块 / 245 API / 14 消息 / 20 发布 / 30 订阅 / 340 契约 / 167 边]**。

## 甲簇发现（均已修复，逐条证据见 fix-report.md）

- **F-A1（P1）10 个生产 UI 文件无归属**：`cmd-block-continuations.js`、`cmd-block-joins.js`、`cmd-pdf-text-insert.js`、`cmd-text-blocks.js`、`pdf-block-text-extract.js`、`pdf-gutter-label-layout.js`、`pdf-region-hit.js`、`pdf-source-locations.js`、`text-block-module.js`、`text-block-preview-coverage.js`。审计方独立扫描复现（82 文件 / 12 模块 / 42 跨模块导入，issues 恰为这 10 个 UNOWNED）。均为被核心文件真实 import 的生产代码，并非死文件；另缺目录绑定 `workspace.js->text-block-module.js`（其余 11 个同类模块挂载均已登记）。
- **F-A2（P1）幻影 API G28**：登记符号 `createTextBlockModule.reviewActions` 在 `ui/text-block-module.js` 中不存在——冻结的模块返回对象共 10 个方法，无此成员；审阅动作是模块自有 DOM。且其可见性标 `internal` 却被跨模块边 X-WP4-G28 引用（与 build 报的 `non-public cross-module API G28` 同源）。工厂本身已由 G25 正确登记，候选/覆盖面已由 G27/G26 登记，故 G28 无可挽救的独立契约面。
- **F-A3（P2）两条边过期**：X-TEXTBLOCK-L48 登记的调用方 `ui/main.js` 早已不调用 `inspectCMDTextBlocks`（真实调用在 cm-document.js:48 与 wcp-cmd-element-transactions.js:74）；X-TEXTBLOCK-L49 的源码表达式停留在重构前写法（现为 workspace.js:404 `this.pdf?.focusBlock(pageIndex`）。
- **F-A4（P2）两条用例 fixture 栏为散文**：TC-PDF-TEXT-P17、TC-PDF-GUTTER-P19 的 fixture 字段填的是几何描述而非文件；两套件实为全合成数据（脚本内联构造，零文件读取）。
- **F-A5（P1）两个 API 零测试行**：P16 `PdfPreview.prepareSelectedPDFText`、L61 `returned.setPDFTextInsertAction`（「PDF 选中文字插入 CMD」链的两端）无任何 test_cases 行（门禁计数 243≠245）。现成套件 pdf-text-extract-insert 实际驱动这条链（点击真实插入按钮 → 经 workspace 注入动作进入 CMD → 一次 Undo 全还原），但只挂在 P15/C60/C62 名下。
- **F-A6（P2）E14 事件链整条无测试行**：新消息 E14 `ocr2md:chapter-boundary-changed` 及其发布方 PUB-W15、订阅方 SUB-W19 均无测试行（门禁逐层计数 13≠14、19≠20）。现成套件 chapter-live-navigation 测的正是这条链（AG 勾选提交标记 → 源码章节导航同步重建）。

注：F-A5/F-A6 是在修复 F-A1–F-A4、build 打通后才逐层暴露的——冻结状态下这些缺口被更早的失败遮蔽。这也是本快照「登记债」的完整清单：修复后 `test_all_contracts_have_test_rows` 对 apis/messages/publishers/subscriptions 四表全部对齐。

## 乙簇发现（产品行为，未修复）

行为面总账（修复树官方 run 67 套 + 干净复跑 38 套合并去重，产品代码与冻结树逐字节相同——补丁仅动登记文件）：**91 套件中 77 通过、14 失败**。失败在两个独立目标、静默机器上同点复现，定性为确定性 Linux 失败（首轮官方跑后半段曾受沙箱写故障污染，其中 3 套经干净复跑翻案为通过：cmd-block-joins、illegal-break-rescan-real、pdf-block-join-toggle；以下 14 套为复跑后仍失败者）：

- **F-B1（P1）启动状态永不就绪（机制已定位）**：应用启动后全局状态栏冻结在文本块模块的占位文案「正在读取 CMD 内嵌的原始 JSON…」，`✓ 已加载` 永不出现（50ms 采样 30 秒无一帧，仪器化复现 4 次）。机制：文本块模块在构造/订阅刷新时无条件以 report=null 发布占位状态（text-block-module.js:190），而其清单扫描 `scanTextBlocks` 仅在模块被激活、覆盖开关开启或文档变更时触发（main.js textBlockDocChanged 门控）；默认停在 chapter-boundary 模块时启动期无人触发扫描，占位状态遂永久占据状态栏首段。原始 `cmd.queryBlockAnalysis()` 直调可正常完成（224 行/224 逻辑块），故为状态/扫描时序缺陷而非解析能力问题。直接受害套件（等待 `✓ 已加载` 超时）：cm6-browser、compact-shell-browser、dockview-preview-browser、quote-indent-browser（另含 WebKit 页错误）。
- **F-B2（P1）源码章节导航初始为空**：chapter-live-navigation 断言「enhanced source menu must show initial chapters — 0 !== 21」在加载期即失败；promoted-chapters（冻结树直跑）另见活动面板为 'text-block' 而非期望 'chapter-boundary'。AG 大纲本身有 21 项（仪器化实测），为空的是 WCP 源码文件导航的章节投影。与 F-B1 同属新 WCP/文本块初始化层异常，但确切的共因未证实，按独立发现记录。
- **F-B3（P2）PDF 交互层多点失败**：pdf-block-drag-edge-scroll（超时）、pdf-block-reorder（超时）、pdf-child-region-select（caption 的 CMD 文本行标记为 'unmarked'，期望已标记）、pdf-coverage-zoom、preview-split（PDF 工具栏 `.ocr-pdf-page` 溢出工具栏：right 1111 > barRight 1032 且不可见）、shared-preview（切到 Markdown 时 PDF 按钮未按契约收起）、contracts-browser（Chrome PDF dispose 契约失败，contracts-browser.test.mjs:127）。
- **F-B4（P2）ag-header WebKit 标题缩放命中区为 0**：ag-header-browser.test.mjs:59 断言 `WebKit/title resize hit area too small 0`，Chrome 阶段通过、iPad-WebKit 阶段确定性失败（两目标同点）。
- **F-B5（P2）text-block-review 模式菜单契约漂移**：「raw block mode only exposes two choices — 3 !== 2」。文本块 Function 菜单现有 3 个模式选项，测试与登记描述（G25/G28 系「2 mode options」）仍按 2 断言——产品与契约必有一方过期，请主线定口径。

乙簇未由本审计修复的理由：均为产品行为/时序缺陷，其中 F-B1/F-B2 涉及 WCP 初始化设计、F-B5 涉及契约口径裁决，超出「按源码事实补登记」的安全修复边界；按 AUDIT.md「无法安全修复则保持未解决」留待主线，并附机制与复现证据如上。

## 专项复核（任务点名项）

- **PDF↔Markdown 双向定位（逻辑层）**：专项套件在冻结树直跑全过——pdf-source-locations（父/子标签作用域、标签间插入归属、224 父 + 43 子）、pdf-region-hit（子矩形优先、空白不误选）、pdf-gutter-label-layout、cmd-text-blocks（224 锚点/bbox、SHA 损坏拒绝）、pdf-text-insert + pdf-text-extract-insert（原文层顺序、任意光标插入、Undo 全还原）、text-block-coverage（215 条真实 MD 映射）。空内容虚线标签（TC-PDF-EMPTY-LABELS 所属 pdf-child-region-select 套件）属乙簇失败面（F-B3 的标记问题），其余定位契约未见违反。
- **编辑事务与数据安全**：save/CAS/Undo 相关套件（wcp-cas-dirty-tracking、save 系列、settings-server、workspace-root-server）在各轮运行中均通过；未发现 HTTP 428/412、版本 CAS、未保存草稿保护方面的失败证据。MinerU JSON/PDF 不变性由夹具哈希在每轮首尾核验，未见改动。
- **WCP 边界与绕过面**：标准清单 62 个运行时调用点分类完毕——viewStore.getState 38、subscribe 15、setState 7（全部位于 view-store.js 自身）、querySelector 2（fontcheck 诊断页、shell）、getElementById 1（shell）、`__v6cm6` 1（main.js DEV 门控）。**跨模块 setState 零例**；字面 DOM 事件未登记点 0；静态扫描除甲簇归属问题外零违规。86c32a0 的「跨模块 DOM 窥探」修复（Shell 改经受限端口读章节编号 + no-foreign-DOM 契约测试）在冻结树在案且其门禁测试通过。未发现需按 AGENTS.md §6 回退的已证实越界。
- **Main/Lab 隔离**：Lab 相关套件（main-promoted-lab-ui、wcp-promoted-api-direct、wcp-virtual-event-contract）在冻结/修复两树均通过；镜像一致性契约未见失败。

## 上轮发现（9b211638）在新基线的处置（逐项复验）

- **F1（门禁基线漂移）**：主线已以更优解法处置——提交 `86c32a0` 将基线改为由版本化 AM 目录 + SQL 登记推导，漂移类问题结构性消除；同提交另修复一处真实跨模块 DOM 窥探（本审计上轮未发现此点，如实记为对方功绩）。本轮冻结树 test_baseline 的失败仅为甲簇归属缺失，推导机制本身工作正常。
- **F2（suite 23 无条件读 settings）**：本审计的 existsSync 回退修复已被主线逐字采纳且在冻结树在案；套件本轮通过。
- **F3（suite 56 WebKit 授权）**：本审计的适配器 APIRequestContext 扩展已被主线采纳且在案；套件本轮双引擎通过。
- **F4（suite 39 iPad 裁切前置）**：主线按本审计建议 (b) 处置——测试显式将滚动口下探 34px 合成裁切几何并先断言其成立；套件本轮在冻结树与修复树均通过，上轮「无法安全修复」的悬案关闭。
- **上上轮 F1（标题字号恢复）**：主线以 git am 原样采纳的修复在冻结树完好（workspace.js 相应行在案），outline-title-scale 双引擎通过。CM6 保存滚动本轮样本稳定。

## 环境事件（如实记录，不计入产品结论）

审计期间沙箱文件写入故障（EPERM）三度发作（约 16:51 起首度、18:12 恢复、18:40 前后复发、21:30 前恢复），造成：冻结树直跑后 21 个脚本结果未及记录（后由修复树全量跑覆盖）；修复树首轮官方跑后半段被污染（已用干净复跑替换其结论）。所有受污染批次均已标注并复跑，未将环境失败计入产品失败，亦未将复跑通过冒充首轮通过。

另：修复树官方跑在 68/91 套件处被 runner 自身总超时（exit 120）截断——91 套件规模已超旧时间预算，此为工具侧限制；剩余套件由审计方以官方同等环境逐套补跑完毕（证据 05）。

## 未验证 / 残余风险

- 真机（真实 iPad Safari、macOS Safari/Chrome）未测；乙簇各条是否在 macOS 同样复现，本审计无证据，主线应在 mac 环境复跑同集合确认平台范围。
- 乙簇 F-B1/F-B2 的共因关系未证实；F-B3 各点的独立根因未逐一定位（仅失败点与断言在案）。
- 登记中仍有两处模块字母不一致（观察项，非缺陷）：API L48/L49 的登记模块为 L，但其源文件分别属 CMD/PDF 领地；本审计按最小修复原则未改动 API 编号（改号将波及用例引用），建议主线择机规范。
- 修复树未获认证：登记门禁虽全绿，乙簇 14 套件失败使其不满足 CERTIFIED 条件；本审计不为自己的修复自签认证。
- 集成证据覆盖沿用常设 REVIEW 口径：本轮新增 TC 行均为既有套件的真实驱动链补挂，未新增套件本身。

## 建议

- SOURCE_MERGE = **建议合并**：将 `fix-muse-75e05598.patch`（`dfe1a05`，仅 tests/am/registry.sql 与 tests/am/ownership.json）以 git am 合入主线；这是后续任何认证的前置条件。
- PRODUCTION_CUTOVER = **NO**：乙簇处置完成并在新基线上取得全量 CERTIFIED 前，不建议切换生产。
- 主线后续：优先处置 F-B1（启动扫描/状态时序）与 F-B2（WCP 章节投影初始化），并裁决 F-B5 的菜单契约口径；修复后冻结新基线再行全量审计。

—— Meta Muse，2026-11-01
