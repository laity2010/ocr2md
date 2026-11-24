# OCR2MD · V2 执行细则（当前实现、数据架构与验收边界）

> **接手前必读**：先读取 OCR2MD 统一根目录联邦 `AGENTS.md`、`BUILD.md`、`COMM.md`，再读 V2 本州 `AGENTS.md`、本 `README.md`，然后按任务查阅 `docs/v2/`、实际源码和测试。此处区分 **[已实现] / [仍待实现] / [风险已修复]**。历史 WP 文档不得推翻当前契约；README 本身不替代代码和可执行门禁。未经测试，不得把目标描述成已上线功能。
>
> **2026-11-24 用户最新批准 [架构目标，待 WP25 实施]：PDF 以逻辑块为单位，Markdown 以真实硬回车行（MD Line）为单位。每行有 PBS、块内行偏移、CM6 物理行号及继承的 Block Type；新增行继承上一行的 PBS，取消显式 PBS 分割和人工新增逻辑块 ID。以第 3.1 节为唯一现行目标；第 3.2 节为实施航路。WP24 已发布基线 `0b29707`（261124-162918）仍是旧块级编辑/标题交互，不能冒称已实施 WP25。** V2 工作树：`labs/lab-ocr-v2`；Git 分支：`experiment/lab-ocr-v2`；统一开发入口：`https://ocr2md.laity.bid/labs/lab-ocr-v2/`。

## 1. 版本身份、框架和边界

| 称呼 | 实际项目 | 权威角色 |
| --- | --- | --- |
| V0 | `main` | 历史主线工作台，**不是** V1 源码；Git 分支/工作树名称不作改名 |
| V1 | `lab-ocr` | 现有已验证交互、PDF 动态多轨 PBS、手势和样式的**复用基线** |
| V2 | `lab-ocr-v2` | 当前 **2 Tables + N Derived Views（两实体表 + N 个前端派生视图）** 的独立实验工作台和唯一 V2 发布目标；WP24 标题 View 仍为块级预设；WP25 将统一行级审阅投影，其他 View 待逐项实施 |
| Frame | `lab-frame` | 原四窗、全局设置、目录授权、导航和 AG Grid 的基础框架 |

- V2 是 **框架型 Lab**，不是 V0/Main 的镜像。优先复用真实 V1 `lab-ocr` 的原组件及公开 API，不得把 V0 的 `ui/pdf-preview.js` 固定双轨误当 V1；业务数据用隔离适配器接入，不额外制作平行 PDF、AG、Settings、导航、状态栏或 CM6 实例。
- 保留已验收 Frame 公共源码（`ui/frame/*`、共享 F02 I/O 与脚本）逐字节隔离；V2 只允许自己受精确签名校验的 Vite 构建适配。不在 V2 实验中修改 V0/V1/Frame 工作树及其持久化数据。
- 工作目录只由 **Frame 原全局设置** `workspace.dataDirectory` 绑定并保存。只在 Frame F02 授权 Cookie、目录白名单及实际读写 `probe` 验证通过后，才可处理书籍数据。原 MinerU JSON、PDF、媒体、其他数据库一律只读保护；禁止假定使用仓库目录或其他 Lab 的数据库。
- 已弃用 V2 的历史证据在 Git 标签 `archive/retired-lab-ocr-v2-20261120`。不得把它的旧业务源码、SQLite 或 UI 当成当前 V2 基线恢复。

### 1.1 AG Grid 表头筛选：统一跨版本规范引用

**唯一跨版本契约**：统一开发区根目录联邦 `COMM.md`（由联邦 `AGENTS.md` 第 10 条登记；旧 `CROSS_VERSION_COMPONENTS.md` 只是兼容链接）；V1 `labs/lab-ocr/ui/enum-checkbox-filter.js` 的 `EnumCheckboxFilter` 是已核验的多选过滤组件基线。新建/调整 V2 AG Grid 列前必须先阅读跨版本规范并查 V1 源码和直接测试，**不得在本 README 中另建或改写同一套强制规则**。PBS/Type/MD Block 的 V2 列序、宽度、排序及过滤状态以本 README 下文为准；Type 即使不可排序，也必须能使用原生 AG 表头多选过滤。

**强制发布门禁（已接入）**：`scripts/v2_frame_publish.py` 发布前执行 Main Git 的 `scripts/verify_cross_version_components.py --target lab-ocr-v2 --browser`，包含 V1 真实组件测试和 V2 真实 AG 浏览器测试；只要 Type 仍是单选，自检就非零退出并阻止发布，不触碰用户 SQL 或旧发布资源。

**WP11 修复现状 [定向跨版本门禁已通过]**：V2 `ui/v2-mineru-entry.js` 已撤除自制 `TypeHeader` 和 `<select>`，直接导入本工作树与 V1 **SHA256 逐字节一致**的 `ui/enum-checkbox-filter.js` / `ui/ag-enum-filter-shared.css`；AG 各列使用 `filter:EnumCheckboxFilter`、原生过滤图标、V1 的 all/多值 checkbox 模型和 AG Grid 自身过滤生命周期。Type 保持列值适配宽度、`sortable:false`；PBS 仍左固定、适配宽度、`sortable:false`；MD Block/其他列序不变。原 `typeFilter` 独立状态和自行删行逻辑完全删除，SQL/CM6/PDF 数据不改。真实 V2 Chromium/iPad-WebKit 原生 Type 过滤测试、V1 原组件行为测试与 `scripts/verify_cross_version_components.py` 发布门禁均已通过；详情见 `docs/v2/WP11_V1_AG_FILTER.md`。

**WP12 列宽纠偏 [定向浏览器验收已通过]**：逻辑表 `PBS`（固定）、`Type`（不固定）默认列宽按**当前 AG 视图中可见的实际文本**和 AG 字体测量，预留原生过滤按钮及单元格边距；不再按整篇文档所有 Type 值的最长字符串给当前页预留过宽空间。两列 `minWidth` 小于默认拟合宽度，因此使用 AG 原生表头右边缘可双向拖动；用户手动调整后，自动拟合不覆盖手动选择，切换“全部／当前页”和切换 SQL 表后再返回仍可保留。不可排序、原版多值过滤和 `MD Block` 第三列不变；验收脚本：`tests/v2-mineru-base.browser.test.mjs`（Chromium/iPad-WebKit 的真实 resize 拖动及宽度保持）。技术说明见 `docs/v2/WP12_AG_PBS_TYPE_FIT_RESIZE.md`。

## 2. 数据唯一权威与派生视图执行架构

### 2.1 2 Tables + N Derived Views · V2 当前采用的正式方案

**本节是 V2 的具体架构执行细则，依据本州 `AGENTS.md` 的两实体表、稳定 `logical_id`、唯一 CM6 正文原则；不修改联邦/州宪法。** 旧文档所称的「两表 + N View」，在 V2 中明确解释为 **2 Tables + N Derived Views（前端派生视图）**：**N 不代表新增 SQL 实体表，也不要求为每个功能执行 `CREATE VIEW`。** SQL 普通 View 不储存数据，但在现阶段并不是本方案的派生视图实现层。

