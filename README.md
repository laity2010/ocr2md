# Lab-Translation · 校译州

## 当前可运行基线（WP04，继承 WP00/01/02/03）

独立工作树 `experiment/lab-translation`，从已验收的 lab-frame `1dbc2b7e4c754330b8d3b365008e4c2e9edc39c9` 建立；不是旧 `translation-lab` 的覆盖升级，也不是 Main 镜像或晋升候选。公共 Frame 布局和组件契约不变，本州界面接线仅涉及 frame.js/layout.js 及独立校译模块；Vite 精确适配品牌、自动更新身份和本州浏览器设置命名空间。默认打开全局设置，未绑定时业务窗格为空，导航只含 settings.json，继承保存、Undo/Redo、Sarasa、目录选择及共享 F02 权限。WP00 不加载或初始化任何书籍 SQL，不生成 trans，不读写正文，不接入 AI。WP04 已撤下 PDF 空白占位及切分控制，原预览窗内切换 Markdown / 翻译 Prompt。

唯一正式入口 `/labs/lab-translation/`，通过统一 `release/` manifest 与门户登记；使用现有网关和 `/labs/lab-frame/api/workspace-io/` 公共 F02，不增加端口或 Tunnel。浏览器设置键 `ocr2md.lab-translation.settings.json.v1`，不读取 Frame、V2 或 Sentence 的设置。F02 授权仍由 Frame 的独立签名会话及目录白名单负责；用户主动选择目录时才按 Frame 约定探针，WP01 不自动读取 SQL。

## WP01 · 已保存原句表只读接入

唯一来源为 Sentence 州 WP04F6（`c95b739`）公开 `GET /labs/lab-sentence/api/sentence/snapshot?workspace=...`；不访问其私有表，不调用可能初始化/迁移的 `open`。共享 F02 目录授权及原 Frame 读写权限探针保持原样（探针临时文件由 F02 管理，不是 SQL 写入）；只有验证成功的目录才出现 SQL → 初始化原句表（只读）。显式初始化后成功才出现 SQL → 原句表 · sentence（只读）并切换四窗业务区，AG 显示全部原始 12 列（MDLine、句序、raw、type、level、状态及来源等）；CM/MD/PDF 暂时仍空白。原句表为已保存快照的内存只读引用，不复制建表或写 SQLite，也不存入浏览器持久层。刷新页面重新初始化；同目录可再次初始化刷新已保存仲裁，换目录/解绑/读取失败立即清除旧引用和表导航，忽略迟到响应；同目录重新读入保持 AG 原生过滤模型。原句行和候选元数据均按上游返回，不修改；显示以 AG 单元格文本方式，不将 HTML 当作可执行标记。对原句原文 SHA 和完整句记录 SHA 做独立校验。

| 接口 | 契约与测试 |
|---|---|
| `readOriginalSnapshot(workspace,{fetcher,signal})` | 仅同源 GET，凭据与 F02 一致，不缓存；验证 schema、字段、身份、顺序、UTF-16 和两项 SHA；错误拒绝。`tests/translation-original.test.mjs` |
| `createOriginalSession({reader,onChange})` | `initialize(workspace)` 只读引用，`invalidate()` 清除旧代及取消请求，`current` 为冻结快照；无写入。直接测试同上。 |
| `createFrameWorkspace.setOriginalRows(rows|null)` | AG 只读展示或恢复空白框架，沿用 V1 EnumCheckboxFilter（type、level），不更改窗格或源码；`tests/cross-version-ag-filter.browser.test.mjs` 验证真实 UI。 |

公共导航、设置、目录授权、Frame 布局、Undo/Redo 位置保持不变。原句表不支持编辑；正式发布器启用联邦实际浏览器 Type 过滤门禁。

## WP02 · 译句表与不可翻译元素识别

仅在已初始化原句表后，SQL 导航出现「初始化译句表」。成功后切到「译句表 · translation」，原句表仍独立可选；未绑定、换目录、源快照变更或读取失败时清除旧内存引用及相应导航。校译表和原句表共享原 AG 窗、导航、布局；筛选独立，type/level/可翻译列沿用 V1 EnumCheckboxFilter，不改变数据。WP02 当时 CM6 源码、MD 预览及 PDF 仍为空白；现行阅读能力见 WP03/04。

唯一新增本州实体表为已授权书籍的 `ocr2md.v2.sqlite` 内 `translation`。原句表仍然只读，不新建副本物理表。唯一写入口为显式初始化，不自动生成、迁移或更新；表主键 `(source_line,sentence_index)`，保留 `raw,type,level,source_line_hash,source_document_hash,sentence_sha256,policy,protected,translatable`。全部原句（含不可译）按原顺序保留。protected 是 JSON 数组，每项 `{from,to,kind,text}`，from/to 为相对于本句 RAW 的半开 UTF-16 区间（包括末尾空行），有序、非重叠，text 必须与原始切片完全一致。API 返回数组和布尔可译状态，SQL 中保存确定性 JSON 与 0/1。

