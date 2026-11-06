# OCR2MD V6 ·「PDF 版面元素标定」独立审计报告（Muse）

> 三方统一任务书（`audit/three-party-pdf-elements-9c47e44`）之 Muse 独立执行件。本报告只依据本机亲自执行的结果；未引用 Internal 或 Grok 的结论作为证据。修复者不对自己的修复签发独立认证。

## 统一报告字段

| 字段 | 内容 |
| --- | --- |
| `AI_ID` | `muse` |
| 环境 | Ubuntu 24.04.5 LTS，Linux x86_64（内核 7.0.0-39-generic / 6.17.0-14-generic 两次 VM 更换前后），git 2.43.0，node v24.22.1，npm 10.9.4，python 3.12.3，Playwright 1.64.1，Chrome for Testing 156，WebKit 27.2（Playwright webkit-2370） |
| `SOURCE_SHA` | `9c47e44f1fc6b44b4f126030d68008854aced6ca` |
| `FIX_SHA` | `cad121e76e1f4e0ad613b3c1954d68c0fceed20c`（本地分支 `fix/muse-pdf-elements-9c47e44`，父 = SOURCE_SHA；冻结树 `5a718cc4` → 修复树 `cad44a99`） |
| 交付来源 | 独立匿名克隆 `github.com/laity2010/ocr2md`；审计包分支 `audit-public-pdf-elements-9c47e44` HEAD `a1c9c57f887523084b8eafe5b2f5568902826bc2`，第一父恰为 SOURCE_SHA；包 diff 仅 4 个交付文件；`git fsck --full` rc=0。PDF SHA-256 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` ✓；MinerU MD SHA-256 `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764` ✓ |
| 初始结果 | **FAIL**。`bash audit.sh` exit 1：AM 建库在 registry 装载即中止（CHECK 约束 `visibility` 失败），标准报告生成器被同一错误打崩（报告目录仅存 run.log）。后续分层调查与行为面结果见下 |
| 问题清单 | F-A 登记簇（已全修）、F-B 行为簇（未修）、F-C 口径项，见 §2 |
| 自主修复 | 提交 `cad121e`：仅 `tests/am/registry.sql` + `tests/am/ownership.json`（+172/−37），零产品代码、零测试脚本、零断言变更。以 format-patch 形式随本报告交付（见「交付通道限制」） |
| 修复后结果 | 修复树：Python 门禁 43/43 OK；`AM_REFERENCES_PASS`；`AM_CHECK_PASS`；边界扫描 0 问题；`run-standard-audit.sh <FIX_SHA>` 行为面与冻结树合并计数 **110/142 套件通过、32 失败**（修复不含产品代码，故同一计数即冻结行为面）；修复树**未获 CERTIFIED**（行为失败在册，且审计员不自签） |
| `SOURCE_MERGE` | **建议合并**（仅指 `cad121e` 登记修复补丁；理由见 §4） |
| `PRODUCTION_CUTOVER` | **NO（FAIL 侧）**：32 个行为套件失败未裁决前不得切换生产 |

## 1. 初始审计（原始证据）

- `bash audit.sh`（2026-11-05 22:01 CST 起跑）exit 1。关键行：`AM_ERROR: CHECK constraint failed: visibility IN ('export','returned','internal','raw')`；`standard_audit.py` 在生成报告时以同一 IntegrityError 崩溃，故冻结标准报告目录只有 `run.log`（证据 01/02）。
- 冻结登记（修复后可装载的口径还原）：装载即失败，无官方计数。经逐项修复后测得冻结内容为 [12 模块 / 299 API（含 3 个重复编号）/ 14 消息 / 20 发布 / 36 订阅 / 434 契约 / 202 边]——此数含缺陷，仅供与修复后 [311 API / 39 订阅 / 452 契约] 对照。

## 2. 问题清单

### F-A 登记簇（P1；已全部由本审计修复，见 fix-report.md）

| ID | 问题 | 机制 / 引入点 |
| --- | --- | --- |
| F-A1 | 5 行 API 的 `visibility` 不在枚举内：P23 `callback`、P25/L84 `constructor-callback`、L83 `module-port`、G32 `re-export` | 里程碑状态整合提交 `ae8bf52`、`a055e88` 以描述性词语代替枚举值，AM 建库第一层即中止 |
| F-A2 | API 编号重复：C63/C64/C65 各被两个不同 API 占用 | 链引擎三 API（`2c08e7c` 引入）复用了已分配编号；与 F-A1 叠加使 DB 根本无法建立 |
| F-A3 | 幻影 API G34 `reviewDropdown`（illegal-break-module.js 中不存在该符号；审阅下拉实际由共享渲染器 G35 在模块内实例化） | 与 75e05598 的 G28 同型：把模块内部 UI 误登记为 API |
| F-A4 | 17 处引用失效：15 条边的源表达式过期（调用点被状态整合/只读基线改写）、X-PDF-TEXT-STATUS-P25 边 owner 写反（登记 P→L，实际 L→P）、G34 符号缺失 | 调用点演进后登记未同步 |
| F-A5 | 16 个生产文件无归属：`cmd-block-chains` 家族关联的 `cmd-pbs-locations`、`cmd-pbs-row-order`、`text-block-page-scope`、PDF 拖放/手势 4 文件、非法断行 3 文件、只读策略、稳定选择渲染器、CM6 可见性、PDF 标签设置等整批里程碑新文件 | 新功能落盘时未同步 ownership |
| F-A6 | 链引擎 12 个跨模块符号只有 ownership 白名单、没有 API+边，被本轮新增门禁 `test_binding_registry`（文件头注明为 Grok 75e05598 守卫建议的产物）当场拦截；连带缺失：`layoutPDFEdgeRails`（pdf-preview 实际调用的沟槽几何）无 API/边/用例、`parseCMDPBSId` 等 7 个链计划器无 API 行、PDF 标签设置订阅（SUB）未登记、CM6 可见性守卫的 viewStore 订阅未登记、L80/L85 零测试行 | 登记完成度不足，非白名单可洗 |
| F-A7 | 建模自相矛盾：`cmd-block-chains.js` 文件归属 L 且其既有 API（L66–L76）均为 L，但新登记的 C120/C125/C126 被写成模块 C，使「边目标模块 = API 模块」与「边目标模块 = 文件归属」两项检查无法同时满足 | 已按文件内先例统一为 L（编号不变；编号前缀与模块不一致在冻结登记中已有先例 C63/L） |

### F-B 行为簇（未修；产品层，留集成裁决）

行为面全量（方法见 §3）：**110/142 套件 PASS，32 FAIL**（另 1 个不稳定套件见 F-B6）。失败按机制分组：

| ID | 组 | 套件与首断言 |
| --- | --- | --- |
| F-B1 (P1) | CMD/PBS 链与母文档基线漂移 | `cmd-block-chains`（Missing sealed MinerU source）、`cmd-native-subblock-repair` 与 `native-subblock-alignment`（Repair sources do not refer to identical original MinerU JSON）、`cmd-pbs-converter-integration`、`cmd-pbs-parent-group-order`（absorbed parent lost one or more original OCR children）、`v6-initialize-cmd`（native CMD baseline drift）、`cmd-text-blocks`、`cmd-source-block-labels`、`cmd-pbs-browser`、`cmd-pbs-absorbed-child-cover`、`cmd-block-chains-wp4/wp5`。指向冻结前提交 `79f36df`（自选 MinerU JSON 重建原生子块）后，母文档/密封源与多套件期望不一致 |
| F-B2 (P1) | 只读基线与套件期望冲突 | `pdf-block-join-toggle`（p9b0 must merge into previous page last p8b8）、`pdf-subblock-annotation`、`cmd-pdf-bbox-wp6`、`pdf-block-reorder`、`pdf-block-drag-edge-scroll`、`cmd-pbs-child-reorder`、`text-block-review`（block mode retains WP4/WP5 controls plus PDF bbox actions）。里程碑以 `0802ea2` revert 将结构编辑恢复为只读标定后，Shell 注入拒绝器（`text-block-readonly.js`），而上述套件仍断言可编辑行为。**这是产品口径裁决项：改套件还是改基线，须集成阶段定** |
| F-B3 (P2) | 状态模型 | `ag-function-menu`（scope status should appear in global status row）——状态整合提交 `ae8bf52`/`a055e88` 后的状态呈现与套件期望不一致 |
| F-B4 (P2) | 上轮乙簇残留 | `pdf-child-region-select`（期望「源码作用域为空」文案不匹配）、`pdf-coverage-zoom`、`preview-split`、`quote-indent`（caret gutter floated——签名已不同于上轮的已加载超时）、`pdf-text-extract-insert` 本轮通过、`contracts-browser`（MinerU converter returned an invalid Markdown document——签名已变）、`workspace-root-browser`（Chrome 全过、iPad-WebKit 等待 `#settings-workspace .ag-row rootPath` 30s 超时，2/2 确定性；与 9b211638 的 403 机制不同，为新签名） |
| F-B5 (P2) | 目标环境缺件 | `engineering-initialize-browser`（ENOENT `.v6/release/index.html`：隔离目标无发布构建产物；与 9b211638 suite 23 同类 harness 缺口） |
| F-B6 (观察) | 不稳定套件 | `illegal-break-rescan-real`：官方跑 FAIL、两次健康环境复跑 PASS，定性不稳定，不计入确定性失败 |
| F-B7 (P2) | 其余确定性失败 | `illegal-break`、`illegal-break-source-edit`（AG 行 strict mode violation）、`sentence`、`pdf-normal-webkit`、`text-block-coverage`——均在健康环境两次复跑同点失败；机制未逐项深挖，日志见证据 05 |

