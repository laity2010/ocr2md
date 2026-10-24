> **上载说明（2026-10-24）**：本报告原件按 AUDIT.md 规定生成于冻结源码工作树 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`，并已以聊天附件交付仓库所有者。本副本由仓库所有者于 2026-10-24 明确授权上载至审计分支 `audit-fixture-5c7497c`，供主线 AI 审阅；上载基于远端 HEAD `8d1cefdc036d6f833e0886235bb21a5630d36e62`（Grok Bot 审计报告提交），仅新增本文件，未改动审计包 `d887aea` 的任何既有内容。正文 §8 的提交说明记录的是授权之前的状态，以本说明为准。审计员：Muse（Meta Muse）。
>
> **与 Grok Bot 报告的交叉对照**：同分支 `audit-reports/GROK_BOT_INDEPENDENT_AUDIT_5c7497c.md` 的独立 Linux 复跑为 87/139（其 scroll-sync-browser FAIL、quote-indent PASS）；本报告为 90/139（scroll-sync PASS、quote-indent 因一条 WebKit pageerror 噪声 FAIL）。其余 5 个失败套件（02/15/16/22/23）两份报告完全一致，差异集中在对环境敏感的边缘套件。本报告对 02/22/23 给出了探针实证的根因（F1/F3），可与 Grok 报告互补对照。

---

# OCR2MD V6 · 独立 AM/Git 审计报告（Linux 冷启动）

| 项目 | 内容 |
| --- | --- |
| 审计者 | **Muse**（Meta Muse，独立第三方审计员，与 Grok、Codex、GPT 主线无关） |
| 审计日期 | 2026-10-24（Asia/Shanghai） |
| 被审计源码（冻结） | `5c7497cdf94ea35217e83effd9496a045625fef0` |
| 审计包分支 / HEAD | `audit-fixture-5c7497c` / `d887aea697fa602c8bc993272db52daf4e1be729` |
| 审计入口 | 仓库根目录 `AUDIT.md` → `bash audit.sh`（本报告遵循其证据与口径要求） |
| 报告位置 | 冻结源码工作树 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md` |

## 结论摘要（先说结论）

1. **自动化复现层（Linux）：未达到全表通过。** 本机独立冷启动实测：27 个测试脚本 **21 PASS / 6 FAIL**；139 条 AM 登记契约 **90 PASS / 49 FAIL**；`am.py certify` 拒绝认证（原文见 §4.4）；`git fsck --full` 通过。此结论与 Codex 在 macOS 上的 139/139 **不矛盾**——49 条 FAIL 已逐条归因（§5），全部落在**冻结测试脚本的平台假设**与 **Linux WebKitGTK 的平台行为差异**上，未发现一条由 V6 业务运行时代码缺陷导致的失败。
2. **架构审计层：已执行独立源码抽查（范围见 §6.1）。** AM 登记的模块边界与抽查到的实际代码一致：`access_edges` 共 42 条 = 41 `registered` + 1 `test_only` + **0 `debt`**；未发现未登记的跨模块写路径。服务端写路径、章节存储、媒体下载的防护实现质量良好（逐项证据见 §6.2）。
3. **新发现一个同类隐含环境依赖（F1）**：此前审计包已补齐的三个依赖之外，冻结测试中还有第四处——两个 Vite 开发服务套件未传 `V6_PDF_PATH`，使 `/api/pdf` 回落到作者个人 iCloud 路径，在任何非作者机器上必然超时。此项在冻结源码内，审计包层无法在不改冻结内容的前提下修复，需主线处理。

## 1. 环境

| 项 | 值 |
| --- | --- |
| OS / 架构 | Ubuntu 24.04.5 LTS（Linux 7.0.0-39-generic），x86_64，虚拟机 2 核 / 8 GB |
| Git | 2.43.0 |
| Node / npm | v24.22.1 / 10.9.4 |
| Python | 3.12.3 |
| Playwright | 1.64.1（与 package-lock 一致） |
| 浏览器 | Chrome for Testing 156.0.8078.4；WebKit 27.2（webkit-2370，Playwright Linux 构建） |

平台口径：按 `AUDIT.md`，Linux 渲染结果属**异平台**证据，不声称 Mac/iPad 实机视觉验收。

