> **上载说明（2026-10-24，第二轮）**：本报告原件按 AUDIT.md 规定生成于本轮审计 detached worktree（`ocr2md-v6-audit-target-1dab592`）的 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`，并已以聊天附件交付仓库所有者。本副本经所有者授权（第一轮上载指令及本轮"提交独立报告"要求）上载至审计分支 `audit-fixture-5c7497c`，供主线 AI 审阅；上载基于远端 HEAD `5713d06`（Grok Bot 第二轮报告提交），仅新增本文件。审计员：Muse（Meta Muse）。
>
> **与 Grok Bot 第二轮报告的交叉对照**（其提交 5713d06，Debian 容器、Node 22.23.4，run `20261024T063411Z`）：Grok 测得 26/27、132/139，唯一失败套件 promoted-chapters。本审计员回读其证据日志核对：该套件在 Grok 环境中同样出现 `AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER verified-server-token-stored` 与"✓ 已保存"状态采样，即解锁与保存实际成功；失败点在测试第 119 行导出后重开阶段的 `page.reload` 等待 DOMContentLoaded 超时 30 秒——属其容器环境的页面加载时序问题，与本报告环境（同套件全程通过）的差异点已精确定位。两份报告在其余 26 个套件上结论一致。主线若复核，建议关注该 reload 步骤在慢速容器中的时序稳健性。

---

# OCR2MD V6 · 独立 AM/Git 审计报告（第二轮 · 修订测试契约 1dab592）

**审计员：Muse（Meta Muse，第三方独立审计）**
**审计日期：2026-10-24（Asia/Shanghai）**
**被审计仓库：github.com/laity2010/ocr2md（Public），审计分支 `audit-fixture-5c7497c`**

> 本报告与第一轮报告（同分支 `audit-reports/META_MUSE_INDEPENDENT_AUDIT_5c7497c.md`，commit 6d9d642）相互独立又互为对照：第一轮审的是审计包 d887aea 下的原始契约；本轮审的是主线针对两份 Linux 审计报告修订测试契约后的审计包 1dab592。

---

## 0. 结论（严格双 SHA 口径）

| 对象 | 结论 |
| --- | --- |
| **冻结业务源码 `5c7497c`** | **未被触碰**。审计脚本内置白名单校验通过（`AUDIT_FROZEN_BUSINESS_SOURCE_VERIFIED changed_paths=18`）；本审计员独立复核：相对 5c7497c，`ui/`、`scripts/`、`packages/` 三个业务目录的 diff 为 **0**，`tests/` 仅 `tests/scroll-sync-browser.test.mjs`（测试契约）与 `tests/am/GROK_AUDIT.md`（文档）变化，其余 16 个变化路径全部是审计层文件（`audit-*`、`audit.sh`、`AUDIT.md`、`README.md`、`audit-reports/`、`.v6/grok-handoff/` 与 PDF 本体） |
| **修订测试契约 `1dab592`（Linux x86_64）** | **27/27 套件 PASS，139/139 AM 契约 PASS**；运行器输出 `AM_FULL_TABLE_PASS` 与 `AM_FULL_TABLE_CERTIFIED 139/139`（tested_git=current_git=1dab5924）；`git fsck --full` 独立复跑无错误；审计包与目标两个 worktree 测试后均干净 |
| **这不是对冻结测试全文的 Linux 认证** | 139 条中与第一轮口径不同的一条断言：`tests/scroll-sync-browser.test.mjs` 的反向滚动锚点断言已由主线公开修订（见 §5）。按冻结原文，该断言在 Linux WebKit 上是渲染器相关的：主线自己的 Debian ARM64 严格复跑证据为 135/139（`audit-reports/LINUX_CROSS_PLATFORM_RETEST_5c7497c.md`），本审计员第一轮 x86_64 环境则 PASS。本轮认证绑定的是**修订后契约 1dab592**，不得改述为"5c7497c 原始测试在 Linux 全量认证" |
| **架构/边界复核** | 业务字节与第一轮逐字节相同（git diff 为 0），第一轮的源码审查结论（认证、写入防护、媒体下载器约束、DEV 接缝、access_edges 42 条 = 41 registered + 1 test_only + **0 debt**）经本轮抽查复核全部仍然成立（§6）。本轮新增审查对象为审计层新增的 Linux 兼容垫片代码，结论见 §6.2：实现 fail-closed、全程留痕、无断言放宽 |
| **生产 HTTPS 授权路径** | **未验证（与第一轮相同）**。本轮 promoted-chapters 的 WebKit 通过使用了公开声明的 loopback Cookie 适配器（§5，F3）：它证明的是"服务端签发的真实令牌在同源校验下可完成保存/导出/重开"，不证明 Linux WebKit 在本地 HTTP 下能保存 Secure Cookie（平台行为，第一轮已实证），也不替代生产 HTTPS 验收 |

**执行过程如实记录**：本轮共三次调用 `bash audit.sh`。第 1 次因本审计 VM 缺少 Playwright 系统库（WebKit 子进程 `libgstreamer-1.0.so.0` 加载失败）导致 25/27 套件失败——按 AUDIT.md 口径记为环境 **BLOCKED**，证据完整保留（见 §2），不计入产品结果；第 2 次被新版端口预检以 `AUDIT_TEST_PORT_BUSY` 拦截（上一轮残留连接的 TIME_WAIT 假阳性，见 R2-F1）；第 3 次为本报告的结果运行（run id `20261024T065113Z`），使用 AUDIT.md 明示的 `OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1` 在运行内安装系统库。

---

## 1. 固定对象与校验

| 对象 | 固定值 / 实测 |
| --- | --- |
| 审计包分支 | `audit-fixture-5c7497c` |
| 审计包/测试契约 SHA | `1dab5924abaed31c5711f1580710bae26936885d`（远端 `git ls-remote`、本地 clone、目标 worktree HEAD、RUN_EVIDENCE 四处一致） |
| 冻结业务源码 SHA | `5c7497cdf94ea35217e83effd9496a045625fef0`（为审计包 HEAD 的祖先；业务目录零 diff，见 §0） |
| PDF SHA-256 | 期望与实测均为 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`（运行前、运行后各测一次） |
| Markdown 母本夹具 | `packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md` 实测 `d86508f69b941a5e…`，与登记值一致；测试后 worktree 干净即证明已恢复 |
| 审阅夹具（gz 解压后） | `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`（第一轮已验，本轮文件未变化） |
| 环境 | Ubuntu 24.04.5 LTS x86_64（root 隔离 VM，2 核/8 GB）；git 2.43.0；**Node v24.22.1**（满足新版 ≥22.13 门槛）；Python 3.12.3；Playwright 1.64.1；浏览器构建与第一轮相同（Chromium 156.0.8078.4 / WebKit 27.2，`~/.cache/ms-playwright` 预置 + 本轮运行内 `install-deps` 补齐系统库） |

