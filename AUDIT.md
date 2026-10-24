# OCR2MD V6 · 第三方独立 AM/Git 审计入口

**此分支是公开的审计交付包，不是 V6 正式开发分支。**

| 对象 | 固定值 |
| --- | --- |
| GitHub | `https://github.com/laity2010/ocr2md.git` |
| 审计包分支 | `audit-fixture-5c7497c` |
| **冻结业务源码提交** | `5c7497cdf94ea35217e83effd9496a045625fef0` |
| **AM 使用的测试契约** | 审计分支 HEAD（仅 `tests/scroll-sync-browser.test.mjs` 与 `tests/latex-browser.test.mjs` 有公开记录的测试契约修订） |
| PDF SHA-256 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |

审计包后续可以修订测试契约，**不允许把审计包 HEAD 当成被冻结的 V6 业务源码 HEAD**。脚本首先验证相对冻结 SHA 的差异仅限审计资料与两条显式记录的测试契约，然后在兄弟目录建立**审计分支 HEAD 的干净 detached worktree**，令 AM 运行/认证绑定这份可核验的测试契约版本；报告分别记录业务源码 SHA 与测试 SHA。主线不改、不合并。

## 从零开始

在 **macOS（标准基准环境）** 或已安装 Playwright Chromium/WebKit 系统依赖的 Linux 上，准备 Git、**Node.js ≥22.13**/npm、Python 3。Node 20 虽能尝试安装依赖，但不满足本审计包 PDF.js 等依赖的引擎要求，因此入口会直接返回 `AUDIT_NODE_UNSUPPORTED`。然后：

```bash
git clone --single-branch --branch audit-fixture-5c7497c \
  https://github.com/laity2010/ocr2md.git ocr2md-audit-bundle
cd ocr2md-audit-bundle
bash audit.sh
```

Linux 测试进程会禁用超大 ELF core dump 文件，避免浏览器子进程退出产生数 GB 未跟踪数据；异常退出码、测试错误与截图仍照常收集。

Linux 首次准备系统库时执行一次 `npx playwright install-deps chromium webkit`（按系统权限可能需要 sudo），或者在拥有 root 权限的隔离容器中用 `OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1 bash audit.sh` 自动安装。默认不擅自更改第三方机器的系统库；若缺失，脚本给出明确 `AUDIT_BLOCKED`。

不需要 GitHub 写权限、Grok 凭据、AgentDock、用户 Mac 原始工作目录或其他私有文件。审计包的 PDF 在 `.v6/workspace/buffetts-alpha.original.pdf`，哈希参见 `.v6/grok-handoff/fixtures.SHA256SUMS`。**当前 GitHub 仓库和 PDF 均为 Public；不可视作私有数据通道。**

脚本执行：

1. 检查 Git 当前是审计包分支、工作区干净、冻结业务源码确实是该分支的祖先；启动前检查全部已登记测试的固定端口未被旧服务占用（忙则 `AUDIT_TEST_PORT_BUSY`，不自动杀进程）；
2. 比对相对冻结业务源码 SHA 的变更白名单，确认所有业务实现、API/AM 表与原始证据仍不变；创建/复用兄弟目录 `../ocr2md-v6-audit-target`，detached checkout 到**当前审计包 SHA**，只在其中运行经明示更新的测试契约；
3. 校验 JSON/Markdown、PDF 哈希，拒绝改写 PDF，并统一设置 `V6_PDF_PATH` 为隔离夹具的绝对路径，避免冻结的 Vite 默认为开发者的 iCloud 路径而在 Linux 返回 `/api/pdf` 404；
4. 对 Web 工作台和独立 `packages/minerujson-md` 转换器分别执行锁文件安装与构建，并安装匹配 lockfile 的 Playwright Chromium/WebKit，在 Mac/Linux 使用真实可执行文件（不依赖用户机器的绝对浏览器路径）；
5. 对历史 start-only UI 测试单独使用 Git 跟踪的压缩审阅夹具（14 条章节标定），结束立即恢复原始零标定样本；对历史章节发布测试单独在忽略目录放置由本次 dist 构建生成的完整 release 快照；冻结测试断言和受审源码均不改变，两项前置夹具在 JSON 证据中显式登记；
6. 在冻结业务源码与审计版测试契约共存的**干净审计 worktree** 执行 `tests/am/run-grok-audit.sh`：AM build/check/coverage/edges、全部已登记测试、certify 和 Git fsck；
7. Linux 环境为仍使用 macOS `sips` 的两项冻结媒体测试提供基于 Chromium 的真实 PNG→JPEG 转换，按 `AUDIT_LINUX_SIPS_SHIM` 日志登记；不修改原测试或跳过断言；遇到 Linux 80s 等页面等待失败时，自动将页面状态/脚本名/JS 错误写入 `AUDIT_LINUX_WAIT_DIAG`，不改变超时阈值；
8. 仅 Linux WebKit 的本地 `http://127.0.0.1` 测试解锁响应，保留服务端验证码和权限校验，在验证解锁成功后让 WebKit 的本地 Cookie Jar 接收非 Secure 的同一有效 Cookie；对两项 Python 服务测试等待真实的初始化/授权探测结束；此适配**不能替代 HTTPS 生产授权的验收**，日志标记 `AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER`；
9. 生成 `.v6/audit-reports/RUN_EVIDENCE.json` 和 `run.log`，失败也保留证据。

