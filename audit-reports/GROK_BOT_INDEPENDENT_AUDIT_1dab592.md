# OCR2MD V6 独立跨平台 AM/Git 审计报告（Grok Bot 审计）

- 审计员：**Grok Bot**（独立第三方，Linux）
- 审计时间：2026-10-24 14:33–14:52（Asia/Shanghai）；RUN_EVIDENCE `date_utc` 2026-10-24T06:49:20Z = 14:49 Asia/Shanghai
- **冻结业务源码 SHA：`5c7497cdf94ea35217e83effd9496a045625fef0`**（业务实现、API/AM 注册表）
- **审计包 / 测试契约 SHA：`1dab5924abaed31c5711f1580710bae26936885d`**（AM 运行与证据绑定此 SHA）
- 获取方式：匿名 HTTPS `git clone --single-branch --branch audit-fixture-5c7497c`；`git ls-remote` 远端 HEAD = `1dab5924…`，与本地一致，无需另行 checkout。主线 `main` 远端为 `d4c1930`，本次未触碰。
- 环境：Linux x86_64，Node v22.23.4（box 默认 Node 20.19.2 被 `AUDIT_NODE_UNSUPPORTED` 拒绝，见下），Python 3.13.5，Playwright 1.64.1（Chromium + WebKit，lockfile 版本）

## 1. 总体结论：**不通过（未取得全表认证）**

| 项目 | 结果 |
|---|---|
| 测试脚本 | **26/27 PASS**，1 FAIL（`tests/promoted-chapters-browser.test.mjs`） |
| AM 契约 | **132/139 PASS**，7 FAIL（TC-G04, TC-G05, TC-G10, TC-L09, TC-L14, TC-L15, TC-L16），0 BLOCKED/SKIP |
| `AM_FULL_TABLE_PASS` / `AM_FULL_TABLE_CERTIFIED` | **未出现**。runner 在套件失败后以 `AM_ERROR` 退出，**`am.py certify` 未执行 → 认证 FAIL/未取得** |
| AM build / check / references / coverage | PASS（7 模块、98 API、8 消息、13 发布者、17 订阅、139 契约链接；test_am 7/7 OK） |
| `git fsck --full`（审计 worktree，本人手动执行） | PASS（exit 0，无输出）。runner 自身的 fsck 步骤因提前退出**未执行** |
| 冻结源码白名单检查 | PASS（`AUDIT_FROZEN_BUSINESS_SOURCE_VERIFIED changed_paths=18`，相对 5c7497c 只改审计资料 + 1 个测试文件） |
| PDF SHA-256 | PASS `be12aa25…2e41ab`（测试前后一致） |
| Markdown / MinerU JSON 夹具哈希（tests/k/data.json） | PASS |
| 测试后工作树 | 干净（clone 与 worktree `git status --porcelain` 均为空；产物仅在 Git 忽略路径） |
| 浏览器证据截图 | `.v6/evidence/` 50 个文件 |

按 AUDIT.md 规则，仅 `AM_FULL_TABLE_PASS`+`AM_FULL_TABLE_CERTIFIED` 才能称全表通过；本次**两者均无**，故**不得**报告为全量认证。

## 2. 两个 SHA 的区分

- 相对 5c7497c 的业务实现、API/AM 表、其余测试字节不变（脚本白名单校验通过，我另行 `git diff --stat d887aea..1dab592` 复核）。
- 唯一测试契约修订：`tests/scroll-sync-browser.test.mjs:116-121`，`reverse.source.sourceLine > sourceResult.source.sourceLine+30` 改为 `> 600+30`。**这是断言放宽**（从相对实测锚点改为相对请求行），本次 scroll-sync 4/4 PASS **是在修订契约下取得的，不等于原 5c7497c 测试通过**。原断言在 Linux 下本次未单独复跑 → 未验证。
- 审计包 d887aea→1dab592 新增 Linux 适配（运行期注入，不改测试文件）：sips→Chromium JPEG 转换 shim、WebKit 127.0.0.1 非 Secure Cookie 适配器（**不能替代 HTTPS 生产授权验收**）、WebKit 初始化屏障、等待诊断、禁用 core dump、端口预检、Node ≥22.13 门槛。这些是测试环境层的改变，结论须附带这一前提。