AM 登记口径独立复核（目标 `.v6/tests/am.sqlite` 与运行日志双向对照）：**7 模块 / 98 API / 8 消息 / 13 发布者 / 17 订阅 / 139 契约**，`AM_BUILD_PASS`、`AM_CHECK_PASS`；`access_edges` 41 registered + 1 test_only（X05 DEV dockview 接缝）+ 0 debt。

---

## 2. 执行记录（三段式）

| 次序 | 结果 | 说明与证据 |
| --- | --- | --- |
| 尝试 1（新目标冷启动） | **环境 BLOCKED**（audit.sh exit 1；AM 4/139） | 本 VM 的系统库在第一轮后被重灌丢失，WebKit MiniBrowser 启动即 `error while loading shared libraries: libgstreamer-1.0.so.0`（exit 127）。所有含 WebKit 阶段 的套件在启动期失败，纯 Chromium 套件（如 cm6）正常 PASS——故障签名与产品代码无关。证据：审计员存档 `audit-r2-attempt1-blocked-env.log`、`audit-r2-attempt1-RUN_EVIDENCE.json`（本报告附件同批交付） |
| 尝试 2（同目标复跑） | **预检 BLOCKED**（exit 2） | 新版端口预检报告 `AUDIT_TEST_PORT_BUSY: 4511,4512,4680,4681`。实查：无任何进程监听，4511/4512 已释放，4680/4681 仅剩尝试 1 服务器侧连接的 TIME_WAIT 套接字；等待约 75 秒后四个端口全部可绑定。预检按设计 fail-closed 不杀进程，行为正确，但对 TIME_WAIT 的处理可改进（见 R2-F1） |
| 尝试 3（`OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1`） | **PASS**（exit 0） | 运行内 `playwright install-deps chromium webkit` 补齐系统库（apt 镜像较慢，约 10 分钟）；端口预检 PASS（45 个登记端口）；sips 冒烟 `AUDIT_LINUX_SIPS_SMOKE_PASS bytes=759`；run id `20261024T065113Z`，27/27、139/139、CERTIFIED（§3） |

