# OCR2MD V6 Main 完整 AM/Git 复审基线与下一轮外部复审（2026-10-28）

## 审计对象与可信边界

原始固定受审 Main：`fbb08bf52e971982794d1a24b110885671ce93b4`（实际分支 `build/2026-10-20`）。原冻结 Lab `043cbf5` 已合入；当前独立镜像 Lab 155 个 Rollup 模块和相同 SHA 源码一致，模块指纹 `7b30f0036cd809e53719105b73fb7077021b6876a5f2cf341aa21dee3eb75582`。Git `fsck --full --no-reflogs` 通过（只有 dangling blobs）。

`python3 tests/am/audit_boundaries.py` 静态 PASS；`python3 tests/am/am.py build && python3 tests/am/am.py check` PASS，基线为 9 模块 / 122 API / 9 消息 / 14 发布 / 19 订阅 / 167 项测试登记；25 项 Python 单测 24 PASS、1 SKIP。**静态 PASS 不是 WCP 全动态合规证明。**

## AM run-all 的完整真实结果

在原始 `fbb08bf` 上逐套执行 `python3 tests/am/am.py run-all` **31/31 套，10 PASS，21 FAIL**；`AM_FULL_RESULT passed_cases=35/167 failed_suites=21 git=fbb08bf5`，非零退出。`python3 tests/am/am.py certify` 亦明确 **FAIL**：未找到同源测试树下全部 PASS 的有效记录。`35/167` 是注册测试关联数，不表示有 132 个相互独立的业务缺陷。不得将这些 FAIL 因测试过时而自动转换 PASS。

本机原始汇总 `/tmp/ocr2md-main-fbb08bf-am-run-all-20261028.log`；逐套原始日志 `.v6/tests/am-full-20261028T004018Z-fbb08bf5-*.log`（ignored，只作本地取证，不含用户数据）。

| # | 套件 | 注册关联项 | 结果 |
|---:|---|---:|---|
| 1 | `tests/ag-header-browser.test.mjs` | 2 | **FAIL** |
| 2 | `tests/am/contracts-browser.test.mjs` | 16 | **FAIL** |
| 3 | `tests/chapter-numbering.test.mjs` | 1 | **PASS** |
| 4 | `tests/cm6-browser.test.mjs` | 3 | **PASS** |
| 5 | `tests/cmd-annotations-browser.test.mjs` | 7 | **PASS** |
| 6 | `tests/cmd-html-unified-browser.test.mjs` | 5 | **PASS** |
| 7 | `tests/compact-shell-browser.test.mjs` | 5 | **FAIL** |
| 8 | `tests/dockview-preview-browser.test.mjs` | 5 | **PASS** |
| 9 | `tests/four-pane-pdf-browser.test.mjs` | 5 | **FAIL** |
| 10 | `tests/latex-browser.test.mjs` | 8 | **FAIL** |
| 11 | `tests/latex-four-view-browser.test.mjs` | 1 | **FAIL** |
| 12 | `tests/latex-normalize-browser.test.mjs` | 2 | **FAIL** |
| 13 | `tests/latex-review-browser.test.mjs` | 3 | **FAIL** |
| 14 | `tests/media-adoption-syntax.test.mjs` | 2 | **PASS** |
| 15 | `tests/media-browser.test.mjs` | 15 | **FAIL** |
| 16 | `tests/media-paste-browser.test.mjs` | 4 | **FAIL** |
| 17 | `tests/mineru-start-only-ui-browser.test.mjs` | 4 | **FAIL** |
| 18 | `tests/obsidian-image-preview-browser.test.mjs` | 1 | **PASS** |
| 19 | `tests/outline-browser.test.mjs` | 15 | **FAIL** |
| 20 | `tests/outline-title-scale-browser.test.mjs` | 3 | **FAIL** |
| 21 | `tests/pdf-anchor-viewport-browser.test.mjs` | 1 | **FAIL** |
| 22 | `tests/pdf-click-only-browser.test.mjs` | 4 | **FAIL** |
| 23 | `tests/preview-split-browser.test.mjs` | 6 | **FAIL** |
| 24 | `tests/promoted-chapters-browser.test.mjs` | 7 | **FAIL** |
| 25 | `tests/quote-indent-browser.test.mjs` | 1 | **FAIL** |
| 26 | `tests/scroll-sync-browser.test.mjs` | 4 | **PASS** |
| 27 | `tests/scroll-sync-leadership-browser.test.mjs` | 6 | **PASS** |
| 28 | `tests/settings-browser.test.mjs` | 12 | **FAIL** |
| 29 | `tests/settings-server.test.mjs` | 1 | **PASS** |
| 30 | `tests/shared-preview-browser.test.mjs` | 6 | **FAIL** |
| 31 | `tests/wcp-runtime-contract.test.mjs` | 12 | **FAIL** |

