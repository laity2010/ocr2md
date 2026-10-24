# OCR2MD V6 主线独立 Linux AM/Git 审计报告 — Grok Bot

- 审计员：**Grok Bot**（独立审计，只读，未修改任何跟踪文件）
- 审计时间：2026-10-24 19:22–20:10（Asia/Shanghai, UTC+8）
- 仓库：https://github.com/laity2010/ocr2md.git，分支 `build/2026-10-20`
- **被审计 SHA：`38ea47d3782387d842098e77a586f1d8f3db0d8a`**（detached checkout；审计时远端分支 HEAD 也恰为此 SHA。结论只绑定该 SHA，不适用于后续提交）

## 总结论：**FAIL（未取得全量认证）**

官方入口 `bash tests/am/run-grok-audit.sh 38ea47d…` 唯一一次正式运行结果：**26/27 套件通过，135/139 契约通过**，`tests/pdf-click-only-browser.test.mjs` 在 240 秒无任何输出后被 AM 运行器超时判为 ERROR，脚本在 `run-all` 处 `set -e` 退出，**`certify` 未执行，未输出 `AM_FULL_TABLE_CERTIFIED` / `AM_AUDIT_CERTIFIED`**。
这不是 AUDIT_BLOCKED：系统依赖齐全，端口预检、Chromium/WebKit 启动预检均 PASS，失败发生在真实测试执行中。单独复现该套件 7 次全部通过（约 36 秒/次），故判断为**间歇性挂起（flaky）**，但按规则不得以复现 PASS 替代正式结果。

## 1. 环境

| 项 | 值 |
|---|---|
| 发行版 | Debian GNU/Linux 13 (trixie)，debian_version 13.7 |
| 架构 / 内核 | x86_64 / 6.12.94+ |
| Git | 2.47.3 |
| Node / npm | v22.23.4（/workspace/tools，仓库外）/ 10.9.9 |
| Python | 3.13.5 |
| Playwright | 1.64.1（与 package-lock 一致）；`npx playwright@1.64.1 install --with-deps chromium webkit` 于仓库外执行，系统包均已最新，无新增安装 |
| 审计 clone | /workspace/ocr2md-audit/main-38ea47d（匿名 HTTPS clone） |
| 隔离工作树 | /workspace/ocr2md-audit/ocr2md-am-38ea47d3-isolated（由入口脚本 `git worktree add --detach` 创建） |

PDF 样本：主线不含 `.v6/`，从旧审计分支 `audit-fixture-5c7497c`（fetch 时 tip `69104ed`）用 `git show` 导出（未 checkout/merge），`chmod a-w`，SHA-256 = `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` ✅。MD 夹具 SHA-256 `d86508f6…b764` ✅。

## 2. 验收项结果

| # | 验收项 | 结果 |
|---|---|---|
| 1 | Chromium、WebKit 真实运行 | **PASS** — `AUDIT_BROWSER_PREFLIGHT_PASS Chromium/WebKit`；24/27 套件日志含 WebKit 执行输出 |
| 2 | 27/27 测试套件 | **FAIL** — 26/27；#21 `pdf-click-only-browser` 超时 ERROR |
| 3 | 139/139 契约 + AM_FULL_TABLE_CERTIFIED | **FAIL** — 135/139（`AM_FULL_RESULT passed_cases=135/139 failed_suites=1`）；certify 未运行 |
| 4 | WP2 27 个 UI 文件归属与跨模块访问 | **PASS（静态范围内）** — 见 §3 |
| 5 | 9 项故意越界负向测试 | **PASS** — 9/9 OK；注意其中 1 项为 baseline，实际负向用例为 8 项；另发现 3 类静态检查盲区（§4） |
| 6 | Git 完整性 / SHA 未变 | **PASS** — 见 §5 |
| 7a | WebKit 章节重开 | **PASS（单次）** — 套件 23 `AUDIT_RELOAD_OK Chrome` / `AUDIT_RELOAD_OK WebKit`，7 契约通过 |
| 7b | LaTeX 渲染 | **PASS（单次）** — 套件 10 `LATEX_BROWSER_PASS Chrome/WebKit`，8 契约 |
| 7c | 媒体粘贴 | **PASS（单次，依赖 Linux sips 适配）** — 套件 15 (15 契约)、16 `MEDIA_PASTE_PASS Chrome/WebKit` |