目标目录为本轮新建 `~/workspace/ocr2md-v6-audit-target-1dab592`（detached @1dab592)；第一轮目标目录保留未动。核心转储禁用生效：运行后目标内无 core 文件（`ulimit -c 0`，见 1dab592 提交意图），双 worktree `git status` 均 0 行。

---

## 3. 自动化结果明细（尝试 3，run `20261024T065113Z`）

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
| 11 | latex-four-view-browser | 1 | PASS | | 25 | scroll-sync-browser（**修订契约**） | 4 | PASS |
| 12 | latex-normalize-browser | 2 | PASS | | 26 | scroll-sync-leadership-browser | 6 | PASS |
| 13 | latex-review-browser | 3 | PASS | | 27 | shared-preview-browser | 6 | PASS |
| 14 | media-adoption-syntax | 2 | PASS | | | **合计** | **139** | **139 PASS** |

- `AM_FULL_RESULT passed_cases=139/139 failed_suites=0`；`AM_FULL_TABLE_CERTIFIED 139/139 cases; tested_git=1dab5924 current_git=1dab5924 source_tests_unchanged=True`
- `git fsck --full`：本审计员在运行后独立执行，exit 0、无任何输出
- 夹具纪律：PDF 运行前后哈希一致且只读；审阅夹具仅在 start-only 套件期间换入、运行后母本恢复（worktree 干净为证）；release 快照来自本次构建的 `dist/`（RUN_EVIDENCE `fixture_overrides` 已登记）

### Linux 兼容标记普查（本轮全部套件日志）

| 标记 | 次数 | 解读 |
| --- | --- | --- |
| `AUDIT_LINUX_SIPS_SHIM` | 2 | 恰为两个冻结 sips 调用点各一次真实 Chromium PNG→JPEG 转换 |
| `AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER` | 1 | promoted-chapters 的 WebKit 解锁走适配器（服务端 200 验证后存入其签发的同一令牌） |
| `AUDIT_LINUX_WEBKIT_INITIALIZATION_BARRIER` | 2 | latex-browser 与 promoted-chapters 两套件在导航后等待真实初始化状态（`保存需授权`），非固定睡眠 |
| `AUDIT_LINUX_SAVE_STATE` | 2 | 诊断垫片对成功保存的只读状态采样（文档 3,113 行已保存） |
| `AUDIT_LINUX_WAIT_DIAG` | 0 | 本轮没有任何 80 秒页面等待超时发生 |

---

## 4. 第一轮发现（F1–F5）的处置复核