1. **SQLite · 唯一持久化权威 [已实现]**：只维护 MinerU 无损原始资料、当前逻辑块正文/顺序/归属及**经明确设计并验收后**需要长期保留的逻辑审阅状态；仍以 `mineru_base`、`logical_block` 两张应用物理表为底座。不得为了标题/LaTeX/断行等每新增一个审阅模块就再建一张表、额外存派生结果或未经授权修改 Schema。
2. **CM6 · 当前会话唯一可编辑正文 [已实现]**：`logical_block.md_block` 是持久化正文，加载后由唯一 CM6 EditorState 表示正在编辑的最新正文；适配器从**当前 CM6 正文快照及 `logical_id`/PBS 位置映射**读取，而不是从可能滞后的 SQL 查询结果自行构造第二个可写正文。正文/结构写回仍使用已有 CM6 事务、原生 Undo/Redo、`md-commit` / `structure-commit` 及旧值冲突保护；派生 View 无权绕开正式写入口。
3. **同一 AG Grid + 两种通用投影 [WP25 目标]**：逻辑块审阅仍用现有 Block 行集（PBS/Type/MD Block）；MD Line View 是唯一共享行级投影，由当前 CM6 正文与逻辑区间派生，不是第三张实体表、第二个正文或专属标题数据集。标题及未来行级审阅预设在同一 MD Line 行集上应用原生 EnumCheckboxFilter、列序及样式。每行继承持久化 Block Type，行自身的 Markdown 类型另由语法派生为 Line Type；不因输入标题而改写整块类型。两个投影共用一个 AG Grid 实例、当前页/全部范围、原生过滤和现有定位契约。实际接口和测试见第 3.1–3.2 节。WP24 已实现的块级 Type/标题预设仅为历史基线。

**审阅决定的持久化例外 [待设计、未实现]**：例如「忽略 / 待核实 / 已匹配 / 已转换」若要求刷新、重开后仍保留，必须有按稳定身份定位的受控持久化契约、历史/冲突语义及迁移/回归测试。当前 `logical_block` 十列**未提供这些新模块的通用审阅状态字段**；不得假定已有持久化能力，也不得静默添加第三张物理表、额外 SQLite View、将状态写入原文或以 AG 过滤状态冒充已保存的仲裁结果。各模块实施前先提交方案取得授权。

**当前与后续范围**：WP24 已发布两表、真实 LF、块级 AG、CM6、PDF/Markdown 联动和显式初始化。WP25 先完成行级共同接口、编辑与定位、退役分割，再以同一 MD Line 行集复现标题 View；此前暂停其他 View，不将旧 WP23H 的“同一块内堆叠标题”误作新目标。

**旧实现证据（仅历史）**：WP23B/C 使用块级有效 Type 筛选，详见 [WP23B](docs/v2/WP23B_AG_TYPE_VIEW.md)、[WP23C](docs/v2/WP23C_LIVE_TYPE.md)；WP23H 块级多标题交互详见 [WP23H](docs/v2/WP23H_OWNED_TITLES.md)。这些已验证的原生筛选器、着色、字号与跨窗定位能力应保留；旧行粒度和混合块整体改为 title 的语义被第 3.1 节取代。

### 2.2 两张已实现的应用物理表

**当前仅有两张应用物理表**：已授权书籍目录内的 `ocr2md.v2.sqlite`。AG、源码、Markdown、PDF 及未来标题等审阅 View 均作为前端投影／派生数据使用；不新增第三张业务表、父块表、Markdown 行表或 SQL 历史表。仅修改本 README **不会变更当前数据库文件或已发布程序**。

| 物理表 | 当前列与来源 | 作用 |
| --- | --- | --- |
| `mineru_base` | **18 列**；`blockid` 为全局稳定整数索引；`blockid=0` 是非业务源文件档案 | 无损保留三类 MinerU 原始块（`preproc_blocks`、`discarded_blocks`、`para_blocks`）、原始 JSON 字节及 SHA256、完整 `block_json`、原始页码和 bbox；不因逻辑编辑而改变 |
| `logical_block` | **10 列**：`logical_id`、`base_blockid`、`parent_id`、`logical_order`、`md_block`、`block_type`、`p`、`b`、`s`、`raw_path` | 当前逻辑块文本、顺序和类型；`logical_id` 为内部稳定身份，`base_blockid` 引用原始基础块，持久化来源类型见 `logical_block.block_type`，WP25 目标中 MD Line 继承此 Block Type，另派生 Line Type；当前 WP24 仍有旧有效块 Type |

