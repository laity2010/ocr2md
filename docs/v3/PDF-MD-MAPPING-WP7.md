# PDF ↔ Markdown 元素关联 · WP7/8 人工审核与关联校正（2026-10-08）

状态：WP7 实施完成，自动验收结果见下；**人工审核仍待用户目视操作**。WP8 进行多端最终验收。

## 决策：区分来源事实与人工判断

- **不修改** WP4 `.ocr2md/pdf-md-map.v1.json` 的 224 条自动匹配与候选状态。其 `manuallyVerified=false` 保留，不假装 OCR 证据已经审阅。
- **新增** `.ocr2md/pdf-md-review.v1.json`，只在用户点击「保存审核」时通过 WorkspaceFS 单文件 CAS 创建/替换。文件结构 `kind=ocr2md/pdf-md-review`、`schemaVersion=1`、`workspaceId`、`mappingSha256`、`decisions[]`。每条决策包括 `elementId`、审核状态、说明、更新时间；「已校正」必须携带所选 Markdown 文件的 `path+sha256+UTF-16 [from,to)`。
- 唯一文件写入由 macOS `NSFileCoordinator`、已知 revision、原子替换、回读校验保护。已有 Sidecar、PDF、JSON、Markdown 不在允许替换范围。审核文件不允许移动、删除、目录列表或越界读取；隐藏路径白名单只有 `pdf-md-map.v1.json` 和 `pdf-md-review.v1.json`，未开放其他隐藏目录内容。
- 写入前验证当前自动映射 Sidecar 的 SHA-256、全体 15 份来源及修正锚点目标文件哈希。外部修订或多个页面冲突时拒绝覆盖，保留当前草稿。

## Feature Contract

- `FC-PDFMD-WP7-1`：进入有 WP4 映射的工作目录，切换左侧 AG Grid 从「文本块」到「关联审核」。应显示 224 行元素，包含锁定的「原PDF页」、带 All/具体值筛选的「审核」列、「元素」、「自动证据」、「人工关联」及「说明」列。单击行应在 PDF 显示候选框并定位到相应 Markdown 原文，右侧源码窗始终可见。
- `FC-PDFMD-WP7-2`：在「审核」列手工设置 `已核对 / OCR错误 / 关联错误 / 缺失 / 待复核 / 已校正`，默认 `未审核`。变化只更改内存草稿，未点「保存审核」不得请求写入；修改说明失焦后暂存。`已校正` 不能不带位置直接选择，必须用「使用当前 MD 选区校正」建立有效范围。
- `FC-PDFMD-WP7-3`：确认错误关联时，在来源完整读取且 SHA-256 匹配的 Markdown 源码中选取非空文字，点击「使用当前 MD 选区校正」。记录当前 elementId 与真实 `path/sha256/from/to`，显示「已校正」；再次点击该元素时，PDF→MD 导航应优先选取人工修正的位置。撤销校正恢复「待复核」，不会写回章节文件。
- `FC-PDFMD-WP7-4`：只按一次「保存审核」，执行一个单文件 CAS commit，回读校验；保存按钮在无修改/写入中不可用。外部变更时明确错误，不静默重试或丢弃草稿；离开工作目录、刷新页面存在未保存更改时需确认。
- `FC-PDFMD-WP7-5`：来源映射缺失/失效、审核文件版本不匹配、校正范围越界、请求越界、权限不足时审核不可写；自动匹配与人工审阅状态永久区分。

## UI Interaction Contract

- `UIC-PDFMD-WP7-A`：授权工作目录→`关联审核` AG Grid 224 行→单击元素行→PDF 橙框 + Markdown 原文同步；确认列含 `All` 筛选，不脱离页面另加筛选框。
- `UIC-PDFMD-WP7-B`：标记 `OCR错误` →审核状态显示未保存→未产生任何 review 文件→点击「保存审核」→文件创建且回读一致；不触碰源文件。
- `UIC-PDFMD-WP7-C`：选中 AG 元素行→CodeMirror 内选择真实源码文本→`使用当前 MD 选区校正`→保存 → 再定位时优先显示人工修正；仅允许已完整读取并匹配 MD 源 SHA 的来源。
- `UIC-PDFMD-WP7-D`：模拟另一设备外部替换审阅文件后，旧页面修改并保存应收到 `ESTALE/ECONFLICT`，文件保持外部版本、页面保留未保存的决策；刷新前需人工确认。
- `UIC-PDFMD-WP7-E`：未校验 Sidecar 的其它书目录/未授权路径→禁用审核保存；`.obsidian` 和其它 `.ocr2md` 文件仍拒绝读取。窄屏 AG Grid/源码和 PDF 保持原有可调布局。

## 自动验收

```bash
python3 -m unittest ui-spikes/v2/tests/v3MacVaultSmoke.py -v
npm --prefix ui-spikes/v3-directory run test:review
node ui-spikes/v3-directory/tests/pdfMdReviewFixture.cjs
npm --prefix ui-spikes/v3-directory run test:mapping
npm --prefix ui-spikes/v3-directory run test:bidirectional
npm --prefix ui-spikes/v3-directory run test:ui
```

隔离浏览器固定在临时 Vault 运行真实端到端写入/回读/冲突测试，**不操作**真实 `Bufett’s Alpha` 人工审核状态。真实书籍只进行只读界面与状态检查，不自动填写/签署审核结论。

## 实际验收结果

- **WP7_REVIEW_CAS_UNIT_OK**：首建、替换、陈旧 revision 冲突、映射 SHA 绑定、错误人工锚点禁止；通过。
- **Mac Vault Python 8/8 PASS**：`.ocr2md/pdf-md-review.v1.json` 创建、受限读取、协调 CAS 替换、删除/越权拒绝以及旧映射行为；通过。
- **WP7_REVIEW_BROWSER_FIXTURE_PASS**：审核 All/未审核状态筛选、先暂存后写盘、保存回读、用户从只读 CodeMirror 选区人工校正、说明保存、外部覆盖后 CAS 拒绝；通过。整个测试只写隔离临时目录。
- **WP7_REAL_REVIEW_READ_ONLY_BROWSER_PASS**：真实 `Bufett’s Alpha` 的 224 行审核 AG Grid、未审核 0 / 224、保存按钮禁用、文本块/关联审核视图切换；全过程 WorkspaceFS 0 次写请求、0 条自动人工签署。
- **V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS**：新增视图后既有 V3 目录、授权、工作台、PDF/MD、文件保护与配置回归通过（一次操作时出现已重跑通过的 AG 行重绘时序性测试波动）。
- **WP4_SIDECAR_CAS_UNIT_OK / WP6_BIDIRECTIONAL_INDEX_UNIT_OK / WP5_PDF_OVERLAY_GEOMETRY_UNIT_OK**：回归通过。原始映射 SHA-256 仍是 `168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2`。
- **线上规则验证**：Mac Vault 服务只重载一次；新增受保护审核路径从旧版的 HTTP 403 变为新版的 HTTP 404（真实审核文件不存在），不再误判为权限拒绝；真实审阅文件仍未创建。

WP7 **开发完成 / 自动验收通过**；用户尚未人工审核任何真实映射元素。WP8 待启航。

用户手工审核入口：https://ocr2md.laity.bid/v3-directory/ → `Bufett’s Alpha` → 设为工作目录 → `关联审核`。人工审核状态仍为**待用户审核**。
