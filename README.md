# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留 F02 授权，WP04E2 将分句工作台扩为五窗。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## WP04 数据契约（WP04F4 RAW 无损结构与 MDLine 属性继承）

### 1. 数据权威与隔离

当前两州的目标是**同一 SQLite、两州各自拥有的三张业务表（不是全库数量上限）**：既有 `mineru_base`（OCR 原始块）、`logical_block`（上游 Markdown 正文权威）、新增 `sentence`（本模块唯一可写业务表）。不新增分句点表、仲裁表或重复的 MDLine 实体表；不向上游任何表追加分句字段，不修改上游正文、PBS、类型、结构、原始数据或其他字段。分句点、候选方案、采用状态、句文本及来源映射全部归 `sentence` 管理；下游无损重组仅为输出与验收，不回写上游。

历史 V2 基线 3b9a50b 的校验误将本州两表架构解释为全库恰好两表。WP04D2 对 V2 和 Sentence 各自执行细则作修正：V2 只校验并管理 mineru_base 与 logical_block；分句仅校验和管理 sentence，不要求存在任何特定外州表，也不限制同库其他业务表数量。两州使用各自公开 API，分句不直接读取上游私有表；SQLite authorizer 保持本表写入限制。外州独立表可共存；会导致跨州写入的触发器或外键依赖不允许进入写事务。未来校译业务表可独立存在，不修改本州 Schema。既有州宪法及联邦宪法不变；本节只是落实数据权威和模块边界的执行细则。

WP04E 已接入现有动态 Lab Gateway 和 F02 授权：保存目录后自动初始化或恢复本州句表；只消费 V2 公开 GET，来源哈希在句表事务内复核，SQLite 文件身份在操作前后检查。没有主动迁移真实用户库；共享整库换档的任意跨进程竞争未完整实证，不能将隔离回归当作此类竞争的保证。logical_block.md_block 保存真实 LF 的多行 Markdown；MDLine 是派生行级投影，不是新的实体表。

### 2. MDLine 输入与无损转换

唯一输入为已保存的 Markdown 文本快照（复用既有公开 GET markdown 接口的已校验正文），按真实 LF 生成 MDLine 序列，不以 OCR 逻辑块分句，不依赖 PBS、PDF 或逻辑块 ID。沿用上游真实行语义：保留空行、空格、LF 及最终换行状态，视觉折行不是新行，终端 LF 后的 CM6 虚拟 EOF 不制造额外 MDLine。旧格式虚拟分隔符不是持久化正文，必须显式识别，不得冒充真实 LF。输入契约须先在 WP04B 验证真实行投影与上游保存正文一致。

分句使用同一不可变文档快照及 MDLine 的局部 UTF-16 半开区间。句界有序且合法，不得截断代理对；保护代码围栏、LaTeX、表格、媒体、注释等非正文结构，跨行保护须由文档上下文判定。未能可靠识别可分句内容时整行保留。禁止 trim、补字、删字或规范化字符。按物理源行号和句序拼接 raw 必须逐字符等于已保存全文。紧随正文的连续真实空白行（含原始空白字符及 LF）归入该行末句 raw，不单独生成句记录。开头无前置正文的空白行连成一条 blank 记录；仅当上游无真实行时句表可空。物理 MDLine 坐标不变。

### 3. 单一分句表（WP04F4 RAW Schema）

每条实际句记录占一行。主键为同一源文档修订中的 `source_line, sentence_index`，行号 1-based、句序 0-based；不把行号伪称为跨修订稳定 ID。已实现字段：