六模块专项（任务书 §1）对应结果：标题（outline/chapter 系列）通过；文本块见 F-B1/F-B2；非法断行：审阅套件 `illegal-break-review` 通过、配对/定位逻辑套件通过，但 `illegal-break` 本体与源编辑套件失败（F-B7）；LaTeX 系列通过；媒体系列通过；注释对系列通过。PDF↔Markdown 双向定位的纯逻辑层（pdf-source-locations、pdf-region-hit、pdf-edge-rails、pdf-gutter-label-layout）全过；失败集中在交互/基线层。

### F-C 口径与观察项

- E07 `activePanel` 消息仍无登记订阅者（与前两轮相同的常设观察项，非本轮新增）。
- L85 `inspectCM6SourceVisibility` 无专属套件，本审计以其守卫 L86 的既有套件作集成链接（已在 fix-report 中明示）；守卫的 viewStore 订阅只登记 E01 一行：其 `focusTarget` 变化仅作同一 `subscribe` 的调度触发，而冻结门禁 `test_focus_includes_all_ten_observed_receivers` 对 E03 接收者有精确集合断言——两行登记会与该冻结契约冲突，此取舍已记录在案，供集成复核。
- `text-block-page-scope.js` 的 re-export 语句被边界扫描器朴素解析为含 `as` 的符号列表，绑定按扫描器口径登记（含 `as` 与别名），属工具口径而非产品问题。