## WP2 · AM 全仓文件归属及共享库审计（独立分支）

在 `audit/wp2-boundary-20261024` 独立工作区内，设置
`OCR2MD_AUDIT_EXPECTED_BRANCH=audit/wp2-boundary-20261024` 后执行同一 `bash audit.sh`。
新检查器 `audit-am-boundaries.py` 会核对全部 `ui/*.js` 文件归属、所有静态/字面量动态 JS 导入、跨模块 AM 访问边与具名导出符号，以及共享库消费和直接 Zustand 写入的登记。`audit-am-boundaries-test.py` 提供故意触发边界违规的负向用例；均通过后继续原有 27 脚本/139 契约。完整分类、遗留审阅项和静态覆盖限制记录在 `audit-reports/WP2_AM_BOUNDARY_BASELINE.md`。

WP2 扫描检查的只是可静态识别的调用入口，并不替代人工审查 DOM 消息、对象属性 API 和运行时耦合；不得因新增检查器 PASS 就宣称已取得全仓动态边界证明。此分支不修改冻结业务源码与正式 AM 表。

## WP1 跨平台环境收口（审计包独立修订）

本项不改变冻结业务源码 `5c7497c`、AM 登记表、生产 Cookie、原章节保存/发布断言。

- **端口**：`audit-port-preflight.py` 在扫描 127.0.0.1 固定测试端口前执行真实监听自测；用 `SO_REUSEADDR` 后的 `bind`+`listen` 拒绝仍在监听的服务，允许可安全复用的 TIME_WAIT，**不设置 SO_REUSEPORT**、不关闭其他进程。实测 `AUDIT_TEST_PORT_PREFLIGHT_PASS` 才继续；仍被占用的端口保持 `AUDIT_TEST_PORT_BUSY`、退出 2。
- **浏览器依赖**：浏览器安装后、139 条测试运行前，用 `audit-browser-preflight.mjs` 真正启动 Chromium/WebKit 并打开 `about:blank`。即使浏览器文件已缓存，缺少 Linux 动态库或无法启动仍会打印 `AUDIT_BROWSER_RUNTIME_BLOCKED` 并退出；`audit.sh` 归类为环境 `AUDIT_BLOCKED`，而不是制造大面积业务 FAIL。该检查不通过测试垫片启动，避免被注入层伪造成功。
- **WebKit 初始化屏障**：Mac/Linux 的 LaTeX 与章节测试，在初次导航后等待真实 CM6 编辑器和授权探测完成，避免异步权限响应覆盖模块状态；该屏障只等真实应用状态，绝不修改授权或业务断言。Linux 的 loopback Cookie 适配仍严格限于本地 HTTP Linux 环境。
- **重开超时取证**：仅 Linux 的 `promoted-chapters-browser.test.mjs` 由 `audit-linux-diagnostics.mjs` 在原生 `page.reload` 前后记录导航、DOMContentLoaded、HTTP 错误、失败请求、有限的页面状态（无凭据）；失败原样抛出。**不重试、不增加超时、不跳过原断言**。对照 Grok 的 `page.reload` 等待失败与 Muse 完整通过的证据，直到可以确认根因。
- **LaTeX 异步渲染测试修订**：新增一次有限时 `waitForFunction`，在读取 AG 可见单元格快照前等待至少十个真的 KaTeX DOM 元素渲染完成。原断言仍然要求 `>=10`、49 项统计与全部筛选结果；原 25 秒等待预算不放宽。此修改由 WP1 Mac 全量（原状态栏等待偶发超时）及独立 WebKit（状态成功但可见 KaTeX 尚未就绪）复现推动；不得声称冻结原测试未修改。
- **兼容既有测试**：`V6_PDF_PATH` 隔离、macOS `sips`→Linux Chromium JPEG、Linux loopback WebKit cookie 适配沿用原先已审核做法；Linux 本地 HTTP 的 Cookie 适配不证明生产 HTTPS 验收。

