# OCR2MD V6 — 内部独立修复 R10 协调验收（阶段性，非全量认证）

- **原始冻结受审 SHA**：`9c47e44f1fc6b44b4f126030d68008854aced6ca`，未修改。
- **R10 协调修复 SHA**：`216520a86e546ccc38e46e545e801cee06137cef`，工作分支 `fix/internal-pdf-elements-9c47e44-r10-coordination`。
- **来源**：对已独立落地的 R9 子块双向定位 `5b5acd4a3349d520b12b6220bf3b9892bc620f73` 与 R9 AG/同页 A/B 概览 `071058230ec2f50412399eb6c59391de1d44530b` 做一次常规 Git merge，形成两父提交，非 rebase/force/覆盖。没有修改 Main 和用户文档。
- **结论**：**PARTIAL PASS / FLAKY / NOT CERTIFIED**。原始 26 个失败套件中，跨轮次有 **23 个**取得过针对性回归通过证据；**3 个旧套件仍 OPEN**。R10 在归档复测时又重现了 PDF 子块 WebKit 偶发旧状态残留（详见下文），因此 23 项不代表稳定、同 SHA、同轮次的全量通过；不能据此宣称全量 AM/Git 通过。

## 合并后真实验证

1. `npm --prefix packages/minerujson-md run build` 与 `npm run build` 通过；构建环境 Node v23.11.0。
2. `python3 tests/am/am.py build` 与 `check` 通过：12 个模块、311 API、452 登记案例、0 已登记静态越界；Python AM 43 项运行、42 PASS、1 SKIP。单元测试诊断报告里的 runtime 候选 **66 项仍需人工/动态核验**。
3. `cmd-block-chains-wp5.browser.test.mjs`：Chromium + iPad-WebKit 均 PASS，AG 只读状态下不得显示失效的旧成员拖动手柄；链分组、展开/折叠为真实 UI 验证；移动、跨链、抽离、无效自拖改为纯 CMD 规划的正向约束。**这并不证明被关闭的旧 AG 拖动写入功能恢复**。PDF 专用结构手势另有独立测试边界。
4. `text-block-review.browser.test.mjs`：Chromium + iPad-WebKit 均 PASS；原始 224 父块、五组跨栏/跨页候选、A/B 双框同页可见、跨页聚焦、复核确认/否决/恢复、保存浏览器会话状态与重新加载、导出 JSON、零旧版 PDF map 请求、零样本磁盘写入。实际修复同页 PDF 双框概览与常规缩放锚点竞争，概览不应被旧的延迟恢复覆盖。
5. `pdf-child-region-select.browser.test.mjs`：第一次 Chromium + iPad-WebKit 运行均 PASS；归档第二次运行 Chromium PASS，**iPad-WebKit FAIL**（在 p4b0s0 期望源码第 650 行时，虽然同一测试的 overlay 和 focusTarget 已通过强校验，随后的 PDF status 却重现前一个 p3b0s1 的旧文字）。224 原始父框、43 原生子标签（42 具有效物理 bbox）、五个原生子块的 PDF→CM6 与 CM6→PDF 双向焦点对齐仅在成功运行得到证据；原始 MinerU JSON 字节级可逆、无隐式写入。必须保留两种结果，**WebKit 状态一致性尚未稳定通过**。

## 新发现：WebKit PDF 子块跨页状态竞态

- 第二次归档复跑原始 FAIL：`tests/pdf-child-region-select.browser.test.mjs:173`，`PDF p4b0s0 must identify the real source body line`，实际 `定位 p3b0s1 → PDF 原框 p3b0s1 · 第 4 页`，预期 `源码正文第 650 行`。第三次 **WebKit 单引擎复跑 PASS**，进一步证明状态不稳定，而非恒定的数据映射错误。**不得把首轮及第三轮 PASS 当成稳定认证**。根因待进一步确认：`PdfPreview.focusLine()` 对旧 source-focus 的显式状态更新与新的 PDF canvas click 状态可能存在重入/顺序冲突；不应只增大等待时间或删除状态断言。四份原始日志（包括 FAILED 一份、额外 WebKit PASS 一份）及 SHA256 已归档。

## 仍未解决

- `pdf-block-drag-edge-scroll.browser.test.mjs`：旧断言将拖动落点放在 PDF 侧栏标签而非原始 bbox；后续还含只读状态下不再允许的三击自动接续流程。需维持真实边缘自动滚动、命中原始覆盖框、落点「之前／之后」、Undo 与未保存数据不变的正向回归；不能只改超时或删测试。
- `pdf-block-join-toggle.browser.test.mjs`：旧跨页三击 checkbox 自动合并预期与明确只读复核契约冲突；需分别核验禁止隐式写入与被允许的显式归入/拆分。
- `pdf-block-reorder.browser.test.mjs`：旧测试用标签坐标当覆盖框目标，并依赖旧自动三击接续；需以真实 bbox/落点操作重建有意义的正向 Chromium/WebKit 回归。

## 审计边界与交付规则

- 本次 R10 **尚未完成其自身固定 SHA 的全部 143 套标准审计**。独立启动的较早 R9-child `5b5acd4` 标准审计不构成 R10 的认证；不能沿用别的 SHA 的 PASS。
- 仍待：66 个动态运行时调用点的 ownership 审计、Linux 实机整套复测、真实 iPad Safari 人工触控验收、最终 GitHub 远端 Main SHA 再确认。
- 修复仅位于独立协调工作树；`SOURCE_MERGE=NO`，`PRODUCTION_CUTOVER=NO`，`AUDIT_VERDICT=NOT_CERTIFIED`。
- 原始 FAIL 历史由 R2–R9 不可变日志与报告分支保存。R10 三个专项复测的原始控制台日志（包含 child-region **WebKit FAIL**）及 SHA256 放在 `round10-coordination-216520a86e546ccc38e46e545e801cee06137cef/logs/`，详见 manifest。不可将 PDF 子块归档复测失败标记为 PASS。
