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

## WCP43 · WP2/3：A/B 双端审阅（只读，2026-11-17）

- `projectBlockBreakRows` 新增 `before_token / after_token`，仍从最新 CM6 Markdown 段落边界派生。新公开纯函数 `resolveBlockBreakFocus({issueId,lineId,blockId},mdRows,blockRows)` 重新校验点击时当前候选、After LineID 与 BlockID，返回两端 `{lineNo,blockId,page,token,text}` 和 `hyphenated`；不信任 AG 旧缓存行、不再从 PBS 推导身份，源内容变化则返回 `null`。
- 统一四窗 `publishLabFocus` 仅扩展经过验证的 `blockBreakId`，消息中**不放 Markdown 正文**；普通 AG、PDF、CM6、预览导航事件均无此 ID。Frame 使用单个 `setReviewPair(pair | null, {skipSource})` 展示瞬态状态。`skipSource:true` 仅供 CM6 `docChanged` 监听回调：CM6 的 Decoration StateField 已在同一次编辑事务自动失效，不能再嵌套调用 `EditorView.dispatch`。切离 View、其他方向导航、Block 变更、工作区切换与文本编辑会清除旧定位。
- **CM6 原文**：两个独立 `Decoration.mark` 只标记前块末尾/后块开头的可证明英文 token，沿用已有整行高亮和 caret，不改实际文本、LineID 或 Undo 历史。
- **MD 预览**：复用当前 Main Markdown 渲染结果的 `data-source-start/end` 节点，在原 DOM 上添加 `data-ocr-review-pair=before/after/both`（一个 Markdown 段落可能含两个源行，不能伪造两份对应 DOM）。另在预览工具栏下方、滚动正文上方显示一个只读、可换行的「断块 · 接续预览」卡片，用两个 `textContent` 片段拼接；不用 `innerHTML` 注入 Markdown，卡片不是文档源，也不参与保存。预览重渲染按当前 pair 再次打标。
- **PDF**：`setReviewPair` 只引用现有 PDF.js `block` 覆盖框和 PBS 标签上的稳定 `data-block-ids`，对 A/B 页分别标注 `data-review-pair-side`；没有创建第二份 bbox，也不重载 PDF。坐标、PBS 标签、父子树、PDF 页码、当前选中后块的定位仍由原 PDF Viewer 负责；跨物理页前块可在前一页，后一页作为主焦点。缩放、页面虚拟重绘后自动恢复 A/B 标记；同一 bbox 的别名只绘一块区域并用标签区分。
- **视觉原则**：A 端暖金色、B 端青绿色；强调文字边界与原始框线，不为两个高亮区域叠加多重半透明底色。所有 CSS 仅在 Lab-OCR 的 `#workspace.ocr-review-focus-unified` 下生效。
- **WP2 不包含**：仲裁、SQL 审阅状态、合并/拆分 Block、行重写、额外的 Markdown 引擎或将接续预览回填正文。这些属于后续 WP3 决策。

### WP2 验收

- 直接 API 测试 `lab-ocr-block-break-view.test.mjs` 验证当前态 A/B 投影、不可变对象、过期 ID 失效；`lab-ocr-four-pane-location.test.mjs` 校验消息仅有稳定 ID、不含正文、拒绝伪造 origin。
- 浏览器 `lab-ocr-block-break-view.browser.test.mjs`（Chromium 与 iPad WebKit）：A/B CM6 token、AG 第二列彩色拼接单元、MD 无卡片及第三行 grid、不同物理页 PDF 标签/框、PDF 缩放后保持标注、选下一个候选更新而不叠加、切离清空、正文编辑清空并立即还原不触发 SQL 写入；在**不切分 PDF 预览、PDF 模式、22 页文件第 16 页**检查实际 PDF.js canvas 可见且有非白像素，防止只验证页码和 canvas 空壳。另验证 Markdown 字符串与 LineID 不因审阅发生变化。
- LaTeX 专项浏览器回归不能因 WP2 的 CodeMirror Decoration、PDF 覆盖框标记或预览重渲染倒退。原 `lab-ocr-pdf-viewer.browser.test.mjs` 的 `No extra PDF buttons` 旧断言仍要求 PDF 按钮数为 0，但现存 PDF 工具栏已有「提取文本」按钮；它在 WP2 之前即已存在，属于历史测试契约不匹配，不为本轮删按钮过关。

### 2026-11-17 用户 Safari 截图反馈与纠正

用户 iPad Safari 显示「PDF 原文」工具栏页 16 / 22，但正文整个区域空白，同时指出接续着色应在 AG 表，不能在 Markdown 预览。之前为卡片向公共 `.ocr-preview-pane` 插入元素并修改 Grid 行数，是不必要的侵入，已整体移除，恢复框架原本 34px 工具栏 + 自适应预览正文两行布局。Chromium 与 iPad WebKit 专项以 PDF 22 页、第 16 页实际 canvas 可见/像素非白和 AG 彩色单元为发布门槛；并不宣称已经远程操作用户实际 Safari 标签页。

### WCP43 · 漏报修复：p9b3s0（2026-11-17）