## 2. 执行过程与环境准备披露

`bash audit.sh` 共执行三次，前两次未进入测试阶段，第三次完成全量：

- **第 1、2 次**：均在 `npx playwright install chromium webkit` 阶段失败（exit=1）。191.1 MiB 的 Chromium 包从 `cdn.playwright.dev` 下载时被本机出口网络反复中断（`Download failed: server closed connection`，安装器内重试亦失败）。失败日志完整保留（审计员本地 `audit-run-2026-10-24.log`、`audit-run2-2026-10-24.log`）。
- **环境补救（不改变任何受审内容）**：改用支持断点续传的下载方式，从 Playwright 官方同一 URL 取回四个官方包（chromium-1248、chromium_headless_shell-1248、webkit-2370、ffmpeg-1013），逐个通过 ZIP 完整性校验后解压到 Playwright 的标准缓存路径，并实测两浏览器均可启动、渲染页面；WebKit 缺失的 19 个系统库用 Playwright 官方命令 `npx playwright install-deps webkit` 补齐。第三次运行使用 `audit.sh` 自带的开关 `OCR2MD_AUDIT_SKIP_BROWSER_INSTALL=1` 跳过重复下载，其余流程（worktree 建立、哈希校验、`npm ci`、双构建、AM 全量）与标准入口完全一致。
- **第 3 次**：`AUDIT_OS=Linux`，runner exit=1（因 6 套件 FAIL），证据文件正常生成：`.v6/audit-reports/RUN_EVIDENCE.json`、`.v6/audit-reports/run.log`、27 份套件日志、47 张浏览器截图。

全程未修改冻结源码、测试断言或审计包任何文件；运行后审计包与目标工作树 `git status` 均干净（0 行）。

## 3. 完整性核验（全部通过）

