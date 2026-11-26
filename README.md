# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## WP04 数据契约（WP04B 输入已实施；WP04C 隔离持久层已实现，尚未接入运行工作台）

### 1. 数据权威与隔离

目标是**同一 SQLite、三张业务表**：既有 `mineru_base`（OCR 原始块）、`logical_block`（上游 Markdown 正文权威）、新增 `sentence`（本模块唯一可写业务表）。不新增分句点表、仲裁表或重复的 MDLine 实体表；不向上游任何表追加分句字段，不修改上游正文、PBS、类型、结构、原始数据或其他字段。分句点、候选方案、采用状态、句文本及来源映射全部归 `sentence` 管理；下游无损重组仅为输出与验收，不回写上游。

现有 V2 基线 `3b9a50bf1f0e181ddbd637f55a74564c82b7a400`：`scripts/v2_mineru_base.py:assert_schema` 严格要求恰好两张表；`logical_block.md_block` 保存真实 LF 的多行 Markdown，而 MDLine 是派生行级投影，不是第三张物理表。不可在运行中的 V2 用户库直接建表：当前校验会拒绝三表库，且联邦要求活动 Lab 数据隔离。本 Lab 首先只在经授权的独立测试/实验 SQLite 中验证同库三表（复制或生成隔离夹具而非修改原库）；实际整合须单独验证上游识别本模块自有表而仍严格保护其两表 Schema、未知表拒绝规则及已有读写/初始化行为。不得绕过上游校验、修改联邦宪法或把隔离夹具当成用户数据。未解决该集成门禁前不对现用 V2 文件执行迁移，不宣称三表共存已上线。

### 2. MDLine 输入与无损转换

唯一输入为已保存的 Markdown 文本快照（复用既有公开 GET markdown 接口的已校验正文），按真实 LF 生成 MDLine 序列，不以 OCR 逻辑块分句，不依赖 PBS、PDF 或逻辑块 ID。沿用上游真实行语义：保留空行、空格、LF 及最终换行状态，视觉折行不是新行，终端 LF 后的 CM6 虚拟 EOF 不制造额外 MDLine。旧格式虚拟分隔符不是持久化正文，必须显式识别，不得冒充真实 LF。输入契约须先在 WP04B 验证真实行投影与上游保存正文一致。

分句使用同一不可变文档快照及 MDLine 的局部 UTF-16 半开区间。句界有序且合法，不得截断代理对；保护代码围栏、LaTeX、表格、媒体、注释等非正文结构，跨行保护须由文档上下文判定。未能可靠识别可分句内容时整行保留。禁止 trim、补字、删字或规范化字符。每条 MDLine 的句文本按句序拼接必须逐字符等于原始行；按行序及原始行终止符重组必须与已保存全文一致。空行也有一条完整记录；仅当上游确无真实行时句表可空。

### 3. 单一分句表（WP04C 隔离 Schema 已实现）

每条实际句记录占一行。主键为同一源文档修订中的 `source_line, sentence_index`，行号 1-based、句序 0-based；不把行号伪称为跨修订稳定 ID。已实现字段：

| 字段 | 语义 |
| --- | --- |
| source_document_hash | 已保存 Markdown UTF-8 SHA-256，识别整篇修订 |
| source_line | 源 MDLine 的真实行序，非 PBS |
| source_line_hash | 行正文及实际终止符的 SHA-256 |
| sentence_index | MDLine 内从 0 开始的连续句序 |
| from_utf16 / to_utf16 | 不含 LF 的行正文内半开区间，连续覆盖原行；空行允许唯一 0..0 |
| sentence_text | 精确源文本片段；仅本表派生数据，不是独立可编辑原文 |
| line_eol | 仅末句保存原行终止符（LF 或无）；其余为空 |
| candidates_json | 仅句序 0 保存各引擎标识、版本/配置、状态及候选句界/受保护范围；不复制全文 |
| review_state / adopted_engine | 仅句序 0 保存一致、待仲裁、已仲裁、无分句或引擎错误等状态及有效采用方案 |

