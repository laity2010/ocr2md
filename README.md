# Lab-Translation · 校译州

## 当前可运行基线（WP05A1，继承 WP00–05A）

独立工作树 `experiment/lab-translation`，从已验收的 lab-frame `1dbc2b7e4c754330b8d3b365008e4c2e9edc39c9` 建立；不是旧 `translation-lab` 的覆盖升级，也不是 Main 镜像或晋升候选。公共 Frame 布局和组件契约不变，本州界面接线仅涉及 frame.js/layout.js 及独立校译模块；Vite 精确适配品牌、自动更新身份和本州浏览器设置命名空间。已保存且授权的目录有合法译句表时启动自动进入；否则打开全局设置，未绑定时业务窗格为空，导航只含 settings.json，继承保存、Undo/Redo、Sarasa、目录选择及共享 F02 权限。WP00 不加载或初始化任何书籍 SQL，不生成 trans，不读写正文，不接入 AI。WP04 已撤下 PDF 空白占位及切分控制，原预览窗内切换 Markdown / 翻译 Prompt / JSON（WP05A）。

唯一正式入口 `/labs/lab-translation/`，通过统一 `release/` manifest 与门户登记；使用现有网关和 `/labs/lab-frame/api/workspace-io/` 公共 F02，不增加端口或 Tunnel。浏览器设置键 `ocr2md.lab-translation.settings.json.v1`，不读取 Frame、V2 或 Sentence 的设置。F02 授权仍由 Frame 的独立签名会话及目录白名单负责；启动及选择目录按 Frame 约定探针，通过后只读发现 SQL；不自动初始化。

## WP04F1 · 单一译句表、统一 SQL 初始化及回填

本州唯一业务表为 `translation`（位于授权书籍的 `ocr2md.v2.sqlite`）；上游 Sentence 州仅为只读输入，不提供独立原句表界面或缓存会话。目录验证后 SQL 组标题打开「SQL · 数据操作」；仅在缺表或可补全旧表时允许用户显式初始化，成功后 SQL 组增加唯一「译句表」并自动进入。已有表通过独立 GET 只读加载，不重新识别。原 AG、源码、MD 预览、Prompt 位置不变。未绑定不显示 SQL 组；失败或换目录清空旧数据和导航，迟到响应不能覆盖新目录。原句 GET 是初始化与只读加载内部的短暂校验输入，不持有第二份业务快照。CM6/MD 阅读直接从译句表 raw 拼接、protected 淡化。

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

## WP05A1 · 联邦 SQL 导航与自动恢复

遵守 COMM.md 第 5 节，复用 V2 Tom Select SQL 组标题/原生 dialog 交互及同款配色。未授权不出现 SQL 组；授权后即使无表也以不可选提示保留组标题，绝无「SQL 初始化」伪表项。点击标题或导航 Alt+Enter 打开弹窗；取消不执行操作。仅已有合法表作为唯一可选「译句表」。首次建表按钮仅在上游已保存原句且无表时可用；旧同源 WP02 表显示显式补全字段（不覆盖原有数据）；合法表不需初始化，来源不匹配、未知结构或权限/读取失败不自动重建，弹窗提供只读重新检查。没有危险重建操作。

GET translation/load?workspace=... 使用 F02 授权、SQLite mode=ro、普通读事务、仅本州 translation 与 SQLite 元数据 authorizer；只读公共 Sentence 快照确认来源、句序、RAW、类型和摘要，不调用 build_rows/scan、不写事务、不建表或迁移。状态 missing/legacy/ready；错误保留原表。ready 从数据库读取保护及 text，校验字段、占位与回填，并由客户端复核 RAW 摘要和现有派生视图。启动/刷新自动进入已有合法译句表；进入设置、切换目录、保存设置只读发现，留在设置直至用户选择已有表；用户主动选择表项执行 GET 只读加载。路径变化和授权失败清空旧 AG、源码、Markdown 与 JSON，旧响应不能覆盖新目录。Prompt 草稿与历史仍独立、不会被目录切换重建。

直接测试：tests/test_translation_preparation.py（真实 SQLite、禁止扫描、并发 RESERVED 写锁下只读、库字节不变、缺表/旧表/过期及 HTTP 权限）；tests/translation-preparation.test.mjs（GET、摘要和回填）；tests/cross-version-ag-filter.browser.test.mjs（Chromium/iPad-WebKit SQL 组弹窗、取消/键盘/触控、无表不自动初始化、GET 恢复、过期和授权及切换竞态、既有视图回归）。本州正式发布器执行上述直接测试及现有跨版本浏览器门禁；联邦通用专项检查器仍不在本航点范围。

