# Lab-OCR · 断块 View WP1/3（只读候选）

## 功能边界

- AG 下拉新增「断块」（`block-break`），复用当前 AG Grid、MD 行的 CM6 StateField、Block 的 CM6 structuredRuntime 与既有四窗定位总线，不创建第二编辑器、SQL 表、CMD 注释或额外永久索引。
- **断块不是普通 Markdown 换行，也不是任意两相邻顶层父块的跨段接续**：只检查同一逻辑父块内部，父块正文→其第一子块、或相邻子块→子块的文本接续。空父容器不被制造为有正文的前块。按稳定 `parent_block_id` / `block_id` 与 `sibling_order` 组织，PBS 只负责显示与页码筛选。
- 检测是*保守启发式*：两端均为有效 `para_blocks` 正文文本，前块末尾非完整句末且以英文单词或连字符结束，后块以小写英文单词开始；排除列表、标题、表格、公式、HTML 及 URL 等结构边界。结构子块和无内容子块是邻接屏障，禁止跨越它们杜撰续接。命中是**疑似候选**，不是 OCR 错误判决；可能漏掉其他语言、跨标点、复杂排版等情形。

## 唯一公开检测 API

`projectBlockBreakRows(mdRows, blockRows)` 位于 `ui/lab-ocr/block-break-view.js`。

- 输入只读：CM6 MD StateField 的 `line_id / line_no / block_id / text`，及 Block StateField 的 `block_id / parent_block_id / sibling_order / block_type / block_group / absorbed_into_block_id / pbs / global_page`。
- 输出：每一条可疑相邻文本边界至多一行，使用 `issue_id=block-break:<beforeBlockID>:<afterBlockID>`，`parent_block_id`、`before_block_id`、`after_block_id`、`before_line_id`、`after_line_id`、`before_line_no`、`line_no`、`before_pbs`、`after_pbs`、`pbs`（逻辑父块）以及 `kind / reason / before_text / after_text / join_preview / boundary`。AG 复用 `after_line_id` 作为本行 `line_id`，`after_block_id` 作为 `block_id`，从而复用原 `patchMdRows` 与现有单 Block 定位。
- 当前索引只计算、只显示；CM6 修改原文或调整 Block 关系后重新投影，既有 AG 增量更新，不重新读取 SQL。无持久化、审核状态及真正的合并编辑。

## WP1 AG 行为

- 选中「断块」时默认勾选「全部」显示全书候选；取消后按**逻辑父 PBS 所属页**筛选。点击记录沿用现有 AG→CM6/MD 预览/PDF 统一定位（本阶段定位的是**后块起始行与 PDF 后块**）。
- 列：逻辑块 PBS、前块、后块、前行、后行、类型、前文末尾、后文开头、接续预览、检测依据；不存在编辑单元和写回按钮。
- WP2 才实现 A/B 两端同时高亮及接续前后的独立审阅预览；WP3 才讨论人工仲裁、决定持久化与合并事务。不能把 WP1 单点定位叙述成 WP2 双端定位完成。

## 验收证据

- `node tests/lab-ocr-block-break-view.test.mjs`：稳定 BlockID/LineID、父子与兄弟邻接、跨页、编辑重新计算、PBS 更名、结构屏障、原对象完全不变。
- `node tests/lab-ocr-block-break-view.browser.test.mjs`：独立模拟 OCR API、Chromium/iPad-WebKit，验证 AG 视图、当前页/全部页切换、候选点击后的 CM6/PDF 定位、MD 来源不变、零 `md-save` / `block-edit-batch`，不读取用户书籍。
- 真实 sample **只读阶段快照**（2026-11-16，未修改数据库）：267 个 `para_blocks` Block、484 行 MD，发现 3 条候选，分别为 `p13b5→p13b5s0`、`p16b4→p16b4s0`、`p16b9→p16b9s0`。`p19b2→p19b2s1` 被正确排除，因为中间还有一个 `interline_equation` 类型的 `p19b2s0` 结构子块，前后并非直接相邻。`p16b4` 对应 BlockID 436、第 310 行末尾 `steady`；`p16b4s0` 对应 BlockID 437、第 311 行开头 `source`。快照测试不代表当前在线用户书籍已经相同，也不代表三条均为错误。

## 已知独立回归

- `tests/lab-ocr-md-full-source.browser.test.mjs` 当前仍在**已有**标题视图列序检查失败：显示 `text,line_no,level,pbs`，期望 `text,line_no,pbs,level`。本次仅新增下拉选项，没有修改标题视图列定义或 AG 通用列序；这项独立历史失败按 FAIL/BLOCKED 留痕，不能冒充 WP1 全量通过。