- **真实来源**：用户指出 p9b3s0 漏检。从 Lab-OCR 的 sample SQLite 只读快照核对 BlockID 251 (`p9b3`) 第 166 行末尾 `... on the basis of the latest`，BlockID 252 (`p9b3s0`) 第 167 行起始 `13F, and the portfolio was rebalanced monthly ...`。两块存在稳定 `parent_block_id=251` 的父子关系，原有结构没有问题；先前检测只认 `[a-z]` 小写开头，拒绝了数字+大写字母的 SEC 文件代号 `13F`。
- `projectBlockBreakRows` 在原小写词规则之外，仅扩展 `[1-9][0-9]{0,3}[A-Z]{1,5}` 这类 **数字+大写字母代码**；它属于待人工审阅候选，不意味着独立数字、年份、标题或已经完整终句可以合并。保留公式/非正文屏障和结构排除。`resolveBlockBreakFocus` 继续根据现行 MD+Block 状态复核稳定 ID。
- 必须同步调整 CM6 `mdReviewPairField` 接受 `13F` 作为 `after_token`，否则 AG 可以列出而源码第二端仍无法精确标记。AG 第二列继续 `textContent` 安全渲染，`latest` 暖金、`13F` 青绿，MD 预览不插入任何接续卡片。
- **实际快照结果**：修复后由 3 条增至 4 条：`p9b3→p9b3s0 latest/13F`、`p13b5→p13b5s0 systematic/portfolio`、`p16b4→p16b4s0 steady/source`、`p16b9→p16b9s0 investors/might`。被公式隔开的 `p19b2→p19b2s1` 仍不报告。直接测试包含 `13F`、`13`、`2024`、完整句末、标题与 LaTeX，浏览器专项夹具包含 `p9b3→p9b3s0` 的 AG/CM6/PDF 三端选中。

## WCP43 · WP3/3：AG 彩色审阅列与独立 SQL 决定（2026-11-17）

### AG 与交互契约

- 「断块」AG View：`逻辑块 PBS` 左固定、`接续预览 A / B` 保持暖金/青绿分色、**审阅**右固定（iPad 窄屏必须可触达），其后保留前块、后块、行号、检测依据列及原 AG 的列值筛选。
- 新公开 DOM API：`createBlockBreakReviewCell(onChoose)` 位于 `ui/lab-ocr/block-break-review-cell.js`。AG `cellRenderer` 只画一个按钮；点击打开**固定定位**、拥有彩色背景的自定义 listbox，依次提供 `待定`（中性灰）、`断块合并`（暖金）、`忽略`（青绿）。不使用 Safari 无法可靠着色的原生 `<option>`；菜单挂到 `document.body` 避免被 AG Grid 虚拟化行和横向滚动剪裁，点击后关闭，Esc 或外部点击也可关闭。
- `待定` 是默认无审阅记录；`断块合并` **仅表示人工认定 A/B 应接续，不执行合并**；`忽略` 表示人工认可现有块边界。选择后只更新对应 AG 行的 `review` 值，沿用 `frame.patchMdRows`，不重建 CM6、AG、PDF 或重载 SQLite。后台成功后才更改 UI，失败反馈到全局状态栏。
- 手动修改了 MD、Block 关系但尚未保存时，审阅操作必须拒绝，并提醒先保存。CM6 源码变化或 Block 结构变化会清除当前内存旧决定；切 View 重新向 SQL 读取有效记录。AG 仍是纯派生视图，审阅状态不嵌入 Markdown CMD 注释。

### SQL 唯一权威与端点

- **`scripts/v6_lab_ocr_block_break_review.py`**：公开 `read_block_break_reviews(book)`（只读）、`set_block_break_review(book,before_block_id,after_block_id,before_line_id,after_line_id,before_text,after_text,decision,expected_decision)`（CAS 事务写入）。`scripts/v6_lab_ocr_serve.py` 分别路由为 `GET block-break-reviews` 和 `POST block-break-review-set`，继续复用 Main 编辑授权、Origin、路径和 POST 大小限制。**无第二套服务器与 Tunnel**。
- 首个非待定决定才在当前书籍 SQLite 创建 `block_break_review` 表，主键是 `(before_block_id, after_block_id)`；仅保存稳定 LineID、文本的 `SHA-256` 证据指纹、决定及时间戳。GET 不创建表/修改数据，也不保存原文副本。
- POST 须同时验证 source fingerprint、两个 BlockID 的有效 para `text/paragraph` 类型和直接父子或同父兄弟邻接、两条 LineID 是所属 Block 的首末非空 MD 行、当前 SQLite MD 全文本与请求证据完全相同，再依据旧决定 CAS 检查并插入/修改。改回待定删除该主键记录。若证据或父子关系改变，GET 隐藏过期决定，POST 拒绝旧快照写入；历史记录在库内不自动重写来源数据。
- `scripts/v6_lab_ocr_store.py` 的已知扩展表检查允许 `block_break_review`；来源不同的 MinerU 导入及 Block 重建禁止静默覆盖它。用户文档 Markdown、BlockID、PDF 坐标、CM6 Undo/Redo 和原 `md_line` **均未被这个审阅动作修改**。实际将两行文本合并需独立的、用户明确执行的 CM6 编辑事务，不以选择下拉作为隐式批准。