| 字段 | 语义 |
| --- | --- |
| source_document_hash | 已保存 Markdown UTF-8 SHA-256，识别整篇修订 |
| source_line | 源 MDLine 的真实行序，非 PBS |
| source_line_hash | 行正文及实际终止符的 SHA-256 |
| sentence_index | MDLine 内从 0 开始的连续句序 |
| from_utf16 / to_utf16 | 不含 LF 的行正文内半开区间，连续覆盖原行；空行允许唯一 0..0 |
| raw | 唯一原文切片；末句包含真实行终止符及所有尾随空白行 |
| type | WP04F5：直接继承 V2 公共 mdLines.type（原始 MinerU 元素类型）；同一 MDLine 各句一致 |
| level | 继承原 MDLine 行首引用层级，值为空或 >、>> 等；不向各句重复插入前缀 |
| candidates_json | 仅句序 0 保存各引擎标识、版本/配置、状态及候选句界/受保护范围；不复制全文 |
| review_state / adopted_engine | 仅句序 0 保存一致、待仲裁、已仲裁、无分句或引擎错误等状态及有效采用方案 |

句序 0 同时是普通句记录与本行元数据承载者，不另建元数据表或伪句。初始化事务建立句表；采用、改选、取消、Undo/Redo 立即修改 CM6 内存，空闲时仅将最终变化的 MDLine 按批次原子替换句记录。事务核对输入修订、行摘要、区间连续覆盖、候选身份与前后选择；失败保留旧表（已确认回滚时）及新内存状态/历史，未收到回执不推定是否提交。禁止写上游表。源行引用不含 PBS；上游全文哈希变化时旧句表保留但不作为当前结果显示，只提示用户通过 SQL 组明确重新初始化；不追踪上游编辑过程，不跨来源修订迁移旧仲裁或增量重分。同一来源的确切旧句表 Schema 可无损升级为 RAW，保留既有采用及候选。无变化的快照重开直接恢复句表，不重复计算，不将旧修订的结果当作当前结果。

### 4. 初始化、人工仲裁与导航

首次绑定有效工作目录、读取并校验已保存 MDLine 后，仅当尚无句表时执行三引擎分句；已有句表来源不一致则提示明确重新初始化。三者都成功且规范化句界完全一致时自动采用，按有效句界构建多条句记录；分歧时整条 MDLine 仅一条句记录，保存三家候选点供人工审阅。未分句、受保护内容或引擎失败均整行保留；空行归其所属末句；失败明确标记，不假装一致。无需先完成仲裁才能得到完整句表。

右窗以 MDLine 为审阅单元，左三窗显示当前 MDLine 的三个完整候选及全部句界；保留 WP03D 右上源码导航、Undo/Redo、左右宽度比例、颜色和全部/采用控件；WP04E2 增设右下句表窗，不再用逻辑块作为下游分句单元。「全部」不勾选显示待仲裁分歧行及紧随其后的真实空行（含空格/制表符的空白行）；采用后连同其尾随空行移出待仲裁范围。句表跟随同一行集合。采用一个引擎，将该行的一条完整句记录替换为对应句序列；改选与取消采用只替换该行记录（取消恢复整行）。刷新和重开必须恢复持久化结果。

复用现有原生 select + Tom Select 导航与组菜单契约。SQL 组在有效绑定且成功加载后出现，包含上游逻辑表只读入口及分句表入口；点击 SQL 组打开组功能菜单，提供「重新初始化句表」。该动作须明确提示将重建分句表、清除旧仲裁，确认后事务性重建本模块表，不重建 SQLite、不触碰上游两表；失败保留原句表。未绑定、读取失败或解绑时保持 WP03C 的导航清理语义。

### 5. 后续航点及验收边界

- WP04B：MDLine 输入解耦；保留已验收四窗，不改上游。
- WP04C：隔离同库第三张表和无损转换 API；验证严格上游数据保护及 SQL 事务。
- WP04D：三引擎自动初始化句表（无争议拆分、分歧整行）；完整覆盖。
- WP04D2：两州数据表管辖权修正及隔离同库共存验证。
- WP04E：首次初始化、已有句表直接加载、来源哈希校验、SQL 导航及明确重初始化（已实现）。
- WP04E2：五窗布局、分歧尾随空行保留、源码和句表同步（已实现）。
- WP04F：同步 SQL 仲裁架构偏离用户预期，已回退（a441fe2 → 74a07f4，树等同 428ad11）。
- WP04F2：CM6 内存仲裁、Undo/Redo 及空闲批量持久化（已实现）。
- WP04G：总体验收（含跨模块安全、异常回滚及实际设备验收）。原独立来源失效航点取消，简单哈希检查已并入 WP04E。