后端复用共享 F02 授权 Cookie、Origin、目录白名单；仅经已发布 Sentence GET 读取真实已保存快照，不接触其私有数据行。验证原句全文及句表摘要，检查独立普通数据库文件身份，mode=rw 不允许新建 SQLite。先计算，再 BEGIN IMMEDIATE 内复读公开快照以拒绝并发源漂移，SQLite authorizer 限制仅允许创建及插入 translation，不读写任何上游业务表；同名表 schema/行与预期完全相同才无写入返回，否则保留旧表返回 409，不自动覆盖或删除。已有触发器拒绝。失败事务回滚。上游表变更后的人工重建策略尚未授权，不在此航点增加清除功能。

保护规则 `wp02/v1`：全文按最早语法开头识别围栏、LaTeX、代码、媒体链接、HTML 标签/属性/注释/实体和字面量元素（含 eq）、脚注标记、链接目标及引用定义、URL/email、Markdown 结构标记/分隔线；再投影回每句并保护首尾空白、尾部所有空行。明确类型 interline_equation 和 image_body 全句保护；标题、正文、图表标题/说明、参考文献文字及 HTML 表格自然语言内容不因类型而被排除。无未保护 Unicode 字母的句子整体标记不可翻译，数字或纯标记句仍保存，不被删除。HTML 单元格的可译文字保留，标签不可译。此版是确定性的常见 Markdown/HTML/LaTeX 语法识别，不声称理解任意嵌套、畸形语法或术语；未闭合围栏标记为 *_unclosed。WP03 负责实际淡化及逐字符重构，WP05 才生成占位模板与 trans 文件，人工调整保护规则和旧表更新策略待明确。

| 接口 | 契约及直接验收 |
|---|---|
| `POST /labs/lab-translation/api/translation/initialize` | JSON 只接受 workspace、source_document_hash、sentence_sha256；授权后调用本州保护识别及事务，返回 ocr2md-translation-preparation/v1、created/ready、两个摘要和 rows；失配/既有异构表拒绝。tests/test_translation_preparation.py。 |
| `build_rows(snapshot)` | 全文识别并投影、无损保留全部原句，隔离真实书籍及跨句/多行/UTF-16/保护优先级测试。 |
| `initializePreparation(workspace,original,{fetcher,signal})` / `validatePreparation(result,original)` | 只向本州提交来源身份，验证每行与原句完全相符、保护范围及可译状态；冻结返回对象。tests/translation-preparation.test.mjs。 |
| `createFrameWorkspace.setTranslationRows(rows|null)` | 同一 AG 显示译句，原表及译句筛选独立；目录切换清除；真实双浏览器门禁。 |

## WP03 · 无损 MDLine 阅读与保护淡化

初始化原句表后，AG 与两阅读窗共享该快照。原句 RAW 按上游顺序直接拼接，无插入、删除、规范化或重新分句；物理行号及 UTF-16 半开区间校验，末尾 LF 与空行保留。CM6 唯一只读正文，禁编辑及非装载文本事务，不增加历史或写入接口。初始化译句表后，已验证同源 protected 逐句范围转换为全文坐标，源码采用 CM6 Decoration 淡化；两表之间切换保留同源保护及正文，不重复建表或写 SQL。来源变化或失败清空过期阅读/保护状态。WP03 当时保留 Frame、导航、字号、PDF 空白占位及 Prompt 边界；WP04 仅替换预览模式。

预览复用 V2 已验收的 markdown-preview、latex-inline-preview、裸媒体识别、CSS 与公共脚注卡片、局部授权媒体 URL；不调用 V2 可编辑会话。唯一校译阅读适配为可选 completeTableBoundary 解析规则，解决闭合 HTML 表格紧接独立公式时被 Markdown-it 吞入同一 HTML 块的问题，保留原物理行号。以 CM6 当前文本渲染，经既有 DOMPurify 消毒。已渲染的数学、代码、媒体、注号等不翻译元素以原保护范围和渲染物理行映射匹配，普通文本精确匹配后仅淡化对应部分；隐藏语法不强制显示。不对无法精确匹配的渲染归一化文本猜测字符映射。预览多句同一段落定位允许回退至映射块首行；源与 AG 按精确原句身份定位。未使用远端媒体下载/采用接口。

| 接口 | 契约与验收 |
|---|---|
| createReadingDocument(original,preparation) | 精确拼接、行首和句区间索引、保护区间投影；tests/translation-reading.test.mjs |
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

联邦 START 远端同步后，`node node_modules/vite/bin/vite.js build --config labs/lab-translation/vite.config.mjs`；`node tests/translation-frame.browser.test.mjs` 验证实际构建的双浏览器空框架、导航、独立设置、发布身份及跨州更新隔离。WP01/02 运行 `python3 -m unittest discover -s tests -p test_translation_preparation.py -v`、`node --test tests/translation-original.test.mjs tests/translation-preparation.test.mjs` 与既有设置/I/O 回归；`node tests/cross-version-ag-filter.browser.test.mjs` 在实际构建上验证两浏览器原句表初始化、只读显示、原生 Type 过滤、同目录刷新及换目录/失败清理。联邦布局检查与 `verify_cross_version_components.py --target lab-translation --browser` 为正式发布门禁。提交干净源码后重新构建，用 `python3 scripts/translation_frame_publish.py` 复用 Frame 正式发布器；随后检查线上 SHA、版本、manifest 文件哈希及其他 Lab 不变，完成联邦 END。真实 iPad 仍需用户验收。