### 测试

- `python3 tests/lab-ocr-block-break-review.test.py`：独立合成书籍、本地 SQL、GET 不建表、持久化/重载、CAS 冲突、MD 文本过期、父子关系变动、原始文件与 MD 内容保全、真实 loopback HTTP Origin 与 Main Cookie 权限。
- `node tests/lab-ocr-block-break-review-cell.test.mjs`：不依赖 AG/DOM 浏览器的菜单公开 API 测试，覆盖三候选、颜色标记数据、关闭行为、相同决定不重复发送。
- `node tests/lab-ocr-block-break-view.browser.test.mjs`：Chromium/iPad WebKit 验证彩色菜单三个选项、记录→忽略→切 View 重载→待定、AG 局部刷新、未保存 MD/Block、现有四窗双端定位及 PDF 第16/22页非空白绘制。`lab-ocr-latex-view.browser.test.mjs`、`lab-ocr-overlay-filter.browser.test.mjs` 做跨模块回归。

## WCP43 用户更正 · 「断块合并」必须立刻真正接续（2026-11-17）

早期 WP3 把「断块合并」错误地做成仅记录，用户明确要求选择后**立即看到源码和 MD 预览已合并**、**后块 PBS/BlockID 保留但内容为空**、**后块原始 PDF 覆盖框为虚线**。自此该选项不再只是标签。实施路径：

1. `ui/lab-ocr/block-break-merge.js` 纯函数 `planBlockBreakMerge(candidate,mdRows,blockRows)` 验证父/子或兄弟无中间子块、物理 A/B 行直接相邻、B 块**只有一条非空正文行**、原文词界仍一致。拒绝多正文行、结构块或关系变更（不可静默丢失其他行）。普通续接加一个英文空格，跨块断词删除 A 的尾部连字符后拼接；返回完整 CM6 编辑计划及保留的两个 LineID/BlockID。`emptyMdChildBlockIds(mdRows,blockRows)` 仅从当前 CM6 MD 行状态派生正文为空的子块 ID；保留 OCR 原始 `sourceEmpty` 不变。
2. `ui/frame/layout.js` 的 `mergeMdBlockBreak(plan)` 经 CM6 Frame 公开 API 在**一个 CodeMirror 事务**里更新 A 行为拼接文本、B 原行为空字符串，**保留两行之间的 `\n`**，不删 B LineID、BlockID，不移动兄弟顺序或 PBS；一个 Undo 恢复两行，Redo 恢复合并。`mdContentChanged` 立即更新 AG 增量投影、Markdown 预览及 `setEmptyMdBlocks`，后台仍由现有 `md-save` CAS splice 持久化，不新建第二份 MD 编辑权威。
3. `ui/lab-ocr/pdf-viewer.js` 新增 `setEmptyMdBlocks(ids)` 纯展示 API，只按稳定 BlockID 设置 `data-md-empty`，沿用现有 PDF.js **原始 bbox/PBS 标签**。`ui/lab-ocr/pdf-viewer.css` 为它单独绘制虚线边框（选中时依旧虚线），**不修改原来的 `data-source-empty` OCR 证据**。懒加载桥缓存这些 ID，缩放及页面虚拟重绘后恢复。不再向 Markdown 预览增加卡片。
4. `block_break_review` 扩展 `joined_sha256/split_offset/merge_glue`，仅存拼接证据摘要和界点，不额外存重复原文。旧 WP3 的「断块合并」记录仍未实际编辑，所以重开会显示「待定」，用户再次选同一选项才能真正合并；真正合并后，SQL 保存行对应的 A 已接续/B 为空，会标记 `merged=true`；重开 View 仍保留「已合并」AG 行。反向 Undo 恢复原文时，不假冒仍处于已合并状态。`待定 / 忽略` 始终只写审阅决定，绝不改变 MD。
5. 只有审阅 POST 后端验证当前证据成功才触发 CM6 合并，紧接着通过现有后台持久化保存。失败时不能虚报成功。由于 MD 事务必须保留原始行身份，当前仅允许一条正文行的后块自动合并；复杂情形提示用户手工处理，而非猜测合并。

### 新增验收

- `node tests/lab-ocr-block-break-merge.test.mjs` 直接覆盖纯计划与空块投影、13F/普通英文接续、连字符、身份不变与多行防丢失。
- `python3 tests/lab-ocr-block-break-review.test.py` 合成书籍中模拟 MD CAS splice，验证 merged digest GET 识别、重开后字段、持久化 Undo 原文恢复、MinerU 原件不改动、旧记录兼容。
- `node tests/lab-ocr-block-break-view.browser.test.mjs` Chromium/iPad WebKit 合并后 A 连贯、B 空行但 BlockID/LineID 相同、MD 预览已更新、原 PDF bbox/PBS 存在且虚线、单次 `md-save`、无 `block-edit-batch`、AG 仍列已合并、CM6 Undo/Redo 一次可恢复/重做。跨平台 PDF 原生第16页完整渲染另按既有回归独立验收。