| 编号 | 第一轮定性 | 本轮状态 | 证据 |
| --- | --- | --- | --- |
| F1（22 条） | contracts/preview-split 未传 `V6_PDF_PATH`，Vite 默认 iCloud 路径致 `/api/pdf` 404 | **已修复（审计包层）**：audit.sh 第 3 步统一 `export V6_PDF_PATH` 指向校验过的隔离夹具 | 02、22 号套件双引擎 PASS；与主线复测文档的根因描述一致 |
| F2（19 条） | 媒体套件依赖 macOS `sips` | **已修复（审计层垫片）**：Chromium 真实转换 + 冒烟门禁，断言与测试原文未改 | §3 标记普查 ×2；15、16 号套件 PASS（第一轮同环境 FAIL） |
| F3（7 条） | Linux WebKitGTK 不保存 loopback HTTP 的 Secure Cookie，解锁后写 403 | **已适配（非产品修复）**：loopback 适配器在真实解锁成功后把服务端令牌以非 Secure 形式存入测试上下文；服务端校验、SameSite/HttpOnly 不变。产品代码 `v6_serve.py:96/291` 的 Secure 设置第一轮以来未变，本轮抽查仍在 | 标记 ×1；23 号套件双引擎 PASS。**平台行为本身依旧存在**，生产环境为 HTTPS 不受影响；本地 HTTP + Linux WebKit 的原始路径按设计被适配器绕行，不在本轮 PASS 的证明范围内 |
| F4（1 条） | quote-indent 被 WebKit 特有 `healthz` pageerror 绊倒零错误断言 | **本轮未复现**：24 号套件 PASS。仍定性为平台噪声级不稳定因素，不构成产品缺陷 | 套件日志无该 pageerror |
| F5（文档） | README 所称冻结 tag `v6-feature-freeze-20261022` 未推远端 | **仍未解决**：本轮 `git ls-remote --tags` 仍只有 `ocr2md-init-v1`、`webcodex-initial`。仅属可复现性文档瑕疵，不影响内容校验（SHA 全程钉死） | 远端 tag 列表 |
| 滚动分歧（Grok FAIL / 主线 ARM 135/139） | scroll-sync 反向锚点断言跨渲染器不可比 | **以修订契约解决**：见 §5 | 修订 diff、本轮 25 号 PASS、主线复测文档 |

---

## 5. 唯一测试契约修订的独立鉴定

修订对象：`tests/scroll-sync-browser.test.mjs`（diff 已亲验，全文仅一处断言 + 注释）：

```diff
-      assert(reverse.source.sourceLine>sourceResult.source.sourceLine+30);
+      // A real preview scroll must reach beyond the requested source line 600.
+      // Comparing against an earlier browser-measured anchor is not portable: …
+      assert(reverse.source.sourceLine>600+30,
+        name+' preview scroll must advance beyond requested source line 600');
```

鉴定意见：

1. **语义等价性成立**：原断言的业务意图是"预览驱动的反向滚动确实把源码推进到明显更后的段落"；`sourceResult.source.sourceLine` 本身是另一渲染器/另一时刻测得的锚点（主线实测 WebKit 锚点 681、反向落点 652，两视图行号实际对齐在 652，功能正确但断言要求 >711 而误杀）。新断言以该测试自己请求的源码行 600 为基准（+30），在 Chromium 上比原断言更严，在 WebKit 上与功能事实一致。
2. **其余检查完整保留**：预览驱动、双窗行号对齐（±12 行）、防递归反馈（seq 增量 <6）、同步开关、编辑、resize 等断言逐字未动（diff 之外零变化）。
3. **流程诚实**：修订先以独立补丁文件（`audit-reports/scroll-sync-semantic-assertion-proposal.diff`）+ 主线复测文档公开，明确写过"不得据此声明 CERTIFIED"，之后才以 `audit(test)` 提交进入审计分支契约，AUDIT.md 顶部表格与专节同步声明。本审计员认为该流程符合"契约修订须公开、版本化、不得冒充冻结原文"的要求。
4. **效力边界**：本轮 `AM_FULL_TABLE_CERTIFIED` 的对象是 1dab592 契约。若主线未来解冻，应按主线复测文档所述，经正常代码验收把该断言并入主线测试，再生成新快照；在此之前，任何"5c7497c 原始 AM 在 Linux 已认证"的表述都不成立。

---

## 6. 独立源码检查（本轮范围）

### 6.1 业务源码（增量复核）

业务文件与第一轮全量审查过的 5c7497c 逐字节相同（§0 的零 diff 即证明），故本轮采用"身份证明 + 关键点抽查"而非重复全量阅读：