| 核验项 | 方法 | 结果 |
| --- | --- | --- |
| 远端 = 本地 | `git ls-remote` 与克隆 HEAD 对比 | 一致：`d887aea697fa602c8bc993272db52daf4e1be729` |
| 审计包未改业务源码 | `git diff --stat 5c7497c..HEAD` | 仅新增审计文档、预载脚本、PDF、`AUDIT.md`、README 顶部 2 行提示、`tests/am/GROK_AUDIT.md`；`ui/ scripts/ labs/ packages/` 零改动 |
| 原始 PDF | SHA-256，运行前/后各一次 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`，与 `fixtures.SHA256SUMS` 及脚本内 pin 一致 |
| MinerU MD 夹具 | SHA-256 | `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764`，与 `run-grok-audit.sh` 内 pin 一致 |
| 审阅夹具（14 章标定） | gz 解压后 SHA-256 | `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`，与预载脚本及证据 JSON 登记值一致 |
| Git 仓库健康 | `git fsck --full --no-reflogs`（run-all 失败后由审计员补跑） | 退出 0，无输出（无损坏） |
| 运行后工作区 | 两棵工作树 `git status --porcelain` | 均为空；PDF 只读、哈希未变 |

## 4. 自动化测试结果

### 4.1 AM 登记与自检（runner 前置步骤，均在 `set -e` 下通过后才进入 run-all）

- `am.py build`：`AM_BUILD_PASS modules/apis/messages/publishers/subscriptions/tests=[7, 98, 8, 13, 17, 139]`——与 `tests/am/README.md` 公布数字逐项一致。
- `am.py` 自身单元测试：`Ran 7 tests ... OK`。
- `am.py check`：`AM_CHECK_PASS apis=98 FK=OK source-and-test-files=OK`。
- `am.py coverage`、`am.py edges debt` 均正常退出（debt 明细由审计员直接查 SQLite 复核：见 §6.2）。

### 4.2 27 个脚本逐项结果

日志相对路径前缀：`.v6/tests/`，批次名 `am-full-20261024T040335Z-5c7497cd`。

| # | 脚本 | 契约数 | 结果 |
| --- | --- | ---: | --- |
| 1 | tests/ag-header-browser.test.mjs | 2 | PASS |
| 2 | tests/am/contracts-browser.test.mjs | 16 | **FAIL（F1）** |
| 3 | tests/chapter-numbering.test.mjs | 1 | PASS |
| 4 | tests/cm6-browser.test.mjs | 3 | PASS |
| 5 | tests/cmd-annotations-browser.test.mjs | 7 | PASS |
| 6 | tests/cmd-html-unified-browser.test.mjs | 5 | PASS |
| 7 | tests/compact-shell-browser.test.mjs | 5 | PASS |
| 8 | tests/dockview-preview-browser.test.mjs | 5 | PASS |
| 9 | tests/four-pane-pdf-browser.test.mjs | 5 | PASS |
| 10 | tests/latex-browser.test.mjs | 8 | PASS |
| 11 | tests/latex-four-view-browser.test.mjs | 1 | PASS |
| 12 | tests/latex-normalize-browser.test.mjs | 2 | PASS |
| 13 | tests/latex-review-browser.test.mjs | 3 | PASS |
| 14 | tests/media-adoption-syntax.test.mjs | 2 | PASS |
| 15 | tests/media-browser.test.mjs | 15 | **FAIL（F2）** |
| 16 | tests/media-paste-browser.test.mjs | 4 | **FAIL（F2）** |
| 17 | tests/mineru-start-only-ui-browser.test.mjs | 4 | PASS（含登记夹具 staging，见 §6.3） |
| 18 | tests/obsidian-image-preview-browser.test.mjs | 1 | PASS |
| 19 | tests/outline-browser.test.mjs | 15 | PASS |
| 20 | tests/pdf-anchor-viewport-browser.test.mjs | 1 | PASS |
| 21 | tests/pdf-click-only-browser.test.mjs | 4 | PASS |
| 22 | tests/preview-split-browser.test.mjs | 6 | **FAIL（F1）** |
| 23 | tests/promoted-chapters-browser.test.mjs | 7 | **FAIL（F3）** |
| 24 | tests/quote-indent-browser.test.mjs | 1 | **FAIL（F4）** |
| 25 | tests/scroll-sync-browser.test.mjs | 4 | PASS |
| 26 | tests/scroll-sync-leadership-browser.test.mjs | 6 | PASS |
| 27 | tests/shared-preview-browser.test.mjs | 6 | PASS |

汇总行（runner 原文）：`AM_FULL_RESULT passed_cases=90/139 failed_suites=6 git=5c7497cd`。逐契约状态见附录 A，机器证据见 `.v6/audit-reports/RUN_EVIDENCE.json`。

### 4.3 certify

run-all 失败后 `run-grok-audit.sh` 按 `set -e` 中止，`certify` 与 `fsck` 未在该次运行内执行。审计员随后在目标工作树补跑：

- `python3 tests/am/am.py certify` → `AM_ERROR: AM_CERTIFY_FAIL: no complete PASS with unchanged source/test Git tree; run-all required`。**本机 Linux 未获 AM 认证**，与 §4.2 结果自洽（认证机制正确拒绝了不完整 PASS，未发现绕过）。
- `git fsck --full --no-reflogs` → 通过（§3）。

## 5. 失败根因分析（49 = 22 + 19 + 7 + 1）

### F1（22 条）contracts-browser、preview-split：第四处隐含环境依赖——Vite 开发服务未传 `V6_PDF_PATH`

- 现象：两脚本均在第一个引擎（Chrome）于 `page.waitForFunction` 等待 `window.__v6cm6.pdf.ready` 处 80 秒超时（`tests/am/contracts-browser.test.mjs:30`、`tests/preview-split-browser.test.mjs:30`）。
- 根因链：两脚本 spawn Vite 开发服务时 env 只设 `V6_DOCUMENT_PATH`，未设 `V6_PDF_PATH`（contracts 第 14–16 行、preview-split 第 13–15 行）；`vite.config.mjs:20-21` 的默认 PDF 路径是作者个人 iCloud Obsidian 路径（`~/Library/Mobile Documents/iCloud~md~obsidian/…/Buffett s Alpha.pdf`）。该文件只存在于作者 Mac 上，于是 `/api/pdf` 返回 404，`pdf.ready` 永不置真。
- 对照证据：其余 8 个需要 PDF 的套件都在 spawn env 中显式传 `V6_PDF_PATH`（如 `tests/mineru-start-only-ui-browser.test.mjs:26`），且全部 PASS；生产服务 `scripts/v6_serve.py:26` 的默认 PDF 路径是工作区文件（审计包已 staging 并校验哈希），故走生产服务的套件不受影响。
- 探针实证（审计员，目标工作树）：同配置启动 Vite，`curl /api/pdf` → 无 `V6_PDF_PATH` 时 **404**；设 `V6_PDF_PATH` 指向审计 staging 的 PDF 后 → **200，1,474,904 字节，且响应体 SHA-256 = `be12aa25…` 与 pin 完全一致**。又以 iPad WebKit 实际打开页面，8 秒后 `__v6cm6.pdf.ready === false`，控制台见 404 资源错误，与套件超时机理吻合。
- 定性：冻结**测试脚本 + 开发配置默认值**的可移植性缺陷，与此前审计包已修复的三个隐含依赖同类；不在 V6 业务运行时路径上。修复建议（交主线）：两脚本 spawn env 补 `V6_PDF_PATH`（与同类套件一致），或把 `vite.config.mjs` 默认值改为 `.v6/workspace/buffetts-alpha.original.pdf`——后者同时移除仓库中的个人路径。

### F2（19 条）media-browser、media-paste-browser：测试夹具生成硬依赖 macOS `sips`

- 现象：两脚本在生成 JPEG 测试夹具时 `Error: spawnSync sips ENOENT`（`tests/media-browser.test.mjs:40`、`tests/media-paste-browser.test.mjs:16`）。`sips` 是 macOS 系统工具，Linux 不存在，脚本在进入任何产品断言前即终止。
- 定性：冻结**测试脚本**的平台依赖；媒体模块本身的契约由 `media-adoption-syntax`（PASS）等覆盖，本项不指向产品缺陷。修复建议：将 JPEG 夹具改为随仓库提交的静态文件，或用跨平台工具生成。

### F3（7 条）promoted-chapters：Linux WebKitGTK 不保存 loopback HTTP 上的 `Secure` Cookie

- 现象：Chrome 全流程 PASS（含章节导出、重开再导出两段 `V6_PROMOTED_CHAPTER_*_PASS Chrome`）；WebKit 轮次在解锁后保存环节等待状态文本「已保存」15 秒超时（`tests/promoted-chapters-browser.test.mjs:99`）。
- 探针实证（审计员，对真实 `v6_serve.py` + dist 以双引擎同流程探测）：

  | 步骤 | Chrome | WebKit（Linux） |
  | --- | --- | --- |
  | `fetch /healthz` | 200 | 200 |
  | `POST /api/unlock`（正确 12 位码） | 200 | 200 |
  | 解锁后 Cookie 存储 | `v6edit`（Secure，SameSite=Lax）✔ | **无——Cookie 被丢弃** |
  | `GET /api/session` | `canSave: true` | `canSave: false` |
  | `PUT /api/document` | 200 | **403** |

- 根因：服务端在解锁与 `/access/<KEY>` 两处下发的编辑 Cookie 均带 `Secure` 属性（`scripts/v6_serve.py:291`、`:96`）。生产环境走 HTTPS，此设置正确；但测试用 `http://127.0.0.1` 回环部署时，Chrome 视回环为可信上下文接受该 Cookie，Linux WebKitGTK 则不存储，导致授权写路径全灭。macOS WebKit（苹果实现）接受，故 Mac 通过。
- 定性：**平台行为差异**，附带一条低级别产品观察：在回环 HTTP 场景下无条件 `Secure` 会使 WebKit 系浏览器无法编辑；如需支持本地 HTTP 调试，可按请求来源条件化该属性。此项不影响生产 HTTPS 形态。

