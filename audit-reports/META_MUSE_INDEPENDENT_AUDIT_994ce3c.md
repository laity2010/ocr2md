# OCR2MD V6 · 独立 AM/Git 审计报告（第三轮 · 修订测试契约 994ce3c）

**审计员：Muse（Meta Muse，第三方独立审计）**
**审计日期：2026-10-24（Asia/Shanghai）**
**被审计仓库：github.com/laity2010/ocr2md（Public），审计分支 `audit-fixture-5c7497c`**

> 与前两轮的关系：第一轮审审计包 d887aea 下的原始契约，Linux x86_64 结果 21/27 套件、90/139 契约；第二轮审修订契约 1dab592，27/27、139/139 认证；本轮审 994ce3c——在 1dab592 基础上新增 WP1 跨平台环境收口（端口/浏览器运行时预检、Linux WebKit 重开追踪、WebKit 初始化屏障泛化、KaTeX 可见就绪等待）。本轮的四个焦点问题由主线提出：① Linux WebKit 章节重开是否仍超时；② 端口 TIME_WAIT 是否不再误阻塞；③ 缺浏览器动态库时是否正确报 BLOCKED；④ 能否取得完整 27/27、139/139 认证。

---

## 0. 结论（严格双 SHA 口径）

| 对象 | 结论 |
| --- | --- |
| **冻结业务源码 `5c7497c`** | **未被触碰**。审计脚本内置白名单校验通过（`AUDIT_FROZEN_BUSINESS_SOURCE_VERIFIED changed_paths=58`，Run F 与 Run G 一致）；本审计员独立复核：相对 5c7497c，`ui/`、`scripts/`、`packages/`、`labs/` 四个业务目录的 diff 为 **0**（§6，复核命令与输出附后） |
| **修订测试契约 `994ce3c`（Linux x86_64）** | **Run F：27/27 套件 PASS，139/139 AM 契约 PASS，`AM_FULL_TABLE_CERTIFIED 139/139`**（`tested_git=current_git=994ce3ce`，`source_tests_unchanged=True`）。**Run G 未完成**（21 套件 PASS、1 套件 FAIL、23 号套件开始后中断，见 §3.2）——它不构成对 Run F 的推翻（其 FAIL 为 WebKit 浏览器关闭事件、无产品断言失败；其中断为基础设施 EPERM 复发），但**背靠背复现未完成**，本报告如实记录，不把单运行结果说成双运行复现 |
| **这不是对冻结测试全文的 Linux 认证** | 139 条中与冻结原文不同的有两条公开测试修订（§5）：`tests/scroll-sync-browser.test.mjs` 的反向滚动语义断言（1dab592 已修订，本轮沿用）；`tests/latex-browser.test.mjs` 新增的 KaTeX 可见就绪等待（本轮新增，同一 25 秒超时、同一 ≥10 计数断言，未放宽）。认证绑定的是**修订后契约 994ce3c**，不得改述为"5c7497c 原始测试在 Linux 全量认证" |
| **焦点 1：Linux WebKit 章节重开** | **Run F 样本：不再超时**。23 号套件 promoted-chapters 在 Chrome 与 WebKit 双引擎均输出 `AUDIT_RELOAD_OK`（含 `reload-complete`）与 `V6_PROMOTED_CHAPTER_REOPEN_REEXPORT_PASS`；Run F 全量套件日志中 `AUDIT_RELOAD_FAIL` 出现 **0 次**。**Run G 第二样本：未获得**（Run G 中断于 23 号套件开始，该套件日志 0 字节）。按 AUDIT.md 的 WP1 口径：单轮绿色不证明该故障根除，本报告只记录一个完整样本的标记与原始日志，不做根除断言 |
| **焦点 2：端口 TIME_WAIT** | **已验证不再误阻塞（实证）**。Run G 在 Run F 结束约 1 分钟后于同一目标启动——此时 Run F 各测试服务器的 TIME_WAIT 套接字尚存——端口预检自测 `AUDIT_PORT_PREFLIGHT_SELFTEST_PASS`（live_listener=blocked，closed_server=reusable）与 `AUDIT_TEST_PORT_PREFLIGHT_PASS ports=45` 双双通过，复跑进入套件阶段未被拦截。第二轮的 R2-F1（旧内联 bind 探针的 TIME_WAIT 假阳性）已被 `audit-port-preflight.py`（SO_REUSEADDR bind+listen，永不 SO_REUSEPORT）修复；Run G 后续的中断与预检无关 |
| **焦点 3：缺库 BLOCKED** | **已验证 PASS（实验 A，不重跑）**。人为移走 `libgstreamer-1.0.so.0` 后，audit.sh 浏览器预检 Chromium PASS、WebKit `AUDIT_BROWSER_RUNTIME_BLOCKED`，以 `AUDIT_BLOCKED: browser runtime unavailable; see browser-preflight.log (environment BLOCKED, not application FAIL)`、exit 2 退出，**零套件运行**——缺库不再表现为成批套件 FAIL，而是按 AUDIT.md 口径的环境 BLOCKED。实验后库已恢复并经 ldconfig 复核 |
| **焦点 4：完整认证** | **Run F 已取得完整认证；背靠背复现未完成**。Run F 为 27/27、139/139、CERTIFIED（§3.1）；Run G 因套件 9 WebKit 中止与 23 号 EPERM 中断而未完成（§3.2），故"双运行复现"一项记为未完成，不计入认证依据 |
| **生产 HTTPS 授权路径** | **未验证（与前两轮相同）**。本轮 promoted-chapters 的 WebKit 通过（Run F）仍使用公开声明的 loopback Cookie 适配器（§5）：它证明的是"服务端签发的真实令牌在同源校验下可完成保存/导出/重开"，不证明 Linux WebKit 在本地 HTTP 下能保存 Secure Cookie（平台行为，第一轮已实证），也不替代生产 HTTPS 验收 |