WP04A 确立数据契约；WP04B 已切换为 MDLine 分句和审阅；WP04C 已在隔离 SQLite 验证持久层，WP04D 已完成隔离三引擎自动初始化；WP04E 接入初始化、句表读取和显式重初始化；WP04F2 已接通内存仲裁及空闲持久化；旧 WP04F 已回退。以下历史实现说明不代表运行工作台持久化已交付。WP03D 恢复基线 `05f8a3396efb75e3043e96abce4fd130ca3f0200`。

## 当前实现

### WP04F5 上游 MDLine 原始 Type 接入

消费 V2 WP32 的既有 GET markdown/v3 响应 mdLines：逐一校验物理行号、UTF-16 from/to/textTo、逻辑元素归属及原始 type 与公开 segments 一致；缺失或不符拒绝打开，不用 Markdown 语法猜测原始 type。空白行归属按原文字符判断，引用 level 保持原规则。type 不限制为 title/text/blank，允许上游原始 table_caption、table_body、table_footnote、image_body 等；不把手工插入的 Markdown 语法冒称原始类型。

仅在已授权同源句表打开时，识别 WP04F4 精确旧 RAW DDL 并原子迁移其类型约束；每条记录仅替换 type，其余字段逐项不变，旧引擎候选及人工采用完整保留。更早精确旧表仍走无损 RAW 升级并继承公开 type。新 Schema 同源类型发生变化时仅局部更新 type；无变化不写入，正文哈希变化保持原表并报告过期；事务内复核公开来源与类型，写入失败回滚，禁止外州写入。原五窗、分句算法、CM6 内存历史及空闲保存不变。用户库不主动迁移。

### WP04F4 RAW 无损结构与 MDLine 属性继承（历史类型语义已由 WP04F5 取代）

sentence 仅存 raw 原文，取代 sentence_text、line_eol；type 继承 V2 MDLine 的 title/text/blank 语义（沿用 CM6 Markdown fenced-code 排除及 V2 ATX 规则），level 取行首 Markdown 引用标记数量，允许标记间空格或制表符，统一显示为相同数量的 >。所有同源句继承相同 type 和 level；raw 保留原始前缀且不重复插入。末句 raw 包含原行 LF 和连续尾随真实空白行；开头空白段归第一条 blank 记录。source_line、source_line_hash 和 from/to UTF16 仍指原物理 MDLine 的正文及其本行 LF，不含尾随行的范围。全文 SHA256 及 RAW 拼接校验覆盖全部尾随空白。AG 显示 raw/type/level，点击尾随空行定位其所属末句，原五窗及过滤不变。内存采用和原生 CM6 History 同步派生 RAW，850ms 空闲批量保存及上游只读不变。

仅识别已验收的精确旧 sentence DDL。授权工作目录打开时，同一来源的旧表以一次 BEGIN IMMEDIATE 事务转换，不重新运行引擎，不丢失人工采用，保存前验证全文、候选及数据权威；异常恢复旧表，外部外键、触发器、索引或 SQL 依赖风险拒绝迁移。来源变化的旧表仅提示原有明确重初始化。仅本州自有表可变，不增加实体表、不改 V2 Schema 或其他州。

验收：Python15/15、Node20/20；真实隔离 V2 497物理MDLine，241个归属行、421句记录（旧677，折叠256空白行），84一致、55分歧、102无分句，RAW无损；保留旧采用及候选、迁移回滚、外州数据不变；Chromium/WebKit空白框架及RAW句表、双向定位、原生筛选、采用/撤销、空闲保存、SQL菜单与过期回归PASS。早期转换摘要赋值、旧表识别入口、旧字段测试断言及WebKit首行滚动问题已登记失败并复验。物理iPad未实测，未主动改真实用户库，既有字体/chunk警告保留。发布后用户打开同源旧表才触发上述事务迁移。

### WP04F3 采用方案后的源码句界

