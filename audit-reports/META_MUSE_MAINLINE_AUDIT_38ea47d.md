# OCR2MD V6 主线独立审计报告（Linux）

- **审计员**：Meta Muse（独立第三方审计；未参与该提交开发）
- **审计日期**：2026-10-25（CST）；全量运行 run id `20261024T160915Z`（UTC）
- **审计对象**：github.com/laity2010/ocr2md，来源分支 `build/2026-10-20`
- **被审计提交（锁定）**：`38ea47d3782387d842098e77a586f1d8f3db0d8a`
  （提交标题：`build(wp3): integrate portable AM audit and UI module ownership checks`，2026-10-24 18:39:38 +0800）
- **审计入口**：`bash tests/am/run-grok-audit.sh 38ea47d3782387d842098e77a586f1d8f3db0d8a`（主线自带统一入口，脚本名沿用主线命名）
- **结论：FAIL**（真实测试失败，非环境 BLOCKED）：27 套件中 26 个 PASS、1 个 FAIL；139 契约中 136 个 PASS；`AM_FULL_TABLE_CERTIFIED` 未取得（全量未通过，认证按设计不予签发）。

## 1. 环境清单

| 项 | 值 |
|---|---|
| 发行版 | Ubuntu 24.04.5 LTS |
| 架构 / 内核 | x86_64 / Linux 7.0.0-39-generic |
| 资源 | 2 vCPU / 7.7 GiB RAM |
| git | 2.43.0 |
| Node.js / npm | v24.22.1 / 10.9.4 |
| Python | 3.12.3 |
| Playwright | 1.64.1（package-lock 锁定） |
| 浏览器 | Chromium（chromium-1248 缓存构建）、WebKit（webkit-2370 缓存构建）；审计前预检 `AUDIT_BROWSER_PREFLIGHT_PASS Chromium`、`AUDIT_BROWSER_PREFLIGHT_PASS WebKit`（真实启动冒烟，非仅文件存在） |
| 端口预检 | `AUDIT_PORT_PREFLIGHT_SELFTEST_PASS live_listener=blocked closed_server=reusable`；`AUDIT_TEST_PORT_PREFLIGHT_PASS ports=45` |

环境判定：依赖齐全、双引擎真实运行，**不构成 AUDIT_BLOCKED**。本轮唯一失败为产品行为断言超时（见 §4），与环境无关。

## 2. 审计对象与样本核验