### F4（1 条）quote-indent：WebKit 零错误断言被一条平台特有 pageerror 触发

- 现象：Chrome 全断言 PASS（日志 `QUOTE_INDENT_PASS Chrome {…}`）；WebKit 轮次功能步全部走完，最终在零错误断言（`tests/quote-indent-browser.test.mjs:133`）失败，实际错误数组为一条：`/127.0.0.1:5263/healthz due to access control checks.`。
- 审计员两次最小复现（桌面 WebKit 上下文、iPad 设备模拟上下文，均对 Vite 开发服务实测 `/healthz` fetch）均未复现该条错误（fetch 返回 200 / 仅见 F1 的 PDF 404 控制台错误）。触发点未完全隔离，推测与 Linux WebKitGTK 在该套件完整交互流中对回环 fetch 的访问控制处理有关。
- 定性：平台差异导致的**断言噪声**，功能行为本身在双引擎均验证通过；建议主线在报告口径中将其列为已知平台差异，或在测试中对该条 WebKit 特有错误做显式豁免并注明原因。

## 6. 独立源码审查

### 6.1 范围与方法

以冻结 SHA `5c7497c` 工作树为对象：通读 `AUDIT.md`、`AGENTS.md`、`README.md`、`tests/am/README.md`；全量枚举 `ui/*.js` 的 ES import 关系、`window.*` 暴露点、全部 `fetch(` 调用点；通读服务端 `scripts/v6_serve.py`（483 行）的全部端点与授权/写路径，`scripts/v6_chapters.py` 的名称校验与导出，`scripts/v6_media.py` 的 URL 校验与下载；抽查 `ui/view-store.js`、`vite.config.mjs`、`labs/cm-html` 隔离实现；对 Git 历史做文件名级敏感文件扫描与大文件盘点；以 SQLite 直查 AM 登记与运行结果交叉核对。**未做**：逐行审完全部约万行代码、生产数据实测、macOS/iPad 真机验证、渗透测试；AM `access_edges` 按其 README 自述是代表性登记而非全仓静态分析，本报告不将其当作完备性证明。