运行器前置步骤：端口预检自测/45 端口 PASS；`AUDIT_LINUX_SIPS_SMOKE_PASS`；`npm run build` 成功；`python3 -m unittest`（16 tests）OK；`am.py check/coverage/edges debt` 通过，`AM_UI_BOUNDARY_PASS files=27 shared=4 cross_imports=14`。

## 3. WP2 UI 文件归属与跨模块访问（独立核对）

`ui/*.js` 共 27 个，`ownership.json` 恰好 27 条，无遗漏/多余：

- C(CMD)：cm-document.js, cmd-annotations.js
- G(AG/章节)：chapter-files.js, chapter-markers.js, outline-grid.js, outline-index.js
- M(MD 预览)：markdown-preview.js, obsidian-images.js
- P(PDF)：pdf-preview.js
- L(Layout)：scroll-sync.js, workspace.js
- A(Media)：media-module.js
- T(LaTeX)：latex-inline-candidates.js, latex-inline-preview.js, latex-module.js, latex-review-markers.js, latex-scan.js
- shell：fontcheck.js, main.js, mineru-comment-folding.js, obsidian-heading-markers.js, obsidian-markdown.js, outline-focus.js
- shared：enum-checkbox-filter.js, ios-native-selection.js, mineru-anchors.js, view-store.js

我独立编写的 import 图（`import-graph.py`）得到 31 条跨归属导入：14 条模块/shell→模块（与脚本 `cross_imports=14` 一致）+ 17 条→shared。shared 消费者与 `sharedConsumers` 完全一致；导入符号与 `crossModuleBindings` 一致。

与 `access_edges` 对照：42 条（41 registered + 1 test_only，debt=0），42 个 source_needle 全部在源码中找到。每一对导入模块对都有至少一条 edge；但以下 3 个导入符号没有专属 edge（模块对已由其他 edge 覆盖）：`workspace.js→PdfPreview`（L→P 构造）、`main.js→createWorkspace`、`main.js→CMDocument`。建议补登或注明。

## 4. 负向测试与额外探针

`tests/am/test_boundaries.py` 9/9 OK（审计内与 /tmp 独立副本中均通过）：baseline、新跨模块导入、未批准 shared 消费者、计算型动态导入、新的直写 store、缺失 edge 登记、已知模块对下隐藏新符号、错误归属、缺失导入目标。

/tmp 副本额外探针（不触碰审计工作区）——**能拦截**：`export * from` 重导出、字面量 `await import()`、副作用 `import "./x.js"`、C 模块消费 view-store、新 setState 字段、字符串拼接动态导入（BLOCKED）。
**未拦截（静态检查盲区）**：
1. 绝对路径导入 `import {x} from "/latex-module.js"`；
2. 函数式 `viewStore.setState(s=>({activePanel:1}))`（在 scroll-sync.js 中新增直写未报）；
3. 经全局对象访问 `window.__v6cm6.cm.replaceRanges([])`。
README 已声明运行时耦合不在范围内，但 1、2 属于静态可检测范围，建议修正。

## 5. Git 完整性

- 审计前后两个工作树：HEAD `38ea47d…`、tree `b6d8b36d…`、`ui` `302850c6…`、`tests` `4e8f80bc…`、`packages` `2c77e6e0…` 完全一致；`git status --porcelain` 均为空。
- 入口脚本因提前退出未执行其 `git fsck`；我手动在审计 clone 执行 `git fsck --full`：退出码 0、无输出。
- 未执行任何 commit/push/rebase/reset/clean。

## 6. 失败日志与复现