句序 0 同时是普通句记录与本行元数据承载者，不另建元数据表或伪句。初始化、采用、改选和取消按整条 MDLine 原子替换所属句记录及其元数据。事务中核对输入修订、行摘要、区间连续覆盖、候选身份和采用有效性；提交失败保持旧表及 UI 状态，禁止写上游表。源行引用不含 PBS；跨修订如有歧义不得自动迁移旧仲裁（重复行、插入、删除、移动等）；WP04G 设计并验证安全失效与匹配，宁可重审不可错配。无变化的快照重开直接恢复句表，不重复计算，不将旧修订的结果当作当前结果。

### 4. 初始化、人工仲裁与导航

首次绑定有效工作目录、读取并校验已保存 MDLine 后，若尚无有效句表则执行三引擎分句。三者都成功且规范化句界完全一致时自动采用，按有效句界构建多条句记录；分歧时整条 MDLine 仅一条句记录，保存三家候选点供人工审阅。未分句、空行、受保护内容或引擎失败均整行保留；失败明确标记，不假装一致。无需先完成仲裁才能得到完整句表。

右窗以 MDLine 为审阅单元，左三窗显示当前 MDLine 的三个完整候选及全部句界；保留 WP03D 右窗导航、Undo/Redo、四窗比例、颜色和全部/采用控件，不再用逻辑块作为下游分句单元。「全部」不勾选显示待仲裁分歧行；采用后移出待仲裁范围。采用一个引擎，将该行的一条完整句记录替换为对应句序列；改选与取消采用只替换该行记录（取消恢复整行）。刷新和重开必须恢复持久化结果。

复用现有原生 select + Tom Select 导航与组菜单契约。SQL 组在有效绑定且成功加载后出现，包含上游逻辑表只读入口及分句表入口；点击 SQL 组打开组功能菜单，提供「重新初始化句表」。该动作须明确提示将重建分句表、清除旧仲裁，确认后事务性重建本模块表，不重建 SQLite、不触碰上游两表；失败保留原句表。未绑定、读取失败或解绑时保持 WP03C 的导航清理语义。

### 5. 后续航点及验收边界

- WP04B：MDLine 输入解耦；保留已验收四窗，不改上游。
- WP04C：隔离同库第三张表和无损转换 API；验证严格上游数据保护及 SQL 事务。
- WP04D：三引擎自动初始化句表（无争议拆分、分歧整行）；完整覆盖。
- WP04E：采用、改选、取消及局部事务持久化。
- WP04F：导航挂载分句表与 SQL 组重初始化功能。
- WP04G：已有句表加载、上游变化检测及失效；明确三表兼容门禁的验证范围。
- WP04H：三表架构、原文无损、上下游隔离、异常回滚、双浏览器及集成总体验收；未通过兼容门禁不得迁移现用 V2 用户库。

WP04A 确立数据契约；WP04B 已切换为 MDLine 分句和审阅；WP04C 已在隔离 SQLite 验证持久层，线上候选与采用状态仍仅在内存，未接入持久层。以下历史实现说明不代表运行工作台持久化已交付。WP03D 恢复基线 `05f8a3396efb75e3043e96abce4fd130ca3f0200`。

## 当前实现