**执行过程如实记录**：本轮共经历实验 A、Run B、Run F、Run G 四段（§2）。实验 A 与 Run B 发生在沙箱写入故障（16:18–约 20:39）之前与之中；故障期间 17:20 与 17:51 两档自动重试均因 EPERM 未能执行；20:39 探针确认写入恢复后立即启动收尾，Run F 为收尾的完整运行，Run G 为背靠背复跑但未完成。Run B 的 12/12 PASS 与 Run G 的 21/27 PASS 均不计入任何认证——它们未跑完，无 verdict；Run G 的套件 9 FAIL 单独定性于 §2/§7，不混入认证计数。

---

## 1. 固定对象与校验

| 对象 | 固定值 / 实测 |
| --- | --- |
| 审计包分支 | `audit-fixture-5c7497c` |
| 审计包/测试契约 SHA | `994ce3ce41f4ab3d5407f2ddd67f76f76415a3cb`（本地 bundle、目标 worktree HEAD、RUN_EVIDENCE 三处一致；远端 HEAD 在执行期间已被 Grok Bot 第三轮报告推进，见本节末） |
| 冻结业务源码 SHA | `5c7497cdf94ea35217e83effd9496a045625fef0`（为审计包 HEAD 的祖先；业务目录零 diff，见 §0/§6） |
| PDF SHA-256 | 期望与实测均为 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`（Run F 与 Run G 运行内各验一次；收尾后独立复核再验一次，一致） |
| Markdown 母本夹具 | `packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md` 实测 `d86508f69b941a5e…`，与登记值一致；测试后 worktree 干净即证明已恢复 |
| 审阅夹具（gz 解压后） | `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`（RUN_EVIDENCE fixture_overrides 登记，文件未变化） |
| 环境 | Ubuntu 24.04.5 LTS x86_64（root 隔离 VM，2 核/8 GB）；git 2.43.0；**Node v24.22.1**；Python 3.12.3；Playwright 1.64.1；浏览器缓存构建 Chromium-1248 / WebKit-2370 / ffmpeg-1013（`~/.cache/ms-playwright` 预置，本轮运行内未补装系统库） |

AM 登记口径独立复核（目标 `.v6/tests/am.sqlite` 与运行日志双向对照）：**7 模块 / 98 API / 8 消息 / 13 发布者 / 17 订阅 / 139 契约**，`AM_BUILD_PASS`、`AM_CHECK_PASS`；`access_edges` 42 条按 classification 计为 41 registered + 1 test_only（X05 DEV dockview 接缝）+ 0 debt（§6 复核命令附后）。

**远端 HEAD 变化（执行期间，如实记录）**：本轮收尾启动时（20:39 CST 探针后），GitHub 连接器 `list_commits` 显示分支 HEAD 已不是 994ce3c，而是 `69104edd2fd7d170710e2effc590d6a7a34a2991`——Grok Bot 第三轮报告与证据（2026-10-24 16:24 CST 提交，消息 "Add Grok Bot independent Linux audit report + evidence for 994ce3c (frozen source 5c7497c)"）。本报告的审计对象仍是本地 994ce3c 的 audit.sh 与测试（bundle 与目标 HEAD 均为 994ce3c，audit.sh 不依赖远端状态）；本报告的上推基底取推送时的远端 HEAD。Grok 第三轮报告的文件内容本审计员未逐项复核（提交后搜索索引尚未收录），其结论不纳入本报告——两份报告相互独立。

**附注（信息级）**：本 VM 上 `git ls-remote` 在本轮多次一致失败（`error: RPC failed; curl 56 Connection died, tried 5 times`），而同机 HTTPS（github.com 返回 200）与 GitHub 连接器均正常。远端 HEAD 因此改走连接器核验；audit.sh 本身不调用 ls-remote，审计结论不受影响。

---

## 2. 执行记录

| 次序 | 结果 | 说明与证据 |
| --- | --- | --- |
| 实验 A（焦点 3，主动负向实验） | **环境 BLOCKED（audit.sh exit 2，零套件）** | 人为移走 `/usr/lib/x86_64-linux-gnu/libgstreamer-1.0.so.0` + ldconfig 后运行：冻结校验 58 路径通过、端口预检 45 个 PASS、浏览器预检 Chromium PASS、WebKit `AUDIT_BROWSER_RUNTIME_BLOCKED`（真实加载错误），随后 `AUDIT_BLOCKED: browser runtime unavailable; see browser-preflight.log (environment BLOCKED, not application FAIL)` 退出。实验后库已恢复（ldconfig 计数回 1，文件大小/日期与原值一致）。证据：`audit-r3-expA-blocked.log`（2,309 字节） |
| Run B（全量尝试，被基础设施故障中断） | **无 verdict（12/12 后中断）** | run id `20261024T081446Z`，16:14 CST 启动；端口与浏览器双预检 PASS；套件 1–12 全部 PASS（含修订后的 latex-browser，8 契约），累计 60 契约；第 13 套件 latex-review 开始后，沙箱写入通道开始 EPERM，运行中途死亡。事后目标 worktree 干净、无残留锁、套件 13 日志为空、RUN_EVIDENCE 截断为 0 字节。12 个 PASS 不构成任何部分认证。证据：`audit-r3-runB-2026-10-24.log`（9,105 字节） |
| 沙箱写入故障窗口（第一次） | **基础设施故障，与被审计仓库无关** | 2026-10-24 约 16:18 至约 20:39：exec 通道一切文件内容写入返回 EPERM（`printf > file` rc=1，`npm write` EPERM，心跳写入 EPERM）；只读与纯计算、Git 读取、GitHub 连接器、文档写通道均正常；磁盘挂载 rw、用量 2%、无 OOM、无残留测试进程。17:20 先行重试与 17:51 兜底重试均因 EPERM 未能执行，两档重试已耗尽。20:39 探针 `write_rc=0` 确认恢复后立即启动收尾 |
| Run F（收尾运行 1） | **PASS（exit 0）** | run id `20261024T124211Z`，27/27、139/139、`AM_FULL_TABLE_CERTIFIED 139/139`（§3.1）。证据：`audit-r3-runF-2026-10-24.log`、快照 `audit-r3-runF-RUN_EVIDENCE.json`（目标内 RUN_EVIDENCE 随后被 Run G 覆盖，快照先行保存） |
| Run G（收尾运行 2，背靠背，未完成） | **无 verdict（21 PASS、1 FAIL、23 号中断）** | run id `20261024T125700Z`，Run F 结束约 1 分钟后于同一目标启动。端口预检（焦点 2 样本）PASS；套件 1–8 PASS；套件 9 four-pane-pdf-browser **FAIL**（见下行）；套件 10–22 PASS；第 23 套件 promoted-chapters 开始后写通道 EPERM 复发，运行死亡（该套件日志 0 字节，RUN_EVIDENCE 截断为 0 字节）；套件 24–27 未运行。证据：`audit-r3-runG-2026-10-24.log` |
| Run G 套件 9 FAIL 定性 | **WebKit 浏览器关闭事件，无产品断言失败** | Chrome 段全部通过（`FOUR_PANE_PDF_OPEN_ZOOM`、`FOUR_PANE_ROTATED_PAGE_PASS 8+11`、`FOUR_PANE_PDF_REVERSE_PASS`、`FOUR_PANE_PDF_PASS`）；WebKit 段在初始化屏障等待处中止：`page.waitForFunction: Target page, context or browser has been closed`（`audit-linux-diagnostics.mjs:68` 的屏障等待，`four-pane-pdf-browser.test.mjs:52`），套件日志仅 864 字节。无任何产品断言失败；其后套件 10–22 全部通过，说明 EPERM 当时尚未复发——该 FAIL 与随后的 EPERM 中断是两个独立事件。根因（WebKit 进程关闭的具体触发点）未隔离，记为未验证（§8），不计入产品 FAIL，也不计入认证 |
| 沙箱写入故障复发（第二次） | **基础设施故障复发，收尾就此停止重试** | Run G 第 23 套件开始后，写通道再次 EPERM（收尾包装的 echo 写日志失败：`/bin/bash: line 1: echo: write error: Operation not permitted`；事后探针 `write_rc=1`）。按任务口径，EPERM 复发即停止一切 audit.sh 重试，不再发起 Run H；报告撰写与上推改走 EPERM 期间仍可用的文档写通道与 GitHub 连接器通道 |

目标目录全程为 `~/workspace/ocr2md-v6-audit-target-994ce3c`（detached @994ce3c）；bundle clone `~/workspace/audit-ocr2md` 全程干净。核心转储禁用生效：运行后目标内无 core 文件，双 worktree `git status` 均 0 行。

---

## 3. 自动化结果明细

### 3.1 Run F（run `20261024T124211Z`）

27 个脚本全部 PASS，契约数合计 139（逐项与 RUN_EVIDENCE 的 `am_cases` 139 条 PASS 一一对应）：

| # | 脚本 | 契约 | 结果 | | # | 脚本 | 契约 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | ag-header-browser | 2 | PASS | | 15 | media-browser | 15 | PASS |
| 02 | am/contracts-browser | 16 | PASS | | 16 | media-paste-browser | 4 | PASS |
| 03 | chapter-numbering | 1 | PASS | | 17 | mineru-start-only-ui-browser | 4 | PASS |
| 04 | cm6-browser | 3 | PASS | | 18 | obsidian-image-preview-browser | 1 | PASS |
| 05 | cmd-annotations-browser | 7 | PASS | | 19 | outline-browser | 15 | PASS |
| 06 | cmd-html-unified-browser | 5 | PASS | | 20 | pdf-anchor-viewport-browser | 1 | PASS |
| 07 | compact-shell-browser | 5 | PASS | | 21 | pdf-click-only-browser | 4 | PASS |
| 08 | dockview-preview-browser | 5 | PASS | | 22 | preview-split-browser | 6 | PASS |
| 09 | four-pane-pdf-browser | 5 | PASS | | 23 | promoted-chapters-browser | 7 | PASS |
| 10 | latex-browser | 8 | PASS | | 24 | quote-indent-browser | 1 | PASS |
| 11 | latex-four-view-browser | 1 | PASS | | 25 | scroll-sync-browser | 4 | PASS |
| 12 | latex-normalize-browser | 2 | PASS | | 26 | scroll-sync-leadership-browser | 6 | PASS |
| 13 | latex-review-browser | 3 | PASS | | 27 | shared-preview-browser | 6 | PASS |
| 14 | media-adoption-syntax | 2 | PASS | | | | | |

运行器原文：`AM_FULL_RESULT passed_cases=139/139 failed_suites=0 git=994ce3ce`；`AM_FULL_TABLE_PASS`；`AM_FULL_TABLE_CERTIFIED 139/139 cases; tested_git=994ce3ce current_git=994ce3ce source_tests_unchanged=True (integrated tests are not separate per-API oracles)`；`AUDIT_AUTOMATED_PASS FrozenBusinessSource=5c7497cdf94ea35217e83effd9496a045625fef0 AuditedTestContract=994ce3ce41f4ab3d5407f2ddd67f76f76415a3cb`。

### 3.2 Run G（run `20261024T125700Z`，背靠背，未完成）

| # | 脚本 | 契约 | 结果 | | # | 脚本 | 契约 | 结果 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | ag-header-browser | 2 | PASS | | 15 | media-browser | 15 | PASS |
| 02 | am/contracts-browser | 16 | PASS | | 16 | media-paste-browser | 4 | PASS |
| 03 | chapter-numbering | 1 | PASS | | 17 | mineru-start-only-ui-browser | 4 | PASS |
| 04 | cm6-browser | 3 | PASS | | 18 | obsidian-image-preview-browser | 1 | PASS |
| 05 | cmd-annotations-browser | 7 | PASS | | 19 | outline-browser | 15 | PASS |
| 06 | cmd-html-unified-browser | 5 | PASS | | 20 | pdf-anchor-viewport-browser | 1 | PASS |
| 07 | compact-shell-browser | 5 | PASS | | 21 | pdf-click-only-browser | 4 | PASS |
| 08 | dockview-preview-browser | 5 | PASS | | 22 | preview-split-browser | 6 | PASS |
| 09 | four-pane-pdf-browser | 5 | **FAIL（WebKit 浏览器关闭，见 §2 定性）** | | 23 | promoted-chapters-browser | 7 | **中断（开始后 EPERM，日志 0 字节）** |
| 10 | latex-browser | 8 | PASS | | 24 | quote-indent-browser | 1 | 未运行 |
| 11 | latex-four-view-browser | 1 | PASS | | 25 | scroll-sync-browser | 4 | 未运行 |
| 12 | latex-normalize-browser | 2 | PASS | | 26 | scroll-sync-leadership-browser | 6 | 未运行 |
| 13 | latex-review-browser | 3 | PASS | | 27 | shared-preview-browser | 6 | 未运行 |
| 14 | media-adoption-syntax | 2 | PASS | | | | | |

Run G 计数：110 契约 PASS（21 套件）；5 契约位于 FAIL 套件（9 号）；7 契约位于中断套件（23 号）；17 契约未运行（24–27 号）；合计 110+5+7+17=139。**无 `AM_FULL_RESULT`、无 `AM_FULL_TABLE_CERTIFIED`**——运行未完成，不输出认证结论。Run G 的 RUN_EVIDENCE 截断为 0 字节，逐条明细以主日志的套件行为准。

### 3.3 Linux 兼容标记普查（双运行全部套件日志）

| 标记 | Run F | Run G | 说明 |
| --- | --- | --- | --- |
| `AUDIT_LINUX_SIPS_SHIM` | ×2 | ×2 | Chromium sips 垫片介入（media-browser、media-paste-browser） |
| `AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER` | ×1 | ×0 | 仅 promoted-chapters，Run F 为 `verified-server-token-stored`；Run G 未跑到该套件 |
| `AUDIT_WEBKIT_INITIALIZATION_BARRIER linux` | ×2 | ×1 | Run F：latex-browser 与 promoted-chapters；Run G：仅 latex-browser |
| `AUDIT_LINUX_SAVE_STATE` | ×2 | ×0 | Run F 均为 promoted-chapters 的已保存状态采样；Run G 未跑到该套件 |
| `AUDIT_LINUX_WAIT_DIAG` | ×0 | ×0 | 无等待超时诊断样本（无超时发生） |
| `AUDIT_RELOAD_FAIL` | ×0 | ×0 | 无重开失败（Run G 未进入重开步骤） |
| `AUDIT_RELOAD_OK` | Chrome ×1 + WebKit ×1（均含 `reload-complete`） | ×0（未进入） | 23 号套件双引擎重开成功（Run F） |

23 号套件 promoted-chapters 双引擎关键行（Run F，WebKit 段；Chrome 段同构）：`AUDIT_WEBKIT_INITIALIZATION_BARRIER linux promoted-chapters-browser.test.mjs` → `AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER verified-server-token-stored` → `AUDIT_LINUX_SAVE_STATE {"status":"✓ 已保存 · 3,113行 / 306,930字 · 大纲21项 · 章节标定 注释1/标签0 · ⇅滚动同步 · Buffett's Alpha.minerujson.md"}` → `V6_PROMOTED_CHAPTER_EXPORT_PASS WebKit {"count":20,"filename":"0025-Bufett-s-Alpha.md","firstChars":2218}` → `AUDIT_RELOAD_OK WebKit […{"type":"reload-start","detail":"{\"waitUntil\":\"domcontentloaded\"}"},{"type":"main-frame-navigation","detail":"/"},{"type":"domcontentloaded","detail":""},{"type":"reload-complete","detail":""}]` → `V6_PROMOTED_CHAPTER_REOPEN_REEXPORT_PASS WebKit` → `V6_PROMOTION_ISOLATION_PASS`。日志中的远端图片 `request-failed`（`net::ERR_FAILED` / `Blocked by Web Inspector`）与 `/api/chapters` 的 http-404 为重开追踪记录的环境噪声，不影响套件自身的导出/重开/再导出断言。

---

## 4. 前两轮发现的处置复核

| 发现 | 本轮状态 |
| --- | --- |
| F1（Vite 套件缺 `V6_PDF_PATH`，第一轮 22 条 FAIL） | 仍修复：audit.sh 导出 `V6_PDF_PATH`，contracts-browser 与 preview-split 在 Run F 与 Run G 均 PASS |
| F2（macOS `sips`，第一轮 19 条 FAIL） | 仍修复：Chromium sips 垫片在双运行各介入 ×2（§3.3），media-browser（15）与 media-paste-browser（4）双运行均 PASS；垫片仅拦截 `execFileSync('sips', …)` 且对异常参数 fail-closed，转换结果为真实 JPEG |
| F3（Linux WebKitGTK 不存 Secure Cookie，第一轮 7 条 FAIL） | **公开适配，未产品修复**：`scripts/v6_serve.py` 的 Secure 设置（:96 `Secure; HttpOnly; SameSite=Strict`、:291 `Secure; HttpOnly; SameSite=Lax`）与第一轮逐字节一致（收尾复核 grep 确认）；loopback Cookie 适配器仍为 Linux-only，init barrier 已泛化至 Mac+Linux。Run F 的 WebKit 通过证明的是服务端签发令牌路径，不替代生产 HTTPS 验收 |
| F4（quote-indent WebKit pageerror 噪声，第一轮 1 条） | Run F 未复现（PASS）；Run G 未跑到该套件（24 号），无第二样本 |
| F5（冻结 tag `v6-feature-freeze-20261022` 未推远端） | **本轮未复核**：连接器只读集不含 tags 工具，本机 git 协议层拒绝 `ls-remote`，故未取得 fresh 的远端 tags 清单；沿用第二轮结论（远端 tags 仅 `ocr2md-init-v1` 与 `webcodex-initial`），记为未验证，不冒写 |
| R2-F1（端口预检 TIME_WAIT 假阳性） | **已修复并实证**：见 §0 焦点 2（Run G 预检样本） |
| R2-F2（缺库应报 BLOCKED 而非成批 FAIL） | **已修复并实证**：见 §0 焦点 3（实验 A） |
| R2-F3（F5、字体、capability-URL carryover） | 与前两轮相同的信息级记录；capability-URL 行为本轮未复测，结论沿用第一轮 |

---

## 5. 本轮两条测试契约修订与 WP1 审计层代码的独立鉴定

### 5.1 两条公开测试修订（RUN_EVIDENCE 自带登记）

- **scroll-sync 语义断言**（1dab592 已修订，本轮沿用；`audited_test_revision`）："replace renderer-dependent previous anchor +30 with requested source line 600 +30"，配套评审文件 `audit-reports/scroll-sync-semantic-assertion-proposal.diff`。其余检查（驱动、±12 行对齐、反馈序列 <6、开关、编辑、缩放）未动。本轮 scroll-sync（4）与 scroll-sync-leadership（6）在 Run F 均 PASS；Run G 未跑到这两套件。
- **latex-browser KaTeX 就绪等待**（本轮新增；`audited_test_revision_latex`）："wait for ≥10 genuinely KaTeX-rendered visible AG cells before original count assertion; same 25s timeout and required count"。即在原有 `LaTeX 49 项`状态等待之后、原有 ≥10 渲染公式断言之前，增加一次同为 25 秒超时的等待，要求 ≥10 个 `.ocr-latex-grid.ag-row` 行内含 `.katex` 元素；期望计数与断言本身未改。本轮 latex-browser（8 契约）在 Run F 与 Run G 均 PASS，含新增等待的 WebKit 段亦由初始化屏障覆盖（§3.3）。

### 5.2 WP1 审计层代码（前期审阅 + 本轮实证）

- `audit-port-preflight.py`：bind+listen + `SO_REUSEADDR`，永不 `SO_REUSEPORT`；内置自测断言"live listener 被挡、已关闭/TIME_WAIT 端口可复用"；忙端口仍 exit 2。实证：Run F 与 Run G 自测均 PASS，Run G 的 TIME_WAIT 样本通过。
- `audit-browser-preflight.mjs`：真实拉起 Chromium 与 WebKit headless 开 `about:blank`，以 `env -u NODE_OPTIONS` 运行（无测试适配器，垫片无法伪造成功）；失败即 `AUDIT_BROWSER_RUNTIME_BLOCKED` + audit.sh 的 `AUDIT_BLOCKED`。实证：双运行双引擎 PASS；实验 A 的 WebKit 失败路径与之同构。
- `audit-linux-diagnostics.mjs` 重开追踪：仅 promoted-chapters、仅 Linux，记录原生 `page.reload` 前后的导航/DOMContentLoaded/HTTP≥400/失败请求（仅路径，无凭据），输出 `AUDIT_RELOAD_OK`/`AUDIT_RELOAD_FAIL`，不重试、不加超时、不改断言。实证：Run F 双引擎 `AUDIT_RELOAD_OK`，`AUDIT_RELOAD_FAIL` 0 次；Run G 未进入该步骤。
- `audit-loopback-cookie.mjs`：init barrier 泛化至 Mac+Linux（标记 `AUDIT_WEBKIT_INITIALIZATION_BARRIER <platform> <suite>`），loopback Cookie 适配器仍 Linux-only；其余行为与第二轮审阅一致（`route.fetch()` 优先、仅 POST + http + 127.0.0.1、仅 200 且含 `v6edit` 时存入服务端签发的同一令牌并验存，失败即抛）。服务端解锁/同源/PUT 校验未动。
- 无断言放宽：两条测试修订均未放宽超时或计数；审计层代码无一处修改产品断言。

---

## 6. 独立源码检查（本轮范围）

### 6.1 业务源码（增量复核，Run G 完成后于 bundle 与目标双执行）

- `git fsck --full`：bundle 与目标均 exit 0、无输出。
- bundle 与目标 `git status --porcelain`：均为空（干净）。
- 业务目录 diff：`git -C bundle diff --stat 5c7497cdf94ea35217e83effd9496a045625fef0 HEAD -- ui scripts packages labs` 输出为空（0 行，exit 0）。
- AM 登记（目标 `.v6/tests/am.sqlite` 查询）：modules 7、apis 98、messages 8、publishers 13、subscriptions 17、test_cases 139。
- edges（同库查询）：`access_edges` 共 42 行，按 classification 计 registered 41、test_only 1（X05 DEV dockview 接缝）、debt 0。
- 夹具复核：PDF `be12aa25…e41ab`、MD 母本 `d86508f6…e3b764`、审阅 gz 解压后 `c998da7a…e3e19`，三者均与登记值逐字节一致（收尾后独立重算）。

第一轮的源码审查结论（hmac 鉴权、PUT 校验、静态路径守卫、章节文件名与 manifest allowlist、媒体下载器单 CDN allowlist、唯一 DEV 接缝 `window.__v6cm6`、50 行中央总线、labs/cm-html 隔离）经本轮抽查复核仍然成立，业务字节与前两轮逐字节相同（diff 为 0）。

### 6.2 审计层代码

见 §5.2。本轮未新增审计层代码文件（changed_paths=58 的增长全部来自审计报告与证据文件的累积；业务目录 diff 为 0）。

---

## 7. 本轮新发现

- **R3-F1（git 协议层故障，信息级）**：本 VM 上 `git ls-remote` 多次一致失败（curl 56），而 HTTPS 与 GitHub 连接器正常。远端 HEAD 改走连接器核验；audit.sh 不调用 ls-remote，结论不受影响。建议后续审计员优先用连接器核验远端状态。
- **R3-F2（远端 HEAD 在执行期间推进，信息级）**：Grok Bot 第三轮报告于审计收尾启动前推入（69104ed）。两份独立报告同分支共存是既定模式（第一、二轮相同）；本报告的上推基底取推送时远端 HEAD，路径 `audit-reports/META_MUSE_INDEPENDENT_AUDIT_994ce3c.md` 与 Grok 路径不冲突（推送前经 `get_file_contents` 核对目标路径状态）。
- **R3-F3（单轮绿色不证明重开故障根除，口径级）**：AUDIT.md WP1 章节已有此警告；本报告记录一个 `AUDIT_RELOAD_OK` 完整样本与原始日志，不做根除断言；Run G 未能提供第二样本。
- **R3-F4（Run G 套件 9 WebKit 浏览器关闭事件，环境级）**：Chrome 段全过、WebKit 段在屏障等待处因浏览器关闭而中止（§2 定性），无产品断言失败；其后套件全部通过，说明这是孤立事件而非系统性故障。Linux WebKit 进程稳定性仍是本环境下已知的非产品风险（与第一轮 F3 的平台行为、第二轮 Grok 的重开超时同属"浏览器/平台层不确定性"一类），建议后续审计员在报告中继续单列此类事件，不并入产品 FAIL。
- **R3-F5（沙箱 EPERM 第二次复发，基础设施级）**：第一次 16:18–约 20:39（已恢复），第二次于 Run G 第 23 套件开始后复发并导致收尾停止重试。两次均为"仅写文件"故障（读、计算、连接器均正常），与被审计产品无关；根因未查明，记为未验证。

---

## 8. 未验证 / 范围外

- 生产 HTTPS 下的授权保存路径（与前两轮相同）。
- macOS 行为：本轮仅 Linux x86_64；Mac 结论以主线与 Grok 的 Mac 证据为准，不在本报告断言内。
- Grok Bot 第三轮报告（69104ed）的文件内容：未逐项复核，不纳入本报告结论。
- 冻结测试全文：两条公开修订（§5.1）之外的测试文本与冻结原文一致（audit.sh 白名单保证），但认证口径仍绑定修订契约 994ce3c。
- 背靠背复现：Run G 未完成，第二样本缺失；"双运行复现"记为未完成。
- 套件 9 WebKit 关闭事件的根因：浏览器进程关闭的具体触发点未隔离（§7 R3-F4）。
- F5 冻结 tag：本轮未复核（§4）。
- 沙箱 EPERM 两次故障的根因：平台侧触发机制未查明；与被审计产品无关。

---

## 9. 提交与证据

| 项目 | 值 |
| --- | --- |
| 本报告（目标内，gitignored） | 目标 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`（28479 字节） |
| 本报告副本 | `~/workspace/your_files/OCR2MD_V6_独立审计报告_第三轮_MUSE_LINUX_2026-10-24.md`（与目标内文件逐字节一致） |
| GitHub 提交 | 分支 `audit-fixture-5c7497c`，路径 `audit-reports/META_MUSE_INDEPENDENT_AUDIT_994ce3c.md`，推送基底（推送前远端 HEAD）`69104edd2fd7d170710e2effc590d6a7a34a2991`；新提交 SHA 见同步记录与主聊天交付；推送后回读逐字节一致 |
| 同步记录 | `~/workspace/audit-ocr2md.muse-github-snapshot-sync.json` 已追加一条 |
| 运行日志 | `audit-r3-expA-blocked.log`、`audit-r3-runB-2026-10-24.log`、`audit-r3-runF-2026-10-24.log`、`audit-r3-runG-2026-10-24.log`；RUN_EVIDENCE 快照 `audit-r3-runF-RUN_EVIDENCE.json`（Run G 的 RUN_EVIDENCE 截断为 0 字节，无快照价值，主日志为准） |

---

## 附录：逐条契约结果说明

逐条 139 条契约的 TC 级明细以 RUN_EVIDENCE 为准：Run F 快照 `audit-r3-runF-RUN_EVIDENCE.json` 的 `am_cases` 139 条全部 `status=PASS`，与 §3.1 的逐套件表一一对应（套件契约数之和 2+16+1+3+7+5+5+5+5+8+1+2+3+2+15+4+4+1+15+1+4+6+7+1+4+6+6=139）；Run G 的 139 条中 110 条 PASS、5 条位于 FAIL 套件、24 条无结果（§3.2），不另附逐条表——未完成的运行不产生逐条认证。本附录不替代 RUN_EVIDENCE 原始文件；如需逐条复核，请以快照文件为准。