源码窗未仲裁时显示三引擎句界并集（绿色一致、橙色分歧）；已采用时仅显示当前 CM6 选择的实际切点，使用绿色实线及采用提示。无切点方案不显示句界，取消恢复分歧，改选、Undo/Redo 与重开恢复即时生效。左三窗比较保持不变。boundaryDisplay 第三参数为实时采用 Map，显式空 Map 代表取消；不传则读取已保存选择。原文相同时通过 CM6 StateEffect 更新装饰，保持原文对象和改选时的光标。未改 SQL、历史、保存调度、布局或上游。

验收：Node 9/9，Chromium/WebKit 空白框架、采用改选取消撤销重做及刷新、原文对象和光标、左三窗、空闲保存、SQL 导航、五窗回归通过。物理 iPad 未验收，未主动写真实用户库，既有字体/chunk 警告。

### WP04F2 CM6 内存仲裁与空闲持久化

用户验收指出 WP04F（a441fe2）将每次点击阻塞在 SQL 事务，偏离实时内存架构。按 BUILD 回退契约，WP04F2-R 以 74a07f4 完整恢复已验收 428ad11 源码树，Node15/15、Python11/11、Chromium/WebKit 及发布复验通过，保留失败提交和 Git Notes；不回退用户 SQLite。WP04F2 从恢复提交独立构建。

唯一实时权威为 ui/sentence/review-session.js 的 CM6 StateField（按 MDLine 保存采用选择）；使用 CM6 原生 history、invertedEffects、isolateHistory、undo/redo。独立无正文 EditorState 避免只读源码状态与筛选投影重建破坏历史；原右上按钮、Mod-Z / Mod-Shift-Z / Mod-Y 与 historyUndo/historyRedo 绑定。不记录光标、筛选或滚动；原五窗、布局、只读源文及 SQL 菜单不变。采用/改选/取消/Undo/Redo 同步改变内存状态，源码待审范围、真实尾随空行、左窗 checkbox、AG 句记录均由此派生。AG 显示当前真实内存分句结果，不冒称已落盘；全局状态提示待保存、保存中、已确认保存或错误。

沿用 V2 的 850ms 尾部空闲间隔。每次内存仲裁重置定时器；与最后已确认的持久化采用状态比较，只保存净变化的 MDLine，净变化为零不发送请求。普通保存过程中不禁用采用、Undo/Redo 或全部；一个在途批次，后续内存修改与其回执独立，确认后更新已保存比较基准而不是覆盖实时状态。失败保留内存和历史及未确认批次，不自动无休止重试；下次编辑或全局保存可重试同一批次，已应用同一目标时幂等返回。若存在真正并发第三种选择、来源或候选变更则拒绝，不强制覆盖。明确重初始化、目录切换及重新加载前先保存，失败保留当前内存；切换/重初始化成功或不同来源/不同记录清空会话历史，刷新仅恢复已保存结果。未保存时 beforeunload 依浏览器能力提示；自动更新回调先 flush，不主动丢弃内存，浏览器强制关闭仍可能丢失尚未落盘内容。未添加本地恢复日志或额外表。

| API | 契约 |
| --- | --- |
| createReviewSession(snapshot,rows,{save,report,delay,timers}) | choose/history 同步提交 CM6 effect，choices/rows/depth/pending 派生实时状态；flush 显式等待队列，dispose 清定时器。默认 850ms，测试注入虚拟时钟。 |
| choiceRows(line,group,engine) | 由已验证 MDLine 与持久候选无损生成当前句记录，不生成其他原文。 |
| saveSentenceChoices(workspace,snapshot,batch) | POST /labs/lab-sentence/api/sentence/save；workspace、source_document_hash、changes[]；每条仅 source_line、source_line_hash、candidates_hash、previous_engine、adopted_engine。校验批次回执的行身份、原文、候选、采用状态、切点和元数据；不发送句文本/任意切点。 |
| SentenceStore.save_choices(markdown,changes,verify_source=...) | BEGIN IMMEDIATE 复核公开来源与文件身份、自有 Schema、外键/触发器保护、全文无损；校验所有行、候选与前后选择，按行 DELETE/INSERT 一次提交；同目标幂等，不写其他行；失败整体回滚。最多 4096 行/批，2 MiB 请求上限。 |