## 失败分类及禁止的假修复

- **旧导航操作失效**：`latex-*`、`outline-title-scale`、`settings-browser` 仍试图 Playwright `.selectOption()` 操作已隐藏的 `#module-select`；PDF/预览测试仍点隐藏的 `.ocr-preview-mode`。Main 已改用可见 Tom Select。后续应真实操作可见控件并保留全部业务断言，不得绕过操作模拟 PASS。
- **旧 UI 合同漂移**：AG 标题行数/列数、旧工具栏位置、母文档“导出章节”和复选框布局的断言与已晋升的虚拟章节设计矛盾；逐项与已验收 Lab 行为对照后区分产品回归和旧测试。
- **媒体/PDF/四窗未充分证明**：`media-*`、`four-pane-pdf`、`pdf-click-only`、`shared-preview` 有真实等待失败，必须调查源码/布局/滚动/资源，不能仅凭“旧测试”一笔勾销。
- **WCP 架构测试明确过时**：原 `wcp-runtime-contract.test.mjs` 正面要求 Lab 专属 `resolveId` 业务模块替换，与 `AGENTS.md` §5 相抵触。后续 Main 改为断言镜像依赖图一致且任何业务模块覆盖被拒绝，并保留 WCP/AG 公共契约断言，新测试 **5/5 PASS**。

## 高风险定向回归（真实执行）

- **并发保存**：Chromium、WebKit 两个独立认证编辑端对隔离 Markdown 实际编辑，A `200,200`、B 旧 ETag `412`；B 的未保存草稿、Undo 保留，A Undo 后恢复原始字节，`pageErrors=0`。证据 `/tmp/ocr2md-cas-two-browser-recheck-20261028.log`；正式用户 MD/Settings 无写入。
- **同 SHA Lab/Main**：在镜像 worktree 上两次标准构建 + `node scripts/v6_lab_parity_check.mjs cm-html`，155 个实际模块字节指纹完全相同。Main Chrome、Lab Chrome、Main iPad WebKit、Lab iPad WebKit 四组真实导航、「全部」、Settings 测试均 PASS。
- **WCP 虚拟章节消息登记与实测**：后续 Main `c63b85b` 将实际生产 `ocr2md:lab-virtual-select`、`lab-virtual-open`、`wp3-ag-ready`、`wp4-virtual-scope` 登记至 AM E10–E13，WCP 活跃模块归属 W；注册表后续计数为 9 模块、122 API、13 消息、19 发布者、24 订阅者、181 关联项。`78a5d54` 进一步用 CMD 真实章节索引选择跨章 AG 标题行，四组 Chrome/WebKit × Main/Lab 的真实用户点击 PASS，事件计数每组为 `2 / 1 / 1 / 3`、零 JS 错误、零 API 写入。仅为有界集成测试，**不等于所有注册项都是独立单 API 测试**。

## Grok 上一轮六项 P1 的真实关闭矩阵（非 Grok/Muse 签字）