- 正式日志：`suite-logs/…-21-pdf-click-only-browser.test.log` 仅含 `AM_TIMEOUT_240_SECONDS`（24 字节），测试无任何 stdout。
- **保留现场发现**：超时后遗留孤儿进程 `python3 scripts/v6_serve.py`（PID 140133，`V6_PORT=4710`，`V6_DOCUMENT_PATH=…/pdf-click-only-chrome-140119.md`），持续监听 127.0.0.1:4710 约 26 分钟（`orphan-server-evidence.txt`）。说明挂起发生在 **Chrome 段**，且 `am.py` 超时只杀 node、未杀其子进程组。
- 复现：在隔离工作树以相同 NODE_OPTIONS/环境变量运行 `node tests/pdf-click-only-browser.test.mjs`。run1–4 均 PASS，但期间孤儿服务器仍占用 4710，Chrome 段可能连到旧服务器，**这 4 次的 Chrome 结果不可作数**；kill 孤儿后 run5–7 均 PASS（约 37 秒，Chrome/WebKit 均 `PDF_CLICK_ONLY_PASS`），端口释放正常。
- 根因未定位；候选：页面加载/`waitForFunction` 外的某一步无超时挂起（如 launch 或 route 拦截），需要在测试中加分步日志。

## 7. 平台兼容与历史遗留

- `window.__v6cm6`（ui/main.js:489）仍存在，仅 `import.meta.env.DEV` 下暴露，但含 `cm`、`save`、`exportChapters`、`setScrollSyncEnabled` 等可写入口；生产构建不暴露。
- `vite.config.mjs:16-17` 仍以 `homedir()/Library/Mobile Documents/iCloud~md~obsidian/…` 作为 PDF 默认路径（Linux 依赖 `V6_PDF_PATH`）。
- 38 个 tests 文件写死 `/Applications/Google Chrome.app` 与 `~/Library/Caches/ms-playwright/webkit-2359`，另有 scripts/v6_serve.py、scripts/v6_ipad_chrome.mjs、scripts/migrate-latex-review.mjs、labs/cm-html/* 含 Mac 路径；Linux 依赖 `audit-browser-preload.mjs` 改写。
- `sips` 仍直接调用于 tests/media-browser.test.mjs:40 与 tests/media-paste-browser.test.mjs:16；Linux 依靠 `audit-sips-compat.mjs`（Chromium 转 JPEG）适配，非原生 sips。
- WebKit 本地 HTTP 授权依靠 `audit-loopback-cookie.mjs` 适配，非生产 HTTPS 验证。

## 8. 问题与建议修正范围

1. **[阻断认证] pdf-click-only 套件间歇挂起**：给该测试各步加超时与阶段日志；`am.py` 超时时以进程组 kill（含 v6_serve 子进程），并在套件间校验端口释放。范围：tests/pdf-click-only-browser.test.mjs、tests/am/am.py（测试层，不涉及业务）。
2. 边界检查盲区（绝对路径导入、函数式 setState）：tests/am/audit_boundaries.py + 相应负向用例。
3. 补登 3 个无专属 edge 的导入符号（需用户批准后改 AM 登记）。
4. 长期：测试浏览器路径和 sips 改为参数化，vite.config 去除 Mac 默认路径。

## 9. 剩余风险

- 其余 26 套件为单次通过，未做重复性统计；flaky 可能不止一个套件。
- 静态边界检查不覆盖运行时事件、DOM 与全局对象耦合。
- 仓库与 PDF 的公开性本轮未复核。

## 10. 证据

`grok-evidence-38ea47d/`：`run-38ea47d.log`（正式运行全量输出）、`suite-logs/`（27 份套件日志）、`browser-preflight.log`、`playwright-install.log`、`repro-21-run1..7.log`、`orphan-server-evidence.txt`、`pre-hashes.txt`/`post-hashes.txt`、`fsck-full.log`、`import-graph.py` 与输出、`playwright-install-with-deps.tail.log`。不含 PDF 与任何凭据。

## 11. 报告分支与提交

- 分支：`audit-grok-mainline-38ea47d`
- 提交：见该分支上本报告所在的最新提交（38ea47d 之上的单个报告提交）
