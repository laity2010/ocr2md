# OCR2MD V6 PDF 版面元素标定 · Grok 独立审计与修复交付

## 结论与固定 SHA

**总体结论：`FAIL` / `REVIEW_REQUIRED`。不得把针对性 PASS 写成完整套件通过。**

- 固定受审源码：`9c47e44f1fc6b44b4f126030d68008854aced6ca`。
- 审计交付包 HEAD：`a1c9c57f887523084b8eafe5b2f5568902826bc2`。
- 修复分支：`fix/grok-pdf-elements-9c47e44`。
- 最终修复 SHA：`a58efa90e2f2ed0a785d6220c1a7d56a8cc7cd8c`。
- 报告分支：`audit/grok-pdf-elements-9c47e44-report`。
- 执行环境：Linux x86_64，Node v22.23.4，Python 3.13.5；Playwright Chromium/WebKit 真实启动。Linux iPad-WebKit 是仿真，不是真实设备。

## 输入与执行完整性

- PDF SHA256：`be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`。
- Markdown fixture SHA256：`d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764`。
- MinerU JSON SHA256：`e7371434b168a68c77e8b26370327670abb150aed63f2989c9f5e7e4336ee4a5`。
- 最终两轮均对同一 FIX_SHA、两个全新干净 detached worktree，串行执行 `bash tests/am/run-standard-audit.sh <FULL_FIX_SHA>`；不是 package `audit.sh`。
- 一次从含实验的脏调用树启动被脚本 BLOCKED（未进入业务测试），保留 `evidence/final-gate-1/source-dirty-blocked*`；随后从干净启动树执行，未将其计为完整门禁。

## 原始与修复后真实结果

| 运行 | SHA | 状态 | suites | declared cases | direct API | 静态边界违规 | 未登记事件 | 动态待审 |
|---|---|---|---:|---:|---:|---:|---:|---:|
| 原始 | 9c47e44f | FAIL（业务测试前 AM CHECK 失败） | 未执行 | N/A | N/A | N/A | N/A | N/A |
| 早期修复 gate2 | 2ee86572 | FAIL | 112/144 PASS，32 FAIL | 336/448 | 92/309 | 0 | 0 | 66 |
| 最终 gate 1 | a58efa90 | FAIL | 119/144 PASS，25 FAIL | 364/448 | 101/309 | 0 | 0 | 66 |
| 最终 gate 2 | a58efa90 | FAIL | 119/144 PASS，25 FAIL | 364/448 | 101/309 | 0 | 0 | 66 |

每轮完整原始输出：[`final-gate-1`](evidence/final-gate-1/run.log)、[`final-gate-2`](evidence/final-gate-2/run.log)，对应 `report.md/json` 和 console 均同目录保存。

### 最终仍 FAIL 的 suites

- `tests/ag-function-menu.browser.test.mjs` — 两轮均 FAIL。
- `tests/am/contracts-browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-block-chains-wp4.browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-block-chains-wp5.browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-pbs-absorbed-child-cover.browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-pbs-browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-pbs-child-reorder.browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-pbs-converter-integration.test.mjs` — 两轮均 FAIL。
- `tests/cmd-pdf-bbox-wp6.browser.test.mjs` — 两轮均 FAIL。
- `tests/cmd-source-block-labels.test.mjs` — 两轮均 FAIL。
- `tests/engineering-initialize-browser.test.mjs` — 两轮均 FAIL。
- `tests/illegal-break-rescan-real.browser.test.mjs` — 两轮均 FAIL。
- `tests/illegal-break-source-edit.browser.test.mjs` — 两轮均 FAIL。
- `tests/illegal-break-source-visible.browser.test.mjs` — 两轮均 FAIL。
- `tests/illegal-break.browser.test.mjs` — 两轮均 FAIL。
- `tests/pdf-block-drag-edge-scroll.browser.test.mjs` — 两轮均 FAIL。
- `tests/pdf-block-label-setting.browser.test.mjs` — 两轮均 FAIL。
- `tests/pdf-block-reorder.browser.test.mjs` — 两轮均 FAIL。
- `tests/pdf-child-region-select.browser.test.mjs` — 两轮均 FAIL。
- `tests/pdf-normal-webkit.browser.test.mjs` — 两轮均 FAIL。
- `tests/sentence.browser.test.mjs` — 两轮均 FAIL。
- `tests/shared-preview-browser.test.mjs` — 两轮均 FAIL。
- `tests/text-block-coverage.browser.test.mjs` — 两轮均 FAIL。
- `tests/text-block-review.browser.test.mjs` — 两轮均 FAIL。
- `tests/v6-initialize-cmd.test.mjs` — 两轮均 FAIL。

