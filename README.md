# Lab-Translation · 校译州

## 当前可运行基线（WP04F3，继承 WP00–04F2）

独立工作树 `experiment/lab-translation`，从已验收的 lab-frame `1dbc2b7e4c754330b8d3b365008e4c2e9edc39c9` 建立；不是旧 `translation-lab` 的覆盖升级，也不是 Main 镜像或晋升候选。公共 Frame 布局和组件契约不变，本州界面接线仅涉及 frame.js/layout.js 及独立校译模块；Vite 精确适配品牌、自动更新身份和本州浏览器设置命名空间。默认打开全局设置，未绑定时业务窗格为空，导航只含 settings.json，继承保存、Undo/Redo、Sarasa、目录选择及共享 F02 权限。WP00 不加载或初始化任何书籍 SQL，不生成 trans，不读写正文，不接入 AI。WP04 已撤下 PDF 空白占位及切分控制，原预览窗内切换 Markdown / 翻译 Prompt。

唯一正式入口 `/labs/lab-translation/`，通过统一 `release/` manifest 与门户登记；使用现有网关和 `/labs/lab-frame/api/workspace-io/` 公共 F02，不增加端口或 Tunnel。浏览器设置键 `ocr2md.lab-translation.settings.json.v1`，不读取 Frame、V2 或 Sentence 的设置。F02 授权仍由 Frame 的独立签名会话及目录白名单负责；用户主动选择目录时才按 Frame 约定探针，WP01 不自动读取 SQL。

## WP04F1 · 单一译句表、统一 SQL 初始化及回填

本州唯一业务表为 `translation`（位于授权书籍的 `ocr2md.v2.sqlite`）；上游 Sentence 州仅为只读输入，不提供独立原句表界面或缓存会话。目录验证后 SQL 组仅显示「SQL 初始化」；一次操作完成上游快照只读获取、保护识别、生成/校验本州译句表、阅读模型装载；成功后 SQL 组增加唯一「译句表」并自动进入。原 AG、源码、MD 预览、Prompt 位置不变。未绑定不显示 SQL 组；失败或换目录清空旧数据和导航，迟到响应不能覆盖新目录。原句 GET 是初始化内部的短暂校验输入，不持有第二份业务快照。CM6/MD 阅读直接从译句表 raw 拼接、protected 淡化。

字段：source_line（MDLine）、sentence_index（联合主键）、raw（完整原句）、type、level（继承上游）、text（待校译文本）、protected（唯一回填清单，JSON 有序非重叠半开 UTF-16 区间 `{from,to,kind,text}`）、translatable（0/1），policy/source_line_hash/source_document_hash/sentence_sha256（来源及识别身份）。不重复保存 fill_list。占位符按本句 protected 的序号生成 ⟦P0⟧、⟦P1⟧…；若 RAW 含该前缀，逐次在 P 后加下划线直到无碰撞。每句作用域独立。全文保留所有句，包括整句不可翻译、空行、末尾 LF；整句不可译的 text 仍为完整保护占位符序列。回填一次扫描，拒绝未知、重复、缺失、畸形占位符。初始化强制校验每条 text 为规范模板、回填与 raw 逐字符一致、全书回填 SHA 等于上游 source_document_hash；浏览器独立重算模板和回填，并逐行核对上游瞬时快照，未通过则不进入界面。

公开来源沿用 Sentence WP04F6 的 GET snapshot；客户端一次初始化内部 GET + POST，本州写端只接受 workspace 和两摘要；F02 授权、Origin、目录白名单保持不变。SQLite mode=rw，不新建库，BEGIN IMMEDIATE 内复读上游公开快照；authorizer 不允许读写上游业务行。已有 WP02 旧表仅在完整 schema 和所有旧字段逐项相等时事务内 ALTER ADD COLUMN text、只写新增字段，校验回读；否则拒绝，保留旧数据。新表或升级后的 schema 一致；再次初始化同源数据无写入。不得删除、替换或自动覆盖过期表，尚无人工重建策略。

保护规则继续使用 wp02/v1，不修改扫描：全文按语法开头识别 LaTeX、媒体、代码、HTML 标签/属性/注释/实体/字面量、脚注及链接、URL/email、Markdown 结构，再投影回句并保护首尾空白和空行。interline_equation/image_body 整句保护；不含未保护 Unicode 字母的句子整句不可翻译。复杂畸形语法仍需人工核实。

| API | 直接验收 |
|---|---|
| readOriginalSnapshot / validateOriginalSnapshot | 同源只读 GET、上游双摘要与字段验证；tests/translation-original.test.mjs |
| build_rows / template / refill / check_row | 原句保护、占位模板与无损逐句/全文门禁；tests/test_translation_preparation.py |
| POST translation/initialize | ocr2md-translation-preparation/v2，created/ready/migrated，事务与旧表安全；同上 |
| initializeTable / initializePreparation / validatePreparation | 单次逻辑初始化、双摘要和逐行回填验证、取消和失败不返回中间表；tests/translation-preparation.test.mjs |
| createFrameWorkspace.setTranslationRows / createReadingDocument(table) | 单表 AG 与 RAW 阅读坐标；tests/translation-reading.test.mjs、双浏览器门禁 |