验收：Node 18/18，Python 12/12；虚拟时钟证明连续操作及撤销抵消零请求、多行合并一个批次，慢响应期间继续审阅，失败及重试保留历史；真实隔离 SQLite 多行事务、原文无损、幂等、冲突、回滚、上游与示例外州表不变；Chromium/WebKit 实际五窗、采用/改选/取消、快捷键、零净变更请求、扣留网络回执期间操作、失败重试、刷新恢复、原导航和 SQL 组菜单、过期清理 PASS，空白五窗 PASS。前两轮浏览器测试分别因模拟故障注入在错误批次、刷新用例前焦点落在不可仲裁空行而失败，修正测试并复验；原生产实现保持不变。未主动写入真实用户库，物理 iPad、任意跨进程整库换档竞争未验收；既有 Sarasa/chunk 警告保留。数据表 Schema、上游、公共组件和宪法未修改。

### WP04E2 五窗布局及分歧空行同步（历史，临时投影由 WP04F2 实时内存句记录取代）

保留左侧三引擎 CM6（等高）和原左右 60/40 宽度；右侧分为上方原源码 CM6、下方独立 Dockview 句表窗（默认右列高度 60/40，可原生拖动分割线）。原导航、Undo/Redo、全部/采用控件、SQL 组重初始化和全局设置不移动。SQL 选择句表仅聚焦右下窗，不再替换源码；选择逻辑表聚焦右上源码。空白框架为五窗，未绑定或来源失效时右下窗为空且没有 AG 实例。

reviewProjection 保留每个待仲裁 MDLine 后连续真实空行及空白字符，不合成或修改任何 LF；其余非分歧正文与其空行隐藏。projectSentenceRows(rows,visibleLines,adopted) 为本州纯展示 API：同一个可见 MDLine 集合过滤实际持久句记录，原句文本/字段保持不变；当前会话采用变更仅显示临时状态「已采用（未落盘）」及引擎，取消已落盘采用时显示「待仲裁（未落盘）」，不伪造已保存句记录；WP04F 才写句表。源码点击定位右下同 MDLine 句记录、橙色高亮并滚动到对应句；句表点击按原行号和 UTF-16 起点定位源码，再更新左三引擎。空行仍有真实记录；同一行内移动不重置左窗。源码和表共享「全部」及采用状态；原 AG EnumCheckboxFilter 可作额外列筛选。

createFrameWorkspace.setReview(next,candidates,rows) 接入实际句表记录；focusTable/focusSource 代替 showTable/showSource 的页面互换。其余初始化与持久层、Gateway、上游表、Schema、API、州宪法不变。

验收：Node 15/15；真实 V2 隔离夹具 497 MDLine、677 句记录，55 分歧行及 53 个尾随空行共 108 MDLine 保留；Chromium/WebKit 五窗位置/空白框架、全部/采用筛选、源码和句表双向定位、原三引擎、SQL 组菜单重初始化、过期和导航清理 PASS。首轮 AG 行删除动画短暂残留、旧 EOF 测试选择器误匹配新 AG 输入框，修正测试等待/范围后通过；未修改真实用户库，物理 iPad 未验收，既有字体/打包警告保留。WP04E 的右窗互换历史说明由本节取代。

### WP04E 句表初始化及 SQL 导航

沿用统一 Gateway 的 manifest 动态后端加载机制，入口 scripts/lab_backend/__init__.py；既有 store/initialize 移入同一隔离包，原 scripts/sentence_store.py 和 scripts/sentence_initialize.py 保留兼容导入，不修改网关工程、V2、联邦或州宪法。F02 同源 POST、会话及根目录授权、probe 检查；只打开已存在的授权 V2 SQLite（mode=rw，不创建新文件），从现有 Gateway 的 loopback V2 公共 Markdown GET 获取输入；本州 authorizer 不直接读取或修改上游私有数据。先计算候选，BEGIN IMMEDIATE 内复核来源哈希及文件身份；初始化拒绝覆盖已存在句表，遇到另一首次初始化已完成时转为读取。来源变化仅返回 stale，旧句表保留。正常 SQLite 事务与来源复核已测试；未声称任意跨进程整库文件换档竞争已完全消除。