## 3. 失败项明细

**F1 `tests/promoted-chapters-browser.test.mjs:119`** — `page.reload({waitUntil:'domcontentloaded'})` 在 WebKit 下 `TimeoutError 30000ms`（已 navigated to `http://127.0.0.1:4512/` 但 DOMContentLoaded 未触发）。Chrome 段导出、重开、再导出全部 PASS；WebKit 段导出 PASS 后，在重开步骤超时。关联 7 条契约 TC-G04/G05/G10/L09/L14/L15/L16 全部记 FAIL（套件级粒度，非逐条断言失败）。
- 判断：**疑似 Linux-WebKit 环境性**（Chrome 同流程通过；该文件使用 Linux WebKit loopback Cookie 适配器与初始化屏障），**但未单独复跑确认，也不能排除 reload 期间未保存提示/服务端阻塞等真实缺陷** → 标“环境性：未确认”。
- 复现：`cd target && node tests/promoted-chapters-browser.test.mjs`（需 audit.sh 设置的 NODE_OPTIONS/V6_PDF_PATH 环境）。
- 建议：单独循环复跑 N 次统计稳定性；在 reload 前后采集 WebKit 控制台/网络日志；比较 Mac WebKit 行为。

**B0（BLOCKED，已解除）** box 默认 Node 20.19.2 → `AUDIT_NODE_UNSUPPORTED`（日志 `audit-sh-node20-blocked.log`）。我在 `/workspace/tools/` 安装官方 Node v22.23.4 后重新执行一次 audit.sh，产生本报告结果。

## 4. 与上一轮（d887aea）对比

| | d887aea（Grok 上轮） | 1dab592（本轮） |
|---|---|---|
| 脚本 | 21/27 | **26/27** |
| 契约 | 87/139 | **132/139** |
| certify | FAIL | **未执行（因套件失败）→ 未认证** |
| sips | 19 条失败 | 由 Chromium shim 解决（smoke PASS），媒体套件 PASS |
| 浏览器超时 | 4 个套件 | 1 个（promoted-chapters WebKit reload） |
| scroll-sync | 断言失败 | PASS（**依赖放宽后的测试契约**） |

## 5. 独立架构检查（5c7497c 源码）