| Grok 9953137 P1 | 最新状态 | 尚缺什么 |
|---|---|---|
| 1 默认 Main 缺少已验收 Lab 功能 | 代码修复，待外部复认 | 真正的 Main/镜像 4 组 Chrome/WebKit 导航通过，旧 AM 总体仍 FAIL |
| 2 Lab 构建时业务源码替换、服务猴子补丁 | 活跃路径已修复，待外部复认 | `LAB_MODULE_OVERRIDE_FORBIDDEN`、155 模块同指纹；旧归档脚本存在但不作为服务入口 |
| 3 WCP 不纳入 AM / 消息未登记 | **本轮重点修复，待外部复认** | 活跃四类消息 E10–E13、发布/订阅及 WCP 所有权已登记；历史 `lab-file-activated` 无活跃生产者，全部运行时路径仍待外部独立审阅 |
| 4 旧 Lab 35 项测试依赖私有数据/不可复现 | **OPEN** | 新镜像 4 组测试不足以覆盖旧 Lab 全部测试，需要逐个迁移到隔离 fixture |
| 5 双编辑端 412 后保留草稿/Undo | **本地指定场景 PASS，待外部复认** | Chrome/WebKit 本轮严格真实执行，用户数据未动 |
| 6 AM 全量套件/认证不稳定 | **OPEN / 本轮 FAIL** | 31 套 21 FAIL；必须迁移/修复后重跑 `run-all` 和 `certify` |

## 外部交付与发布边界

- 原始 SHA `fbb08bf...` 的私有、固定分支 `audit/main-20261028-fbb08bf` 与冻结标签 `audit/frozen-main-20261028-fbb08bf` 已普通 push 且远端核对。Grok/Muse **共用一份审计 Prompt**：https://github.com/laity2010/ocr2md-independent-audit/issues/5 ，要求独立取证、分别报告，不能参考彼此。
- 外部审计 Issue 建立成功 ≠ 任一外部 AI 已读取、获得权限、实际启动或签字；本轮仍缺正式 Grok/Muse 结果。修复后的新 Main SHA 也需要新固定快照及增量复审，不能沿用原始 fbb 的结论。
- **开发 Main 源码集成 ≠ 正式 Main 发布**。公网 Main `v6-20261027-221615` 本轮未更新，冻结旧 Lab 不动，Main/Lab `.runtime` 用户数据哈希未变。根正式发布不得绕过既有发布门禁。

## 本地结论

`AM_GIT_AUDIT_RESULT = FAIL`；`MAINLINE_ARCHITECTURE_COMPLIANT = BLOCKED`（动态全量未证）；`READY_FOR_PRODUCTION_CUTOVER = NO`。

接下来按“旧测试迁移 → 真正功能回归修复 → 完整 run-all+certify → 同一 SHA 双外部复审”闭环，不得删测、弱化断言或凭局部 PASS 宣布全量合格。

### 后续增量：可在 Main 直接安全执行的 WCP 事件测试

原镜像测试会在 Main 工作树中发现现有正式 `labs/cm-html/.runtime` 并主动拒绝触碰它，不能直接作为 AM `run-all` 的测试脚本。新增 `tests/wcp-virtual-event-contract.browser.test.mjs`：自建临时 Markdown/Settings 与独立 localhost Vite，以 Chrome、iPad WebKit 真点 AG 跨章节标题行，核对 `lab-virtual-select/open`、`wp3-ag-ready`、`wp4-virtual-scope` 四类消息以及导航和「全部」保持。**Chrome + iPad WebKit PASS**，零 JS 错误、零业务写入，临时数据恢复后删除。AM 14 条新增消息/发布/订阅测试登记均指向此可在 Main 执行的隔离脚本。镜像测试 `tests/v6-lab-mirror.browser.test.mjs` 仍单独执行 Main/Lab 4 组实际业务回归。历史 `fbb08bf` 31 套 **10 PASS/21 FAIL** 的认证结果完全不变。