复跑时执行同一 `bash audit.sh`。审计员应分别报告环境 BLOCKED、测试 FAIL、以及 `AM_FULL_TABLE_CERTIFIED`；要比较 reload 失败，提供 `AUDIT_RELOAD_OK`/`AUDIT_RELOAD_FAIL` 与原始日志，不应仅凭单次 Linux 全绿声称故障已根治。 Mac 目标环境仍单独执行真实 Chrome/WebKit 验收，Linux 视觉表现不能替代 iPad 实机截图验收。

**测试契约修订说明（2026-10-24）**：`tests/scroll-sync-browser.test.mjs` 原本使用 `reverse.source.sourceLine > sourceResult.source.sourceLine + 30`，这比较两个不同浏览器生成的像素滚动位置。审计版保留预览驱动、双窗行号对齐、反馈循环、同步开关、编辑与 resize 等全部检查，只把该项改为 `reverse.source.sourceLine > 600 + 30`（相对于该测试明确请求的源码行 600，确认进入后续段落）。修改在审计分支 Git diff 中可见，绝不声称它是原始 `5c7497c` 测试全文未变。后续若解冻主线接纳该断言，必须由正常代码验收与 Git 流程实施。

仅 `AM_FULL_TABLE_PASS` 加 `AM_FULL_TABLE_CERTIFIED` 才能称**审计分支该 SHA 下的**已登记契约全表通过。139 是**契约关联数**，不是 139 个互不相关的黄金单测；脚本通过也**不等于**模块边界已独立审完。

如需复跑，在原目录再次执行 `bash audit.sh`；仅在目标 SHA 与工作区状态仍安全时复用 worktree，不删除既有内容或强行清理。

Linux 推荐在具有匹配 Playwright 浏览器及系统库的容器中运行（版本来自 package-lock）；Linux 的渲染结果必须标注为**异平台**，不得假称经过 Mac/iPad 实机视觉验收。缺少系统库/网络/浏览器时保留日志并报告 BLOCKED，不能跳过某些脚本后宣称 PASS。

## 给第三方 AI 的审计任务

你是独立审计员。**先读本文件、`AGENTS.md`、`README.md`、`tests/am/README.md`。**

运行上述冷启动命令；核对 `RUN_EVIDENCE.json`、每一份 `.v6/tests/am-full-*.log`、`am.py certify`、`git fsck`。然后**独立检查源码**：查找实际跨模块导入、直接读写、非登记 API、模块职责越界与 Git 历史风险。AM `edges debt` 仅返回**已登记**债务，不是全仓无越界证明。

把你**自己**的报告写入审计 detached worktree `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`。至少包括：

- 固定业务源码 SHA、审计包/测试契约 SHA，操作系统/架构、Node/Python/Playwright/浏览器版本、PDF/JSON/Markdown 校验；
- 每个运行脚本的实际结果，139 条登记契约的 PASS/FAIL/BLOCKED/SKIP/NOT VERIFIED，日志的相对路径；`certify` 和 `git fsck` 的结论；
- 对 AM/API/跨模块调用的**独立源码检查**，发现的问题附文件行号、可复现步骤和建议；未发现也说明检查范围；
- 结论明确区分测试通过与架构审计完成，保留环境差异和未检查范围。

严禁写回或推送 GPT 主线、审计包、原始 PDF，也不得读取/上传别人的凭据。审计结果通过聊天附件或用户另行授权的报告渠道提交；只读 Git 凭据不授予 GitHub Issue 写权限。

审计分支内部分历史说明（包括 `tests/am/GROK_AUDIT.md`）曾要求额外传递 PDF、SSH 访问；对**本审计分支**以当前 `AUDIT.md` 为唯一交接入口，对**业务源码**以固定 SHA 对应内容为准。历史文本不应覆盖更新后的事实。
