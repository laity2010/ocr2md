# V3 行号菜单 · PDF 人工补录遗漏标题

2026-10-09 · 范围：V3「章节定界」的 V2 CodeMirror 源码窗，沿用 V2 行号高亮/行号点击操作，不改变 V2 默认只允许选中行调菜单的行为。V3 可以直接单击任一行号，打开与该行关联的操作菜单。

## Feature Contract

**FC-MANUAL-01** 操作：进入工作台→章节定界→点击源码窗行号→「补录标题」。需要：已加载 DIRjson 和 PDF；光标行须落在具有 DIR blockId 的内容块内。效果：仅弹出该行菜单及补录表单，不改变原文，不预先添加虚假 OCR 元素。标题插入在当前行所属块后；如果需要在段中间插入标题，应先用结构清洗模块拆分该块。

**FC-MANUAL-02** 操作：填写标题单行文字、H1/H2、原 PDF 页码，勾选「已对照 PDF 核实」后提交。需要：1..PDF 总页数内的页码，真实已有的插入锚点，非空文字，用户明确核对。效果：DIRjson 新增带稳定 `blk_...` 标识的 `title` 逻辑块和 `manualHeadings` 记录（method=`manual-pdf-page`, afterBlockId, pdfPageNumber, detail），按阅读顺序插入。章节结构自动重算，AG 出现「人工补录 · PDF 页码」候选，源码立即显示 `#` 或 `##`。原 OCR JSON、sourceElements 与 PDF 字节不变；没有任何伪造的 OCR jsonPointer/bbox。所有操作为内存草稿，待点击「保存章节定界」才持久化。

**FC-MANUAL-03** 操作：在 AG 点击新标题。效果：源码选中相应块，PDF Viewer 仅跳到人工确认的 PDF 页，不生成或显示虚假的 OCR 框。人工来源证据面板显示补录的页码与所属锚点；AG 的 OCR 层级明确显示「人工」。

**FC-MANUAL-04** 操作：取消、输入无效页码、不勾选已核实、缺少来源块或尝试插入多行文字。效果：拒绝并保留当前 DIRjson；未操作原 OCR/PDF，保留来源映射；可以撤销/重做人工补录。手动标题可以继续通过源码编辑修改标题文字，但仍不能把没有来源的普通行当成 OCR 元素。

**FC-MANUAL-05** 操作：保存带人工补录的 DIRjson。需要：沿用 WP7 CAS 防冲突、SHA 绑定；服务端验证 `manualHeadings` 明确的 PDF 页来源及不允许无标注来源块。效果：未全部人工确认章节时只保存全书连续待审核 MD；新的手工块在 Markdown 索引有 `manualPdfPage`、`pdfPages`，`evidence=[]`，明确不属于 OCR 元素来源。多会话冲突不覆盖。

## UI Interaction Contract

**UIC-MANUAL-01 · browser-auto** 初始：真实浏览器 fixture 已进入 V3 章节定界，只有 5 个 OCR 原始块。动作：直接点击 V2 源码中的第 2 行行号，点击「补录标题」，填写新标题、H1、原 PDF 页码 1，勾选已核实，提交。预期：菜单收起、AG 新增人工标定行、源码新增标题、导出 DIRjson 含 `manualHeadings` 且原 `sourceElements` 无变化，浏览器不产生 Vault 写请求。

**UIC-MANUAL-02 · unit** 初始：3 页/16 OCR 块 DIR fixture；在已有块后人工补录 PDF 第 1 页漏识别的 H1。预期：块数 +1，候选 +1，章节结构合法，生成 Markdown 范围同时包含 `manualPdfPage=1`、无 OCR evidence；原始 OCR JSON 完整重建；页码 99、跨行标题和不存在的 source ID 均拒绝。

**UIC-MANUAL-03 · backend-auto** 初始：含手工标题的完整版本化 DIRjson ZIP。动作：服务端解析并校验、保存后读回。预期：只有合法 `manualPdfPage` 可令特定 range 的 `evidence=[]`，每个来源为空的块必须是已登记的手工标题。未知页码、无标记的空来源块、篡改 `manualHeadings` 记录均拒绝；原文 SHA 不变。

**UIC-MANUAL-04 · manual-external** iPad Safari 下点击行号触发菜单并补录一条真实 PDF 缺失标题，检查软键盘、菜单可见性和 PDF 页证据。人工目视复核后才保存真实书籍。

> 重要：本版只提供 PDF 页级人工来源证据，不声称已经精确框选 OCR 漏识别标题的 bbox。日后可在 PDF 组件提供文本矩形框选时扩展手工来源为精确区域。

## 2026-10-09 · 实施与验收

- 编辑器复用 `ui-spikes/v2/src/workingEditor.ts` 的 CodeMirror gutter 点击事件，并为 V3 提供可选 `lineActionsOnAnyLine=true`。V2 原构造调用继续默认 `false`，不改变 V2 对“当前行行号按钮”的既有规则。
- V3 popover 始终通过源码行号定位到 `DIR` blockId；「补录标题」表单要求人工输入单行文字、H1/H2、原 PDF 页及确认勾选。插入在该行所属逻辑文本块**之后**，不会自动拆开多行 OCR 段落；关闭菜单无 DIR 副作用。
- DIRjson v1 向后兼容可选 `manualHeadings`，手工块 `sources=[]`，且仅允许经 PDF 页级人工来源登记的 `title` 使用空 OCR 来源；全部 OCR sourceElements/segment pointer 和 bbox 原样保留。MD 索引的手工块证据是 `manualPdfPage`，`evidence=[]`；没有伪造 OCR bbox。
- `test:ir:chapters` → `IR_WP4_CHAPTER_UNIT_PASS`：本次增加 H1 人工插入、插入后章节重建、全量 OCR JSON 往返、错误页码/多行/无效锚点拒绝。
- `test:ir:ui` → `IR_WP5_BROWSER_FIXTURE_PASS`：在 CodeMirror gutter 第 2 行真实点击弹窗，输入标题/页码/确认并提交，AG 新增一行、源码同步显示 H1，导出的 DIRjson 中 `manualHeadings` 一条、原 OCR sourceElements 不变，页面无 Vault 自动写入；该测试还涵盖 iPad viewport/旧 PDF 视图。
- 对真实 224 块书籍的**隔离**衍生样本补录 1 条，生成 225 块、一个 `whole-book-draft.md` + DIRjson + manifest 的 ZIP；`v3_ir_persistence.validate_archive()` 拒绝伪造 PDF 页码、缺少手工来源标记、被篡改的 Markdown 页码索引。隔离 Vault `save_snapshot()/load_snapshot()` CAS 读回通过，原始 PDF/OCR SHA 未改变。
- `test:ir:persistence:backend` → `IR_WP7_ISOLATED_BACKEND_PASS`；`test:ir:persistence` → `IR_WP7_BROWSER_PERSISTENCE_PASS`，旧未修改书籍保存/恢复及 CAS 冲突不回退。
- `test:ir:ui:real` → `IR_WP5_REAL_BROWSER_PASS`；`test:ui` → `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`，真实书籍仍只读/无人工误核准；`test:review` → `WP7_REVIEW_CAS_UNIT_OK`，`test:bidirectional` → `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`。
- 不执行 reset/clean/rebase/force push；未提交，保留本地 Git WIP。真实书籍无人工补录和 DIRjson 正式保存；人工作业仍待用户审核。