- **WP22 · V2 默认逻辑块审阅与右侧 PDF 2/3 布局 [已实现；待 iPad Safari 实机验收]**：此为 V2 **本版独有**的布局/文字标牌改动，仅在 `labs/lab-ocr-v2/vite.config.mjs` 对 Frame 的真实 `ui/frame/layout.js`、`ui/frame/index.html` 做**精确原文校验的构建期适配**，不改 Frame/V1 工作树、统一四窗组件或相关 API。AG 自有顶栏去掉冗余文字「AG 表」，保留既有下拉和右侧「全部」/页码工具；原「空白框架」模块在 V2 下拉和启动状态改为「逻辑块审阅」，保持 `frame` 的内部稳定模块 ID 与全局设置入口。右侧**上源码约 1/3、下 PDF 预览约 2/3**（通过 Dockview 原生 `panel.api.setSize({height:约 2/3})` 在首次显示时设置，用户可继续拖动改尺寸），启动默认**三个 Panel、不切分**，预览类型选择框默认 PDF；同一个 PDF.js 预览实例保留在原预览窗，Markdown 预览在下拉中继续可切换；现有切分按钮保留供用户手动选择，但**不再默认拆出第四窗**。不修改现有 SQL / PBS / CMD 原文、PDF 绘制/坐标/缓存或 V1 公共 Frame 基线。真实 Buffett 267 块 Chromium/iPad-WebKit 浏览器验收：Panel 数 3、V1 PDF.js 实例 1、AG 无冗余标签、模块名准确、右侧 Preview 高度比例 Chromium 0.66628/iPad-WebKit 0.66698，并复测可选切分/恢复不重建 PDF。详见 [WP22 默认 PDF 与逻辑块审阅布局](docs/v2/WP22_DEFAULT_PDF_2THIRDS_REVIEW.md)。
- **WP21 · PDF 提取替换后 CM6 源码可视区域稳定 [已发布；虚拟组尾处理待按 3.1 改造]**：WP20 的「提取文本替换/插入」曾使用 `{from:0,to:整篇,insert:全篇}` 修改**唯一 CM6 文档**，即使仅一个逻辑块改动也会使 CM6 丢失局部高度/滚动锚点：真实 Buffett 267 块样本在源码**第 60 行**操作时，Chromium 从第 60 行跳到第 1 行，`scrollTop` 由 `2532` 变 `252`。WP21 改为只替换选中 `logical_id` 的**局部 `[from,to)`（包含该块的虚拟组尾 LF）**，提交前强制用 `composeLogicalSource` 比对整个目标源码完全一致，不允许引入 WP18 的块边界错位；使用唯一 CM6 原生 `EditorView.scrollSnapshot()` 映射局部 ChangeSet 保持视觉锚点，替换时保留当前逻辑行内光标偏移、CM6 Undo/Redo 和 SQL 旧值差量。行号菜单/API 在源码窗失焦后调用现有 V1 `scroll-sync.js` 的 `sourceEditGesture()`，**让正在操作的源码窗保持滚动主导权**，Markdown 重绘不能反向拖走源码。没有新滚动实例、数据库字段、Frame/V1 公共源码改动。真实267块第60行测试：Chromium `scrollTop=2123`、行位置约`95px`操作前后相等；iPad-WebKit `scrollTop=2831`、行位置约`297px`操作前后相等；撤销/重做、3次 SQL MD 提交及 267 个逻辑身份验证通过。相关说明 [WP21 PDF 替换视口稳定](docs/v2/WP21_PDF_SOURCE_VIEWPORT_STABILITY.md)。
- **WP20 · V2 源码行号 PDF 文字插入与替换 [已发布；单行文本约束待按 3.1 改造]**：沿用 V1 Frame 行号按钮/浮层的原结构与视觉样式，在**V2 本地行号组件副本**通过两个可选回调新增「提取文本插入」「提取文本替换」。原 V1/Frame 工作树和它们的 API、按钮菜单不变；**WP17 所称 V2 `v2-md-line-gutter.js` 与 V1 字节相同的结论仅适用于 WP17，不再适用于本次 V2 特有扩展**。点击行号菜单捕获当前物理行的唯一 `logical_id`；不使用 PDF 窗口之前选中的框。PDF 经 V2 adapter→本 V2 已有的 V1 PDF.js 预览实例新增只读公开 `readNativeTextInBox({page,bbox,pageSize})`，同一实例、同一缓存按该 `logical_id` 的原始页号和 bbox 读取**真正 PDF.js 原生文字层**；没有 PDF、坐标失效或原生文字为空时，两项菜单禁用，不把 OCR、MinerU 或 MD 作为替代。**插入**将规范为单行的 PDF 文本插入该逻辑行的 CM6 光标位置（光标不在本行则行首），不删除现有正文；**替换**只以 PDF 原文替换目标 `md_block` 全部正文，不影响相邻行或 PBS。两者通过 WP15/WP18 类型化的**同一个 CM6 文档/Undo/Redo** 操作和 WP10 SQL 旧值条件 `md-commit` 保存；重复内容不自动去重、无改动不另存。PDF 原工具栏「提取文本」按钮仍保持 WP17 的原有插入行为。真实 Chromium/iPad-WebKit 测试包含“PDF 当前选中别的块也只读菜单行”、“无原生文字层按钮禁用”、插入/替换/撤销/重做、0 结构提交。详见 [WP20 行号 PDF 原文插入和替换](docs/v2/WP20_LINE_NATIVE_PDF_INSERT_REPLACE.md)。
- **WP19 · 滚动与高亮焦点分离 [已实现；待 iPad Safari 实机验收]**：V2 四窗中，手指/鼠标滚动只改变当前窗口的阅读位置；V1 `scroll-sync.js` 仍可保持 CM6 源码窗与 Markdown 预览窗的**阅读位置同步**，但其 `viewStore.scrollTarget` **绝不能当作 `focusTarget`**，不允许以滚动时首个可见行更新光标、AG 高亮/PBS 当前页或 PDF/Markdown 选中块。V2 `ui/v2-pane-focus.js` 仅接受 **显式点击/选中/主动定位**的 `focusTarget` 更新 `v2-sync-focus`，并保留 AG 行点击、PDF PBS 标签点击、Markdown 元素点击和真实 CM6 光标选择的跨窗定位。滚动不改变 CM6 selection、逻辑块高亮、不写入 SQL/PBS，不隐式移动其他窗的**焦点**；阅读位置继续按既有 V1 规则同步。真实 V2 Chromium/iPad-WebKit 双浏览器测试验证“Markdown 与 CM6 滚动 → AG/选中块/页码/光标不变 → 明确 AG/MD 点击仍更新焦点”；真实 22 页 PDF 额外验证 PDF 滚动不会改变已选择的 PBS 高亮。详见 [WP19 滚动与高亮焦点分离](docs/v2/WP19_SCROLL_FOCUS_SEPARATION.md)。
- **WP18 · CM6 正文前缀错位防线 [历史防错位验收；虚拟 LF 限制已被 3.1 取代]**：2026-11-23 发现用户书籍中 267 个逻辑块里 211 行被错误改写，起点 `p1b11s0`（`CE Credits: 1` 行后异常出现 `\n\nM`），其后所有逻辑正文在统一拼接源码中的起始位置**整体右偏 2 个 UTF-16 字符**，导致标题 `##`、HTML `<t`、普通英文前两个字符被吞到前块尾部或虚拟空行。用原始 MinerU/基础表及当前 PBS 组别**全书 267/267 严格比对**，可完整证明一次统一偏移、并非 OCR 丢字；已先创建用户 SQLite 的单独完整性备份。V2 普通 CM6 事务改为从**原始逻辑行的真实 MD 文本范围**严格推导编辑结果，只有 `planOwnedTextEdit` 重组的源码与 CM6 拟提交的源码逐字节相等时才允许放行；任何跨逻辑块/虚拟 LF 的 Backspace、Delete、粘贴或不一致位置映射均拒绝，不再依赖 `mapPos` 在交界处猜测区间。行尾键入不将显示用 LF 写成正文；SQL 组显式多行整理改走单次类型化 CM6 历史，仍可 Undo/Redo 和旧值乐观保存。以上禁止虚拟 LF 编辑及单行整理仅为旧版行为，不再是后续目标；严格重组校验必须保留。所有两表/N View、PBS、PDF 几何和原始 JSON 不变。真实 267 块开头/结尾逐块校验见 `tests/v2-prefix-ownership.test.mjs`；现场根因和修复说明见 [WP18 CM6 逻辑块前缀防线](docs/v2/WP18_MD_PREFIX_DRIFT.md)。**不自动覆盖现有已编辑 SQL**：事故库恢复必须先有独立备份、全书严格匹配单次偏移、再以带旧值条件的 `md-commit` 恢复受损正文；不重建逻辑表，不改 PBS。
- **WP17 · V1 行号操作 + PDF 原生文字层提取 [已发布旧实现；行删除/文本归属待按 3.1 改造]**：仅当前 CM6 焦点逻辑块的行号显示 V1 Frame 原 `createMdLineGutter` 真实按钮及「删除当前行」菜单，其他行号为普通数字；复用 V1 `frame/md-line-gutter.js` 的逐字节原件及原样按钮 CSS，经 V2 适配 `onDelete(logical_id)`。**已发布旧模型（非新目标）**：一个源码正文行就是一条有稳定 `logical_id/PBS` 的 SQL 行，直接删掉结构行会破坏 PDF/AG 关系；「删除当前行」在 V2 **只清空该行 `md_block`，保留空行和逻辑块/PBS**，使用原生 CM6 撤销/重做、旧值乐观 `md-commit`，不能悄悄删除物理 SQL 行。PDF 仍由 V1 `mountLabOcrPdf` 的 `getTextContent()` / `pdfTextInBox` / `onExtractText` 控制「提取文本」按钮可用性：无原 PDF 文字层或目标 bbox 内无字则禁用，绝不借用 OCR 或 MD；有文字时仅把**当前高亮逻辑块**的原生文本层文字（规范成一条正文行）插入唯一 CM6 的该块光标位置，整文档位置重映射保持所有虚拟 LF 不进 SQL、PBS 不变；状态只走全局顶栏，支持 Undo/Redo 与 SQL 差量。详见 [WP17 V1 行号和 PDF 原文](docs/v2/WP17_V1_LINE_GUTTER_PDF_NATIVE_TEXT.md)。
- **WP16 · PDF 虚线跟随当前 MD Block [已实现；待实机验收]**：V1 PDF 组件 `sourceEmpty` 是旧版空来源标签，但 V2 目前用加载时的 `md_block` 空值填充它，**不能代表当前 CM6 已恢复的 HTML 是否有内容**。旧版 PDF-map 把加载时的 `md_block` 空值缓存到 `sourceEmpty`，WP15 通过 CM6 恢复内容或 Undo/Redo 时，PDF 覆盖框及标签因此仍可能错误显示虚线。V2 仅在适配层复用 V1 公共 `setEmptyMdBlocks()`，在 CM6 load/edit/structure/saved 时同步当前 `md_block` 的空块 ID，V2 CSS 对 `sourceEmpty=true` 且 `mdEmpty=false` 的块显示实线，**不改写已加载的 PDF-map 标记；真正原始 OCR 仍保存在只读基础表**。容器 `table` 的 s0 虽无独立文本，但只要同 PBS 父组的 s1+ 中存在非空正文，整个容器为实线；真正空白的逻辑子块仍保持虚线。全程不改 SQL、MinerU 原文、PBS、PDF 坐标或 V1 公共源码。详见 [WP16 虚线同步修复](docs/v2/WP16_PDF_EMPTY_STATE_SYNC.md)。
- **WP15 · 真实跨页表格恢复 [已实现，待 iPad 实机验收]**：MinerU 可能在 `para_blocks` 中将次页表格 caption/body/footnote 清成 `lines_deleted:true`，同时把次页表体合并到前页。V2 仍从最终 `para_blocks` 建立唯一逻辑 ID/PBS/类型/原始路径，但对**同原始文件、同页、同类型、同 index、同 bbox** 能唯一匹配的 `preproc_blocks` 表格，改用其物理页原文来初始化 `md_block`；对明确的跨页重复脚注按严格原文一致和连续表头证据归位，根 `table` 仍允许为空。真实 22 页样本的 p4b0s1/s2/s3 分别恢复 `Table 1 (continued)`、`<table>...</table>`、Notes，p3 的合并表体分成当前页片段，不更改逻辑行数（267）、两张表/PBS 或原始 JSON。**已有编辑的数据库不自动重建**：在 SQL 组使用「恢复跨页表格正文（不重建）」，后端只读预览逐一核对旧 `md_block` 必须等于原 para 导入文本，跳过已人工编辑块；用户第二次确认后经唯一 CM6 历史一次应用、Undo/Redo 和原有 `md-commit` 旧值事务保存。`Raw Block` 仍真实显示 `para_blocks` 原始子元素（可能为空），预处理来源属于不可变 `mineru_base` 的同页 `preproc_blocks`，不得伪造为 para 原文。无匹配或有歧义的来源拒绝猜测，详见 [WP15 真实表格恢复](docs/v2/WP15_PAGE_LOCAL_TABLE_RECOVERY.md)。
- **WP09 初始化现状**：仅取最终 `para_blocks` 作为逻辑来源，不把前处理和丢弃块当正文；每个顶层 para 为 s0 原始父块，原始 `blocks[]` 内每个 caption/body/footnote 等直系元素生成独立 s1+ 子行。真实 22 页样本为 539 个原始基础块 / 224 个 para 根 + 43 个直系子元素 = **267 条逻辑行**。Raw Block 只读外联该元素自身 span 的 `content/html/image_path` 与原有行结构，Raw Block 保留原样不生成 Markdown 标题/围栏/媒体标记、不合并不同类型；原始 JSON 字节归档于基础表 `blockid=0`。新书初始化产生新结构；同源非空旧库不会自动覆盖，仅在导航下拉点击 SQL 组标题，弹窗提供「导入基础表」、「重建逻辑表（覆盖编辑）」、「仅整理正文断行（不重建）」三个明确不同的操作；危险重建需二次确认，AG 顶栏不放数据操作按钮。
- **当前窗口**：框架原导航下拉 `SQL` 组展示 SQLite `sqlite_master` 中真实两表。AG 基础表仍每次从 SQL 读取 120 行分页；**AG 逻辑表取消翻页，完整加载当前逻辑表供视图过滤**，默认按 CM6/Markdown/PDF 当前焦点逻辑块的 **PBS `p` 值**只显示同一逻辑页，AG 工具栏最左端「全部」checkbox 勾选时显示全部逻辑块，取消勾选恢复当前焦点 `p`。这里的 `p` 是逻辑归属页，不是跨页块的原始 PDF 物理页；过滤不修改 SQL，列由数据库元数据提供，横向虚拟化不等于字段缺失。**逻辑表 AG 显示列序以 `PBS`（左固定、当前可见文本最适宽度、可拖动列宽、不可排序）、`Type`（V1 列值复选、当前可见文本最适宽度、可拖动列宽、不可排序）、`MD Block`（`md_block`）开头**；其余物理字段全部保留在后，并附只读外联字段 `Raw Block`（基础表 `block_json` + `raw_path`），基础表列序不变。源码窗为**唯一可编辑 CM6 文档**。已发布 WP23C 仍采用旧虚拟补尾/单块单行限制，现已废止为目标规则；新正文归属、真实空行及事务依第 3.1 节，待实现。现有 850ms 空闲 SQL 增量写回、旧值冲突保护与统一 Undo/Redo 须保留。Markdown 预览由真实 V1 渲染器投影当前 CM6 文档。AG↔CM6↔MD↔PDF 同步高亮定位和结构；PDF 原始几何只读，但 PBS 拖动关系可编辑。
- **V1 PDF 现状**：直接复用 V1 `lab-ocr` 的 `mountLabOcrPdf` 和 `layoutPbsLabels` 原版动态多轨、引线、手势与 PDF.js。三窗时预览下拉可选 PDF/Markdown；四窗切分时同一个 PDFViewer 和工具栏 DOM 移入独立面板，恢复也不重新建立 PDF 实例。原始 PDF 位置只取基础表的真实 bbox，失配/多来源/无 PDF 时不伪造覆盖框。
- **PBS 三列现状**：`scripts/v2_pdf_projection.py` 从持久化 `p、b、s` 生成 `p0b0s0` 等两层标签，禁止孙块，不从 `logical_order` 全页重编号。WP07 复用 V1 PDF 拖动可调整根块组前后顺序、归入为子块、调整同组子块前后顺序（含 V1 支持的相邻跨页归入）；**插槽处及其后所有同级编号统一顺延，不跳过空号**；结构经 CM6 内存事务、AG/PDF 即时显示和空闲 SQL 增量更新。**手工拆分子块、任意脱离父组操作仍未开放；WP10 已开放 CM6 正文编辑**。

