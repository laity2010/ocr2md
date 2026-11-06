# OCR2MD V6 PDF 版面元素独立内审修复 — Round 11

**审计判定：专项修复通过，整体 AM/Git 仍 NOT CERTIFIED。** 这是一份可追溯的阶段修复报告，不是 143 套标准审计通过证书。

## 固定审计范围、分支与源 SHA

- 最初三方统一受审冻结源码：`9c47e44f1fc6b44b4f126030d68008854aced6ca`（不变）。
- 本轮继承 R10 协调修复 `216520a86e546ccc38e46e545e801cee06137cef`，只在独立 worktree `fix/internal-pdf-elements-9c47e44-r11-gates` 修复。
- **本轮已提交且已验证远端的新源码 SHA**：`c7b9f65ee9e4aa6487ebefc6d7e7bb672970da79`。两个本轮源提交：`407c720b5a4c167c219ec1338c6996ec91fea2e0`（禁止隐式 checkbox 写入的真实测试契约）以及 `c7b9f65ee9e4aa6487ebefc6d7e7bb672970da79`（真实 CMD 来源逆转换修复、三套遗留浏览器门禁及 AM 描述核对）。
- 原始 OCR PDF `SHA256=be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`；MinerU MD fixture `SHA256=d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764`。所有浏览器用测试隔离文件和本地页面；未写用户文档。
- 远端 Main 在推送 R11 时仍为 `25f17decbb976cad8c2790ae97482bf389f6e34a`；没有合并 Main、没有部署主线，也没有推正式发布引用。无 reset/rebase/force push。

## 已证实的生产缺陷及源码修复

**问题**：父块 A 执行 PDF「之前／之后」插入，通过 `planCMDInsertPBSParentAt` 写入真实 CM6 后，位置映射保存在页脚 `<!-- cmd:pbs-locations:v1 ... -->`；原始 OCR 的最后一块可能因编号顺延而显示逻辑编号 `p16b16`，超出原始物理 16 块编号范围。旧 `packages/minerujson-md/src/index.ts` 的 `toMineruJSON` 逆转换仅处理部分 inline `origin=` 情形，不读取已提交的 CMD 物理位置页脚，报 `MINERUJSON_MD_INVALID: page-local reordered PBS must preserve every original OCR block`。这是真实的操作之后无法无损回转错误，不是测试超时。

**修复**：逆转换只在内存中的校验副本解析唯一 `cmd:pbs-locations:v1`，严格检查 schema、当前 PBS ID、来源格式、重复/缺失、body/removed 列表和原有 inline 值冲突，将来源绑定临时投影为 `origin=`，继续执行原来**未削弱**的 OCR 密封来源 SHA/完整原始块集合/子块、页边界、正文匹配与无损反向检查；用户 CM6 Markdown 与原始 MinerU JSON 不因此改写。真实测试要求 `p16b0` 插至 `p16b8` 之后，移动块逻辑 ID 为 `p16b9`，原物理 `p16b15` 归到逻辑 `p16b16`，然后 `toMineruJSON()` 与原始 JSON **byte-exact**；篡改为不存在的来源、重复来源、重复 sidecar 必须 FAIL。正/反测试真实通过。

## 原始剩余三套历史失败：真实 Chrome 和 WebKit 专项回归

| 套件 | 本轮专项结果 | 验证内容与边界 |
|---|---|---|
| `pdf-block-join-toggle.browser.test.mjs` | **Chrome PASS / iPad-WebKit PASS** | 保留 224 原始父块控制、图表/表格原生 caption/body/note 边框、无伪造 Notes、标签单行且不与正文/其他标签重叠；原始复选框当前是**隐藏、禁用、全选**，p6b7、空白 p2b8、跨页 p9b0 的单击和三击**不得自动接续/改号/改源码/写磁盘**。旧版可三击自动合并断言与冻结只读里程碑冲突，已用真实禁止写入断言代替；旧 C57 writer **NOT EXERCISED**。 |
| `pdf-block-reorder.browser.test.mjs` | **Chrome PASS（两种落点）/ iPad-WebKit PASS（两种落点）** | 实际 PDF 物理覆盖框命中并出现三槽落点，父块 `p1b3` 插至 `p1b5` **之后**，`p1b5` 插至 `p1b3` **之前**；picker 宽度固定 155px、完整父子组及 OCR bbox 保持、CM6 仅一次可 Undo 编辑，禁止 autosave，逆转换原始 JSON 一致。不再错误地将页边小标签坐标当落点。 |
| `pdf-block-drag-edge-scroll.browser.test.mjs` | **Chrome PASS（上下）/ iPad-WebKit PASS（上下）** | 第 17 页 `p16b0` 向下滚动并命中 `p16b8` 的真实覆盖框、选择**之后**，反向 `p16b8` 向上滚动命中 `p16b0` 选择**之前**；端点初始在可见窗外，实际连续滚动大于 40px 后命中，提交单一 CMD 事务、来源绑定、字节级逆转换、一次 Undo、零 autosave。旧“标签附近即落点／三击接续”不在此门禁中。 |

