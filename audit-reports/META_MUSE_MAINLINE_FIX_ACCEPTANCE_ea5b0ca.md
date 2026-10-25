# OCR2MD V6 主线修复专项验收报告（Linux）

- **验收员**：Meta Muse（独立第三方审计；未参与主线开发与本次修复）
- **验收日期**：2026-10-25（CST）
- **验收对象**：github.com/laity2010/ocr2md，主线分支 `build/2026-10-20`
- **被验收提交（锁定）**：`ea5b0ca73889a88625204b02b77579b98be7b3ec`
  （提交标题：`fix(latex): restore review count after asynchronous startup status overwrite`，2026-10-25 00:47:51 +0800）
- **验收缘起**：基线提交 `38ea47d3782387d842098e77a586f1d8f3db0d8a` 的独立审计结论为 FAIL，唯一失败为 13 号套件 `tests/latex-review-browser.test.mjs`（Chrome 阶段保存审阅标记后 `page.reload` 重开，状态栏 `latex 1 / 忽略 1` 计数 25 秒未恢复，确定性复现；WebKit 阶段上轮未验证）。主线称已修复，本轮专项验收该修复。
- **结论：专项验收 PASS**（严格绑定 `ea5b0ca` 的 LaTeX 审阅计数修复项；不是对 `38ea47d` 的追认，也不是全量套件认证——本轮未跑全量，见 §7）。

## 1. 修复 diff 定性（先审 diff，再跑测试）

### 1.1 修复提交 ea5b0ca 本身（重点审查）

`git show --numstat ea5b0ca`：仅两个文件，均为纯新增行、零删除：

| 文件 | 增 / 删 | 性质 |
|---|---|---|
| `ui/main.js` | +5 / −0 | **产品修复** |
| `tests/latex-review-browser.test.mjs` | +14 / −0 | 测试强化（见下） |

**产品修复机制**（`ui/main.js`，`main()` 内，异步权限检查之后）：

```js
// A module may have become active while the async document fetch and
// authorization check were still running. The generic 'loaded' status above
// can otherwise overwrite its initial report (Muse Linux 38ea47d). Refresh
// through Workspace's public semantic API, never via LaTeX internals.
if ($('module-select').value === 'latex') workspace.scanLatex();
```

根因与上轮审计定性一致：重开文档时启动流程是异步的（文档 GET + 权限检查），latex 模块先行恢复的审阅计数被随后完成的通用「✓ 已加载」状态覆盖。修复在启动流程收尾时，若当前模块为 latex，经 Workspace 既有公共语义 API `scanLatex()`（基线 `38ea47d` 的 `ui/workspace.js:376` 已存在，定义为 `currentOutline?.latex?.refresh()`，非本次新增）重新发布计数。修复落在**产品代码的审阅计数恢复路径**，未绕过模块边界、未改服务端、未改登记表。

**测试变更独立判定：强化，无放宽。** 同提交对 `tests/latex-review-browser.test.mjs` 的 +14 行（区间全程仅此一个提交触碰该文件）为：

1. 在 reload 前新增 `page.route('**/api/document', …)` 拦截，仅对重开时的文档 GET 人为延迟 2400ms，使上轮在 Linux 上自然出现的启动竞态变为**确定性复现**——这是收紧复现条件，不是放宽；
2. reload 后、最终断言前，新增一条前置等待（审阅下拉框 ≥2 个渲染完成，28s）与两条**新增断言**：重开后两个下拉框的已存值必须分别为 `latex` 与 `忽略`（此前契约只验状态栏文本，不验恢复值本身）；
3. **原最终断言逐字未动**：`waitForFunction` 等待状态栏包含 `latex 1 / 忽略 1`，超时仍为 **25000ms**；期望计数、42 公式不变、落盘注释断言等全部原样保留。无任何断言被删除、改弱或延时。