## WP04F2 · AG 原句表 / 待译句表

初始化成功后，AG 自身下拉启用「原句表」（默认）与「待译句表」，源导航仍仅一个 SQL 初始化与译句表入口。原句视图以 raw 为主列、显示全部记录；待译视图以 text 为主列、仅保留 translatable=true 的记录，raw 与回填元素仍可核对。两视图的筛选状态独立。切换为纯内存派生，不建 SQL view/表、不调用初始化 API、不写数据库；换目录或清空时恢复原句视图、清除筛选及禁用业务下拉。

两阅读窗随 AG 视图切换：原句视图保留全文 RAW，待译视图只拼接可译句原始 RAW，完整不可译句仅保留原 LF 分隔（物理 MDLine 行号不变），可译句内部 protected 继续按原坐标投影并淡化。保留原 source_line/sentence_index 作为定位身份；省略区不定位到其他句；切回原句表恢复全文。待译视图不以 text 的占位符破坏预览；仅 AG 主列显示占位文本。跨句 Markdown/HTML 结构若依赖被省略句中的标记，派生预览可能与全文不同，原句视图始终保留完整结构。Prompt 状态与历史不受切换影响。

`createReadingDocument(table,{pending:true})` 为待译阅读投影，默认仍为无损全文模式。tests/translation-reading.test.mjs 覆盖同行与跨行省略、保留行号、保护坐标、全不可译及原始记录不变；tests/cross-version-ag-filter.browser.test.mjs 覆盖真实 AG 切换、两窗省略/淡化、定位、切回及无 API 请求。

## WP04F3 · 待译句双源码对照

仅 AG 选择「待译句表」时，原源码窗 body 左右等分，原顶栏导航/Undo/Redo 不移动。左窗复用已有只读 CM6 RAW 投影、原物理行号和保护淡化；右窗复用同一只读 CM6 组件但不显示行号、逐句显示实际 text，回填占位符淡化，句间新增 LF 仅作显示分隔、不写入任何业务数据。两窗共享同一 source_line:sentence_index 身份，点击任一窗同步另一窗同句高亮以及 AG、MD 预览定位；预览仍只渲染左窗 RAW，Prompt 保持独立。双向垂直滚动以当前顶部原句身份和句内可视高度比例映射，使用 CM6 实际折行坐标、屏幕外块几何估计；不按像素硬同步。用户滚动输入确定主窗，接收端滚动不反向触发循环。两窗因折行高度不同、文档首尾滚动边界，不承诺逐像素对齐。切回原句表/清空时隐藏右窗并恢复完整 RAW；不改变 SQL、初始化、保护规则、文件或其他州。

| API | 直接验收 |
|---|---|
| createComparisonDocument(rows) | 从唯一表 text 构造句级坐标及占位范围，逐句回填校验；tests/translation-comparison.test.mjs |
| nearestSentence / fractionWithin / anchorHeight | 句身份与可视高度比例映射；同上 |
| mountReadingSource(host,onLocate,options) / mountSourceComparison | 复用 CM6、单双窗切换、行号、双向点击和实际 scrollDOM 验收；tests/cross-version-ag-filter.browser.test.mjs |

## WP03 · 无损 MDLine 阅读与保护淡化

统一 SQL 初始化成功后，AG 与两阅读窗共享译句表。原句 RAW 按上游顺序直接拼接，无插入、删除、规范化或重新分句；物理行号及 UTF-16 半开区间校验，末尾 LF 与空行保留。CM6 唯一只读正文，禁编辑及非装载文本事务，不增加历史或写入接口。已验证的 protected 逐句范围转换为全文坐标，源码采用 CM6 Decoration 淡化；导航切换不重复建表或写 SQL。来源变化或失败清空过期阅读/保护状态。WP03 当时保留 Frame、导航、字号、PDF 空白占位及 Prompt 边界；WP04 仅替换预览模式。

预览复用 V2 已验收的 markdown-preview、latex-inline-preview、裸媒体识别、CSS 与公共脚注卡片、局部授权媒体 URL；不调用 V2 可编辑会话。唯一校译阅读适配为可选 completeTableBoundary 解析规则，解决闭合 HTML 表格紧接独立公式时被 Markdown-it 吞入同一 HTML 块的问题，保留原物理行号。以 CM6 当前文本渲染，经既有 DOMPurify 消毒。已渲染的数学、代码、媒体、注号等不翻译元素以原保护范围和渲染物理行映射匹配，普通文本精确匹配后仅淡化对应部分；隐藏语法不强制显示。不对无法精确匹配的渲染归一化文本猜测字符映射。预览多句同一段落定位允许回退至映射块首行；源与 AG 按精确原句身份定位。未使用远端媒体下载/采用接口。