- WP04C：新增独立 Python 持久层 \`scripts/sentence_store.py\` 与直接测试 \`tests/test_sentence_store.py\`。仅操作调用方授权提供的隔离 SQLite 专用连接，不提供路径打开器、不接入 Gateway、不直接读取上游私有表。已有两张上游表保持原样；第三张 \`sentence\` 表的 11 列及复合主键 \`(source_line,sentence_index)\` 见上节，采用 WITHOUT ROWID，不创建其他业务表、元数据表、触发器或 View。SQLite authorizer 默认拒绝非本表写入、上游正文读取、额外建表、附加数据库等；仅受控建表期间允许必要的 SQLite 内部目录操作。已存在的未知表、不同 sentence Schema、sentence 相关触发器/View 拒绝。隔离实验不替代上游现行 Schema 审计；正式接入前仍须获授权并验证在同一事务中来源版本有效、目录归属和上游兼容性。

### WP04C 公开 API 与验收

| API | 契约 |
| --- | --- |
| \`split_mdline(text,boundaries)\` | 真实行正文（无 LF）＋严格递增的内部 UTF-16 切点，返回连续原始文本片段；拒绝越界、重复、行末冗余切点及代理对截断。空行返回一个空片段。 |
| \`build_sentence_rows(markdown,plans)\` | 一行一个显式计划，生成有序句记录；不在本航点执行引擎、自动采用或人工决策。 |
| \`rebuild_markdown(rows)\` | 校验连续行序/句序、UTF-16 区间、源行/全文 SHA-256、LF 归属和候选/采用一致性，独立无损重组 Markdown。 |
| \`SentenceStore(connection).replace_all(markdown,rows)\` | 专用隔离连接上事务性建表或替换本表；写入后再次读取并无损比对，异常整体回滚。 |
| \`SentenceStore(connection).read(markdown)\` | 同一事务读取有序句记录并比对提供的已保存 Markdown；拒绝陈旧、损坏或不完整结果。 |

每行计划字段 \`boundaries\`、\`candidates\`、\`review_state\`、\`adopted_engine\`；候选键严格为 intl/sentence-splitter/wink-nlp，各含非空 \`version\`（引擎版本及配置指纹）、\`status\`（ok/error）、内部切点 \`boundaries\` 和 \`protected_ranges\`（有序不重叠的行内 UTF-16 半开区间）。不允许句界切开保护区间。首句保存 JSON 元数据，其余句无重复元数据。状态为 agreed/no_split/disputed/adopted/engine_error；一致或无分句不指定单一采用引擎，人工采用才登记引擎 ID。未仲裁和失败行保留整行。实际引擎候选到持久计划的转换和自动初始化属于 WP04D，局部事务仲裁属于 WP04E；WP04C 测试使用明确指定的测试计划，不把它们冒充实际引擎自动初始化结果。

验收：\`python3 -m unittest discover -s tests -p test_sentence_store.py -v\` 5/5 PASS：真实 V2 隔离夹具 497 条 MDLine 全部写入第三表、重复初始化及重开一致；上游两表全部记录、Schema 和 user_version 前后相等；权限拒绝、首次建表及替换过程注入失败均回滚；各状态、UTF-16、空行、原始 LF、受保护区间、错误数据拒绝及无损重组测试通过。原 WP04B Node 直接测试 12/12 PASS，三引擎各 497 行零错误；未改运行 UI，继承 WP04B 浏览器验收。**现用 V2 仍拒绝三表数据库，测试明确复现此门禁；没有对用户数据库迁移，也未挂载新运行接口或发布新 UI。** 本航点按 ISOLATED 留痕，线上保持 WP04B。


- WP04B（替代 WP02A–WP03D 的逻辑块级输入和审阅粒度）：snapshot.js 仅在 V2 公开 GET 传输适配器验证 v3 真实 LF、摘要、位置和来源清单；旧 v2 虚拟分隔符显式拒绝。createMDLineSnapshot(markdown) 生成无 PBS/逻辑 ID 的不可变行序列（sourceLine、from/to、textTo、text、eol、sha256），文档修订使用 Markdown SHA-256。保留空行、真实 LF、无末尾 LF 和 UTF-16 坐标；终端 LF 后不制造额外行。splitLine/rebuildLine/splitSnapshot 复用三引擎适配器，文档级保护围栏、注释、表格、公式等，逐行生成候选与无损原始片段。lineAtOffset/lineCandidateDisplay 及 reviewProjection 按行聚焦、筛选、采用；行内移动不重置左窗，跨行切换，EOF 虚拟光标行清空左窗，左窗不控制右窗。切换目录或读取失败清空旧仲裁；同文档版本会话内保留。原有导航、四窗比例、颜色、只读及上游 GET 边界不变；没有 SQL 写入或第三张表。直接测试 12/12 PASS；隔离 V2 267 逻辑块投影为 497 MDLine，三引擎各 497 行无错误；Chromium/WebKit 行级焦点、空行、EOF、筛选、采用、只读、导航失效及空白框架回归 PASS。物理 iPad 未验收；旧字体和打包体积警告保留。

以下为此前航点历史实现（与 WP04B 冲突的粒度描述由 WP04B 取代）：

- WP00：空白框架，独立设置名称、标牌、自动更新和发布身份。
- WP01：保存的资料目录通过原 Frame F02 验证后，以现有 V2 公开 GET markdown 接口只读加载，校验完整 SHA、块哈希、逻辑 ID、父子和 UTF-16/字符位置；快照版本包含块顺序及来源映射，暂存在独立会话内。无 V2 写请求；未提交的目录不加载。尚无翻译。
- WP01B2：原文右侧整高40%，左侧60%三个引擎 CM6 上下等高（WP03A），Dockview 原生分割；工作台默认打开，设置仍通过原 Tom Select 导航进出。四窗使用 V2 同版 Sarasa、Everforest、Markdown/Obsidian 扩展、行号及 iOS 原生选择，全部只读，不提供编辑行号按钮。工作台不挂载 AG、PDF、MD 渲染；全局设置页保留原组件。WP01 快照接入仍独立。
- API：本州 ui/frame/layout.js 的 createFrameWorkspace(container,{onModuleChange}) 返回 activate/setSourceMarkdown/setReview/dispose；Frame 入口直接接线，不再用 Vite 字符串生成业务代码。
- WP01C2：原有目录授权与快照读取成功后，直接将 Markdown 全文交给右侧只读 CM6；导航 SQL / 逻辑表 · logical_block，三个引擎窗在分句前留空。未新增目录管理、快照管理或数据库写入。

- WP02A：原有三引擎适配器来自已验收的 Sentence Benchmark 84dfe75，固定版本依赖见 ui/sentence/package-lock.json（独立安装 npm ci --prefix ui/sentence）。每个逻辑块独立分句，保护公式、表格、媒体等非正文，保持块内 UTF-16 来源区间及原始片段；引擎跳过的点状省略符归入相邻句，不吞掉非标点遗漏。公开 API：splitBlock(block,engine)、rebuildBlock(result)、splitSnapshot(snapshot) 返回 documentVersion 与 blocks/candidates；每个候选含 units/sourceRanges 和完整原文 pieces 或显式 error。载入快照后在内存生成候选，状态栏报告成功/总数，不写 SQL、不仲裁。

- WP02C：复刻原 Sentence Benchmark 84dfe75 的 BreakWidget 与句界颜色（全三引擎一致绿 │，分歧橙 │；右原文分歧 ┆），原版全篇对比随后由 WP03B 调整为右窗焦点驱动左三窗完整逻辑块对比（WP03D）。保留 V2 的原生行号、字体、语法着色、布局与只读保护；各窗当前行复用原版橙色高亮，当前逻辑块其余行淡橙色。不引入旧 CMD 标签、旧 PBS gutter、旧折叠或仲裁；块筛选/采用见 WP03A；页码后续。display.js API：blockAtOffset(blocks,offset)、boundaryDisplay(snapshot,results)，后者把已有候选的最后源片段末端转换成全篇句界 Widget 投影，候选失败明确计数，不变更原文或分句算法；setReview 只接同一快照版本。

- WP03A：右源码原有导航和 Undo/Redo 原位（原文只读故保持禁用），左三个引擎上下等高；高亮句界，源码栏「全部」默认不勾选，仅显示尚未仲裁的分歧逻辑块；勾选全部恢复完整原文。三引擎栏「采用」对当前分歧块互斥，采用后移出待审范围；全部模式可以改选/取消。独立会话 Map 按 logicalId 记录选择，同 documentVersion 保留，版本变化重置；未持久化，刷新丢失，WP04 才落盘。isDisputed(row) 和 reviewProjection(snapshot,results,all,adopted) 为纯显示投影；右窗使用筛选文档与源位置映射，左窗整块见 WP03D。引擎错误不伪装成分歧，在全文显示失败计数。未改变原逻辑表、分句算法、设置。

- WP03D（替代 WP03B 的单句显示）：右窗焦点唯一决定左三窗所显示的完整逻辑块。blockCandidateDisplay(block,candidate,marks) 保留该块的全部原始 Markdown，将各引擎全部句界映射为块内位置，保留原有分歧/一致着色；块内移动不重置左窗，跨块才切换。无分句保留全文并标记，失败留空并标记。右窗光标、筛选、块高亮、采用整块方案和只读语义不变。左窗不反向控制右窗。未变更分句算法或数据。

- WP03C：逻辑表导航由成功载入的已保存 V2 快照生成，未绑定仅全局设置，空白四窗不预设 SQL 项。已保存目录变更、解绑或读取失败时清除旧原文及候选、移除两处导航中的 SQL 组；未保存目录仅探测，不加载。仍用原生 select + 公共 Tom Select 适配器，不改变设置、分句或数据库。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