另有决定性交叉验证（§4）：以上轮原始（`38ea47d` 版）测试文件对 `ea5b0ca` 产品代码复跑，同样双引擎通过——**通过不依赖本次测试改动**，产品修复独立成立。

### 1.2 全区间 38ea47d..ea5b0ca 异常筛查（只查契约影响）

区间共 12 个提交：全局设置模块（Settings WP）开发 7 个、其测试跟进 2 个、Grok 审计工具修复 3 个、LaTeX 修复 1 个（即 ea5b0ca）。逐项筛查结论：

- **登记表（registry.sql / ownership.json）：纯增量，基线完整保留。** 逐行核对：基线 `registry.sql` 的每一行在 `ea5b0ca` 均原样存在（缺失 0 行）；`ownership.json` 无文件删除、无归属变更，仅新增 3 个 UI 文件。将基线与 `ea5b0ca` 两版 AM 数据库逐表逐行比对：modules / apis / messages / publishers / subscriptions / access_edges / test_cases **删除 0 行、变更 0 行**，只有新增（模块 S、API C24/C25/S01–S06/C27/C28、消息 E09、PUB-S01、SUB-C01、edges X70–X74、13 条 test_cases）。原有 **41 条 registered edges 与 X05（test_only）逐行未动，debt 仍为 0**。新总量为登记 8/108/9/14/18/152、edges 47 = 46 registered + 1 test_only + 0 debt、UI 文件 30、跨模块导入 17——属新模块的合法工程登记，不构成对原契约的破坏。
- **边界门禁同步更新且更严**：`test_boundaries.py` 基线计数随实际树更新为 (30, 8, 17)，并新增 4 项负向测试；`audit_boundaries.py` 新增两类 fail-closed 扫描（绝对/URL import、函数式 `viewStore.setState`）。`test_am.py` 的模块/消息计数断言随新登记更新（模块集合加入 S、消息数 ≥9），属功能登记记账，不涉及 LaTeX 契约。
- **审计工具修复（不改判据）**：`am.py` 改为超时时整棵进程树清理（PASS 仍以退出码 0 为唯一标准，超时记 ERROR，判据未变）；`audit-linux-diagnostics.mjs` 仅给失败时的诊断采样加 5 秒上界并原样重抛错误，不触碰断言。
- **其他测试改动（记录存在，不深入审计）**：新增 `tests/settings-browser.test.mjs`、`tests/settings-server.test.mjs`、`tests/am/test_settings_io.py`（设置模块自身测试）；`tests/pdf-click-only-browser.test.mjs` 改为有界步骤（9d1ce16）；`tests/promoted-chapters-browser.test.mjs` 一行断言随模块菜单新增「全局设置」更新期望值（四项菜单与新功能一致）。
- 未发现偷改 LaTeX 验收契约、删除既有登记、改动既有 edges 掩盖违规或引入 debt 的改动。

## 2. 环境与工作区

| 项 | 值 |
|---|---|
| 发行版 / 架构 | Ubuntu 24.04.5 LTS / x86_64（内核 7.0.0-39-generic） |
| git / Node / Python | 2.43.0 / v24.22.1 / 3.12.3 |
| Playwright | 1.64.1（package-lock 锁定）；Chromium（chromium-1248）、WebKit（webkit-2370）预检双 PASS |
| 端口预检 | `AUDIT_PORT_PREFLIGHT_SELFTEST_PASS`；`AUDIT_TEST_PORT_PREFLIGHT_PASS ports=47` |