## 3. PDF 逻辑块 → MD Line（2026-11-24 用户最新批准）

### 3.1 唯一现行目标 [已批准；尚待实施]

**实施进度**：WP25A–D 已通过隔离验收；公共索引接入 CM6 行编辑、行号菜单及 PDF 行操作；WP25E–G 待实施。

本节取代 WP08/WP13/WP14/WP18/WP23C 的虚拟 LF、单块单行和旧编辑限制，也取代 WP23G 的显式分割、人工 logical_id 库存增删，以及 WP23H 的块级有效 Type 与同一单元格堆叠标题。已验收的历史代码和 Git 证据不删除，不再作为新构建目标。现行发布仍为 WP24，不因文档更新改变运行行为。

**A. 两表不变、行级公共投影**

- `mineru_base` 保留不可变的原始 MinerU/PDF 证据；`logical_block` 保留原始块对应的稳定 `logical_id`、两层 PBS、持久化来源类型及完整 `md_block`。CM6 是唯一会话可编辑正文，SQL 是唯一持久化正文。
- `MD Line View` 是从唯一 CM6 正文、现有逻辑块边界和来源信息派生的通用内存行索引；不新增物理表、SQL VIEW、第二个 EditorState、专用标题行集或持久化行号。所有行级业务使用这一公共投影，不分别计算 PBS/行号。
- 每个真实 LF 终结一个合法 MD Line，包括长度为零的空行。逻辑块的全部真实字符（含 LF）必须有且仅有一个归属；块间空行属于前块。CM6 自动折行不是新 MD Line。最终 LF 后 CM6 的 EOF 光标位置不是额外持久化行；它只是在已有正文末端可编辑的位置，输入产生的真实内容按末块归属并维护真实 LF。
- 块内行偏移从 0 开始，物理源码行号从 1 开始，按 CM6 当前文档计算。行偏移和行号会随编辑/归组变化，不能充当稳定持久化身份；行定位使用当前文档版本 + logical_id + line_offset，跨修订必须重新解析或拒绝过期定位。

