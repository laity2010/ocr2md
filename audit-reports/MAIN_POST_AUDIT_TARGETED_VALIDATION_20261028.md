# OCR2MD V6 · Main 实际全回归失败后的针对性修复与证据 · 2026-10-28

## 可信状态

原完整基线 `fbb08bf52e971982794d1a24b110885671ce93b4` 的 `tests/am/am.py run-all` 真实执行 31/31 套，10 PASS、21 FAIL；只有 35/167 AM 登记关联项取得本轮 PASS，`certify` FAIL。原始证据保留在 `audit-reports/MAIN_FBB08BF_FULL_REAUDIT_20261028.md` 和本机 ignored `.v6/tests/am-full-20261028T004018Z-fbb08bf5-*.log`。**绝不将这个基线冒认为已完成全量认证**。

本次针对性修复与验证不是在旧生产发布目录上运行：开发 Main 提交 `989a73a965734b2931a729a6c7f1176391644119` 经真实 `npm run build` 形成隔离 `dist/`，未发布根入口。该提交以前的 WCP 登记修复为 `c63b85b`，独立章节列的实际业务缺陷修复为 `c460c9e`。紧凑布局测试修订 `2e5d118`、引用/缩进测试修订 `791e536` 均为单独提交；随后 WebKit 媒体虚拟列测试修订 `eeaf9020b4ba661797eddd29ae3276904b7df4e9`。

## 实际修复而非更改标准

1. 新版 AG 虚拟章节过滤 `ui/virtual-ag-query.js` 曾同时删除 `independent` 和废弃 `chapterFile`，导致「独立成章」复选框无故消失。修复后仍去除**物理导出**，但保留可编辑的 `independent`；在 `tests/wcp-virtual-event-contract.browser.test.mjs` 的 Chrome+iPad WebKit 检查确实有这个列和 checkbox，没有物理导出列，且真实 AG 行点击可以跨虚拟章节定位。
2. 新 `tests/navigation-ui.test-helper.mjs` 仅用用户实际能操作的 Tom Select 文件、文档元素及预览下拉做浏览器回归，替换原先指向隐藏系统 `<select>` 的 50 处操作。**未删除原业务断言**；原设置表的注册项增加为导航字号，测试必须实际选择所需 CM 字号记录，不假定第一行、默认激活或固定只有两项。
3. AG Grid 在 iPad WebKit 横向滚动时会卸载屏外列；媒体「采用」检查先滚动实际 AG 水平视口，再坚持验证 1 项未采用 / 12 项已采用、过滤器、Undo/Redo 和保存重开。修复只改测试交互时序，没有绕过媒体下载安全验证。
4. WCP 四种活跃 DOM 消息 E10–E13 已登记，`tests/wcp-virtual-event-contract.browser.test.mjs` 从隔离 Main 启动环境监听真实 `lab-virtual-select`、`lab-virtual-open`、`wp3-ag-ready`、`wp4-virtual-scope`，检查有效跨章行点击、不暴露 AG 原始对象、无 API 写入。当前 AM 有 9 模块/122 API/13 消息/19 发布/24 订阅/181 登记关联项。旧未登记状态已在 Main 修复，但跨平台/外部独立签字仍需完成。

## 逐项真实回归（未运行过的不得标通过）

