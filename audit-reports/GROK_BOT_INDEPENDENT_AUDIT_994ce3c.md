# OCR2MD V6 · Grok Bot 独立 Linux AM/Git 审计报告（994ce3c）

- 审计员：**Grok Bot**（独立第三方，Linux）
- 时间：2026-10-24 16:13–16:27（Asia/Shanghai，UTC+8）
- **冻结业务源码 SHA**：`5c7497cdf94ea35217e83effd9496a045625fef0`
- **审计包 / 测试契约 SHA**：`994ce3ce41f4ab3d5407f2ddd67f76f76415a3cb`（远端分支 `audit-fixture-5c7497c` HEAD，匿名 clone 时即为此 SHA，无需 detached 切换）
- 环境：Debian GNU/Linux 13 (trixie)，x86_64，内核 6.12.94；Node v22.23.4（仓库外 `/workspace/tools/`），Python 3.13.5，Playwright 1.64.1（chromium_headless_shell-1248、webkit-2370）
- 执行：`OCR2MD_AUDIT_TARGET_DIR=<新目录> bash audit.sh`，**正式运行仅一次**，退出码 0。

## 结论摘要

| 项目 | 结果 |
| --- | --- |
| 测试脚本 | **27/27 PASS** |
| AM 契约 | **139/139 PASS** |
| `AM_FULL_TABLE_PASS` / `AM_FULL_TABLE_CERTIFIED` | **均已输出**（certify 通过） |
| `AUDIT_AUTOMATED_PASS` | 是 |
| `git fsck --full`（审计 worktree，手动复跑） | PASS（无输出，exit 0） |
| 测试后工作树 | 干净（bundle clone 与 target worktree `git status --porcelain` 均为空） |
| PDF SHA-256 | `be12aa25…2e41ab`，与 `fixtures.SHA256SUMS` 一致 |
| Markdown SHA-256 | `buffetts-alpha.minerujson.md` = `d86508f6…e3b764`，与上轮一致 |

这是 Linux 上**单次运行**取得的审计分支 994ce3c 测试契约下的全表认证。按 AUDIT.md 要求，单次 Linux 全绿不能证明 reload 故障已经根治。另外，该结果依赖审计包的 Linux 适配（sips 替代、WebKit loopback Cookie 适配、WebKit 初始化屏障、LaTeX KaTeX 等待），**不等同于**冻结 5c7497c 原始测试全文在 Linux 上通过，也**不等于**模块边界审查完成。

## 两个 SHA 的区分

`git diff 5c7497c..994ce3c` 去掉审计资料（audit*、AUDIT.md、audit-reports）后，只剩：`.v6/workspace/buffetts-alpha.original.pdf`（夹具）、`.v6/grok-handoff/fixtures.SHA256SUMS`、`README.md`（+2 行）、`tests/am/GROK_AUDIT.md`、`tests/latex-browser.test.mjs`（+6）、`tests/scroll-sync-browser.test.mjs`（+5/−1）。业务实现、API 和 AM 登记表与 5c7497c 相同。

1dab592→994ce3c 改了这些：`AUDIT.md`、`audit.sh`、新增 `audit-port-preflight.py`、新增 `audit-browser-preflight.mjs`、`audit-linux-diagnostics.mjs`（reload 取证）、`audit-loopback-cookie.mjs`，`tests/latex-browser.test.mjs` 加了一次 KaTeX 渲染等待（新的测试契约修订），再加上历史审计报告。没有业务源码改动。

## 四项重点

### 1. Linux WebKit 章节重开是否仍超时：**PASS（本次未超时；只有单次样本）**
`23-promoted-chapters-browser` 7/7 PASS。日志里有 `AUDIT_RELOAD_OK Chrome` 和 `AUDIT_RELOAD_OK WebKit`，WebKit 导航→domcontentloaded→load 都完成了（同时记录到若干图片 404 / request-failed，不影响断言）。上轮 1dab592 在 `:119` 处 30s 超时，这次没有出现。根因没有单独确认：可能是新的 WebKit 初始化屏障起了作用，也可能是偶发问题这次没出现。我没有重复跑多次。证据：`am-logs/*-23-promoted-chapters-browser.test.log`。