| 公共行字段（WP25A 已验证接口） | 含义 |
| --- | --- |
| logical_id / base_blockid | 所属稳定逻辑块 ID 与原始基础块 ID |
| pbs（p/b/s） | 当前所属逻辑块的两层编号；随块归组/排序而变 |
| line_offset | 块内第几条真实硬回车行，0-based |
| source_line | CM6 当前物理行号，1-based（非视觉折行） |
| from / to | CM6 UTF-16 半开区间，包含该行真实 LF；可另计算 textTo 指向 LF 前 |
| md_line | 行正文（不含行末 LF）；空行是空字符串，重组时 LF 不得丢失 |
| block_type | 继承所属逻辑块的持久化 Type，空行亦继承，不随 Markdown 内容改变 |
| line_type / title_level | 当前独立派生 title/text/blank 与标题层级（非标题为 null）；后续元素属性逐步扩展，不改写 Block Type |

例：块 `p1b3s0` 的 `md_block = "A\n\n## B\n\n"` 从 CM6 第 21 行开始，产生偏移 0/1/2/3、物理行 21/22/23/24，内容依次 A、空、## B、空。四行继承相同 Block Type，只有第三行的 Line Type 为 title。下一块从第 25 行开始。按逻辑顺序及行偏移拼回所有 md_line + 原 LF，必须与 CM6 全文及各 SQL md_block 精确相等。

**B. 行级编辑与归属**

- CM6 行号菜单、源码编辑、PDF 文本插入/替换、业务审阅改写均以真实 MD 行为操作目标，不把整块正文当成一行；普通字符输入、删除、Enter、粘贴仍由原生 CM6 事务完成。行级 API 不绕开 CM6。
- 新增行继承上一行的 logical_id、PBS 和 Block Type；例如在 A 块最后一个空行按 Enter，新行仍属 A，后续 B 原有行不换归属。行首、块交界、EOF 和多行粘贴必须按实际事务的旧行及新增行区分；文档开头没有上一行时继承首块。非换行字符编辑原有行时保持该行既有归属，不能把下一块首行挪给前块。验收用真实 LF/UTF-16 边界，不用光标位置猜测。
- 删除或编辑行不得删除逻辑 ID，也不改其他块的 PBS。清空块时保留有归属的真实空行。跨块范围操作不得静默吞并原有块或把剩余文字错误归属；WP25C 先验证无歧义的逐块行删除/替换，不能确定归属时整笔拒绝并保留正文，未经专项确认不开放隐式跨块合并。
- 取消显式 PBS 分割：撤下 WP23G 的「在此分割逻辑块」菜单及公开操作，禁止普通行编辑或业务 View 生成任何新逻辑块 ID、人工子块或库存增删。旧已存在的人工逻辑 ID 不得静默删除/合并；先识别并报告，是否按 WP24 已有明确初始化入口重建该书由用户决定。无新建人工块功能；原始 MinerU 初始化仍可创建原生根与直系子块。
- 保留 WP23D/E/F 的真实 LF 与归组规则：独立组末至少一个真实空行，组内相邻子块至少一个真实 LF；新归组消除新形成的子块间多余空行，保留块内及既有相邻边界的人工空行。空行维护必须在同一实际 CM6 历史事务完成，不在加载/保存或渲染时偷偷补删。PBS 归组、排序仍以逻辑块为单位，保留原有 V1 PDF 手势和两层规则，禁止孙块。
- 编辑单位是行，持久化单位仍为块。只对受影响的 MD Block 重组写回，保留 WP18 严格全文/各块重组校验、旧值 CAS、原子事务及失败保留内存。原生 CM6 Undo/Redo 同时恢复正文、真实 LF、逻辑区间及派生行索引；不增加平行历史或仅为行号变动写入 SQL。PDF 原始页号/bbox 及来源始终不变。

**C. 行级 View 和多窗定位**

- 同一 AG Grid 保留原逻辑块审阅（PBS、Type、MD Block），并增加通用 MD Line View；行级列建议为 MD Line、PBS、块内偏移、源码行号、Block Type、Line Type。字段/列序经航点验收，不改变已验证的块审阅列契约。
- 标题 View 用同一 MD Line 行集的原生 Line Type=title 多值筛选，不把普通 text 块内所有行升级为 title；同一块含多标题时显示为各自的 AG 行，复用 V1 原着色、全局基础字号和 AG 原生表头过滤。围栏内 # 不误判；添加/删除标题及时进出筛选。其余 LaTeX、注释、非法断行、媒体、HTML 表格待行级基础验收后分别规划；多行元素/跨行关联使用公共行范围，不假定每个元素必然只占一行，也不另建可写文档。
- AG/CM6/MD 预览以实际 source_line 或经公共索引校验的行范围定位；PDF 仍定位原逻辑块覆盖框。PDF 点块默认定位所属首行（保留既有聚焦规则），CM6 同一块内换行应更新行级 AG/Markdown 焦点而不重绘/改变 PDF 原始框。阅读滚动不等于显式焦点。逻辑页码范围继续通过 PBS 派生，排序或拖动后行号即时重算。

**D. 数据兼容与发布边界**

- WP24 已获准不迁移旧编辑、通过 SQL 组显式初始化；该授权不等于后续自动清理任意书籍。新目标优先复用 v3 真实 LF、两表和现有 API，不要求变更 SQLite schema 或重新初始化已兼容的书籍。若发现旧人工块或其他不兼容状态，只读检查并阻止不安全写入；不未经确认重建、迁移或删除。恢复仍使用明确授权的备份/初始化路径。
- WP23G 库存变更协议需要在独立航点退役；旧缓存客户端的创建/删除请求须安全拒绝，不能只隐藏按钮。旧有效块 Type 与标题堆叠仅在行级替代通过后移除，不以删测试代替验收。当前兼容旧未标记库的既有安全门禁继续有效。