**不得误称**原有三项旧测试文本原封不动 PASS：它们此前断言了与固定只读设计冲突的旧写入路径。本轮以正向实际浏览器手势、不可变 OCR 约束以及“不自动写入”的真实负向行为替换过时预期，并在 `tests/am/registry.sql` 明示没有执行的历史可写接口。没有删除 AM 边界限制、放宽架构守卫或删掉逆转换断言。

## 构建、数据测试、AM 及运行时证据

- `npm --prefix packages/minerujson-md test`：**23 PASS，0 FAIL**。
- `npm --prefix packages/minerujson-md run build`、`npm run build`：**PASS**（Vite 构建有已知大 chunk 警告，不是构建失败）。
- `node tests/cmd-pbs-insert-after.test.mjs`：**PASS**，包含逻辑 `b16` 原生来源、伪造来源/重复绑定和多份 footer 的严格 FAIL 断言。
- `python3 tests/am/am.py build` + `check`：**PASS**，12 模块、311 APIs、452 登记测试、0 已登记静态违规；**这不包含 66 个待动态核查的运行时候选调用点**。
- Python AM `python3 -m unittest discover -s tests/am -p 'test_*.py'`：**43 执行，42 PASS、1 SKIP**。
- `git fsck --full --no-reflogs`：**PASS**；R11 修复 worktree clean；远端 fix 分支已普通 push 且 SHA 核对一致。
- `pdf-child-region-select.browser.test.mjs`：曾在 R10 归档 WebKit 复测发现第 650 行跨页跳转显示上一子块 p3b0s1 状态的间歇问题。R11 为焦点事件与 PDF 状态安装**仅测试时**的诊断轨迹，没有修改生产逻辑或减弱严格状态断言；R11 在 Chromium 和 WebKit **6 次连续双引擎专项 PASS**（原始日志 `child-r11-stress-1..6.log`）。这并不证明原间歇竞态已经被根除；该疑点留作单独的复现/运行时审阅项。

## 判定范围与 OPEN 项目

先前 26 个原始历史失败套件中，至 R10 有跨多轮来源的 23 项专项 PASS，本轮三套在同一 R11 源上双引擎专项 PASS；因此**26/26 个历史失败名称现在均曾获得对应专项 PASS 证据**，但其中若干是根据现行合同重建的严格测试，**不是完整 143 套在同一 SHA 下的认证**。原始 FAIL 与所有本轮中间 FAIL 没有被抹除。

- **R11 固定 SHA 的正式全部 143 套标准 `bash tests/am/run-standard-audit.sh <SHA>` 尚未运行完成，最终 AM/Git 认证仍 FAIL/BLOCKED（NOT CERTIFIED）**；旧 R9-child 标准 runner 在第 47 套开始前止步，45 PASS、1 FAIL，已完整归档“未完成”状态，不能引用为 R11 结果。
- **66 处动态 runtime cross-module site 候选**仍需独立所有权及实际消息/API 可用性核对。静态 AM 0 不等于动态跨模块 0。
- Linux (Grok/Muse 可移植环境) 全量，以及**真实 iPad Safari 实机**手指操作/滚动/Undo 未在本机通过；WebKit 自动化不是物理 iPad。
- 上述 WebKit 子块定位偶发旧状态风险需排除，与 Chromium/WebKit 连续 6 次 PASS 并列保留。
- `SOURCE_MERGE=NO`，`MAIN_DEPLOY=NO`，`PRODUCTION_CUTOVER=NO`，`AUDIT_VERDICT=NOT_CERTIFIED`。

## 原始证据与哈希

R11 目录：`audit-reports/internal-pdf-elements-9c47e44/round11-c7b9f65ee9e4aa6487ebefc6d7e7bb672970da79/logs/`。共 **42 份真实控制台原始日志**（旧失败、中间诊断、最终两浏览器 PASS、MinerU/AM/Vite、六轮双浏览器子块测试）；`evidence-sha256.txt` 全部 `shasum -a 256 -c` 验证 PASS。R2–R10 的独立失败和成果分别仍在各历史报告目录，互不覆盖。**不得只保留 PASS 或用新日志覆盖原失败。**