失败 suite 表示其声明 cases 未全部满足，不把 suite 数误算成失败 case 数；逐断言日志见各轮 `.v6/tests` 路径及 run.log。两轮失败列表完全相同。gate2 对照见 `report.json` 的 `comparison`。

**新增稳定失败/候选回归**：`pdf-block-label-setting`（rail 几何通过但缺 `p6b6s1` 标签）与 `shared-preview-browser`（Markdown 模式 PDF 按钮未收起）均由 gate2 PASS 变为两轮最终 FAIL；不得归类为 pre-existing 或环境问题。

### 相比 gate2 已改善的 suites

- `tests/cmd-block-chains.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/cmd-native-subblock-repair.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/cmd-pbs-parent-group-order.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/cmd-text-blocks.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/native-subblock-alignment.browser.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/pdf-block-join-toggle.browser.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/pdf-coverage-zoom-browser.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/pdf-subblock-annotation.browser.test.mjs`：gate2 FAIL，最终 gate1 PASS。
- `tests/preview-split-browser.test.mjs`：gate2 FAIL，最终 gate1 PASS。

## 修复范围与专项证据

五个修复提交、21 个文件的实际范围见 [`fix-report.md`](fix-report.md)。关键结果：

- converter 23/23 PASS；原 JSON bytes/OCR bbox 不变，伪造/缺失/重复 provenance fail closed。
- rail 224 个标签无 OCR overlap、无 label collision、无 off-page。
- canonical join 在 Chrome 和 Linux iPad-WebKit 仿真 PASS：224→223→224，其他页面 chip 0 mutation；BC 投影 mutation 测试有效。
- AM_CHECK 与静态边界 PASS；本轮曾引入的 Node-only 浏览器 import 回归已用共享浏览器原生 reader 消除。
- 专项日志（含成功与失败）位于 `evidence/targeted-probes/`，不得据局部日志推断完整门禁。

## 遗留 FAIL / BLOCKED 与分类

- **真实功能 FAIL**：上述最终失败 suites 保持 FAIL；AG/illegal-break、PDF drag/reorder、PBS undo/restore 等未因环境原因被豁免。未通过完整集成的 drop 三槽实验及 AG/helper WIP 未纳入 FIX_SHA。
- **原始 AM BLOCKED/FAIL**：原始 audit 在 registry SQLite CHECK 前终止，证据保留；后续完整门禁已实际执行业务测试，不再把此入口失败当作当前业务通过情况。
- **产品契约 REVIEW_REQUIRED**：固定源码的 `TEXT_BLOCKS_READ_ONLY` / `rejectTextBlockEdit` 撤下 join，但测试仍要求接续；`a58efa9` 恢复的是测试中的能力，主线须裁决是否授权恢复，不能因测试通过直接合并。
- **环境/平台 BLOCKED**：真实 macOS Safari、真实 iPad Safari 未运行；Linux WebKit 仿真不等效真实设备。native alignment 的 Linux WebKit picker 仍失败，Chrome 通过不能代替。
- **边界 REVIEW_REQUIRED**：动态/DOM/shared-store 调用点仍需人工核对；静态 0 违规不证明运行时全面解耦。直接 API 覆盖不等于 309 个 API 均独立验证。

详细保守分类见 [`evidence/CLASSIFICATION.md`](evidence/CLASSIFICATION.md)。

## SOURCE_MERGE / PRODUCTION_CUTOVER 建议

- **SOURCE_MERGE：HOLD，不作整分支通过性合并批准。** 主线可有选择地复核并吸收已证实的小修复，但必须先裁决 join/read-only 产品契约、核验真实 diff，并对合入后的新 Main 重做受影响测试与完整门禁。
- **PRODUCTION_CUTOVER：BLOCKED / HOLD。** 完整候选仍非全 PASS，且真实 macOS/iPad 平台未验收；不得部署或宣称生产就绪。
- 本报告是 Grok 的独立审计记录，不是修复者对自身改动的独立签字，也不是用户发布授权。

## 复现与证据索引

- [`fix-report.md`](fix-report.md)：逐项提交和未纳入实验。
- [`report.json`](report.json)：机器可读计数、完整失败列表与两轮差异。
- [`run.log`](run.log)：交付编排日志；完整标准执行日志在 final-gate 目录。
- [`evidence/REPRODUCE.md`](evidence/REPRODUCE.md)：环境、命令及隔离要求。
- [`evidence/original/`](evidence/original/)、[`evidence/post-fix-gate2/`](evidence/post-fix-gate2/)：不可改写的历史 FAIL。
- [`evidence/final-gate-1/`](evidence/final-gate-1/)、[`evidence/final-gate-2/`](evidence/final-gate-2/)：最终 SHA 的两次完整门禁。
