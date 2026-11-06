# 修复说明 · fix/muse-pdf-elements-9c47e44

修复提交：`cad121e76e1f4e0ad613b3c1954d68c0fceed20c`（父 = 冻结 `9c47e44f1fc6b44b4f126030d68008854aced6ca`）
范围：仅 `tests/am/registry.sql` + `tests/am/ownership.json`（+172/−37）。零产品代码、零测试脚本、零断言、零 Schema 变更。
冻结树 `5a718cc41a2a45b787b0f366e255a6520cf9788b` → 修复树 `cad44a99ae37974e52f80ef0eb124f040e20926c`。
交付形式：`fix-muse-pdf-elements-9c47e44.patch`（format-patch），在冻结 SHA 上 `git am` 复现同一树。

## 逐项修复（与 report.md 的 F-A 编号对应）

- **F-A1 visibility 枚举**：按代码事实与登记先例改回枚举值——P23/P25（PdfPreview 构造注入、存为实例成员的回调）→ `returned`（先例 W04–W06 的 returned.on* 回调）；L83（Shell 交予消费者的 modulePort 成员）→ `returned`；L84（导出工厂 `createWorkspace` 的签名参数）→ `export`；G32（文件内字面 re-export 语句）→ `export`。未改 Schema、未扩枚举。
- **F-A2 编号重复**：第一组（planCMDSubblockAnnotations / markOriginalSubblocks / queryBlockChains）保留 C63/C64/C65；后登记的链引擎三 API 改号 C125/C126/C127，其边（X-FOCUS-*）与用例（TC-FOCUS-*）按脚本归属同步迁移。
- **F-A3 幻影 G34**：删除 API 行；其唯一用例 TC-BREAK-REVIEW-G34 改挂模块门面 G20（`createIllegalBreakModule`）——该套件测的正是门面呈现的审阅下拉（内部由已登记的共享渲染器 G35 实例化）。与 75e05598 的 G28 处置同型。
- **F-A4 过期边**：15 条按当前源码逐字改针（如 `markIllegalBreakCandidates(issues,source)` → `(marking,source)`、`planCMDPDFBBoxEdit(...,memberId,...)` → `(...,identity.origin,...)`、PdfPreview 构造针改为实际的 `pageNumber=>…` / `(message,kind)=>reportMediaStatus…` 段）；X-PDF-TEXT-STATUS-P25 的 caller/target 由 (P,L) 改正为 (L,P)。6 条指向已被只读基线（`0802ea2`）撤销的接线（Shell 直调 cmdPort.setBlockJoin / moveBlockAfter / moveBlockBefore / markOriginalSubblocks / setPDFBBox，以及 pdf-preview 直调 layoutPDFGutterLabels）的边予以删除——调用已不存在，保留即虚假登记；相应 API 本体与测试行不动。
- **F-A5 归属补全**：16 个文件按 registry 内 API 行的模块声明与导入关系归属（链家族 cmd-pbs-* → L；PDF 拖放/手势/标签设置 → P；非法断行 pair → G、md-pair → M、annotation-update → L、cmd-illegal-break-review / cmd-native-subblock-repair → C；ag-stable-select-renderer 与 text-block-readonly → shared 并登记 sharedConsumers）。
- **F-A6 登记补全**：新增 12 个 API 行（链计划器 L88–L94、parseCMDPBSId、sortCMDPBSRows L95、compareCMDPBSIds L97、rebaseIllegalBreakRowsInPlace L96、keyIllegalBreakReviewRows C128、layoutPDFEdgeRails P42、registerPDFBlockLabelScaleSetting P43），每个都附真实套件的 TC 行（逐个核对过套件确有导入/驱动）；新增/订正 20+ 条边（含满足 `test_binding_registry` 的逐符号边：每个白名单符号都有同文件 API + 调用方模块的已登记边）；新增订阅 SUB-P01（PDF 标签设置，settings）与 SUB-VIS-01（可见性守卫，E01）；为 L80/L85 补真实集成套件链接。
- **F-A7 模块统一**：C120/C125/C126 的 module_id 由 C 改 L（编号不变），其边 target_module 同步改 L，与文件归属及其同文件 L66–L76 先例一致。

## 取舍记录（供集成复核）

- 可见性守卫的 viewStore 订阅只登记 E01：其单个 `subscribe` 同时以 documentRevision 与 focusTarget 变化为调度触发；冻结门禁对 E03 接收者有精确十元集合断言，登记 E03 行将与该冻结契约冲突。订阅文件本身已被另一门禁（订阅者清单）经 E01 行覆盖。此为两条冻结门禁之间的口径取舍，已在 report.md F-C 明示。
- L85 的 TC 链接到 L86 守卫的既有套件（illegal-break-source-edit.browser）：该套件的核心断言即 CM6 跨模块切换后保持可见绘制，守卫的 inspect() 在其中真实运行。无专属套件这一事实本身已在报告中记录。

## 修复后验证（修复树实测）

| 检查 | 结果 |
| --- | --- |
| `am.py build` | `AM_BUILD_PASS [12, 311, 14, 20, 39, 452]` |
| `am.py` 引用核验 | `AM_REFERENCES_PASS`（311 API 行及全部源/测试路径） |
| Python 门禁（tests/am/test_*.py，43 项） | **OK（43/43）** |
| 边界扫描（audit_boundaries.scan_files） | 102 文件 / 12 模块 / 65 跨模块导入，**issues = []** |
| `am.py coverage` | 311 API 全链接；发布 20/20、订阅 39/39、消息 14 链接（E07 无订阅者为常设观察项） |
| `am.py edges debt` | 无债务（no results） |
| `run-standard-audit.sh <FIX_SHA>` | AM_CHECK_PASS；run-all 首跑 93/142 被沙箱写故障截断，余数以同环境补跑合并：**110/142 套件 PASS**；`AM_FULL_RESULT`/certify 因 32 个行为失败不存在——修复树未认证（见 report.md F-B） |

回归保护：本修复未删任何测试行所指套件、未改任何断言/期望/超时；被删的仅是幻影 API 行 1、虚假边 6；被改挂的用例 4（TC-BREAK-REVIEW-G34→G20，TC-FOCUS-* 随编号迁移）。