| 接口 | 契约与验收 |
|---|---|
| createReadingDocument(table) | 精确拼接、行首和句区间索引、保护区间投影；tests/translation-reading.test.mjs |
| mountReadingSource / mountReadingPreview | 独立只读显示端口 setDocument/locate/dispose；预览读取 CM6 正文；双浏览器实际阅读和三窗定位验收 |
| createFrameWorkspace.setReadingDocument(model,path) | 同源更新、清空、AG/源码/预览协调，不改变持久层；tests/cross-version-ag-filter.browser.test.mjs |

WP03 的预览保护匹配属于显示层，不构成新的保护识别规则。复杂 Markdown 归一化、未知 HTML 与精确行内点击仍需实书人工验收。未改动上游、WP02 识别策略或持久化结构。

## WP04 · 翻译 Prompt 编辑

保留原 AG 左窗、CM6 源码右上窗、预览右下窗及各自工具栏；撤下独立 PDF 占位和切分 checkbox。原预览下拉仅两个选项：Markdown 预览（默认）和翻译 Prompt。切换仅隐藏/显示同一窗中的阅读器和独立 Prompt CM6，不销毁编辑器、阅读器或其会话，不自动改 AG、原句、保护范围或 SQL。Prompt 模式工具栏自有撤销/重做，源码撤销/重做保持禁用。AG/源码定位继续联动，返回 MD 时恢复最后的阅读定位。

默认任务书沿用已讨论的统一校译要求：完整 MDLine 上下文、逐句 corrected/translated、目标语言、保护占位符、身份字段及独立 AI_ID.json；最终导出 schema 示例和目录路径留 WP05。WP04 的任务书为本州通用草稿，非按书籍存储：CM6 为唯一编辑权威，历史仅内存，显式点击顶栏全局保存（Prompt 模式）才将当前草稿写入本浏览器独立 localStorage 键 `ocr2md.lab-translation.prompt.md.v1`；切换和 Undo/Redo 不写盘。刷新加载已保存稿、历史重新开始。其他页面已改同一草稿时拒绝覆盖；保存失败保留编辑内容。设置模式仍保存 settings.json；原 Markdown 不可编辑。未生成 trans、未写用户文件或数据库、无跨设备同步。

| 接口 | 直接验收 |
|---|---|
| createPromptStorage(storage).read/save(text,expected) | 默认任务书、精确保存、空字符串、陈旧基线拒绝、失败传播；tests/translation-prompt.test.mjs |
| mountPromptEditor(host,options) | getText/getState/save/undo/redo/activate/layout/dispose；独立 CM6，由真实双浏览器验收 |
| createFrameWorkspace.isPromptActive/getPromptText/savePrompt | 原预览组合端口及全局保存分流；tests/cross-version-ag-filter.browser.test.mjs |

## 已确定的后续执行边界（尚未实现）

- WP05：指定目标语言；在书籍工作目录 trans/ 导出 sentences.json 与 prompt.md。整 MDLine 作为 AI 上下文、按既定句序输出；保护元素、来源/分句摘要、任务身份验证及无损回填。外部 AI 经 AgentDock 领取同一输入和提示词，只写自己的 AI_ID.json，逐句返回 corrected（拼写/OCR 校正，不润色）和 translated（基于校正后原文的指定语言译文），不得跨句移位或改动保护元素。文件生成和更新不得覆盖已有外部结果；具体冲突策略待该航点确认。
- 后续独立航点：验证导入多 AI 结果、保留所有译文、仅对校正分歧仲裁；未校正/未翻译如实标记，基于未采用校正的译文标明来源差异。最终按原句身份生成一份校正原文、多份译文的句级交叉互译文档，原句与上游始终不变。尚未确定最终校译存储 schema，不提前建额外表。

## 构建与验收

联邦 START 远端同步后，`node node_modules/vite/bin/vite.js build --config labs/lab-translation/vite.config.mjs`；`node tests/translation-frame.browser.test.mjs` 验证实际构建的双浏览器空框架、导航、独立设置、发布身份及跨州更新隔离。WP01/02 运行 `python3 -m unittest discover -s tests -p test_translation_preparation.py -v`、`node --test tests/translation-original.test.mjs tests/translation-preparation.test.mjs` 与既有设置/I/O 回归；`node tests/cross-version-ag-filter.browser.test.mjs` 在实际构建上验证两浏览器统一 SQL 初始化、单表只读显示、原生 Type 过滤、同目录刷新及换目录/失败清理。联邦布局检查与 `verify_cross_version_components.py --target lab-translation --browser` 为正式发布门禁。提交干净源码后重新构建，用 `python3 scripts/translation_frame_publish.py` 复用 Frame 正式发布器；随后检查线上 SHA、版本、manifest 文件哈希及其他 Lab 不变，完成联邦 END。真实 iPad 仍需用户验收。