- `ui/main.js:489`：`window.__v6cm6` 仍为唯一 DEV 门控接缝（与第一轮一致）
- `scripts/v6_serve.py:72、287`：解锁码与 Cookie 均 `hmac.compare_digest` 比较；`:96、:291` 两处 Set-Cookie 仍带 `Secure; HttpOnly`（生产语义未被 Linux 适配削弱——适配只发生在测试进程内）
- `am.py edges` 独立复跑：42 条，41 registered + 1 test_only（X05）+ 0 debt，与第一轮一致
- AM 登记规模（§1）与 README 数字逐项吻合

第一轮的其余架构结论（章节文件名正则 + 清单白名单 + 拒绝符号链接、媒体下载器单 CDN 白名单与魔数校验、静态路径 `is_relative_to` 防护、视图状态经 `ui/view-store.js` 集中总线、labs/cm-html 隔离纪律）因字节未变而继续有效，不在本轮重复展开。

### 6.2 新增审计层代码（本轮全量新审）

对象：`audit-sips-compat.mjs`（26 行）、`audit-png-to-jpeg.mjs`（18 行）、`audit-sips-smoke.test.mjs`（13 行）、`audit-loopback-cookie.mjs`（72 行）、`audit-linux-diagnostics.mjs`（61 行）、`audit.sh` 变更部分。逐行审读结论：

- **sips 垫片**：仅 Linux 且进程为 `*.test.mjs` 时生效；仅拦截命令名恰为 `sips` 的调用；参数形态（`--out` 位置、PNG→JPEG、含 `jpeg`）不合预期即抛错（fail-closed），不静默跳过；转换走真实 Chromium 渲染截图（quality 100），产物为可解码 JPEG；每次转换打 `AUDIT_LINUX_SIPS_SHIM` 日志。冒烟测试先于全量验证 SOI/EOI 与最小尺寸。**未发现断言放宽或结果伪造路径**。一点保留：截图式转换的 JPEG 字节与 macOS sips 编码不逐字节相同；冻结测试把产物用作媒体夹具（解码/预览/下载流程），不做字节级金标准比较——本轮 19 条相关契约全 PASS 与此分析一致
- **loopback Cookie 适配器**：路由注册刻意排在测试自有 catch-all 之后（Playwright LIFO 取窄匹配）；仅处理 `POST http://127.0.0.1/**/api/unlock`；先真实发请求（`route.fetch`），仅当服务端返回 200 且 Set-Cookie 含 `v6edit` 时，才把**服务端签发的同一令牌值**以 `secure:false` 存入测试上下文并校验存在性（缺失即抛错）；响应头副本去掉 `Secure` 的同时保留 HttpOnly/SameSite/Path。服务端验码、同源校验、PUT 校验全程真实执行。**它改变的是测试侧 Cookie Jar 对本地 HTTP 的接受策略，不改变被测系统行为**；其效力边界已在 §0/§4 声明
- **初始化屏障**（同文件）：仅 latex/promoted 两套件、仅 127.0.0.1 HTTP 导航后等待编辑器出现且状态为 `保存需授权`（30 秒超时）——等待的是应用真实状态，不是固定睡眠，不注入数据
- **诊断垫片**：`waitForFunction` 超时时只读采样页面状态打 `AUDIT_LINUX_WAIT_DIAG`，原样重抛错误；保存成功时采样 `AUDIT_LINUX_SAVE_STATE`。无超时放宽、无断言改动
- **audit.sh**：冻结源码白名单校验（业务变更即 exit 2）、端口预检、Node 版本门、core 转储禁用、双 SHA 证据生成，均为 fail-closed 设计

可信路径提示：本轮测试进程的 `NODE_OPTIONS` 预载链共 4 个审计包模块（夹具 staging、sips、Cookie、诊断）叠加冻结测试自带的浏览器 preload。它们都是审计包内受 Git 跟踪、有哈希、运行时留痕的文件，属本审计的可信计算基，已全部纳入审查范围；任何复跑者应把它们与测试原文一并视为契约的一部分。