### 6.2 正向确认（抽查与登记一致）

- **跨模块调用**：SQLite 直查 `access_edges` 共 42 条：`registered` 41、`test_only` 1、`debt` **0**（README 公布：42 条、1 条 test_only、debt 为零 ✔）。前端状态经 `ui/view-store.js`（50 行，对外仅 `viewStore/documentChanged/selectionChanged/publishScroll/setScrollSyncEnabled/publishFocus`）集中中转，被 7 个 UI 模块 import；纯函数型共享（`cmd-annotations.js`、`mineru-anchors.js`、`latex-scan.js` 等）以显式 import 注入，与登记口径一致。唯一的 `window.*` 暴露是 `ui/main.js:489` 的 `window.__v6cm6`，受 `import.meta.env.DEV` 门控，与那条 `test_only` 登记吻合；生产构建中不存在。
- **服务端授权与写路径**（`scripts/v6_serve.py`）：编辑 Cookie 以 `hmac.compare_digest` 常量时间比对（:72、:287）；`PUT /api/document` 同时要求 Cookie 授权与同源（:433-436），并有大小上限、UTF-8 校验、写锁、临时文件 `fsync` + `os.replace` 原子替换（:455-465）；静态文件服务做 `is_relative_to(static_root)` 路径穿越防护（:189）。
- **章节存储**（`scripts/v6_chapters.py`）：文件名严格正则 `CHAPTER_NAME.fullmatch`（:16），读取必须命中 manifest 清单（:37-46），目录/文件为符号链接时拒绝；导出校验源文档 SHA-256 与已保存版本一致、文件名去重、内容标记规则与 8 MiB 上限，并拒绝覆盖无 manifest 的未托管目录。
- **媒体下载**（`scripts/v6_media.py`）：URL 仅允许单一官方 CDN 主机（https、443、无 userinfo）或显式回环测试源（:34-47），禁止重定向（:27-30），扩展名白名单 + 魔数校验，40 MiB 上限，落盘文件名由 URL 哈希派生（无用户可控路径），多处符号链接拒绝。SSRF 面收敛良好；残余观察：`validate_url` 只比对主机名字符串、不解析校验目标 IP，安全性依赖该官方域名本身可信（低风险，记录备查）。
- **旁路实验隔离**（`labs/cm-html`，对应 `AGENTS.md` 第 5 条）：实验有独立 `.runtime` 目录、独立令牌文件（0600）与独立 Cookie 名，主线组件只读复用，转换宣称内存-only；抽查未发现实验写主线 Markdown 的路径。
- **Git 历史**：冻结源码 171 个提交、单一作者；全历史文件名扫描未见 `.env/.pem/.key/token/credential` 等敏感文件入库；最大 blob 为两款 Sarasa 字体（约 8.8 MB / 8.5 MB）与 MinerU JSON 夹具（2.3 MB）——属仓库体积问题（F6），非安全问题。