### 3.2 实施航路（WP25，逐航点验证、一构建一 Git）

固定基线 `0b29707`（WP24 已发布）。本 README 提交是规划检查点，不是源码发布。下一航点从当前规划提交建立隔离测试，保留 WP24 恢复点。各航点先确定公开 API/事件及独立测试、再做真实 UI；不同时重写 Frame、PDF、SQL 和全部 View。一个航点只有在独立测试、必要交互/数据回归、Git 留痕及门禁通过后才完成；不发布破坏已有行为的过渡版本。

| 航点 | 最小目标与验收 |
| --- | --- |
| WP25A · 公共 MD Line 索引 [隔离 PASS] | 纯投影 API：由当前 CM6 真实正文与区间生成双向行索引，字段、空行、EOF、Unicode、跨页/组内边界准确；真实 267 块夹具逐行逐块精确拼接、无遗漏无重叠，验证正反向定位；只读，不改编辑/SQL/UI。实际两份 267 块 SQLite 夹具在 Node/Chromium/iPad-WebKit 分别完整验证 491/497 个真实 MD 行、83,383/83,337 个 UTF-16 位置；详见 [WP25A 接口与验收](docs/v2/WP25A_MD_LINE_INDEX.md)。 |
| WP25B · 退役显式分割 [隔离 PASS] | 移除菜单、人工 ID 分配和库存新增/删除操作，拒绝旧创建请求；保留普通行编辑与块归组，已有人工 ID 只读兼容检查，不自动改库。浏览器菜单及后端拒绝写入测试，保持原 267 个 ID、原 PDF 几何。 |
| WP25C · CM6 行级编辑归属 [隔离 PASS] | 复用 A 的索引与原生 CM6 事务，验证行首/行尾/真实空行/块交界/EOF、Enter、多行粘贴、删行、清空块、跨块保护与同块光标定位；新增行继承上一行，旧行所属逻辑 ID 不变，完整重组、Undo/Redo、SQLite 局部 CAS 及重开一致。 |
| WP25D · PDF 归组与行级操作回归 [隔离 PASS] | 保留 V1 拖放、组末真实空行和已验证归组原子保存；验证行偏移/物理行号随重排实时更新，行号菜单的删除、PDF 插入/替换以行定位，原始 bbox 与非目标文字不变。 |
| WP25E · 通用 AG MD Line View | 同一 AG 实例新增公共行级行集预设，保留块审阅原列序、页范围/全部及 V1 原生多选过滤；准确行号/偏移、继承 Block Type、AG/CM6/MD/PDF 双向定位、同块跨行焦点、滚动不抢焦点。禁止新 SQL 查询或专属正文。 |
| WP25F · 标题 View 行级复现 | 对同一 MD Line 行集应用 Line Type=title 原生过滤，逐标题一行、V1 标题着色与全局字号；任意空行输入/删除标题实时更新，围栏排除，多标题同 PBS 不堆叠、不拆块；切回块审阅不改正文，保存重开一致。 |
| WP25G · 集成验收与发布 | Chromium/iPad-WebKit 真实工作台跑完整 A–F 及 WP24 初始化、旧库保护、归组、编辑、标题、持久化/冲突回滚；核对两表、全量正文、身份、PDF 坐标、V1 组件和统一布局门禁。提交/推送并通过统一发布器核对实际 SHA 后，交用户 iPad 人工验收；未获授权不改用户库。 |

验收未完成必须继续在本航点执行或按联邦 BUILD 保全故障证据回退，不跳到后续功能。各航点只实施约定范围；WP25G 完成之前暂停其他元素 View。

**历史基线与证据**：WP23D [真实 LF](docs/v2/WP23D_OWNED_LF.md)、WP23E [真实多行编辑](docs/v2/WP23E_OWNED_EDIT.md)、WP23F [归组原子事务](docs/v2/WP23F_OWNED_STRUCTURE.md) 均通过隔离验收，应继承无冲突成果。WP23G [显式分割](docs/v2/WP23G_OWNED_SPLIT.md) 及 WP23H [块级多标题](docs/v2/WP23H_OWNED_TITLES.md) 当时通过隔离验收，但本次架构已明确淘汰其人工分割和标题堆叠方案。WP24 [全新初始化](docs/v2/WP24_FRESH_OWNED_INIT.md) 已发布（0b29707），真实 Chromium/iPad-WebKit 初始化和重开通过，用户实机验收未完成；此前 v3 协议及真实 LF 安全规则保持。

### 3.3 已发布旧实现的历史记录（有冲突者已废止）

- **WP13 [历史实现，已被 3.1 取代]**：旧版使用 `groupEndPad` 投影虚拟 LF，不落盘。保留其历史证据 [WP13](docs/v2/WP13_CHILD_SINGLE_NEWLINE.md)，不得复用虚拟补尾设计。
- **WP14 [历史实现，已被 3.1 取代]**：旧版单块单行、禁止多行输入、SQL 单行整理均不再是目标要求。证据见 [WP14](docs/v2/WP14_ONE_LOGICAL_BLOCK_ONE_LINE.md)。
- **WP14B [历史实现，正文规则已被 3.1 取代]**：旧版组末虚拟补尾与单行整理不得恢复；独立的 PDF 切分/恢复图层修复仍保留。证据见 [WP14B](docs/v2/WP14B_GROUP_BLANK_AND_SQL_ACTIONS.md)。

**用途**：修正 OCR 块识别时的张冠李戴、跨栏/跨页归属错误、既有原始块归入和重组（不再新建/分割 PBS）；**只允许“父块分组 → 子块”两层，禁止孙块、递归多层和复杂树结构**。

