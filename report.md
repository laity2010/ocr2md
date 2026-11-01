# OCR2MD V6 独立 AM/Git 全量审计报告 · Grok

- 受审源码 SHA：75e055988df73d3d3899036f6a62ce1e851f2d15
- 交付包 SHA：6aa7acd0c64a4ae6cc54ffdce76acd7b3bfa592f（HEAD^ = 源码 SHA，status 干净）
- PDF SHA256 be12aa25…41ab、MD SHA256 d86508f6…b764：audit.sh 校验通过
- 修复分支：fix/grok-75e05598 = b86415eeb3e37026a63ce7eaaae7c29cd026a60c（2 个提交：719b591、b86415e）
- 环境：Linux（box），Node v22.23.4，Python 3.13.5，Playwright 1.64.1（Chromium + WebKit headless）。macOS、真实 iPad/iPhone/Mac 设备：**未测**。
- 本报告不引用其他审计者的结论。

## 1. 原始源码正式门禁（bash audit.sh，2026-11-01 16:18 UTC+8）
状态 **FAIL**，exit=1。`am.py build` 报 missing AM references，所以全部业务测试都没有执行：direct_api_pass=NA/NA，static_findings=10，unregistered_event_sites=0，runtime_review=62。证据：evidence/audit-sh-run1.log、evidence/formal-run1/。

## 2. 问题分级

### P0
- **P0-1 AM 门禁自 808caa0 之后约 60 个提交无法构建**（evidence/am-build-bisect.txt，逐个 first-parent 提交做了 bisect）。原因如下：
  - f7c5fbc：X-TEXTBLOCK-L48 的 needle 已不在 main.js，调用已迁到 cm-document.js:48。
  - 355fd37：G28 的符号 reviewActions 不存在，且该 API 为 internal，却被跨模块边 X-WP4-G28 引用；X-TEXTBLOCK-L49 的 needle 已失效。
  - 871b8d4 / c760789：P17 和 P19 的 fixture 字段填的是描述文字，不是文件。
  - 后果：这些提交期间 Main 上没有任何有效的 AM 测试证据。
- **P0-2 PDF/CMD 新模块 AM 归属不完整**：ownership.json 有 10 个 UNOWNED_UI_FILE（cmd-text-blocks、text-block-module 来自 d6f9ead；cmd-block-continuations 来自 f7c5fbc；cmd-block-joins 来自 9a9bbdb；text-block-preview-coverage 来自 a2cb8f4；pdf-block-text-extract 来自 01dc503；cmd-pdf-text-insert 来自 3f06719；pdf-region-hit 来自 871b8d4；pdf-gutter-label-layout 来自 c760789；pdf-source-locations 来自 641f4a7）。按 registry 的模块身份归属后，暴露出未登记的 C→L 越界：
  - cm-document→readCMDBlockJoins（9a9bbdb，导入后未使用）
  - cm-document→precedingPageBlock（93c363d）
  - wcp-cmd-element-transactions→inspectCMDTextBlocks（9a9bbdb/b301867）
  - C63 登记为 C，但实现位于 L 文件。

### P1
- **P1-1 契约无测试行**（以前被构建失败掩盖）：
  - P16、L61（01dc503 引入时就没有测试行）
  - E14 / PUB-W15 / SUB-W19（d703d46 引入时就没有测试行）
- **P1-2 修复后业务门禁仍 FAIL**：两次全量运行分别为 278/345 和 265/345 用例 PASS。15 个套件两次都失败：
  - ag-header
  - contracts
  - chapter-live-navigation
  - cm6
  - cmd-block-joins
  - compact-shell
  - dockview-preview
  - illegal-break-rescan-real
  - pdf-block-drag-edge-scroll
  - pdf-block-reorder
  - pdf-child-region-select
  - pdf-coverage-zoom
  - preview-split
  - shared-preview
  - text-block-review

  另有 pdf-normal-webkit（仅 run1 失败）和 sentence（仅 run2 失败）两个不稳定套件。主要症状是 Linux headless 下的 TimeoutError，以及 WebKit 命中区为 0、章节菜单为 0 一类断言。对照实验：在同一隔离目录里，用 75e05598 原始 UI 代码加修复后的 AM 元数据（本地 DIAG 提交 f0ad4f1，未推送）单独复跑：
  - TC-MOVE-C58、TC-WP4-L53、TC-PDF-TEXT-PARTS 同样失败
  - TC-JOIN-L55 单独运行时 PASS，修复后 UI 下单独运行也 PASS

  结论：现有证据未显示这些失败由本次修复引起，但并未对全部 15 个套件逐一做对照，因此根因没有确认，保持 **FAIL**。
- **P1-3 cmd-block-joins.test 在全量顺序中报 ENOENT**：缺少 .v6/tests/text-blocks/buffett-reinitialized.minerujson.md，单独运行时 PASS，说明测试依赖运行顺序或其他套件生成的产物，测试隔离不足。
- **P1-4 直接测试覆盖低**：245 个 API 中只有 65 个有直接 PASS 测试（明细见 evidence/fix-run*/report.json 的 api_without_direct_test）。

### P2
- **P2-1** API 的 module_id 与文件归属不一致：L49/L53/L54/G29 位于 pdf-preview.js（文件属 P），L48–L57/L64 位于 cmd-* 文件；历史上 M02–M07、P14 也有类似情况。
- **P2-2** 17 条历史 crossModuleBindings 没有对应的 registry API+edge，多数来自 shell 组合根（如 main.js→createWorkspace）。新加的守卫只覆盖新增的 PDF/CMD 绑定，这 17 条未处理，作为遗留登记。
- **P2-3** runtime_review=62 个动态 DOM/Store 调用点没有逐一人工追踪，状态为**未核实**。

## 3. 越界检查
- 静态：原始源码 10 个 finding；修复后 0（两次运行一致）；cross_module_imports 为 48。
- 动态：unregistered_event_sites=0；62 个运行时调用点**未逐一核实**。

## 4. 人工核查（部分）
- 文档 CAS：labs/cm-html/modules/document-router.py 在写锁内校验 If-Match，缺失返回 428，不匹配返回 412，其余章节原样保留。ui/main.js 收到 412/428 时保留本地修改并阻止覆盖。仅做了代码审读；并发场景只有既有的 wp8 测试，本次没有新增验证。
- 以下未完成独立人工核查，只有自动测试结果（部分 FAIL）：PDF↔MD 父子块 bbox 与跨页表格错配、Undo/Redo、MinerU JSON 不可变性、Main/Lab 镜像一致性。

## 5. 结论
- **SOURCE_MERGE：有条件建议合入 fix/grok-75e05598 的两个提交**。它们恢复了 AM 构建、补全了归属、去除了 3 处真实越界，属于不改变行为的修复，可以合入开发 Main。但合入不等于门禁通过：业务门禁仍 FAIL，需要主管交叉复验。
- **PRODUCTION_CUTOVER：不建议（NO-GO）**。原因：业务套件 15 个持续失败；直接测试覆盖 65/245；macOS 和真实设备未测；62 个运行时调用点未核实。

## 更新（fix cfdc2d4）
见 fix-report.md 第二轮。门禁 run3 84/91、run4 83/91，均 FAIL。
- SOURCE_MERGE：**不建议合并**（门禁未全绿；L05/L06/G28 需负责人决策，illegal-break-rescan 顺序依赖未解）。955c608/0b93f10/cfdc2d4 可作为候选单独审阅。
- PRODUCTION_CUTOVER：**不建议切换**（存在真实 UX 缺陷 L05 与未定位的完整门禁失败）。