### 6.3 审计包机制复核

- `audit-fixture-preload.mjs`（审计包新增，非冻结内容）：仅对两个具名历史套件生效；审阅夹具写入前先校验解压后 SHA-256 与当前母文档等于原始夹具，进程退出恢复原文件，崩溃时由标记文件在下个套件启动时恢复；release 快照仅复制到 Git 忽略的 `.v6/release`。两项覆盖均登记在 `RUN_EVIDENCE.json.fixture_overrides`。实现与 `AUDIT.md` 第 5 条披露一致，未改动任何受跟踪文件或断言。残余提示：该预载经 `NODE_OPTIONS --import` 注入整轮所有套件，其正确性属于审计可信路径的一部分，本报告已将其全文纳入审查。
- 冻结侧 `tests/am/audit-browser-preload.mjs`（24 行）：仅改写 Playwright 启动的 `executablePath`（用环境变量指定或在非 macOS 删除写死的 Mac 路径），不拦截请求、不伪造结果，浏览器运行真实。

### 6.4 其他问题与观察

- **F5（文档，低）**：`tests/am/README.md` 称历史冻结标记为 tag `v6-feature-freeze-20261022`，但 GitHub 远端 `git ls-remote --tags` 只有 `ocr2md-init-v1` 与 `webcodex-initial`，该 tag 未推送。第三方只能靠被 pin 的 SHA（`audit.sh` 已强制校验）定位冻结源，不构成复现障碍，但文档与远端事实不一致，建议补推 tag 或更正文档。
- **F6（体积，信息）**：仓库内嵌两款整字重中文字体（合计约 17 MB）与多份大夹具，匿名克隆在本机网络下约 70 秒。仅作记录。
- **F7（设计观察，低）**：`GET /access/<KEY>` 以 URL 路径承载完整编辑令牌并直接下发编辑 Cookie（`scripts/v6_serve.py:94-100`），属能力 URL 设计；写操作另有同源校验兜底。风险点在链接经聊天/日志/截图外泄即等同交出编辑权，建议使用者按密码同等对待该链接（README 已提示保存需授权，此处仅强调保管口径）。

## 7. 两层结论

**第一层 · 自动化 AM/Git 全量测试的独立复现**
- macOS：Codex 交付结果（139/139）本报告未重复验证，也不冒充为本审计结论。
- Linux（本报告实测）：**未全表通过**——90/139 契约 PASS，`certify` 未通过。49 条 FAIL 已 100% 归因：F1 测试/开发配置的个人路径依赖 22 条、F2 测试对 macOS 工具 `sips` 的依赖 19 条、F3 WebKitGTK 的 Secure Cookie 平台差异 7 条、F4 WebKitGTK 平台错误噪声 1 条。**没有一条指向 V6 业务运行时代码错误**；走生产服务形态的套件（章节、LaTeX、大纲、滚动同步、PDF、四视图等）在 Linux 上与 Mac 结果一致。
- 因此，「已通过全量测试的审计包可在任意干净环境冷启动复现」这一命题，目前仅在 macOS 成立；在 Linux 成立的前提是主线处理 F1、F2，并对 F3、F4 给出平台差异口径。

**第二层 · 第三方 AI 源码架构审查**
- 本报告 §6 即为该层产出：**已实际执行**（抽查范围如 §6.1 声明）。登记边界与抽查代码一致，未发现未登记的跨模块写路径或明显的授权绕过；主要风险不在架构，而在测试资产的可移植性（F1、F2）与文档事实一致性（F5）。

**未检查范围**：macOS/iPad 真机与 Safari 本体、生产域名 `ocr2md.laity.bid` 的线上部署状态、MinerU 转换器 TypeScript 源码的逐行审查（仅经其构建与契约测试间接覆盖）、性能与并发压测、依赖供应链（`npm audit` 未在本轮执行）。

## 8. 提交方式说明

按 `AUDIT.md` 的强制要求：审计报告不得写回或推送 GPT 主线/审计包，本报告已写入其指定路径（冻结源码工作树 `.v6/audit-reports/INDEPENDENT_AM_GIT_REPORT.md`，该目录为 Git 忽略的本地证据区），并通过聊天附件提交。审计环境对 GitHub 仅有匿名只读权限，无写凭据；如需将本报告上 GitHub，请由仓库所有者自行上传，或另行授权一个报告专用仓库/分支。