| 新增运行公开 API | 契约 |
| --- | --- |
| POST /labs/lab-sentence/api/sentence/open | workspace、source_document_hash；不存在句表则自动初始化，已存在且一致则直接读取，不执行引擎；不一致返回 stale 且不返回旧句记录。 |
| POST /labs/lab-sentence/api/sentence/reinitialize | 同上字段及 confirm=reinitialize-sentence-table；明确事务重建 sentence，失败回滚；不写上游。 |
| SentenceStore.inspect(markdown, verify_source=...) | 事务内判定 missing/ready/stale，校验句记录无损，过期不返回旧记录。 |
| requestSentence / persistedReview（ui/sentence/persisted.js） | 读取后端已落盘句记录，校验来源、行序及原文往返；根据候选内部切点投影原三窗，不在浏览器重新分句。 |

复用现有原生 select + Tom Select；SQL 组在有效目录与来源加载后显示逻辑表和当前句表；过期时仅逻辑表及 SQL 组菜单。点击组标题打开两步确认的「重新初始化句表」功能菜单。选择分句表仅将右窗原 CM6 区域切换为只读 AG Grid，导航/Undo/Redo 和左三窗及四窗比例保持；采用原 V1 EnumCheckboxFilter（同文件哈希），未绑定时不创建 AG 容器。选择逻辑表恢复原审阅界面。三窗只显示内部持久句界，末句终点不再作为额外分句点。人工采用仍仅内存，WP04F 接入局部 SQL 事务。本航点已保存的候选及句记录重开直接恢复。

隔离直接测试 Python 11/11、Node 14/14 PASS。实际 V2 夹具 497 MDLine → 677 句记录；首次/重复读取、原文变化拒绝旧句表、明确重建、规划失败保留旧表、来源变化阻止事务、授权/来源/确认字段校验、原上游及未来表不变。Chromium/WebKit 浏览器使用该真实句记录回执夹具，原三窗焦点、AG、原生过滤、SQL 菜单确认/取消/失败、过期和导航清理、未绑定空白框架均 PASS。首轮弹窗关闭时浏览器自动恢复导航焦点导致测试误关闭，已修正操作；空白框架旧约定要求未绑定不创建 AG 容器，已调整为选择时创建，最终回归通过。Git Notes 短暂断链后已同步。物理 iPad 和真实用户目录未主动验收，已有字体与 chunk 警告保留。

### WP04D2 数据表管辖权（隔离验收）

SentenceStore 的公开 API 和 sentence DDL 不变。取消整库表清单断言；仅验证自有表的准确名称、对象类型、DDL 和本表触发器。初始化或替换在 BEGIN IMMEDIATE 内检查外部表的只读外键元数据，拒绝引用 sentence 的跨域依赖（即便 foreign_keys 关闭），并保留原 authorizer 对外表正文读取、修改、删除、DDL、ATTACH 等操作的拒绝。不检查或改写其他州的数据，不新增任何表或运行接口。

Python 8/8、Node 14/14 PASS：真实 V2 夹具 497 MDLine 初始化为 677 句记录、三引擎零错误；V2 公共 Markdown 快照在三表及四表（含独立 translation 示例表）条件下逐字节相等；上游两表全量记录、Schema 和 user_version 不变，未来表结构/行记录不变；未知独立表允许，错误 sentence Schema/同名 View/大小写冲突、外表读写、跨表触发器和外键写入风险均拒绝；原子回滚及重开通过。未改变 UI、现用用户数据库或联邦/州宪法；本州 ISOLATED，运行持久化仍待接入。

### WP04D 三引擎自动初始化（隔离验收）

