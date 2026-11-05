# OCR2MD V6 PDF 版面元素标定 — GPT-6 独立审计与修复报告

**AI_ID:** `internal` / GPT-6；**结论：FAIL（独立修复未取得全量认证）**。

## 1. 版本、运行环境和来源

| 字段 | 经真实命令核验的值 |
| --- | --- |
| `SOURCE_SHA` | `9c47e44f1fc6b44b4f126030d68008854aced6ca` |
| `FIX_SHA` | `47205a753bbdf257226568415a780cbea3dc83bb` |
| 统一任务书 | `audit/three-party-pdf-elements-9c47e44` HEAD `60cbb0825f09663ccc526c49b98a95a672ad02c2` |
| 匿名新克隆审计包 | `audit-public-pdf-elements-9c47e44` HEAD `a1c9c57f887523084b8eafe5b2f5568902826bc2`，直接父提交是固定源码 |
| 原始 PDF SHA256 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`，匹配 |
| MinerU Markdown SHA256 | `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764`，匹配 |
| Mac | macOS 27.2 ARM64 / Apple Silicon，Node 23.11.0，Python 3.13.3，Git 2.54.0 |
| Linux 全量 | **BLOCKED / 未执行**，不能宣称跨平台完全通过 |
| 浏览器 | Mac Playwright Chromium / WebKit 的标准测试脚本参与执行；失败脚本可能在进入第二浏览器前中止，不能宣称 143 套件都对两个内核完成验证。未使用真实 iPad 硬件。 |

## 2. 原始 `SOURCE_SHA` 失败证据（不可覆盖）

从公开审计包的**匿名全新 Git clone**实际运行 `bash audit.sh`：固定 SHA 检出、两个证据夹具哈希、80 端口预检、依赖安装与 Vite build 已真实通过；然后 AM SQLite 建库在 `tests/am/registry.sql:1543` 的 `visibility='callback'` 处违反现有 `CHECK(visibility IN ('export','returned','internal','raw'))`。原始脚本退出码 **1**。紧接着原有标准报告器 `audit_boundaries.load_registry` 又因同一约束抛出异常，因此原始运行的官方 `report.json/report.md` **不存在**；禁止补造、禁止把修复后报告误称为原始 PASS。

独立只读 RAM SQL 调查（未在真实门禁中跳过约束）进一步发现其他非法值 `constructor-callback`、`module-port`、`re-export` 以及重复 `C63/C64/C65` 三个 API ID；Git blame 对应数据追加见 `d1bae67c`（2026-11-04）和 `2c08e7c3`（2026-11-04）。全部原始标准输出及哈希保存在 [`original/`](./original/)。

**原始状态：`FAIL`，尚无已执行的 AM 全量用例成绩。**

## 3. 独立修复和差异

从**固定源码**独立创建 `fix/internal-pdf-elements-9c47e44`，提交 `47205a753bbdf257226568415a780cbea3dc83bb`；修改范围只有：

1. `tests/am/registry.sql`：将已存在、真正公开的返回值/构造参数/纯函数标为已允许的 API 可见性；为三个新增同名冲突 API 分配不占用的稳定 ID，保留旧行及所有测试；修订真实调用方向及源码针点；移除六条已不再存在的调用边（保留 API 和相关测试）；登记真实跨模块读/规划接口、PDF 设置订阅、CM6 `focusTarget`/`documentRevision` 观察及对应测试关联。
2. `tests/am/ownership.json`：逐个识别 16 个未归属 UI 源码文件，登记实际 Owner / 纯共享组件使用者，并与真实公开 API/边对应；没有给任意未实现函数放行。
3. `tests/am/test_am.py`：将 `focusTarget` 的精确订阅者集合从真实旧 10 项扩展为**含实际存在的第 11 项**（`cm6-source-visibility.js`）；仍然使用相等断言，没有改成宽松下限。

未修改 `schema.sql`、六模块生产业务源码、冻结 SHA、原始 PDF/JSON、用户文件、`main` 或部署。没有从 Grok/Muse/internal 其他修复分支复制代码；修复本身只解决第一道 AM catalog gate，**不能据此证明功能修复完毕**。

## 4. 修复后标准全量实测（精确到 `FIX_SHA`）

执行 `bash tests/am/run-standard-audit.sh 47205a753bbdf257226568415a780cbea3dc83bb`，使用新隔离工作树与标准报告目录。**真实退出码 1**，报告 `status=FAIL`，检出 SHA 等于 FIX SHA，源码工作树干净。

| 检查项 | 修复后结果 |
| --- | --- |
| `am.py build` / `am.py check` | **PASS**：12 模块、310 API、14 消息、20 publisher、39 subscription、450 关联用例 |
| 静态所有权/绑定 | **PASS**：102 个 UI JS 文件、62 个跨模块 import、0 项扫描所得静态违规 |
| Python AM 单元测试 | **43 项运行：42 PASS、1 SKIP** |
| Mac 全量 AM `run-all` | **FAIL**：143 套件已启动并得到结果，117 PASS、26 FAIL；关联用例 **343/450 PASS** |
| API 直接通过证据 | **92/310**；剩余 218 不具有独立直接 PASS 证据 |
| 动态间接调用复核 | **66 个调用位置待人工核实**，静态 PASS 不等于运行时边界认证 |
| 标准 `certify` | **未取得 PASS**；全量 `run-all` 非零，整体报告 FAIL |
| Linux 全量 / 真实 iPad | 未执行，不得表述为通过 |

具体 26 套失败项目及各自真实日志在 [`postfix/47205a7.../suite-index.csv`](./postfix/47205a753bbdf257226568415a780cbea3dc83bb/suite-index.csv)、[`failed-suites/`](./postfix/47205a753bbdf257226568415a780cbea3dc83bb/failed-suites/)，全部 143 套原始日志保存在 `all-143-suite-logs.tar.gz`；官方报告及输出在 [`standard/`](./postfix/47205a753bbdf257226568415a780cbea3dc83bb/standard/)，每份证据 SHA256 见 `evidence-sha256.txt`。所有失败都保留并计为失败，无断言豁免。

**单独精确重测：** 同一个 FIX SHA 工作树中，`cmd-block-chains.test.mjs` **EXIT 1**（`Missing sealed MinerU source`），`cmd-pbs-converter-integration.test.mjs` **EXIT 1**（assertion），`pdf-source-locations.test.mjs` 和 `illegal-break-pair.test.mjs` 各 **EXIT 0**。这些单独重测不能将全量失败冲销。

## 5. 未修复问题、风险和 Git 归因

- **P1 / CMD 来源契约：** 历史/旧 Markdown 测试送入 `readCMDBlockChains` 后在 `ui/cmd-pbs-locations.js:13` 因未找到密封 MinerU 来源拒绝继续；但其中是否存在应该兼容旧文档的产品缺陷、还是必须更新的 fixture，**待上游定义、保留失败**。`cmd-block-chains.test.mjs` 已独立重现。
- **P1 / PDF-CMD 三窗与块链：** 多个测试对父子重排、拖拽落点、跨页归并、PDF 覆盖和 PDF bbox 编写的期望与冻结版本不一致，部分测试请求的编辑在该里程碑由 `rejectTextBlockEdit` 明确阻止。旧接口登记已清理，但业务语义与测试合同需要逐项核对；不得在没有决策时重新开启受限制写入。
- **P1 / 非法断行与审阅：** `illegal-break.browser.test.mjs`、`illegal-break-rescan-real.browser.test.mjs` 超时；`illegal-break-source-edit.browser.test.mjs` 报当前块 ID 为 null，尚无修复后 PASS。
- **P2 / 测试/发布夹具：** `engineering-initialize-browser.test.mjs` 报 `.v6/release/index.html` 不存在；其他失败包含 UI 文案、块数、定位断言与现状不符。发布物缺失是测试环境约束，不能以新增用户生产数据或伪造通过掩盖。
- **REVIEW_REQUIRED / 动态边界：** 静态 0 违规只代表扫描覆盖面，66 个共享状态/DOM 位置缺少全量人工链路证明，尤其 PDF→CMD→AG 由只读投影转为编辑动作的路径。

部分问题可能存在**多个源头**，目前无法给出所有业务失败的唯一根因和安全修复。保存上述真实失败供集成者独立判断，不能将它们标为已解决。

## 6. 两道独立门禁与交付

- **`SOURCE_MERGE = FAIL`**：即使 catalog 修复有局部价值，修复分支上的完整标准 AM/Git 仍失败。集成者可以选择性评审、提取已验证的元数据修复，但**不能把整个分支直接作为认证通过的 Main 合并依据**。
- **`PRODUCTION_CUTOVER = FAIL`**：26 套 Mac 失败，Linux 全量和真实 iPad 未验证，运行时 66 项未审阅；不可生产晋升。

这份报告是**独立审计者的证据与判断，不是对自身修复的第三方签字**。下一步由集成负责人比较 Internal/Grok/Muse 原始证据与修复，去重、解决冲突，在新的集成 SHA 全量重审。Main 未修改，公开审计包及固定源码快照未修改，没有 force/rebase/reset/clean。