—— Muse（独立审计员），2026-10-24

## 附录 A · 139 条 AM 契约逐条状态（据 RUN_EVIDENCE.json）

（见随附生成的逐条清单，与 `.v6/audit-reports/RUN_EVIDENCE.json` 中 `am_cases` 一一对应。）
### tests/ag-header-browser.test.mjs (2 cases)
- TC-G08: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-01-ag-header-browser.test.log)
- TC-G09: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-01-ag-header-browser.test.log)

### tests/am/contracts-browser.test.mjs (16 cases)
- TC-C03: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-C08: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-C10: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-C11: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-C12: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-C13: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-E07: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-E08: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-G06: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-P08: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-P12: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-PUB10: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-PUB11: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-PUB12: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-SUB13: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)
- TC-SUB15: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-02-contracts-browser.test.log)

### tests/chapter-numbering.test.mjs (1 cases)
- TC-G12: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-03-chapter-numbering.test.log)

### tests/cm6-browser.test.mjs (3 cases)
- TC-C09: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-04-cm6-browser.test.log)
- TC-L08: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-04-cm6-browser.test.log)
- TC-PUB02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-04-cm6-browser.test.log)

### tests/cmd-annotations-browser.test.mjs (7 cases)
- TC-C17: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)
- TC-C18: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)
- TC-C19: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)
- TC-C20: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)
- TC-C21: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)
- TC-C22: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)
- TC-C23: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-05-cmd-annotations-browser.test.log)

### tests/cmd-html-unified-browser.test.mjs (5 cases)
- TC-C01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-06-cmd-html-unified-browser.test.log)
- TC-C02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-06-cmd-html-unified-browser.test.log)
- TC-C04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-06-cmd-html-unified-browser.test.log)
- TC-C05: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-06-cmd-html-unified-browser.test.log)
- TC-C06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-06-cmd-html-unified-browser.test.log)

### tests/compact-shell-browser.test.mjs (5 cases)
- TC-E05: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-07-compact-shell-browser.test.log)
- TC-G11: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-07-compact-shell-browser.test.log)
- TC-L01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-07-compact-shell-browser.test.log)
- TC-PUB09: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-07-compact-shell-browser.test.log)
- TC-SUB12: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-07-compact-shell-browser.test.log)

### tests/dockview-preview-browser.test.mjs (5 cases)
- TC-L02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-08-dockview-preview-browser.test.log)
- TC-L11: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-08-dockview-preview-browser.test.log)
- TC-M01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-08-dockview-preview-browser.test.log)
- TC-M03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-08-dockview-preview-browser.test.log)
- TC-SUB02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-08-dockview-preview-browser.test.log)

### tests/four-pane-pdf-browser.test.mjs (5 cases)
- TC-E03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-09-four-pane-pdf-browser.test.log)
- TC-P09: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-09-four-pane-pdf-browser.test.log)
- TC-PUB05: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-09-four-pane-pdf-browser.test.log)
- TC-PUB06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-09-four-pane-pdf-browser.test.log)
- TC-SUB06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-09-four-pane-pdf-browser.test.log)

### tests/latex-browser.test.mjs (8 cases)
- TC-SUB17: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T02-RENDER: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T05: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)
- TC-T06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-10-latex-browser.test.log)

### tests/latex-four-view-browser.test.mjs (1 cases)
- TC-SUB09-LATEX: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-11-latex-four-view-browser.test.log)

### tests/latex-normalize-browser.test.mjs (2 cases)
- TC-L20: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-12-latex-normalize-browser.test.log)
- TC-T12: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-12-latex-normalize-browser.test.log)

### tests/latex-review-browser.test.mjs (3 cases)
- TC-T09: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-13-latex-review-browser.test.log)
- TC-T10: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-13-latex-review-browser.test.log)
- TC-T11: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-13-latex-review-browser.test.log)

### tests/media-adoption-syntax.test.mjs (2 cases)
- TC-A02-SIZED: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-14-media-adoption-syntax.test.log)
- TC-A12: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-14-media-adoption-syntax.test.log)