- **字段与身份**：逻辑表已将 `p`、`b`、`s` **作为三个整数持久化**，对外显示 `pNbMsK`。`pNbM` 为父块**分组**，不另建一条父块 SQL 行；每个实际逻辑行代表 `sK` 子块，`(p,b,s)` 在当前逻辑表唯一。`logical_id` 保留为稳定的内部行身份；AG 首列显示派生 PBS，所有十个 SQL 真实字段仍可检查。`base_blockid` 指向不变的原始基础块 ID，PDF 物理页和原始 bbox 始终来自基础表，跨页逻辑归属不改变物理覆盖框。
- **默认 `s0` 与 `s1+`**：每个 `para_blocks` 顶层基础块仍是唯一 `s0`，其原始 JSON 直系子元素分别是同组 `s1+`（table_caption/body/footnote、image_body、chart_caption/body/footnote 等）。子行可以和父行共用 `base_blockid`，但 `logical_id` 各自唯一，不能把多个原始类型的 Raw Block 合并为一个 MD Block。没有第三级。
- **插入槽位顺延（WP07 已接入 V1 手势与 SQL 事务）**：父块 `before` 在目标 `b` 腾槽（目标及后续 `b+1`），`after` 在目标 `b+1` 腾槽（后续 `b+1`）；父块带所有子块一起移动，其 `s` 和 `parent_id` 保持原关系，受顺延的父块子块同步更新 `b`。例如 `p1b3s0` 移至 `p1b4s0` **之后**：目标保持 `p1b4s0`，移动块成为 `p1b5s0`，原 `p1b5s0` 及其后所有同页父块成为 `p1b6s0` 等。旧 `p1b3` 留空不补号。子块 `before/after` 对目标 `s/s+1` 腾槽，后续同组 `s+1`；`child` 在目标 `s+1` 腾槽，归入多行父块组时按插入行数顺延后续 `s`，不产生孙块。**即使原编号有空号，也统一顺延，不因空号停止**。不在整个页上重新从零编号；只修改受影响的逻辑行。PBS 可有空号，不要求连续。
- **WP07 iPad 实机 no-op 修复**：CM6 文本顺序不变**不等于**结构没变化。旧版曾只移动 `logical_order`、PBS 保持旧编号；遇到此类已按目标排列但 `b/s` 仍颠倒的状态，拖动必须允许**只更正 PBS**，经同一 CM6 StateEffect/Undo/Redo 和空闲 SQL 差量事务写回。只有块序已符合目标且 PBS 同级顺序也正确时，重复放置才是真正无操作；不创建 CM6 历史、不标脏、不写 SQL，状态栏提示「已在目标位置」，不可报「写入失败」。回归见 `tests/v2-structure-move.test.mjs` 和 `tests/v2-mineru-base.browser.test.mjs`。
- **结构/状态职责**：`p,b,s` 管当前归属编号，`logical_id` 不变；CM6 的 StateField / StateEffect 负责内存结构、正文和同一原生 Undo/Redo；当前 WP24 源码窗仍按块归属编辑；WP25 以第 3.1 节 MD Line 行级操作为目标，禁止无归属字符及任何编辑新增逻辑块身份。SQL 仅存最新状态，不加历史表。空闲后 `structure-commit` 使用 Frame F02 目录权限、旧值乐观冲突检查、`BEGIN IMMEDIATE` 事务、局部五列 `UPDATE`，冲突回滚、CM6 当前状态保留并警告；已保存的 Undo/Redo 也作为新的增量变更写回。
- **当前范围和起点**：只将 `para_blocks` 根及其直接子元素初始化为逻辑块；其余原始块组保留在基础表。PBS 根按原始 PDF 页顺序初始化 `p/b/s0`，原生子元素依源顺序标 `s1+`。PDF 子块优先投影自己的原始 bbox，没有可用子 bbox 再沿用原始父块 bbox。
- **WP07 验收门禁**：真实 V1 PDF 标签拖动，包括 `p1b3s0 → p1b4s0 之后` 的根块和后续 `b+1`、同组子块 `s+1`、父块带子块、缺号仍顺延、跨页原 bbox 保持原位、无孙块、AG/CM6/MD/PDF 联动、同源 CM6 Undo/Redo、SQL 延迟增量事务、冲突回滚；并单独验证 iPad-WebKit 和正文编辑不破坏 PBS。**拆分新文本子块不属于 WP07**。

## 4. 旧 SQLite 原地升级与数据边界：[WP10 已增加 9→10 列保护性迁移]

- **WP10 MD Block 物理字段与安全迁移**：十列逻辑表以 `md_block` 唯一持久化正文；`raw_path` 是原始子元素外联路径，AG 的 `Raw Block` 从基础表只读动态获取，不在 SQL 再存一份。旧九列 `markdown_text` 经来源 SHA 验证后在一个事务内升级为 `md_block` + `raw_path`，保留已有人工文本/PBS，不因刷新重建；新书初始化仅一次生成 Markdown 标题、图片、公式标记。`md-commit` 使用逐行旧/新值乐观校验保存文本，CM6 编辑/Undo/Redo 可回写，失败保留内存；原基础表不修改。
- **WP15 SQL 表格修复操作**：原 SQL 组增设「恢复跨页表格正文（不重建）」：首次点击只读预览有来源证据、未改动原 `md_block` 的候选行，第二次确认才一次性进入 CM6 历史；SQL 仅执行现有 `md-commit`，不执行 `logical-rebuild`/`structure-commit`，不修改 PBS。重建逻辑表依然是破坏性操作，本修复不需要点击它。详见 [WP15 真实表格恢复](docs/v2/WP15_PAGE_LOCAL_TABLE_RECOVERY.md)。
- **WP09 SQL 组入口（历史；WP24 已改为初始化逻辑表，见 3.1D）**：沿用原 Tom Select 导航的 SQL optgroup 标题点击事件，模态弹窗区分三个动作：`导入基础表` 使用 F02 `import`，同源非空逻辑表保留不覆盖；`重建逻辑表（覆盖编辑）` 经二次明确确认后调用 `logical-rebuild`，只在已授权资料目录事务覆盖 `logical_block`（**当前正文和 PBS 会被清除**），不修改 `mineru_base` 及原文件；`仅整理正文断行（不重建）` 经二次明确确认后使用 CM6 Undo/Redo + 增量 SQL 正文提交，不改变 PBS。原 SQL 表条目继续切换 AG 视图，AG 顶栏不新增数据操作按钮。 **其中「仅整理正文断行（不重建）」是旧版功能，按第 3.1 节退役，不能用于新架构。**

- WP05 时用户明确当时 V2 **没有任何人工编辑**，同意直接升级 PBS，不要求先建独立 WP05 门禁。已知五列、六列 `logical_block` 在来源不变及 Frame F02 授权验证后，**原地事务升级九列（WP10 再升级十列）**，保留现有文本、ID、顺序和类型，不执行整体从 MinerU 重建覆盖。
- 已修复早前“未知九列非空逻辑状态被自动重建造成内容丢失”的入口：不兼容且非空的未知逻辑表现在**拒绝覆盖**，仅已确认的五/六/九列执行可验证迁移；空逻辑表可按原规则补齐。测试见 `tests/test_v2_pbs_upgrade.py` 与 `tests/test_v2_mineru_base.py`。
- 数据读写仍要求已保存资料目录、F02 目录白名单与读写 `probe`，保护 MinerUJSON/PDF 原件、其他书籍和 Lab。活动 SQLite 日志、符号/硬链接、来源 SHA 不一致等情况下拒绝不安全迁移。
- 未验证过的未知旧 Schema 仍可能被拒绝；不能为让它看起来兼容而擅自删除重转。

## 5. 开发、验收与发布门禁