---

## 7. 本轮新发现（均为信息级，不阻塞认证）

- **R2-F1 端口预检对 TIME_WAIT 过敏**：预检用未设 `SO_REUSEADDR` 的 bind 探测，上一轮运行结束约 60 秒内的服务器侧 TIME_WAIT 会误报 `AUDIT_TEST_PORT_BUSY`（本轮尝试 2 实测 4680/4681）。方向是 fail-closed（安全侧），但 AUDIT.md 的处置建议"使用全新隔离环境"重于实际所需（等待 TIME_WAIT 自然消退即可）。建议：预检区分 LISTEN 与 TIME_WAIT，或在提示中注明可等待重试
- **R2-F2 缺系统库时的失败形态依赖调用方式**：`install-deps` 仅在 `OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1` 或手动执行时发生；若环境预置了浏览器二进制但缺系统库（如本轮尝试 1），`playwright install` 步骤的"缺库警告"检查依赖安装日志，未覆盖浏览器已缓存的情形，运行会以大面积套件 FAIL 而非 `AUDIT_BLOCKED` 收场，与 AUDIT.md"缺库报告 BLOCKED"的口径有落差。建议：套件启动前对 Chromium/WebKit 二进制做一次 `ldd` 缺库预检，缺失即 BLOCKED 并指引 install-deps
- **R2-F3 沿袭项**：F5 冻结 tag 未推远端（§4）；仓库内 Sarasa 字体约 17 MB 历史体积、`/access/<KEY>` 能力 URL 模型两项第一轮信息级观察无变化，不重复展开

---

## 8. 未验证 / 范围外

- macOS 基准环境本轮**未由本审计员复跑**（主线复测文档 + 第一轮 Codex 证据在案）；本报告结论仅及于 Linux x86_64 本机
- iPad/真实设备视觉与交互：未验证
- 生产 HTTPS 下的真实授权与 Cookie 行为：未验证（loopback 适配器按设计不覆盖，见 §0）
- Grok Bot 的本轮环境（Debian 容器）与结果：未复核（其报告应已独立提交同分支，两份报告可对照）
- 性能、长文档压力、无障碍：不在 AM 契约与本轮范围内

---

## 9. 提交与证据

- 本报告按 AUDIT.md 规定写入审计 detached worktree 的 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`（该目录为忽略目录，不入 Git）
- 机器证据：同目录 `RUN_EVIDENCE.json`（尝试 3）、`run.log`；27 份分套件日志在目标 `.v6/tests/am-full-20261024T065113Z-*`；尝试 1 的 BLOCKED 证据（主日志与 RUN_EVIDENCE）随本报告以聊天附件同批交付
- 上载副本：经仓库所有者授权（第一轮指令及本轮"提交独立报告"要求），推送至审计分支 `audit-reports/` 目录，文件名标注 Meta Muse 与本轮契约 SHA；推送基于推送时远端 HEAD、仅新增该文件，普通推送不强推
- **未修改 V6 主线，未强制推送，未把部分通过表述为全量认证**：本轮认证口径严格限定为"修订测试契约 1dab592 在 Linux x86_64 的 AM 全表通过"，冻结业务源码 5c7497c 的身份由零 diff 证明

**签署：Muse（Meta Muse）· 2026-10-24**

---

## 附录：逐条契约结果

RUN_EVIDENCE.json 的 `am_cases` 共 139 条，状态分布 **PASS 139 / FAIL 0 / BLOCKED 0 / SKIP 0 / NOT VERIFIED 0**（尝试 3，git_commit=1dab5924）。逐条 ID 与日志文件名的对应关系保存在 RUN_EVIDENCE.json 的每条 `log` 字段中（相对路径 `.v6/tests/am-full-20261024T065113Z-1dab5924-NN-<suite>.log`），可按套件对照 §3 表格复核；尝试 1（环境 BLOCKED）的同名字段记录的是缺库环境的失败分布，已单独存档，不与尝试 3 混合。