### tests/media-browser.test.mjs (15 cases)
- TC-A01: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A02: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A03: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A04: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A05: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A06: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A07: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A08: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-A09: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-C14: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-L17: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-L18: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-L19: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-PUB13: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)
- TC-SUB16: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-15-media-browser.test.log)

### tests/media-paste-browser.test.mjs (4 cases)
- TC-A10: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-16-media-paste-browser.test.log)
- TC-A11: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-16-media-paste-browser.test.log)
- TC-C15: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-16-media-paste-browser.test.log)
- TC-C16: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-16-media-paste-browser.test.log)

### tests/mineru-start-only-ui-browser.test.mjs (4 cases)
- TC-L04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-17-mineru-start-only-ui-browser.test.log)
- TC-P03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-17-mineru-start-only-ui-browser.test.log)
- TC-P10: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-17-mineru-start-only-ui-browser.test.log)
- TC-SUB03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-17-mineru-start-only-ui-browser.test.log)

### tests/obsidian-image-preview-browser.test.mjs (1 cases)
- TC-M08: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-18-obsidian-image-preview-browser.test.log)

### tests/outline-browser.test.mjs (15 cases)
- TC-E01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-E02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-G01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-G02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-G03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-G07: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-L03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-M04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-PUB01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-PUB03: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-PUB04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-SUB01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-SUB04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-SUB05: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)
- TC-SUB08: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-19-outline-browser.test.log)

### tests/pdf-anchor-viewport-browser.test.mjs (1 cases)
- TC-P06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-20-pdf-anchor-viewport-browser.test.log)

### tests/pdf-click-only-browser.test.mjs (4 cases)
- TC-L10: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-21-pdf-click-only-browser.test.log)
- TC-P02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-21-pdf-click-only-browser.test.log)
- TC-P11: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-21-pdf-click-only-browser.test.log)
- TC-SUB07: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-21-pdf-click-only-browser.test.log)

### tests/preview-split-browser.test.mjs (6 cases)
- TC-L05: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-22-preview-split-browser.test.log)
- TC-L12: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-22-preview-split-browser.test.log)
- TC-M06: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-22-preview-split-browser.test.log)
- TC-M07: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-22-preview-split-browser.test.log)
- TC-P05: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-22-preview-split-browser.test.log)
- TC-P07: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-22-preview-split-browser.test.log)

### tests/promoted-chapters-browser.test.mjs (7 cases)
- TC-G04: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)
- TC-G05: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)
- TC-G10: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)
- TC-L09: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)
- TC-L14: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)
- TC-L15: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)
- TC-L16: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-23-promoted-chapters-browser.test.log)

### tests/quote-indent-browser.test.mjs (1 cases)
- TC-C07: FAIL (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-24-quote-indent-browser.test.log)

### tests/scroll-sync-browser.test.mjs (4 cases)
- TC-E06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-25-scroll-sync-browser.test.log)
- TC-L07: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-25-scroll-sync-browser.test.log)
- TC-SUB10: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-25-scroll-sync-browser.test.log)
- TC-SUB14: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-25-scroll-sync-browser.test.log)

### tests/scroll-sync-leadership-browser.test.mjs (6 cases)
- TC-E04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-26-scroll-sync-leadership-browser.test.log)
- TC-L13: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-26-scroll-sync-leadership-browser.test.log)
- TC-PUB07: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-26-scroll-sync-leadership-browser.test.log)
- TC-PUB08: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-26-scroll-sync-leadership-browser.test.log)
- TC-SUB09: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-26-scroll-sync-leadership-browser.test.log)
- TC-SUB11: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-26-scroll-sync-leadership-browser.test.log)

### tests/shared-preview-browser.test.mjs (6 cases)
- TC-L06: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-27-shared-preview-browser.test.log)
- TC-M02: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-27-shared-preview-browser.test.log)
- TC-M05: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-27-shared-preview-browser.test.log)
- TC-P01: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-27-shared-preview-browser.test.log)
- TC-P04: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-27-shared-preview-browser.test.log)
- TC-P13: PASS (log: .v6/tests/am-full-20261024T040335Z-5c7497cd-27-shared-preview-browser.test.log)