## WP04F6 · 单原句视图与三窗高亮

原句表为 AG 唯一业务视图，完整显示所有句记录（raw 为主列，text、protected、translatable 等原字段仍可核对）。移除 WP04F2–F4 的待译独立视图、第二源码窗、分隔线、句级双窗滚动及过滤正文投影；不保留隐藏编辑器或平行数据状态。原生列值筛选仍只影响 AG 行，不能改变原文和 MD 预览；全部 RAW 及其物理行号和最终保存句界保留。源码、MD 预览使用同一完整阅读模型；AG、源码、MD 预览按原句身份同步定位，包括整句不可译记录。AG 原生选中行与源码焦点、预览焦点统一橙色底 rgba(235,163,82,.18)，保留各窗口原有结构、字体和原生控件。WP04F5 的保护色 #505e55、暗底 #25302c、细下边线及 V2 引用原色不变。Prompt 编辑仍独立。text 与回填清单不删除，留待 WP05 导出；SQL、上游及其他州不变。

现行接口：createReadingDocument(table) 只生成全文坐标；mountReadingSource(host,onLocate) 单只读 CM6；createFrameWorkspace.setTranslationRows / setReadingDocument 负责三窗装载及同句定位。直接测试 tests/translation-reading.test.mjs，真实双浏览器门禁 tests/cross-version-ag-filter.browser.test.mjs 覆盖单视图、完整 RAW、最终句界、保护色、同一选中背景、三向定位及原生筛选和 Prompt。已撤除视图的历史实现与验收可追溯 Git，不再列为现行能力。

## WP03 · 无损 MDLine 阅读与保护淡化

译句表只读加载或首次初始化成功后，AG 与两阅读窗共享译句表。原句 RAW 按上游顺序直接拼接，无插入、删除、规范化或重新分句；物理行号及 UTF-16 半开区间校验，末尾 LF 与空行保留。CM6 唯一只读正文，禁编辑及非装载文本事务，不增加历史或写入接口。已验证的 protected 逐句范围转换为全文坐标，源码采用 CM6 Decoration 淡化；导航切换不重复建表或写 SQL。来源变化或失败清空过期阅读/保护状态。WP03 当时保留 Frame、导航、字号、PDF 空白占位及 Prompt 边界；WP04 仅替换预览模式。

预览复用 V2 已验收的 markdown-preview、latex-inline-preview、裸媒体识别、CSS 与公共脚注卡片、局部授权媒体 URL；不调用 V2 可编辑会话。唯一校译阅读适配为可选 completeTableBoundary 解析规则，解决闭合 HTML 表格紧接独立公式时被 Markdown-it 吞入同一 HTML 块的问题，保留原物理行号。以 CM6 当前文本渲染，经既有 DOMPurify 消毒。已渲染的数学、代码、媒体、注号等不翻译元素以原保护范围和渲染物理行映射匹配，普通文本精确匹配后仅淡化对应部分；隐藏语法不强制显示。不对无法精确匹配的渲染归一化文本猜测字符映射。预览多句同一段落定位允许回退至映射块首行；源与 AG 按精确原句身份定位。未使用远端媒体下载/采用接口。

| 接口 | 契约与验收 |
|---|---|
| createReadingDocument(table) | 精确拼接、行首和句区间索引、保护区间投影；tests/translation-reading.test.mjs |
| mountReadingSource / mountReadingPreview | 独立只读显示端口 setDocument/locate/dispose；预览读取 CM6 正文；双浏览器实际阅读和三窗定位验收 |
| createFrameWorkspace.setReadingDocument(model,path) | 同源更新、清空、AG/源码/预览协调，不改变持久层；tests/cross-version-ag-filter.browser.test.mjs |

WP03 的预览保护匹配属于显示层，不构成新的保护识别规则。复杂 Markdown 归一化、未知 HTML 与精确行内点击仍需实书人工验收。未改动上游、WP02 识别策略或持久化结构。

## WP04 · 翻译 Prompt 编辑