- **按联邦/州约定执行**：任务开始依次读统一根目录联邦 `AGENTS.md`、`BUILD.md`、`COMM.md`，再读本州 `AGENTS.md` 和本 README，查受影响源码、公开 API 和独立测试；先固定可回退 Git 点；在隔离夹具上实验，不以推测修补未定位故障；任何新的结构 Schema 必须有明确迁移与数据恢复测试。README 只记录当前项目契约，开发历史放 `docs/v2/`。
- **Frame/F02**：`ui/frame/*` 基线一致性和 Settings 保存、权限验证、两表导航；旧 `/api/v2/` 不得复活。V2 的业务 API 为 `/labs/lab-ocr-v2/api/mineru-base/{state,import,markdown,pdf-map,pdf,structure-commit,logical-rebuild}`；`structure-commit` 和 `md-commit` 均仅允许带 Frame 会话/同源来源/旧值校验的 POST 差量提交，只处理本书籍的授权数据；不新设端口、Tunnel、认证或平行文件管理器。V2 的 F03 自动更新在 CM6 结构未保存时延后执行，不依赖 iOS 的离开页面弹窗。
- **现行测试**：`python3 tests/test_v2_mineru_base.py -v`（两表、原始字节与兼容迁移）、`python3 tests/test_v2_pdf_projection.py -q`、`python3 tests/test_v2_pbs_upgrade.py -q`、**`python3 tests/test_v2_structure_commit.py -q`**；`node tests/v2-block-source.test.mjs`、`node tests/v2-block-source-fixture.test.mjs`、`node tests/v2-focus-map.test.mjs`、`node tests/v2-logical-ag-filter.test.mjs`、**`node tests/v2-structure-move.test.mjs`**、`node tests/lab-ocr-pbs-layout.test.mjs`、`node tests/v2-pdf-evidence-adapter.test.mjs`；`node tests/v2-mineru-base.browser.test.mjs`、`node tests/v2-real-markdown-preview.browser.test.mjs`、`node tests/v2-clean-frame.browser.test.mjs`、`node tests/v2-clean-frame-isolation.test.mjs`。WP08 重点手势回归可用 `V2_TEST_WP08_ONLY=1 node tests/v2-real-markdown-preview.browser.test.mjs`，保留不加标志的全量 WP07 PDF 手势测试。浏览器回归包括 Chromium 和 iPad-WebKit，重点检查真实 V1 PDF 标签拖放、CM6 源码可编辑及唯一正文归属、Undo/Redo 后 SQL 再次写入、PDFViewer 不换实例、不重复下载及原 bbox 不变；**实机 iPad Safari 仍须单独验收**；WP10 还需 `tests/test_v2_md_block.py`、`md-commit` 的冲突回滚和 Type 表头筛选测试。
- **Git/发布**：变更经过有依据的定向回归与审计、commit/push 后，按 `AGENTS.md` 第 9 节的唯一 `release/`+manifest 网关发布同一 `lab-ocr-v2` 入口，核对 Git SHA、静态文件 SHA256 和其余 Lab 不变。WP07 修改 SQLite 写入接口，发布后必须通过既有 V2 发布脚本同步刷新常驻 Gateway 的 Python 业务模块。
- **V2 后端运行版本同步**：Gateway 使用常驻 Python 进程导入 V2 模块；静态资源发布不等于更新其 `sys.modules` 缓存。V2 的正式发布脚本 `scripts/v2_frame_publish.py` 对比上次发布 SHA 与本次 Git SHA，若 V2 五个 Python 业务模块发生变化，发布后只通过既有 `launchctl kickstart -k` 刷新 **同一个统一 Gateway**，并核验 `/labs/healthz` 的发布 ID；纯静态变更不重启。禁止清理用户书籍 SQLite 或建立第二个 Gateway。直接测试：`python3 tests/test_v2_gateway_publish_sync.py -q`。

## 6. 既有航点文档（历史证据与模块说明；不得覆盖本 README）

- 当前航点：[WP07 PDF 拖放、CM6 结构历史与 SQLite 空闲写回](docs/v2/WP07_PDF_DRAG_CM6_STRUCTURE_IDLE_SQL.md)。
- 历史（正文旧规则已废止） WP08：[CM6 父块组末尾空行与无分隔拼接](docs/v2/WP08_CM6_GROUP_END_BLANK_LINE.md)。
- 当前 WP09：[para 原始类型/内容与仅重建逻辑表](docs/v2/WP09_PARA_RAW_LOGICAL_REBUILD.md)。
- 当前 WP10：[MD Block 唯一正文、Raw Block 外联及 CM6 编辑增量回写](docs/v2/WP10_MD_BLOCK_CM6_PERSISTENCE.md)。
- 历史（正文旧规则已废止） WP13：[成为子块时只消除自动空行，保留一个换行](docs/v2/WP13_CHILD_SINGLE_NEWLINE.md)。
- 历史（正文旧规则已废止） WP14：[一个逻辑块一个正文行、组间保留空行与既有书籍安全规范化](docs/v2/WP14_ONE_LOGICAL_BLOCK_ONE_LINE.md)。
- 当前 WP15：[真实跨页表格正文无损恢复、既有书籍安全补齐](docs/v2/WP15_PAGE_LOCAL_TABLE_RECOVERY.md)。
- 当前 WP16：[PDF 虚线跟随当前逻辑正文并保留 OCR 原始证据](docs/v2/WP16_PDF_EMPTY_STATE_SYNC.md)。
- 当前 WP17：[V1 行号按钮删除正文与高亮覆盖框 PDF 文字层提取](docs/v2/WP17_V1_LINE_GUTTER_PDF_NATIVE_TEXT.md)。
- 当前 WP18：[CM6 实时 MD Block 区间归属与 p1 前缀丢失事故处理](docs/v2/WP18_MD_PREFIX_DRIFT.md)。
- 当前 WP19：[滚动只影响阅读位置，不切换 CM6 光标和跨窗高亮](docs/v2/WP19_SCROLL_FOCUS_SEPARATION.md)。
- 当前 WP20：[行号菜单 PDF 原文插入/替换与唯一 CM6 归属](docs/v2/WP20_LINE_NATIVE_PDF_INSERT_REPLACE.md)。
- 当前 WP21：[PDF 文字替换/插入后的 CM6 源码窗口位置保持](docs/v2/WP21_PDF_SOURCE_VIEWPORT_STABILITY.md)。
- 当前 WP22：[默认三窗右侧 PDF 2/3、AG 顶栏与模块命名](docs/v2/WP22_DEFAULT_PDF_2THIRDS_REVIEW.md)。
- 本轮 PBS 实施：[PBS 三列直接升级](docs/v2/WP05_PBS_THREE_COLUMNS.md)。
- PBS 三列升级：[PBS 直接升级与两层规则](docs/v2/WP05_PBS_THREE_COLUMNS.md)。
- 两表和 Markdown：[WP01 逻辑契约](docs/v2/WP01_LOGICAL_CONTRACT.md)、[WP02 初始化](docs/v2/WP02_LOGICAL_INITIALIZATION.md)、[WP03 无损往返](docs/v2/WP03_MARKDOWN_ROUNDTRIP.md)、[WP03 类型列](docs/v2/WP03_BLOCK_TYPE_CONTRACT.md)；当时的文字可编辑 CM6 属于历史，**WP10 起 CM6 正文可编辑，新编辑归属以第 3.1 节为准，并始终保护原始 Raw 数据**。
- CM6/Markdown/联动：[WP04 CM6](docs/v2/WP04_CM6_SOURCE_CONTRACT.md)、[V1 MD 预览](docs/v2/WP04_V1_MD_PREVIEW.md)、[多窗联动](docs/v2/WP04_V1_MULTI_PANE_SYNC.md)；其早期“PDF 无真实数据/仅三窗”结论已被后续 PDF 接入取代。
- 正确 V1 PDF：[真正 V1 多轨源](docs/v2/WP04_V1_LABOCR_MULTILANE_SOURCE.md)、[单窗与切分恢复](docs/v2/WP04_V1_PDF_PREVIEW_SPLIT_LIFECYCLE.md)。早期 [错误 PDF 映射](docs/v2/WP04_V1_PDF_PBS_SYNC.md)、[错误复用方案](docs/v2/WP04_V1_PBS_DIRECT_REUSE.md) 曾误将 V0/Main 的固定双轨当 V1，**仅保留为失败证据**，不可作为当前复刻依据。