| 套件 / 证据 | 实际执行 | 结论 |
|---|---|---|
| `tests/wcp-virtual-event-contract.browser.test.mjs` | Chrome + iPad WebKit；章间 AG 行实际点击，4 个消息计数、无页面错误或写入 | **PASS ×2** |
| `tests/v6-lab-mirror.browser.test.mjs` | 同一 `989a73a`，Main Chrome / Lab Chrome / Main iPad WebKit / Lab iPad WebKit；21 虚拟章节、全部切换、导航与 Settings、WCP 事件 | **PASS ×4** |
| `node scripts/v6_lab_parity_check.mjs cm-html` | 同一 Git SHA 两次标准构建，155 个实际模块路径和源码 SHA256 完全一致，指纹 `aa83d1b998c49b1d33fcf0b99773f3d72ef7f2d8df039cb0de36d851b7148793` | **PASS** |
| `tests/latex-normalize-browser.test.mjs` | Chrome + WebKit；8 项标定、6 显示/2 行内、保存重开、重复规范化不变 | **PASS ×2** |
| `tests/latex-browser.test.mjs` | Chrome + WebKit；49 公式、20 显示、22 推断、KaTeX、筛选、审阅、模块切换、恢复后的独立成章列 | **PASS ×2** |
| `tests/outline-title-scale-browser.test.mjs` | Chrome + WebKit；2×→0.2×→1.7×、字号/行高、Settings 保存重开 | **PASS ×2** |
| `tests/pdf-anchor-viewport-browser.test.mjs` | Chrome + WebKit；实际 PDF OCR 锚点可见和同步滚动 | **PASS ×2** |
| `tests/four-pane-pdf-browser.test.mjs` | Chrome + WebKit；22 页 PDF、旋转第 8/11 页、AG→PDF、PDF→AG、缩放、四逻辑视图 | **PASS ×2** |
| `tests/settings-browser.test.mjs` | Chromium + WebKit；设置 JSON / AG / CM6 / Slider、Undo/Redo、消息同步；**保存重开专门断言仅由 Chromium 脚本分支覆盖** | **PASS ×2（覆盖有区别）** |
| `tests/compact-shell-browser.test.mjs` | `V6_ONLY_CHROME=1`，源导航置于源码窗、顶栏布局/全局 Save Undo Redo | **Chrome PASS；WebKit 本轮未单独执行** |
| `tests/media-browser.test.mjs` | Chrome + WebKit，13 项媒体、512KiB 断点续传、采用/状态筛选、敏感地址拒绝、Undo/Redo、保存重开 | **PASS ×2** |
| `tests/wcp-cas-two-editor-regression.test.mjs` | 原始 `fbb08bf` 现代码隔离 fixture，Chromium + WebKit 两个授权编辑端：A 200、B 412、保留 B 草稿/Undo | **PASS ×2（前轮独立复验）** |

本机原始执行日志保留在 `/tmp/ocr2md-...-20261028.log` 系列和 `.v6/tests` ignored 目录。这些单套 PASS **不自动写成 AM run-all 全量 PASS**，且 `tests/am/am.py certify` 在 `989a73a` 和后续版本上尚无一套 181/181 的完整 PASS 记录。旧 Lab 多项实验测试的当前可复现性也未形成全面签字。

## 发布及数据保护

公网正式根 `/` 仍为 `v6-20261027-221615`，公网 Lab `/labs/cm-html/` 为 `v6-lab-cm-html-20261027-230238`；以上构建与浏览器测试没有进行生产 cutover，也没有替换托管 Lab 静态目录。Main 母 Markdown `.v6/workspace/buffetts-alpha.minerujson.md` SHA256 `c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19`，Main Settings `18fdc687751150f8f0c994c9889b36caf326c8e1482ddacededc6362e5c07c23`；Lab 母 Markdown `649c0de9ce82896ef2c7a04f4fea0cc79ade32d0657cc3ebc47cc9d9864ebe6f`，Lab Settings `365284a9e9578cd134e27362a09d3ce0df6caac0565bf1981d9cdefc9070b7fe`。本轮核对全部保持。

## 未关闭门禁

- **AM 完整套件尚未重跑取得全绿，certify 未通过。** `fbb08bf` 的 21 个 FAIL 已经有多项通过实际改进得到定向 PASS，但其余仍须逐一调查，不能统计成生产合格。
- 旧 Lab 约 35 项业务/跨平台测试仍需审查适用性与可重复执行证据，禁止因旧控件变化而盲目删除。
- 冻结独立审计统一 Prompt：`https://github.com/laity2010/ocr2md-independent-audit/issues/6`，审计源 `cbea9b61ab8400268894cf9f0e4ee32714ceab9c`；Grok/Muse 尚无这次的独立双签。后续提交必须以增量审计签字，不能冒用旧 SHA 结论。
- 本记录所列运行结果严格绑定所列已测 SHA；后续测试/源码提交、其他并行开发造成的 Git HEAD 前进均需另行校验。正式发布仍为 **NO**。