保留原 AG 左窗、CM6 源码右上窗、预览右下窗及各自工具栏；撤下独立 PDF 占位和切分 checkbox。原预览下拉选项：Markdown 预览（默认）、翻译 Prompt、JSON（WP05A）。切换仅隐藏/显示同一窗中的阅读器和独立 Prompt CM6，不销毁编辑器、阅读器或其会话，不自动改 AG、原句、保护范围或 SQL。Prompt 模式工具栏自有撤销/重做，源码撤销/重做保持禁用。AG/源码定位继续联动，返回 MD 时恢复最后的阅读定位。

默认任务书沿用已讨论的统一校译要求：完整 MDLine 上下文、逐句 corrected/translated、目标语言、保护占位符、身份字段及独立 AI_ID.json；最终导出 schema 示例和目录路径留 WP05。WP04 的任务书为本州通用草稿，非按书籍存储：CM6 为唯一编辑权威，历史仅内存，显式点击顶栏全局保存（Prompt 模式）才将当前草稿写入本浏览器独立 localStorage 键 `ocr2md.lab-translation.prompt.md.v1`；切换和 Undo/Redo 不写盘。刷新加载已保存稿、历史重新开始。其他页面已改同一草稿时拒绝覆盖；保存失败保留编辑内容。设置模式仍保存 settings.json；原 Markdown 不可编辑。未生成 trans、未写用户文件或数据库、无跨设备同步。

| 接口 | 直接验收 |
|---|---|
| createPromptStorage(storage).read/save(text,expected) | 默认任务书、精确保存、空字符串、陈旧基线拒绝、失败传播；tests/translation-prompt.test.mjs |
| mountPromptEditor(host,options) | getText/getState/save/undo/redo/activate/layout/dispose；独立 CM6，由真实双浏览器验收 |
| createFrameWorkspace.isPromptActive/getPromptText/savePrompt | 原预览组合端口及全局保存分流；tests/cross-version-ag-filter.browser.test.mjs |

## WP05A · 待译句 JSON 预览与下载

译句表加载或初始化验证后，同一份冻结译句表生成唯一派生的 JSON 文本；现有预览下拉增加 JSON，只读 CM6（行号、JSON 语法着色），不改源码、AG 或 Prompt。工具栏「导出 JSON」最初手动下载 sentences.json（WP05A4 改为 input_json 直接落盘），UTF-8，无 BOM，预览与下载同一字符串（含末尾 LF）。未初始化禁用下载，目录变化/失败清除 JSON；切换及下载不读写 SQL，AG 筛选不影响内容。此航点不写书籍目录、不创建 trans、不导出 prompt.md。

输入结构 ocr2md-trans/v1：schema、task_id（去除 task_id 的规范字段顺序 JSON.stringify 的 SHA-256）、source_sha256（原文摘要）、sentence_sha256（已保存分句摘要）、target_language（暂为 zh-CN）、mdlines（按原 source_line 分组，继承 type/level；每组 sentences 保留原 sentence_index 与 text）。仅 translatable=true；整句不可译省略、不重新编号，保留占位符原样，不输出 raw、protected 原值、绝对路径及内部 SQL 字段。回填原值仅留本地。生成器复验每句 text 与回填及全文 RAW SHA，任务 ID 随输入/目标语言变化；尚不绑定 Prompt 摘要，正式工作目录任务协议在下一航点确定。createTranslationJSON(table,options) 为唯一生成器，tests/translation-export-json.test.mjs 验证字段、身份、无损和确定性；mountJSONPreview 由双浏览器验收实际只读预览与下载字节、切换及清理。

## WP05A2 · JSON 行号与跨窗定位

JSON 只读 CM6 复用源码窗 ocr-cm-source 行号、字体及 Everforest 配色；不新增样式体系。indexJSONSentences(text) 仅为现有确定性 JSON 文本生成 MDLine:sentence_index → text 物理行的内存索引，不改变 JSON 字节、任务 ID 或持久数据。沿用三窗句身份焦点，AG/源码点击时定位高亮 JSON 对应 text 行并居中滚动；切回 JSON 恢复最新焦点，未导出的不可译句清除高亮，不误跳其他句。目录清空时索引与高亮清除。JSON 仍单向跟随、只读，不新增反向交互。直接测试及双浏览器覆盖行号样式、准确身份、长文滚动、模式恢复、不可译句及原导出字节。

## WP05A3 · Prompt 样式及本次任务参数