- 独立工作区：`~/workspace/ocr2md-mainline-audit-38ea47d`（全新克隆，detached 于固定 SHA）；审计实际执行于脚本创建的隔离 worktree `~/workspace/ocr2md-am-38ea47d3-isolated`。
- 审计前：`HEAD=38ea47d3782387d842098e77a586f1d8f3db0d8a`，tree `b6d8b36ddd9d8bb18ee2836cba9f3e8fa5bf1a84`，`git status` 0 行，`git fsck --full` rc=0。
- PDF 样本：主线检出不含 `.v6/workspace/`（gitignored），按审计规程从既有冻结样本源（第三轮审计目标工作区）复制同一冻结样本至源工作区 `.v6/workspace/buffetts-alpha.original.pdf`，SHA-256 实测 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`，与登记值一致；MD 夹具 `packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md` SHA-256 实测 `d86508f6…e3b764`，与脚本内嵌登记值一致。脚本的样本哈希门禁亦通过（否则不会进入测试阶段）。

## 3. 全量运行结果

原文摘录：

```text
AM_AUDIT_ENV node=v24.22.1 python=Python 3.12.3 playwright=1.64.1
AM_BUILD_PASS modules/apis/messages/publishers/subscriptions/tests=[7, 98, 8, 13, 17, 139] database=.v6/tests/am.sqlite
AM_REFERENCES_PASS checked 98 API registry rows and all source/test paths
AM_CHECK_PASS apis=98 FK=OK source-and-test-files=OK ui-ownership=OK
AM_FULL_START git=38ea47d3 suites=27 contracts=139
AM_FULL_RESULT passed_cases=136/139 failed_suites=1 git=38ea47d3
AM_ERROR: AM full suite failed: [('tests/latex-review-browser.test.mjs', 'FAIL')]
AUDIT_EXIT=1
```

`run-grok-audit.sh` 在 `am.py run-all` 失败后按 `set -e` 退出（exit 1），`certify` 未执行——全量未通过时不签发认证，为正确行为。因此本轮**无 `AM_FULL_TABLE_CERTIFIED`**，不得以 136/139 表述为认证通过。

### 逐套件结果（27 个）

| # | 套件 | 契约 | 结果 |
|---|---|---|---|
| 1 | ag-header-browser | 2 | PASS |
| 2 | contracts-browser | 16 | PASS |
| 3 | chapter-numbering | 1 | PASS |
| 4 | cm6-browser | 3 | PASS |
| 5 | cmd-annotations-browser | 7 | PASS |
| 6 | cmd-html-unified-browser | 5 | PASS |
| 7 | compact-shell-browser | 5 | PASS |
| 8 | dockview-preview-browser | 5 | PASS |
| 9 | four-pane-pdf-browser | 5 | PASS |
| 10 | latex-browser | 8 | PASS |
| 11 | latex-four-view-browser | 1 | PASS |
| 12 | latex-normalize-browser | 2 | PASS |
| 13 | latex-review-browser | 3 | **FAIL** |
| 14 | media-adoption-syntax | 2 | PASS |
| 15 | media-browser | 15 | PASS |
| 16 | media-paste-browser | 4 | PASS |
| 17 | mineru-start-only-ui-browser | 4 | PASS |
| 18 | obsidian-image-preview-browser | 1 | PASS |
| 19 | outline-browser | 15 | PASS |
| 20 | pdf-anchor-viewport-browser | 1 | PASS |
| 21 | pdf-click-only-browser | 4 | PASS |
| 22 | preview-split-browser | 6 | PASS |
| 23 | promoted-chapters-browser | 7 | PASS |
| 24 | quote-indent-browser | 1 | PASS |
| 25 | scroll-sync-browser | 4 | PASS |
| 26 | scroll-sync-leadership-browser | 6 | PASS |
| 27 | shared-preview-browser | 6 | PASS |

合计 139 契约：136 PASS / 3 未通过（均为 13 号套件）。

## 4. 失败详析（唯一失败：13 号 latex-review-browser）

- **位置**：`tests/latex-review-browser.test.mjs:128` —— Chrome 阶段。该测试先在文档中标定两条 LaTeX 审阅标记（`latex` 与 `忽略`）、全局保存并断言落盘内容正确（2 条注释、含 id、42 个公式不变，此前各步均通过），随后 `page.reload` 重开文档、切回 latex 模块，等待状态栏出现 `latex 1 / 忽略 1`（25 秒）。
- **原始错误**：

```text
page.waitForFunction: Timeout 25000ms exceeded.
    at page.waitForFunction (.../.v6/audit-reports/audit-linux-diagnostics.mjs:68:32)
    at .../tests/latex-review-browser.test.mjs:128:14