已完成：
1. **access_edges 逐条对照**：用 schema.sql+registry.sql 建内存库，42 条边（41 registered、1 test_only、0 debt）的 `source_needle` 在对应文件中**全部存在**。
2. **注册模块间实际 import 图**：7 个注册模块文件（C cm-document、G outline-grid、M markdown-preview、P pdf-preview、L workspace、A media-module、T latex-module）之间相对 import 共 5 处，**全部有对应模块对的已登记边**，未发现未登记的模块间直接导入。
3. **未登记依赖（发现）**：`ui/` 共 27 个 JS，**20 个不属任何 AM 模块**，但被注册模块导入：如 `ui/view-store.js` 被 T/A/G/P/L 五个模块共享（共享状态通道却不在注册表）、`ui/enum-checkbox-filter.js`（T/A/G）、`ui/mineru-anchors.js`（C/P）、`ui/scroll-sync.js`（L）、`ui/chapter-files.js`、`ui/chapter-markers.js`、`ui/outline-index.js`（G）等。`ui/main.js`（编排层）亦非模块。AM 的“0 debt”只覆盖 7 个文件，**不能作为全仓无越界证明**。建议把共享 helper（尤其 view-store）登记为模块或明确声明为共享库并为其写边。
4. **DEV 全局对象**：`ui/main.js:489` `if (import.meta.env.DEV) window.__v6cm6 = {...}`，注释称 “Read-only test seam”，但暴露 `save`、`exportChapters`、`setScrollSyncEnabled`（有副作用）及 `view/cm/dockview/pdf` 原始句柄。仅 DEV 构建有效（生产构建被 tree-shake，未核验 dist 中是否残留 → 未验证）。登记为 X05 test_only 边。建议改名/注释与实际一致，或拆分只读与写入接口。
5. **硬编码路径 / 跨平台**：
   - `vite.config.mjs:17` 默认 PDF 为 macOS iCloud 路径（`Library/Mobile Documents/iCloud~md~obsidian/...`），Linux 依赖 `V6_PDF_PATH` 才能工作；`scripts/v6_serve.py:203` 注释提及 iCloud vault。
   - **25+ 测试文件**写死 `executablePath:'/Applications/Google Chrome.app/...'`（如 `tests/auto-refresh-browser.test.mjs:8`、`tests/cm6-browser.test.mjs:27`、`tests/am/contracts-browser.test.mjs:18`、`labs/cm-html/*.test.mjs`），Linux 仅靠审计包 preload 改写才能运行。
   - `tests/media-browser.test.mjs:40` 调用 macOS `sips`（另上轮记录 `tests/media-paste-browser.test.mjs:16`），Linux 依赖 shim。
   - 结论：**冻结源码与测试本身不具备跨平台可移植性**；Linux 26/27 结果依赖审计包注入层。
6. **am.py 缺 PDF 行为**：`tests/am/am.py:53-57` `require_clean_fixtures_and_sources()` 对 mineruJson/sourceMarkdownFixture/pdf 任一缺失或哈希不符即抛 `ValueError` 拒绝认证（fail-closed，合理但使无 PDF 的第三方无法做任何部分认证）。
7. **仓库 Public / PDF 公开**：AUDIT.md 自述仓库与原始 PDF 均公开（PDF 已在 Git 历史中，`.v6/workspace/buffetts-alpha.original.pdf`）。若该 PDF 有版权/授权限制，属**持续风险**，转私有不能清除已被克隆的副本。

未验证：labs/ 与 scripts/ 的 Python/Node 调用关系与 API 边界；动态 `import()`/DOM 事件/全局变量形式的隐式耦合（只做了静态相对 import 与 needle 检查）；生产 dist 中 `__v6cm6` 是否被剔除；Mac/iPad 实机视觉（Linux 渲染为异平台）；原始（未修订）scroll-sync 断言在 Linux 的结果。

## 6. 剩余风险
- 全表未认证，certify 与 runner 内 fsck 均未执行。
- Linux 通过依赖审计包注入 shim/适配器，生产 HTTPS 授权、真实 sips、真实 Chrome 路径未经验证。
- 一条测试契约已放宽，主线若采纳须走正常验收。
- AM 注册表只覆盖 27 个 UI 文件中的 7 个。
- 仓库/PDF 公开。

## 7. 证据（`/workspace/grok-evidence-1dab592/`）
- `RUN_EVIDENCE.json`（139 条逐条状态）、`run.log`、`audit-sh-console.log`（完整 audit.sh 输出）、`audit-sh-node20-blocked.log`
- `am-logs/`：27 份套件日志（失败：`am-full-20261024T063411Z-1dab5924-23-promoted-chapters-browser.test.log`）
- `git-fsck-full.txt`、`git-status-after.txt`、`sha256-after.txt`、`playwright-install.log`
- box 原始位置：clone `/workspace/ocr2md-audit/clone-1dab592`，worktree `/workspace/ocr2md-audit/target-1dab592`（因默认兄弟目录 `ocr2md-v6-audit-target` 已被上轮旧 SHA 占用，用 `OCR2MD_AUDIT_TARGET_DIR` 指定新目录），截图 `target-1dab592/.v6/evidence/`

本审计未修改任何跟踪文件，未 commit、未 push、未改动 V6 主线。