复用 WP04B 的已保存 V2 v3 公共 Markdown 快照验证、三引擎适配器及跨行保护；WP04C 的 sentence 表 Schema 和无损 API 保持不变。初始化候选新增实际保护掩码的行内 UTF-16 半开区间；引擎异常时仍带行身份、保护区间和明确失败标识。无 UI、导航、Gateway、上游源码或用户数据库改动。采用 Node 独立适配器运行同一套引擎，并由 Python 持久层一次事务落盘，不另造分句引擎或业务表。

| 新增公开 API | 契约 |
| --- | --- |
| `initializationPlans(snapshot,results,versions)`（ui/sentence/initialize.js） | 校验快照/行/引擎身份、候选原文重组和保护区间；取各句最后源区间的末点，排除最后一句的终点，仅保留内部 UTF-16 句界。三者成功且内部切点一致时自动采用：非空切点为 agreed，否则 no_split；分歧为 disputed，失败为 engine_error，两者保持整行且不指定采用引擎。返回 WP04C 显式计划数组。 |
| `sentence_init_engine.mjs`（scripts） | Node 内部适配器，stdin 为 V2 已保存的公开 v3 快照 JSON，stdout 为来源文档 SHA-256 与计划；锁定依赖版本及 Node/ICU/Unicode/locale、锁文件、引擎和保护/转换源码配置哈希。拒绝依赖版本偏差与错误快照。Node 版本指纹不冒充浏览器 Intl 版本。 |
| `initialize_sentence_table(connection,snapshot)`（scripts/sentence_initialize.py） | 已授权隔离专用连接＋公开快照；调用 Node，核对文档 SHA，复用 build_sentence_rows 和 store.initialize；返回完整句记录。无文件路径打开器，无上游写入 API。 |
| `SentenceStore.initialize(markdown,rows)` | BEGIN IMMEDIATE 后拒绝已经存在的 sentence 表，仅允许首次原子建表写入；防止自动初始化覆盖已有仲裁。重复调用可能重新计算候选，但不会写表。已有句表直接加载、来源哈希检查和显式重新初始化已由 WP04E 接入。 |

本航点按内部切点判定持久方案是否一致，不将末句终点/尾部空格视为额外切点。WP04E 已接通审阅并使用相同判定语义，避免 UI 与持久状态不一致。隔离调用方提供源快照和对应授权连接；正式集成仍须解决上游当前修订的事务性核验及共享连接授权。历史 V2 两表数量限制已由 WP04D2 修正。

验收：Node 14/14、Python 7/7 PASS。真实隔离 V2 夹具 497 MDLine 生成 677 条句记录：84 行 agreed、55 行 disputed、358 行 no_split，实际三引擎错误 0、人工采用 0。所有分歧及无分句行均只有一条原始行记录，所有一致拆分句数与切点数一致；全文逐字符复原、重复初始化拒绝、关库重开一致、上游两表全量记录/Schema/user_version 不变、非法快照拒绝、插入中途故障回滚并可重试。额外模拟引擎异常与分歧测试通过。未变更运行界面，不进行新的线上 UI 发布，仍保持 WP04B。WP04D 时 V2 公共读取接口拒绝三表数据库（历史限制，WP04D2 已修正）；未迁移现用用户库。


- WP04C：新增独立 Python 持久层 `scripts/sentence_store.py` 与直接测试 `tests/test_sentence_store.py`。仅操作调用方授权提供的隔离 SQLite 专用连接，不提供路径打开器、不接入 Gateway、不直接读取上游私有表。已有两张上游表保持原样；第三张 `sentence` 表的 11 列及复合主键 `(source_line,sentence_index)` 见上节，采用 WITHOUT ROWID，不创建其他业务表、元数据表、触发器或 View。SQLite authorizer 默认拒绝非本表写入、上游正文读取、额外建表、附加数据库等；仅受控建表期间允许必要的 SQLite 内部目录操作。不同 sentence Schema、同名非表对象、sentence 上的触发器拒绝；WP04C 历史整库清单限制由 WP04D2 取消。隔离实验不替代上游现行 Schema 审计；正式接入前仍须获授权并验证在同一事务中来源版本有效、目录归属和上游兼容性。