- 验收工作区：`~/workspace/ocr2md-mainline-accept-ea5b0ca`（全新克隆，detached 于 `ea5b0ca`，tree `76fc10bfd2af01b511e93f0287eec6f0ac6b594c`，status 0 行）；实际执行于隔离 worktree `~/workspace/ocr2md-am-ea5b0ca7-isolated`，制备流程与上轮全量审计的 `run-grok-audit.sh` 完全一致（同一可移植适配层，取自被验收树自身的 `tests/am/portability/`：sips 垫片、loopback Cookie 适配、WebKit 初始化屏障、只读诊断采样；适配层不改变产品断言与超时）。
- PDF 样本：主线检出不含 `.v6/workspace/`，按规程从上轮冻结样本源复制同一冻结样本，SHA-256 实测 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`，与登记值一致；MD 夹具 SHA-256 `d86508f6…e3b764` 一致。

## 3. 核心验收：13 号 latex-review-browser（Linux 双引擎完整运行）

日志：`~/workspace/audit-mainline-accept-suite13.log`。结果原文：

```text
=== suite13 ea5b0ca tests/latex-review-browser.test.mjs ===
2026-10-25 00:26:30 UTC
LATEX_CM_REVIEW_PASS Chrome {"inline":true,"standalone":true,"undoRedo":true,"saveReload":true,"inlineKatex":true,"ignoredPlain":true,"cmdAnnotations":true,"deltaApiRemoved":true,"sourceSingle":true}
LATEX_CM_REVIEW_PASS WebKit {"inline":true,"standalone":true,"undoRedo":true,"saveReload":true,"inlineKatex":true,"ignoredPlain":true,"cmdAnnotations":true,"deltaApiRemoved":true,"sourceSingle":true}
SUITE13_EXIT=0
```

- **Chrome 阶段 PASS**：含新增的确定性竞态场景（文档 GET 延迟 2400ms 后重开）——状态栏在原 25 秒预算内恢复 `latex 1 / 忽略 1`，上轮在此处确定性超时的失败点已消除；落盘断言（2 条注释含 id、42 公式不变）、恢复值断言（`latex` / `忽略`）、重开后重置再保存、零页面错误，全部通过。
- **WebKit 阶段 PASS**：上轮被 Chrome 失败遮蔽、记为未验证的 WebKit 阶段，本轮完整执行并通过（同一 PASS 标记，九项子检查全 true）。
- 判定标准与原契约一致，未作任何调整。

## 4. 审计方交叉验证：原始基线测试 × 修复后产品代码

将 `38ea47d` 版 `tests/latex-review-browser.test.mjs`（逐字节原始文件，无延迟注入、无新增断言、原等待结构）临时置入隔离 target，对 `ea5b0ca` 产品代码运行（日志 `~/workspace/audit-mainline-accept-suite13-baseline38.log` 与 `…-baseline38-rerun.log`，临时文件已删除并验证 target 干净）：

- 第 1 次：Chrome **完整 PASS**（打印 `LATEX_CM_REVIEW_PASS Chrome`）——上轮在基线代码上两次确定性失败的原始契约，在修复后代码上通过；WebKit 阶段全部功能步骤（含重开后计数恢复）走完，仅在最后一行零页面错误断言被一条间歇性 WebKit 平台噪声绊倒：`'/127.0.0.1:5661/healthz due to access control checks.'`（与夹具审计第一轮 F4 记录的同签名 WebKitGTK 回环 pageerror，非产品断言失败）。
- 第 2 次（复跑）：**Chrome 与 WebKit 双双完整 PASS，退出码 0**，无该噪声。

结论：修复对**原始未修改契约**成立；ea5b0ca 中的测试改动不是通过的前提。

## 5. 辅助证据（照跑记录，不构成全量验收）

日志：`~/workspace/audit-mainline-accept-regression.log`。

| 项 | 结果 |
|---|---|
| 10 号 latex-browser | 双引擎 `LATEX_BROWSER_PASS`（49 公式、KaTeX 渲染与状态过滤正常） |
| 11 号 latex-four-view-browser | 双引擎 `LATEX_FOUR_VIEW_PASS` |
| 12 号 latex-normalize-browser | 双引擎 `LATEX_NORMALIZE_API_PASS`（saveReload true） |
| 23 号 promoted-chapters-browser | 双引擎 PASS；`AUDIT_RELOAD_OK` ×2、`V6_PROMOTED_CHAPTER_REOPEN_REEXPORT_PASS` ×2（章节重开未超时） |
| `am.py check` | `AM_CHECK_PASS apis=108 FK=OK source-and-test-files=OK ui-ownership=OK`；`AM_UI_BOUNDARY_PASS files=30 shared=4 cross_imports=17`；`am.py edges debt` 无结果（0 debt） |
| 负向门禁 `test_boundaries` GateTests | **13/13 ok**：原 9 项（baseline、未登记跨模块导入、未批准 shared 消费、计算式 import、未追踪 store 直写、删登记边、新符号藏匿、篡改归属、未登记字面目标）全部继续拦截；新增 4 项（绝对路径 import、URL import、函数式 store 写 ×2）同样拦截 |
| AM 单测全集 | `Ran 25 tests … OK`（test_am / test_boundaries / test_settings_io / test_timeout_cleanup） |

以上仅证明修复未波及邻近 LaTeX 套件、章节重开与登记/边界完整性；不作为否决门槛之外的任何升级表述。

## 6. Git 完整性

- 验收前后双侧核验：验收工作区与隔离 target 的 HEAD 均为 `ea5b0ca73889a88625204b02b77579b98be7b3ec`（tree `76fc10bf…` 不变），`git status --porcelain` 均为 0 行，`git fsck --full` 均 rc=0。
- 本轮未修改主线、未修改被验收对象任何文件；测试写入仅发生在隔离 target 的 `.v6/`（gitignored）；交叉验证用的临时基线测试文件已删除并复验干净。未使用 rebase / force push。

## 7. 未验证范围

- 全量套件（`ea5b0ca` 树共 29 个套件 / 152 契约）未跑 `run-all`，无 `AM_FULL_TABLE_CERTIFIED` 事项——本结论不构成全量认证。
- 全局设置模块（Settings WP）功能本身未审计（本轮仅确认其登记为合法增量、且未破坏原登记与 LaTeX 契约）。
- 10/11/12/13/23 号以外的套件本轮未运行（含被改写的 pdf-click-only 与新增 settings 套件）。
- macOS 表现、生产 HTTPS 下 Cookie/保存链路未验证。
- WebKit `/healthz` pageerror 噪声为间歇性平台现象（§4），本轮未做根除性取证。

## 8. 结论

**专项验收 PASS。** 修复提交 `ea5b0ca` 的产品改动（`ui/main.js` +5 行，经既有公共 API 在启动收尾刷新 latex 审阅计数）真实修复了基线 `38ea47d` 的失败：13 号套件在 Linux 的 Chrome 与 WebKit 双引擎均完整通过（含确定性竞态场景），且原始未修改的基线测试对修复后代码同样双引擎通过；同提交的测试改动为强化而非放宽。区间内的登记扩展经逐行核对为合法增量，原有登记与 41 条 registered edges 完整保留、debt 为 0；邻近套件与边界门禁未被波及。本结论严格绑定 `ea5b0ca` 的 LaTeX 修复项。

- 报告提交：本报告经 GitHub 连接器快照推送至既有分支 **`audit-muse-mainline-38ea47d`**，路径 `audit-reports/META_MUSE_MAINLINE_FIX_ACCEPTANCE_ea5b0ca.md`（提交 SHA 记录于验收交付与同步记录中）。
- 证据索引（验收机本地）：`~/workspace/audit-mainline-accept-suite13.log`、`~/workspace/audit-mainline-accept-suite13-baseline38.log`、`~/workspace/audit-mainline-accept-suite13-baseline38-rerun.log`、`~/workspace/audit-mainline-accept-regression.log`、`~/workspace/audit-mainline-accept-prep.log`；隔离 target `~/workspace/ocr2md-am-ea5b0ca7-isolated`。
- 报告不含任何凭据、Cookie 或令牌。