Prompt CM6 与只读源码窗复用 ocr-cm-source、Everforest、Markdown 源码着色及标题标记，独立编辑与 Undo/Redo 保留。既有本浏览器 Prompt 用户草稿原样加载，不强行替换旧文本；新增默认任务书引用文末自动参数。createPromptParameters(artifact,workspace) 以唯一当前 JSON 导出及授权资料目录派生 input_json（资料目录/trans/sentences.json；WP05A4 直接导出并回读核验）、input_status、target_language、task_id、source_sha256、sentence_sha256、schema、sentence_count、AI_ID、result_json（资料目录/trans/AI_ID.json）。参数来自当前 JSON，不另设目标语言权威；目标语言当前仍为 zh-CN，正式配置及落盘留 WP05B。不得声称路径已有文件或自动写入。参数区在同一 CM6 文档末尾只读，复制/getPromptText 得到完整任务书，显式保存只存用户正文，参数切换不进入历史或修改草稿 dirty 状态。无有效表/换目录/授权失败立即清除旧参数。直接测试及双浏览器覆盖样式、当前路径、参数区拒绝编辑、草稿保存、切换更新及既有 Prompt/JSON 回归。

## WP05A4 · JSON 直接导出至 input_json

现有「导出 JSON」按钮不再触发浏览器下载，而是 POST translation/export（仅工作目录与当前预览 UTF-8 SHA-256）。后端复用 F02 授权及固定目录/普通文件安全端口，只读重新核验已保存译句和上游句表，按同一 ocr2md-trans/v1 字节协议校验 SHA-256；匹配后只允许创建当前资料目录 trans/sentences.json（必要时创建固定 trans 目录），回读验证完整内容及摘要。已存在相同文件幂等复用；不同内容拒绝覆盖、保留旧任务与其他 AI 文件，不提供重建或删除操作。拒绝符号/硬链接及任意客户端输出路径，沿用公共文件服务 8 MiB 上限。Prompt 的 input_json 与前端验收路径共享同一函数，input_status 仅在本会话当前任务收到匹配回读凭证后标记已验证；刷新后再次点击可重新核验，不冒称文件已写入。目录切换/任务变化时清除状态，迟到结果不污染新目录。用户正文、JSON 预览/格式/定位、SQL、AG 与其他州数据不变。直接测试包含跨语言字节一致、真实隔离文件、冲突和权限；双浏览器验证固定路径、回读状态、无浏览器下载、筛选不影响导出。目标语言设置及 prompt.md 落盘留 WP05B。

## 已确定的后续执行边界（尚未实现）

- WP05 后续：指定目标语言；在书籍工作目录 trans/ 导出 prompt.md（sentences.json 已由 WP05A4 实现）。整 MDLine 作为 AI 上下文、按既定句序输出；保护元素、来源/分句摘要、任务身份验证及无损回填。外部 AI 经 AgentDock 领取同一输入和提示词，只写自己的 AI_ID.json，逐句返回 corrected（拼写/OCR 校正，不润色）和 translated（基于校正后原文的指定语言译文），不得跨句移位或改动保护元素。文件生成和更新不得覆盖已有外部结果；具体冲突策略待该航点确认。
- 后续独立航点：验证导入多 AI 结果、保留所有译文、仅对校正分歧仲裁；未校正/未翻译如实标记，基于未采用校正的译文标明来源差异。最终按原句身份生成一份校正原文、多份译文的句级交叉互译文档，原句与上游始终不变。尚未确定最终校译存储 schema，不提前建额外表。

## 构建与验收

联邦 START 远端同步后，`node node_modules/vite/bin/vite.js build --config labs/lab-translation/vite.config.mjs`；`node tests/translation-frame.browser.test.mjs` 验证实际构建的双浏览器空框架、导航、独立设置、发布身份及跨州更新隔离。WP01/02 运行 `python3 -m unittest discover -s tests -p test_translation_preparation.py -v`、`node --test tests/translation-original.test.mjs tests/translation-preparation.test.mjs` 与既有设置/I/O 回归；`node tests/cross-version-ag-filter.browser.test.mjs` 在实际构建上验证两浏览器统一 SQL 初始化、单表只读显示、原生 Type 过滤、同目录刷新及换目录/失败清理。联邦布局检查与 `verify_cross_version_components.py --target lab-translation --browser` 为正式发布门禁。提交干净源码后重新构建，用 `python3 scripts/translation_frame_publish.py` 复用 Frame 正式发布器；随后检查线上 SHA、版本、manifest 文件哈希及其他 Lab 不变，完成联邦 END。真实 iPad 仍需用户验收。
