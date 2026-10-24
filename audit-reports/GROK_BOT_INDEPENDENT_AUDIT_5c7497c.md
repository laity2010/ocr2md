# OCR2MD V6 · Grok Bot 独立审计报告（5c7497c）

**审计员：Grok Bot（第三方独立审计）** · 时间：2026-10-24 11:58（Asia/Shanghai，UTC+8）
**总体结论：FAIL（Linux 环境）—— 自动化全量未复现 27/27、139/139；仅 21/27 脚本、87/139 契约 PASS；certify 未通过。架构审查发现若干平台耦合问题。**

## 1. 固定对象与环境
| 项 | 值 |
|---|---|
| 审计包分支 | audit-fixture-5c7497c |
| 审计包 SHA（远端 ls-remote = 本地 clone） | d887aea697fa602c8bc993272db52daf4e1be729 ✅ 一致 |
| 被审计源码 SHA | 5c7497cdf94ea35217e83effd9496a045625fef0（detached worktree） |
| clone 方式 | 匿名 HTTPS，--single-branch，clone 后工作树干净 ✅ |
| OS | Linux（Debian 13 容器，box），x86_64 |
| Node / Python / Playwright | v20.19.2 / 3.13.5 / 1.64.1（与 package-lock 一致）；Chromium、WebKit 由 audit.sh 安装，系统依赖先行 install-deps |
| 执行入口 | `bash audit.sh`（按 AUDIT.md），仅执行一次 |

## 2. 自动化结果
| 验收项 | 结果 |
|---|---|
| 冻结源码 worktree 自动建立 | PASS |
| PDF SHA-256 be12aa25…41ab | PASS |
| Markdown 母本 SHA d86508f6…b764（=data.json 登记值） | PASS（测试后） |
| npm ci + MinerU 转换器构建 | PASS |
| 测试脚本 | **21/27 PASS，6 FAIL** |
| AM 契约 | **87/139 PASS，52 FAIL**（RUN_EVIDENCE.json） |
| AM certify | **FAIL**：AM_CERTIFY_FAIL: no complete PASS |
| git fsck --full | PASS（无输出，exit 0） |
| 测试后源码工作树 | 干净（git status 0 行） |

### 失败脚本（日志：.v6/tests/am-full-20261024T033425Z-5c7497cd-NN-*.log）
| # | 脚本 | 契约数 | 原因 |
|---|---|---|---|
|02|tests/am/contracts-browser.test.mjs|16|page.waitForFunction 超时 80s（:30）|
|15|tests/media-browser.test.mjs|15|`spawnSync sips ENOENT`（:40 调用 macOS 专有 sips）|
|16|tests/media-paste-browser.test.mjs|4|`spawnSync sips ENOENT`（:16）|
|22|tests/preview-split-browser.test.mjs|6|waitForFunction 超时 80s（:30）|
|23|tests/promoted-chapters-browser.test.mjs|7|Chrome 导出/重开通过后，:99 waitForFunction 超时 15s|
|25|tests/scroll-sync-browser.test.mjs|4|Chrome 通过；后续断言 `reverse.source.sourceLine>sourceResult.source.sourceLine+30` 失败（渲染/度量差异）|

结论：Mac 上声称的 27/27、139/139 **在 Linux 上未复现**。15/16 是确定性平台依赖（非业务缺陷但违反“Mac/Linux 均可运行”的承诺）；02/22/23/25 为超时或布局度量差异，需判断是环境性能/字体差异还是脆弱测试，本轮未定性（未验证）。

## 3. 独立源码架构检查（5c7497c）
1. **macOS 专有工具依赖**：tests/media-browser.test.mjs:40、tests/media-paste-browser.test.mjs:16 调用 `sips`。复现：Linux 运行 audit.sh。建议：改用 sharp/ImageMagick 或预生成 JPEG 夹具。
2. **硬编码 Mac 路径**：tests/media-adoption-syntax.test.mjs:29 硬编码 `/Users/daisor/Library/Caches/ms-playwright/webkit-2359/pw_run.sh`（已确认）；另有 `/Applications/Google Chrome.app` 硬编码出现在 46 个被跟踪文件中（如 tests/am/contracts-browser.test.mjs:18、tests/ag-header-browser.test.mjs:13、tests/auto-refresh-browser.test.mjs:8、scripts/v6_ipad_chrome.mjs:21、labs/cm-html/*）。审计包通过 preload/环境变量绕过，但源码本身不可移植。建议统一读取 OCR2MD_AUDIT_CHROME_PATH/WEBKIT_PATH 或用 Playwright 默认路径。PROJECT_INIT.md 也含 /Users/daisor 路径（信息泄露低风险）。
3. **DEV 全局对象**：ui/main.js:489 `if (import.meta.env.DEV) window.__v6cm6 = {view, cm, exportChapters, save, dirty, dockview}`（已确认）。注释称“只读测试接缝”，但暴露 save/exportChapters 为可写副作用 API，绕过 AM 登记的模块边界。生产构建由 Vite 常量剔除（未对 dist 做验证）。建议：仅暴露只读 getter，写操作经登记 API；在 AM 中登记为测试接缝。
4. **am.py 缺 PDF 整体拒绝**：tests/am/am.py:53-57 `require_clean_fixtures_and_sources` 对 mineruJson/sourceMarkdownFixture/pdf 任一缺失即抛错，PDF 不在 Git（data.json 中 storage: host-readonly-not-portable-fixture-yet）导致源码分支独立无法建库/认证，依赖审计包注入。建议：PDF 缺失时把依赖 PDF 的契约标 BLOCKED，其余继续。
5. **审计包 preload 改写测试输入**：audit-fixture-preload.mjs 对 2 个测试替换母本/发布快照（已在 RUN_EVIDENCE 登记，测试后母本哈希复原 ✅）。透明，但意味着这两项测试在冻结源码下本身不自足。
6. **access_edges 对照/未登记依赖**：本轮仅抽查上述点，**未完成**全仓 import 图与 registry.sql access_edges 的逐条对照 —— 标 **未验证**。

## 4. 风险
- 仓库 Public 且原始 PDF（.v6/workspace/buffetts-alpha.original.pdf）公开跟踪：版权/数据泄露风险；PROJECT_INIT.md、测试暴露本机用户名路径。
- 139 是契约关联数，非独立单测；通过也不等于架构无越界。
- Linux 渲染为异平台，不代表 Mac/iPad 视觉验收。

## 5. 证据路径（box）
- 运行日志：/workspace/ocr2md-audit/logs/audit-1133.log；目标内 .v6/audit-reports/run.log、RUN_EVIDENCE.json
- 27 份分脚本日志：/workspace/ocr2md-audit/ocr2md-v6-audit-target/.v6/tests/am-full-20261024T033425Z-*
- 审计包 clone：/workspace/ocr2md-audit/clone-202610241133

## 6. 结论分层
- 自动化复现（Linux）：**FAIL**（21/27，87/139，certify FAIL；fsck、哈希、干净工作树 PASS）。
- 第三方架构审查：**部分完成**（上述 6 项），access_edges 全量对照未验证。
