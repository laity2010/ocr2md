# 修复说明（fix/muse-75e05598）

- 修复提交：`dfe1a05e5078ae2998ba405f22d9a89f074aad82`（本地分支 `fix/muse-75e05598`，基底为冻结 SHA `75e055988df73d3d3899036f6a62ce1e851f2d15`）
- 交付形式：`fix-muse-75e05598.patch`（format-patch 序列，随报告同分支交付）。在冻结 SHA 上 `git am` 可复现修复树（冻结 tree `71b170d733d6d7dcfbbca5dcdc683a999a4b224e` → 修复 tree `c2919a8f4cfd68f530a371a783971b9b7141658d`）。
- 变更范围：仅 `tests/am/registry.sql` 与 `tests/am/ownership.json` 两个登记文件。**零产品代码改动、零测试脚本改动、零断言削弱**（无期望值放宽、无超时放大、无用例删除）。
- 通道限制（如实说明）：GitHub 连接器 push-files 只能在仓库默认分支基底上创建分支且无 create-ref-at-SHA 工具，故修复无法直推为位于冻结 SHA 的 `fix/muse-75e05598` 远端分支，以补丁序列交付；本地分支完整保留。

## 逐项修复（与 report.md 甲簇编号对应）

### F-A1 文件归属（ownership.json）
按「导入方 + 功能 + 登记惯例」归属 10 个文件，并在 crossModuleBindings 补 `workspace.js->text-block-module.js: [createTextBlockModule]`（其余 11 个同类模块挂载均有此绑定）：
- → C（CMD）：cmd-block-continuations.js、cmd-block-joins.js、cmd-pdf-text-insert.js、cmd-text-blocks.js（导入方为 cm-document.js / wcp-cmd-element-transactions.js，均属 C；仅 import shared 的 mineru-anchors）
- → P（PDF）：pdf-block-text-extract.js、pdf-gutter-label-layout.js、pdf-region-hit.js、pdf-source-locations.js（导入方 pdf-preview.js 属 P）
- → G（AG）：text-block-module.js（登记 API G25/G28 属 G；workspace 以工厂模式挂载，与 spellcheck/illegal-break 同型）
- → L（Layout）：text-block-preview-coverage.js（仅被 workspace.js 引用、对渲染后 MD 投影做只读覆盖透镜，与 scroll-sync.js 同型）

### F-A2 幻影 API G28（registry.sql）
删除 API 行 G28 与其边 X-WP4-G28。依据：模块冻结返回对象（text-block-module.js:202 起 Object.freeze）共 10 个方法，无 `reviewActions` 成员；该边的调用表达式 `createTextBlockModule(this.textBlockHost` 与 G25 的挂载边 X-TEXTBLOCK-G25 完全重复。曾考虑改符号为工厂名，但与 G25 撞唯一约束（module,symbol,file）——实测 sqlite UNIQUE 冲突，证明该面已被登记。其 3 条用例按实际驱动面改挂：TC-WP4-G28→G25、TC-TEXTBLOCK-AG-FUNCTIONS-G28→G25（审阅动作属模块门面）、TC-TEXTBLOCK-COVERAGE-OVERLAY-G28→G26（覆盖透镜面）。

### F-A3 过期边（registry.sql）
- X-TEXTBLOCK-L48：调用方 ui/main.js → ui/cm-document.js（调用者模块 NULL→C，表达式 `inspectCMDTextBlocks(source)` 与 cm-document.js:48 逐字一致）；新增 X-TEXTBLOCK2-L48 登记第二个真实调用点 ui/wcp-cmd-element-transactions.js:74。
- X-TEXTBLOCK-L49：表达式 `currentPreview.pdf?.focusBlock(point.pageIndex` → `this.pdf?.focusBlock(pageIndex`（workspace.js:404 现行代码）。

### F-A4 散文 fixture（registry.sql）
TC-PDF-TEXT-P17、TC-PDF-GUTTER-P19 的 fixture 改为各自脚本路径。依据：两脚本数据全内联合成（逐行核验零文件读取）；登记表既有同类先例 TC-SENT-* 诸行即以脚本自身为 fixture。

### F-A5 API 测试行（registry.sql）
新增 TC-PDF-TEXT-P16（→P16）、TC-PDF-TEXT-L61（→L61），均指向既有套件 tests/pdf-text-extract-insert.browser.test.mjs。依据：该套件点击真实 PDF 插入按钮（其处理链即 pdf-preview.js:178 `prepareSelectedPDFText`，按钮绑定在 :135）并经 main.js:741 `workspace.setPDFTextInsertAction(...)` 注入的 CMD 动作完成插入，断言一次 Undo 全字节还原——P16/L61 正是这条链的两端。

### F-A6 E14 事件链测试行（registry.sql）
新增 TC-E14（→消息 E14）、TC-PUB-W15（→发布方）、TC-SUB-W19（→订阅方），均指向既有套件 tests/chapter-live-navigation.browser.test.mjs。依据：该套件头部注释与断言即为此链（标题勾选提交标记 → `ocr2md:chapter-boundary-changed` → 源码章节导航同步重建）。三行置于 E14/PUB-W15/SUB-W19 定义之后以满足外键顺序（首版置于定义前曾触发 FOREIGN KEY 失败，已修正并记录于此）。

## 回归证据（修复树）

- `am.py build`：**AM_REFERENCES_PASS**（244 个 API 行及全部源/测试路径）。
- Python 门禁：**37/37 OK**（冻结树为 3 FAIL + 1 ERROR）。
- 边界扫描：82 文件 / 12 模块 / 43 跨模块导入（新增 1 条即补登的挂载绑定），**issues=[]**。
- 登记规模（修复后）：[12 模块 / 244 API / 14 消息 / 20 发布 / 30 订阅 / 345 契约 / 167 边]；四表 test-row 覆盖全部对齐（apis/messages/publishers/subscriptions 无缺行）。
- 行为面：官方标准跑（runner 于 68/91 处总超时截断，后半程另受沙箱写故障污染）+ 干净复跑 38 套合并：**77/91 通过、14 失败**，失败全部为 report.md 乙簇产品行为问题（与登记无关——补丁不触产品代码，冻结树同集合失败签名一致）。修复树因此**未获 CERTIFIED**，本审计不自签。
- 修复未引入的行为变化：补丁仅含登记文件，`git diff 75e05598..dfe1a05 --stat` 为 2 文件 +33/−14 行。

## 残余风险

- G28 的删除使 API 总数 245→244：若主线另有外部文档引用 G28 编号，需同步更新（登记内部引用已全量核查：除被改挂的 3 条用例外无其他引用）。
- L48/L49 的模块字母与源文件领地不一致（观察项）未在本补丁处理，避免改号波及用例引用；见 report.md。