```

- **超时瞬间页面状态**（审计诊断层 `AUDIT_LINUX_WAIT_DIAG` 采样）：文档已完整加载（`documentState=complete`，3,110 行 / 307,051 字，大纲 21 项），latex 模块已选中，网格已渲染（`latexGridPresent=true`，`latexRows=16`），页面错误为空（`errors=[]`）；但状态栏文本为 `章节标定 注释0/标签0` 一类汇总，**未出现预期的 `latex 1 / 忽略 1` 审阅计数**。
- **引擎范围**：证据目录仅有 `latex-cm-review-chrome.png`（Chrome 阶段截图，复跑时再次生成），无 WebKit 截图——失败发生在 Chrome 阶段，WebKit 阶段未及执行。故本套件的 WebKit 表现记为**未验证**（被 Chrome 阶段失败遮蔽），不记 PASS 也不记 FAIL。
- **复现（确定性）**：审计后以与全量运行完全相同的适配层与环境变量（`NODE_OPTIONS` 预载、`V6_PDF_PATH`、双引擎路径）单独复跑该套件，结果在**同一行、同一等待点、同样的诊断快照**再次 25 秒超时。两次独立运行同签名失败，排除单次时序抖动。
- **定性**：保存前与保存落盘断言均通过，失败点专一在**重开文档后审阅标记计数未恢复到状态栏**。这是产品行为与测试契约之间的真实不一致，记 **FAIL**；不是依赖缺失、不是浏览器启动失败、不是适配层伪造（诊断层只采样上报、按原样重抛超时，未改任何断言或超时值）。
- **建议修正范围（仅建议，审计方未改代码）**：检查 reload 后 latex 审阅标记的恢复路径——已保存注释（`ocr2md:latex`）在文档重开时是否被重新扫描并汇总进状态栏计数（含模块切换到 latex 时的汇总刷新时机）；可先在 macOS 主线环境复跑同一套件，以区分平台特异与跨平台共性。

## 5. 专项核验：AM 模块边界与 WP2 UI 文件归属

- **归属检查（流水线内）**：`AM_UI_BOUNDARY_PASS files=27 shared=4 cross_imports=14`；`AM_CHECK_PASS … ui-ownership=OK`。
- **归属表独立核对**：`tests/am/ownership.json` 登记 `ui/*.js` 共 **27 个文件**，归属分布与 `registry.sql` 的 7 个模块（C/G/L/M/P/T/A）及 shared/shell 分类一致；其中 shared 4 个（enum-checkbox-filter、ios-native-selection、mineru-anchors、view-store），并登记其消费者模块；跨模块绑定 14 条与流水线 `cross_imports=14` 一致。基线门禁断言 `(ui_js, modules, cross_module_imports) = (27, 7, 14)` 通过。
- **登记计数（独立 sqlite 复核）**：modules 7、apis 98、messages 8、publishers 13、subscriptions 17、test_cases 139；`access_edges` 42 = registered 41 + test_only 1（X05 DEV dockview seam）+ **debt 0**；coverage 输出 `total=98 | linked=98 | core_total=70 | core_linked=70`，`edges debt` 查询无结果（0 债务）。

### 9 项门禁负向测试（`tests/am/test_boundaries.py` GateTests，独立逐项复跑 9/9 OK）

原理：每项在内存中向真实 UI 源码注入一处违规，断言边界扫描器必须报出指定违规码（违规未被拦下则测试失败）。

| # | 测试 | 注入的违规 | 期望违规码 | 结果 |
|---|---|---|---|---|
| 1 | test_baseline | 无（正面对照） | 零问题且计数 =(27,7,14) | ok |
| 2 | test_new_cross_module_import | outline-grid 新增未登记跨模块导入 | UNREGISTERED_MODULE_IMPORT | ok |
| 3 | test_shared_consumer_review | markdown-preview 新增未批准 shared 消费 | UNAPPROVED_SHARED_CONSUMER | ok |
| 4 | test_computed_import | 计算式动态 import | UNRESOLVED_DYNAMIC_IMPORT | ok |
| 5 | test_new_raw_store_write | media-module 新增未追踪的 viewStore 直写 | UNTRACKED_DIRECT_STORE_WRITE | ok |
| 6 | test_missing_edge_registration | 从登记表删除一条既有边 | UNREGISTERED_MODULE_IMPORT | ok |
| 7 | test_new_symbol_hidden_behind_known_module_pair | 已知模块对后藏新符号导入 | UNAPPROVED_CROSS_SYMBOL | ok |
| 8 | test_bad_owner | 篡改文件归属模块 | MODULE_OWNER_MISMATCH | ok |
| 9 | test_missing_literal_target | 字面 import 指向未登记文件 | MISSING_IMPORT_TARGET | ok |

流水线内 unittest 总计 `Ran 16 tests … OK`（test_am.py 7 项 + 上述 9 项），与独立复跑一致。结论：**9 项越界注入全部被门禁拦截，负向测试有效**。

## 6. Git 完整性与工作区状态

- 审计前后（源克隆与隔离 target 双侧）：HEAD 均为 `38ea47d3782387d842098e77a586f1d8f3db0d8a`，tree 均为 `b6d8b36ddd9d8bb18ee2836cba9f3e8fa5bf1a84`，`git status --porcelain` 均为 0 行。
- `git fsck --full` 双侧 rc=0、无输出。
- 审计未修改主线、业务模块、AM 登记表；未使用 rebase / force push；失败套件的独立复跑仅写入隔离 target 的 `.v6/`（gitignored），未触碰被审计源码。
- 结论绑定范围：本报告仅对提交 `38ea47d` 负责，主线其后提交（远端 HEAD 已前进）不在认证范围内。

## 7. 历史故障复查（在本提交上）

| 历史故障 | 本轮证据 | 结论 |
|---|---|---|
| WebKit 章节重开超时（旧审计分支 Grok 曾在此步 reload 30 秒超时） | 23 号 promoted-chapters PASS（7 契约）；双引擎 `AUDIT_RELOAD_OK` ×2、`V6_PROMOTED_CHAPTER_REOPEN_REEXPORT_PASS` ×2；Cookie 适配器 `verified-server-token-stored`、初始化屏障均正常 | 本提交 Linux 双引擎均未超时 |
| LaTeX 渲染 | 10 号 latex-browser PASS（`LATEX_BROWSER_PASS`，8 契约）、11/12 号 PASS；LaTeX 网格在本轮失败套件中亦正常渲染（16 行） | 渲染本身正常；**但**审阅标记在重开后的计数恢复失败（§4），属同区域新发现 |
| 媒体粘贴（旧环境曾因 macOS `sips` 依赖在 Linux 失败） | 15 号 media-browser PASS（15 契约）、16 号 media-paste-browser PASS（`MEDIA_PASTE_PASS`）；审计层 Chromium sips 垫片冒烟通过（`AUDIT_LINUX_SIPS_SMOKE_PASS`） | PASS（经公开审计适配层） |

## 8. 平台兼容性说明

- 本轮使用主线自带的可移植审计层（`tests/am/portability/`）：Linux sips 垫片（仅拦截测试夹具生成、真实转码）、loopback Cookie 适配器（仅回环 http + 服务端已签发 token、原样存入）、WebKit 初始化屏障、只读诊断采样。适配层不改变产品断言、超时与服务端校验，与旧审计分支的公开适配口径一致。
- 产品侧已知项沿用既往结论：编辑 Cookie 的 `Secure` 属性在本地 http 回环下由适配层绕行，生产 HTTPS 下的真实行为本轮未验证。

## 9. 未验证范围

- 13 号套件的 WebKit 阶段（被 Chrome 阶段失败遮蔽）。
- macOS 上本提交的表现（本轮仅 Linux；主线若有 Mac 证据可与本报告 §4 对照定性）。
- 生产 HTTPS 部署下的 Cookie/保存链路（本地回环审计不覆盖）。
- 全量仅运行一次（另加失败套件一次独立复跑）；未做第二次全量背靠背。

## 10. 结论与报告提交

- **结论：FAIL** —— 38ea47d 在 Linux（Ubuntu 24.04 x86_64）上 26/27 套件、136/139 契约通过；唯一失败为 latex-review-browser 在 Chrome 阶段重开文档后审阅计数（`latex 1 / 忽略 1`）25 秒未恢复，确定性复现。AM 模块边界、27 个 UI 文件归属、9 项负向门禁、Git 完整性全部通过。因全量未通过，**不签发 AM_FULL_TABLE_CERTIFIED**，亦不宣布该提交通过独立验收。
- 报告提交：本报告经 GitHub 连接器快照推送至分支 **`audit-muse-mainline-38ea47d`**，路径 `audit-reports/META_MUSE_MAINLINE_AUDIT_38ea47d.md`（提交 SHA 记录于审计交付与同步记录中）。
- 证据索引（审计机本地）：主日志 `~/workspace/audit-mainline-run-2026-10-25.log`；失败套件日志 `~/workspace/ocr2md-am-38ea47d3-isolated/.v6/tests/am-full-20261024T160915Z-38ea47d3-13-latex-review-browser.test.log`；复跑日志 `~/workspace/audit-mainline-suite13-rerun.log`；逐套件日志目录 `~/workspace/ocr2md-am-38ea47d3-isolated/.v6/tests/`。
- 报告不含任何凭据、Cookie 或令牌。