### 2. 端口 TIME_WAIT 是否不再误阻塞：**PASS（附一个限定条件）**
- 正式运行：`AUDIT_PORT_PREFLIGHT_SELFTEST_PASS live_listener=blocked closed_server=reusable`、`AUDIT_TEST_PORT_PREFLIGHT_PASS ports=45`。
- 运行结束后 `ss -tan` 显示 32 条 TIME-WAIT（其中有测试端口，比如 6081）。这时我在 target 里再跑一次 `audit-port-preflight.py`，结果仍是 `PASS ports=45`，rc=0，说明没有误阻塞。
- 读代码：`can_listen` 先设 `SO_REUSEADDR`，再 `bind`+`listen` 到 127.0.0.1，没有用 SO_REUSEPORT，所以还在监听的端口会被拒绝。
- 我在临时副本里做了最小复现（`repro/`，让服务端先关闭，从而制造服务端口的 TIME_WAIT）：
  - 正在监听的端口：返回 False（正确阻塞）
  - 原监听 socket 设了 SO_REUSEADDR 时的 TIME_WAIT：返回 True（放行）
  - Node http 服务（libuv 默认设 SO_REUSEADDR）关闭后的 TIME_WAIT：返回 True
  - **限定条件**：如果原监听 socket **没有**设 SO_REUSEADDR，Linux 内核仍会拒绝 bind，这时预检返回 False，会误报 BUSY。这种情况在实际测试服务（Node/libuv、Python `HTTPServer` 的 `allow_reuse_address=True`）中通常碰不到，属于低风险，但脚本注释写的“允许所有 TIME_WAIT”不完全准确。

### 3. 缺浏览器动态库能否报 BLOCKED：**PASS（模拟验证）**
我没有动系统库。做法是把 Playwright 浏览器缓存复制到 `/tmp/blk/pw`，在**副本**里把 `webkit-2370/minibrowser-wpe/lib/libWPEWebKit-2.0.so.1` 改名，然后用 `PLAYWRIGHT_BROWSERS_PATH=/tmp/blk/pw env -u NODE_OPTIONS node audit-browser-preflight.mjs` 只跑预检。输出：Chromium PASS；WebKit 报 `error while loading shared libraries: libWPEWebKit-2.0.so.1` → `AUDIT_BROWSER_RUNTIME_BLOCKED`，exit=2。读代码确认：`audit.sh` 开了 `set -euo pipefail`，第 145 行 `node … | tee` 失败时会走 `fail` 并输出 `AUDIT_BLOCKED: browser runtime unavailable…`、exit 2，不会进入 139 条测试。完整的 `audit.sh` 包装层没有在缺库环境里端到端跑过，这一层只做了静态判断。缺的是系统级库（比如 libnss3）的情形没有测试，按代码看走的是同一路径。证据：`repro/blocked.out`。

### 4. 全量认证：**PASS**
数据见摘要。证据：`audit-sh-994ce3c.log`（含 `AM_FULL_RESULT passed_cases=139/139 failed_suites=0`、`AM_FULL_TABLE_CERTIFIED 139/139 … source_tests_unchanged=True`）、`RUN_EVIDENCE.json`（runner_exit_code=0）、27 份 `am-logs/`、`git-fsck-full.txt`、`git-status-after.txt`、`sha256-after.txt`。

## 与上轮（1dab592）对比

| | 1dab592 | 994ce3c |
| --- | --- | --- |
| 脚本 | 26/27 | 27/27 |
| 契约 | 132/139 | 139/139 |
| certify | 未执行（运行器中止） | CERTIFIED |
| promoted-chapters WebKit reload | 30s 超时 | AUDIT_RELOAD_OK |

## 上轮残留问题复核（静态，没有变化）
- `vite.config.mjs:17` 仍然写死 macOS iCloud PDF 路径（审计包用 `V6_PDF_PATH` 绕开）；tests 目录下仍有写死 `/Users/` 的文件。
- `ui/main.js` 仍然暴露 `window.__v6cm6`，带写操作的方法。
- 上轮指出的 AM 模块登记不全（27 个 ui/*.js 只登记了 7 个，`view-store.js` 等没登记）：这次业务源码和 AM 表都没变，所以这个问题依然存在。本轮没有重做逐条 `access_edges` 和 import 图对照，标为**未重新验证**。
- 仓库和原始 PDF 仍然 Public。
- Linux 结果属于异平台，不能替代 Mac/iPad 的实机视觉验收；本地 HTTP 的 Cookie 适配不能证明生产环境 HTTPS 授权没问题。

## 未验证项
- reload 稳定性：没有多次重复运行。
- 缺系统级动态库时的端到端 `audit.sh` BLOCKED 流程。
- 模块/API 边界的完整独立复审（沿用上轮结论，未重做）。