### WP04C 公开 API 与验收

| API | 契约 |
| --- | --- |
| `split_mdline(text,boundaries)` | 真实行正文（无 LF）＋严格递增的内部 UTF-16 切点，返回连续原始文本片段；拒绝越界、重复、行末冗余切点及代理对截断。空行返回一个空片段。 |
| `build_sentence_rows(markdown,plans)` | 一行一个显式计划，生成有序句记录；不在本航点执行引擎、自动采用或人工决策。 |
| `rebuild_markdown(rows)` | 校验连续行序/句序、UTF-16 区间、源行/全文 SHA-256、LF 归属和候选/采用一致性，独立无损重组 Markdown。 |
| `SentenceStore(connection).replace_all(markdown,rows)` | 专用隔离连接上事务性建表或替换本表；写入后再次读取并无损比对，异常整体回滚。 |
| `SentenceStore(connection).read(markdown)` | 同一事务读取有序句记录并比对提供的已保存 Markdown；拒绝陈旧、损坏或不完整结果。 |

每行计划字段 `boundaries`、`candidates`、`review_state`、`adopted_engine`；候选键严格为 intl/sentence-splitter/wink-nlp，各含非空 `version`（引擎版本及配置指纹）、`status`（ok/error）、内部切点 `boundaries` 和 `protected_ranges`（有序不重叠的行内 UTF-16 半开区间）。不允许句界切开保护区间。首句保存 JSON 元数据，其余句无重复元数据。状态为 agreed/no_split/disputed/adopted/engine_error；一致或无分句不指定单一采用引擎，人工采用才登记引擎 ID。未仲裁和失败行保留整行。实际引擎候选到持久计划的转换和自动初始化已于 WP04D 在隔离环境验证；局部事务仲裁已由 WP04F2 空闲批量落盘。WP04C 历史测试使用明确指定的测试计划，不把它们冒充实际引擎自动初始化结果。

验收：`python3 -m unittest discover -s tests -p test_sentence_store.py -v` 5/5 PASS：真实 V2 隔离夹具 497 条 MDLine 全部写入第三表、重复初始化及重开一致；上游两表全部记录、Schema 和 user_version 前后相等；权限拒绝、首次建表及替换过程注入失败均回滚；各状态、UTF-16、空行、原始 LF、受保护区间、错误数据拒绝及无损重组测试通过。原 WP04B Node 直接测试 12/12 PASS，三引擎各 497 行零错误；未改运行 UI，继承 WP04B 浏览器验收。**WP04C 历史测试复现 V2 拒绝三表数据库（WP04D2 已修正）；没有对用户数据库迁移，也未挂载新运行接口或发布新 UI。** 本航点按 ISOLATED 留痕，线上保持 WP04B。


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

## WP04F6 · 下游只读已保存句表快照

`GET /labs/lab-sentence/api/sentence/snapshot?workspace=授权目录` 是唯一新增的下游运行公开接口，复用 Frame F02 Cookie、目录白名单及来源校验（无 Origin 的同源 GET 可用）。只读 V2 已保存 MDLine，并用 SQLite `mode=ro` + `query_only` 和 SentenceStore 自有表事务检查读取已保存句记录；不调用 probe、分句引擎、初始化、迁移或保存。缺表、旧 schema、原文或 type 不一致返回 409 且不返回旧行；非法目录/未授权拒绝，失败不产生数据变更。返回 `schema=ocr2md-sentence-snapshot/v1`、`source_document_hash`、`sentence_sha256`（按 UTF-8、ensure_ascii=False、sort_keys=True、紧凑分隔符序列化完整有序 rows 后 SHA-256）、`rows`（当前正式完整列，顺序 source_line/sentence_index），用于下游引用及仲裁版本溯源。只读取已提交的仲裁，不读取浏览器未落盘内存。旧 open/save/reinitialize 及 UI、DDL 不变。直接测试 `python3 -m unittest discover -s tests -p test_sentence_readonly.py -v`。