## 3. 方法与环境注记（影响证据效力的事项，全部如实记录）

1. 冻结行为面计数来自修复树：本审计的修复只改登记文件、不含产品代码，故修复树行为 = 冻结行为。官方 `run-standard-audit.sh <FIX_SHA>` 首跑在 93/142 处被沙箱写故障（EPERM）杀停（73 PASS / 19 FAIL 已记录、无污染签名）；其余套件以官方同一环境（同目标、同 NODE_OPTIONS 预载、同夹具）在健康时段补跑两轮，取健康环境结果为准。
2. 本轮环境发生两次 VM 更换：第一次丢系统库（WebKit 的 libgstreamer 等），使一批复跑的 WebKit 阶段假性失败——该批结果已整批作废并在重装 `playwright install-deps webkit` 后重跑；第二次更换后再次重装并完成决定性复跑。所有计数均出自 WebKit 预检通过的环境。
3. macOS 真机与 iPad 真机未测（未测）；本报告的 WebKit 指 Linux WebKitGTK 模拟路径。
4. 运行时旁路复核（冻结源码，人工）：`viewStore.setState` 仅出现在 view-store.js 本体（跨模块 0 处）；`window.__v6cm6` 仍为 DEV 门控（main.js:1168）；未登记 DOM 事件点 0。未发现 AGENTS.md §6 的 revert 级越界。

## 4. 结论

- **冻结 SHA 9c47e44：FAIL，未获 CERTIFIED。** 依据：标准入口在 AM 建库阶段中止（F-A1/F-A2）；登记修复后行为面仍有 32 个确定性套件失败（F-B1/F-B2 为 P1）。
- `SOURCE_MERGE`：**建议合并**——仅指登记修复补丁 `cad121e`（`git am` 于 9c47e44 可逐字节复现修复树 `cad44a99`）：它使 AM/Git 门禁全绿且不触碰任何产品行为与测试断言。F-B 各簇不建议由集成阶段顺带「修复登记了事」，须先作产品口径裁决。
- `PRODUCTION_CUTOVER`：**NO**。

## 交付通道限制（照例明示）

连接器无在指定 SHA 建分支的工具（本轮复核 `list-tools` 仍无 create_branch/refs 类工具），故 `fix/muse-pdf-elements-9c47e44` 以 format-patch 形式随本报告分支交付，本地分支完整保留，补丁在 9c47e44 上 `git am` 可复现同一修复树（树哈希 `cad44a99` 可核）。报告分支为 `audit/muse-pdf-elements-9c47e44-report`。

**Meta Muse**（独立审计）· 2026-11-06
