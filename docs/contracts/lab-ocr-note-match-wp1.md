# Lab-OCR · 注释匹配 WP1/3 — 异构格式只读识别/配对契约

状态：WCP43 WP1；本阶段**不注册 AG View、不转换任何注引/注文、不新增 SQLite 表**。WP2 是界面与书籍级配置落盘，WP3 才可人工仲裁和受控 CM6 原子转换。本契约仅覆盖 WP1 纯计算 API。

## 数据权威和唯一对外 API

文件：`ui/lab-ocr/note-match-index.js`。纯 ES module，无 DOM、网络、SQLite 或可变全局状态。

- `projectNoteMatchIndex(mdRows, blockRows = [], config = DEFAULT_NOTE_MATCH_CONFIG)`：`mdRows` 为**当前 CM6 持有的**按 `line_no` 排序的 MD 行数组，具有稳定 `line_id / block_id / text`；`blockRows` 是当前 Block 关系投影，BlockID 是关联键，PBS 仅作标签。任何一个原文修改后，调用方必须从当前 CM6 状态重新执行，不能复用旧的字符偏移、PBS 或候选结果。输入不变；返回一份不可变的只读投影。
- `validateNoteMatchConfig(config)`：验证可序列化的书籍规则配置。可分别选择内置的 `referenceRules`、`bodyRules`；`scope` 为 `book`（默认）或 `chapter`（按 `chapterLevel` 的 Markdown 标题边界划分，`Notes` 标题不产生新章节）；`continuation` 为 `same-block`（默认）或 `notes-section`（只在明确 Notes 区跨块追踪多行注文）；`weakAutoMatch` 默认 `false`。
- 可选的 `customRules` 最多 8 项，格式 `{id:'book.ref.example'|'book.body.example',kind:'reference'|'body',pattern:'...',strength:'strong'|'ambiguous'}`。两个命名组分别为 `(?<id>...)` 与（仅注文）`(?<content>...)`；注文规则必须以 `^` 锚定行首；表达式限制 240 字符，拒绝零长度匹配。**WP1 只接受调用方传入，尚未实现保存/编辑规则的 UI。** 禁止对未知格式暗中使用默认规则硬猜。
- `NOTE_REFERENCE_RULES` / `NOTE_BODY_RULES` 列出可用内置规则，`DEFAULT_NOTE_MATCH_CONFIG` 则是安全默认启用集。**字母上标 `ref.html-alpha` 和字母注文 `body.letter-dot` 需显式启用**，避免 OCR `M<sup>uch</sup>` 伪影误报。

返回：

| 字段 | 数据含义 |
|---|---|
| `references[]` | 每个注引候选独立 ID，注号、原始格式、字符区间 `from/to`、LineID/BlockID、PBS、PDF 页、上下文与 `evidence.rule_id/strength/scope` |
| `bodies[]` | 每个注文候选 ID、注号、原文、多行 `body_line_ids[]/body_block_ids[]`、来源与规则证据；多段跨块只在明确开启模式时派生 |
| `pairs[]` | **每个注引一条记录**，`candidate_body_ids[]` 可有多个；确认唯一时 `body_id` 指向注文，多个注引可以指向**同一个注文**；没有足够证据时 `body_id=null` |
| `orphan_bodies[]` | 没有任何同号引用的注文候选 |
| `stats` | 分别统计 refs、bodies、明确匹配、待核实、编号冲突、缺注文、孤立注文 |

状态及边界：

- `已匹配`：同一个已配置范围内只有一个同号注文，且规则可信度达到阈值；不代表已经人工审阅，也不授权修改源码。
- `待核实`：`[1]`、`(1)`、`*` / `†` 以及可配置字母上标等弱语法，即使数字相同，也**不能未经人工核对就转换**。启用 `weakAutoMatch:true` 仅代表书籍配置明确授权更宽松的发现阈值；WP1 始终不写回。
- `编号冲突`：同范围内多个可能注文时，候选全部保留，绝不“就近选一个”。书籍重复编号可通过显式 `scope:'chapter'` 分割，而不隐式猜测范围。
- `缺注文`、`缺注引`：保留未匹配侧的候选。暂不判断是否 OCR 缺失或人工合并过，不能将推测落盘。
- 对 Markdown 链接 URL、行内代码、公式、围栏代码块、HTML 表格和块类型明确为表格/图片/公式的来源，只做只读安全过滤。默认不将引用区/文献清单中的类似编号自动认定为脚注。
- 识别器可输出候选，但**不可建立新的 `note_pair` 匹配事实表**；校阅结论将来由 WP3 的独立审阅扩展表保存，并以稳定 LineID、BlockID 和原文证据防止过期使用。不要沿用旧 Main `note-pair-scan.js` 中的 CMD 注释回写路径。

## 真实基准和已知限制

实际只读 sample `484` 条 MD 行的结果：

- **10** 条注文（编号 `1`—`10`），**10** 个数字上标明确匹配；均有可独立定位的 LineID/BlockID/PBS 和规则来源。
- 另外发现句内枚举 `(1)`、`(2)` 两个**待核实**候选，**没有自动加入确定配对**；这是保守筛查而不是宣称它们是脚注。没有数字 `<sup>uch</sup>` 之类的 OCR 错词假阳性。
- `packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md` 的直接回归同样明确匹配 10 个注号，避免仅在数据库中表现正常。

限制必须公开：本阶段不试图自动理解所有 OCR 损坏的格式；只有显式规则才识别。多段注文只从已有行/块的相邻结构派生，不会自动移动正文；若跨页/跨栏边界需依靠 Block 关系先行校正。标题范围、Notes 区分类是辅助证据而不是绝对语义判断。正式 AG 配对审阅和统一 CM6 转换留待 WP2/WP3。

## 直接验收

```bash
node tests/lab-ocr-note-match-index.test.mjs
node tests/lab-ocr-note-match-index.browser.test.mjs
```

直接测试覆盖：格式混用、默认弱证据不强配、多引一注、缺项、重复编号、全书/章节边界、多行/多段注文、默认排除 OCR 伪上标与代码公式、可配置书籍专用 `§1` 和字母上标、输入不修改和来源字段。浏览器用原生 Chromium 与 iPad WebKit 验证模块同结果，且不挂载/修改书籍、SQL 或 PDF。

## WCP43 WP2/3 · AG 注释匹配、四窗端点与书籍规则（2026-11-17）

### 公开模块/API 契约

- `ui/lab-ocr/note-match-view.js`：`projectNoteMatchRows(mdRows,blockRows,config)` 仅组合 WP1 只读候选与 `pairs[]`，同一注引形成「注引／注文」两条 AG 行；多个注引共享注文时**每条匹配各有独立 AG `note_row_id`**（从候选 ID 派生），但同一注文 `LineID/BlockID` 不复制或修改。编号歧义时列出所有候选注文；缺少的一端显示占位行；独立孤立注文仍保留可定位记录。`resolveNoteMatchFocus(noteRow,mdRows,blockRows)` 重新验证当前 CM6 的 LineID、BlockID、字符范围、精确原始字串后才返回定位消息（否则 `null`，拒绝过期候选）。均有独立直接测试。
- `ui/lab-ocr/workflow.js` 将 `note-match` 注册为第五个 AG View；始终使用现有 `frame.showSqlRows`/CM6 MD StateField/同一 PDF viewer。固定前列注号，展示端点、原文、状态、PBS、行号、规则 ID、证据级别、理由和候选数量，使用原有 `EnumCheckboxFilter` 对字段和配对状态筛选。原文列是**只读**。切换或源码修改只重投影内存 CM6，不重新读取 SQL 正文。
- `ui/frame/layout.js` 扩展两个窄公共边界：`frame.setAgAction({label,onClick})` 让活动 View 在现有 AG Toolbar 放一个「识别规则」按钮，离开即隐藏；`frame.patchNoteRows(rows)` 以 `note_row_id` 对现有 AG 做增量更新，保留过滤/滚动，而不是按可重复的 LineID 错误合并。同一 Frame 的 `focusMdNoteRange({lineNo,from,to,focus:false})` 在 CM6 当前行以 UTF-16 字符范围高亮注号，`clearMdNoteRange()` 清除；源码实际语法色不被覆盖成公式色。
- `ui/view-store.js` 的既有 `publishLabFocus` 消息扩展可选 `noteFrom` / `noteTo`；仅接受 `origin:'ag'`、正整数源行、同一行合法字符段，并经四窗订阅器驱动源码精确 caret、Markdown 预览对应行、PDF 原始 BlockID 覆盖框，不将 Markdown 内容或注号文本放进消息 Store。端点缺失不可虚构位置。
- `ui/lab-ocr/note-match-rules-dialog.js` 的 `createNoteMatchRulesDialog({onSave})` 生成一个书籍规则对话框：注引/注文内置规则分别勾选，编号范围（全书/按章节）、H1–H6 作用域、续行策略、弱证据选项、自定义 `book.ref.*` / `book.body.*` JSON 正则。高级 JSON 必须有命名组，出错不保存；取消不修改规则，成功应用后立即重算 AG。无需复制全局设置组件，UI 只服务该模块。

### 书籍级配置持久化，非新 SQL 表

- 新增 `scripts/v6_lab_ocr_note_match_config.py` 的 `read_note_match_config(book)` 与 `save_note_match_config(book,config,expected_revision)`；配合原有单一 Lab-OCR HTTP 服务的 `GET note-match-rules` 和 `POST note-match-rules-save`。两者复用 Main Cookie 授权、目录防符号链接及 POST Origin 校验，**无新 Tunnel 或后台服务**。
- 当前书籍工作目录下使用隐藏文件 `.ocr2md-note-match-rules.json` 记录规则（以及 `.ocr2md-note-match-rules.lock` 用于操作锁）。GET 不创建任何文件；POST 才经版本 SHA CAS、输入字段白名单、安全的临时文件+原子替换、拒绝 symlink 保存。不同书籍从独立路径读取，不用浏览器 `localStorage` 的偶然值推测用户在其他设备的配置。
- 严禁因规则更改写入 `md_line`、`block_review`、MinerU JSON、PDF 或用户媒体。本阶段只保存识别规则，不保存任何「已经确认匹配」或「已转换」结论；只有 WP3 在独立授权操作中才允许变更 Markdown。

### 新增测试 / 边界

- `node tests/lab-ocr-note-match-view.test.mjs`（AG 两端、重复引用唯一行、缺失/冲突、源证据过期直接测试）。
- `python3 tests/lab-ocr-note-match-rules.test.py`（合成书籍独立规则、读只读、CAS 冲突、非法规则、symlink、真实 HTTP Cookie/Origin/方法边界，不需要建 SQLite）。
- `node tests/lab-ocr-note-match-view.browser.test.mjs`：Chromium 与 iPad WebKit，原生 Lab Frame + 合成 API，AG 5 View 正确、两端独立源码/PDF/MD 预览定位、按书籍修改规则后候选增删、切换 View 重载配置、没有 MD/Block 保存请求。
- 回归：标题/LaTeX/断块的 AG 选项列表新增 `注释匹配` 是预期的接口扩展，不得删除旧 View 或改变旧列身份；同时验证 PDF 原覆盖框、LaTeX 异步渲染和断块的 CM6 Undo/Redo。

### WCP43 注释匹配排序与缺号提示（2026-11-17）

- **默认排序改为注号升序，不再默认按源码/PBS 顺序。** `compareNoteNumbers(left,right)` 对数字注号使用数值自然比较（`2` 在 `10` 前），字母注号与 `* / † / ‡` 符号注号位于数值注号之后，按稳定顺序排列；`projectNoteMatchRows` 先按注号、配置范围及候选组组织行，同一引用-注文对保持连续，多处注引可引用同一注文定义。
- 现有 AG Grid `number` 列声明默认 `sort:'asc'` 和数值比较器；`ui/frame/layout.js` 仅在**进入注释匹配 View** 时通过 Grid 官方 `applyColumnState` 清理前一个 View 的旧排序并设定注号升序。PBS 仍用已验证的 `comparePBS`，`line_no` 仍是数值列；用户点击对应表头可以改用 PBS 或行号排序，后续规则保存和增量更新**不重置手动排序**。再次切入此 View 恢复默认注号顺序。既有 MD/标题/LaTeX/断块视图不受此默认规则改变。
- `findMissingNoteNumbers(index)` 在**同一配置范围**内取注引和注文已发现数字注号的并集，只提示两端**已观测**编号之间的空缺：发现 `1、2、4` 会增加 `3 · 疑似缺号` 提示行。每条提示行的 `LineID/BlockID/源码行号` 为 `null`、PBS 为空，绝不造出不存在的原文或 PDF 框；点击时仅由全局状态栏提示“请检查 OCR 与编号规则”。已有注引没有注文、或反过来，沿用已有 `缺注文 / 缺注引` 状态，不重复虚报整号缺失。章节重启编号时使用 `scope:'chapter'` 分范围统计，防止把两个独立序列混合认定为断档；缺少足够证据时**不猜测第一个已见编号之前或最后一个之后**是否缺号。
- `疑似缺号` 不是 WP3 的人工裁决，也不自动补号或转换 MD。真实 Buffett 示例注号 1–10 连续，因此缺号提示为 0；但原来位于 7 之后的正文枚举 `(1)`、`(2)` 将按数字排到注号 1、2 的匹配行附近，仍保持“待核实”。
- `tests/lab-ocr-note-match-view.test.mjs` 直接覆盖数字 2/10、字母/符号、1/2/10 中间缺号、无虚假 LineID/PBS、按章节独立、未观测开头不猜测；`tests/lab-ocr-note-match-view.browser.test.mjs` 通过 Chromium/iPad WebKit 验证第5 AG 默认注号升序、虚线无关的缺号行与筛选、手动 PBS/行号排序、规则更新不重置手动排序、重新切换恢复注号顺序，以及 MD/Block 保存次数为0。

## WCP43 WP3.1 · 人工审阅 + 注释配色（2026-11-17）

### 可见行为

- 注引/注文属于**端点类型**：注释候选端点（`注引` 金色，`注文` 蓝色 `#84b7ff` + 蓝色侧边条及浅蓝底）。`待核实` 属于**匹配状态**：橙红 `#ff9b62` + 独立描边橙底。状态、端点类型用不同色相及形状，不能继续复用注文字色渲染警示。
- AG 同一「注释匹配」View 的固定末列为「审阅」。每个**注引候选**持有唯一审阅对象，同一 pair 的注引和注文行展示相同审阅状态；「缺注引」孤立注文、「疑似缺号」占位行不可进行伪审阅。
- 审阅选项：`待定`（撤销人工决定）、`忽略`（人工确认不是要处理的注释）、`确认配对（待转换）`（当且仅当至少有候选注文时选择一个明确的 body CandidateID）。有多个同号注文时必须从菜单点选一个候选 PBS/行号，不依赖最近距离猜测。`待转换` 是编辑流程状态，不等于**已转换**；本 WP **不运行 CM6 脚注转换、不写 MD、不动 Block**，真正转换留 WP3.2。
- 选 `忽略` 即刻从默认待审阅候选列表退出；AG 工具栏复用 Frame 的 `setAgToggle({label:'显示已忽略',...})` 随时显示并恢复 `待定`。只在 Note Match View 显示此复选框；AG 其他 View 的布局不变。对 iPad 狭窄四窗版面，只有带此复选框的 AG toolbar 可以自动折行。
- 保存审阅是局部 AG `patchNoteRows`，不重新加载 SQL 或替换 CM6 编辑器；注号/PBS/行号原有排序与 AG 列过滤保持。工作区切换重置内存缓存及规则窗，按书籍重新读取。用户源码未保存时仍可只读看候选，但禁止保存人工决定。

### 新持久化契约和权威边界

- `scripts/v6_lab_ocr_note_pair_review.py` 仅负责 `read_note_pair_reviews(book)` 和 `set_note_pair_review(book,reference,body,decision,expected_revision)`；`GET /labs/lab-ocr/api/ocr/note-pair-reviews` 是**只读**，没有扩展表仍返回空记录；`POST /labs/lab-ocr/api/ocr/note-pair-review-set` 校验 Main Cookie、Origin 和书籍工作目录授权，采用现有 SQLite 库的 `BEGIN IMMEDIATE`，只在第一次人工决定后创建扩展表 `note_pair_review`。
- `note_pair_review` 的主键为 **ref CandidateID**（稳定 LineID + UTF-16 位置 + 规则 ID，非 PBS、非注号），保存 ref LineID、BlockID、字符范围、原文上标、整行 SHA256，及可选明确选择的 body CandidateID、LineID、BlockID、字符范围、整行 SHA256。一个注文允许多个注引复用；单注引仅对应一条人工审阅决定。
- 每次更新生成随机 revision，用户请求必须携带上一版 revision 或 `null`；若另一设备修改则返回 422，不自动覆盖。服务端同时核对 SQLite `md_line` 真实原文、BlockID、LineID 和字符区间；SQL 中修改过的原文不能带旧快照冒充新证据。`GET` 不把过期记录宣称有效；UI 从当前 CM6 运行态重新对齐每条引用及 body 候选，过期时只提示 `需复核`。
- 原始 MinerU/MD 数据仍为唯一权威：审阅表不保存可写的第二份 Markdown，禁止在 GET 时创建表，禁止在保存审阅时修改 `md_line` 或 `block_review`。旧来源覆盖/Block 重建会发现这张人工审阅表并拒绝静默覆盖。书籍级规则仍由 `.ocr2md-note-match-rules.json` 负责，不复制入新 SQL 表。
- 公共 Frame 只新增小 API `setAgToggle`；注释模块直接 API `projectReviewedNoteRows` 纯函数、`createNotePairReviewCell` 审阅菜单、后端读写 API 均有直接/浏览器测试。暂不对其他 AG View 引入复选框或单独状态存储。

### 回归

- `node tests/lab-ocr-note-pair-review.test.mjs` 验证同一行多注引、忽略/恢复、明确 body 冲突选取、原文变化仅对应候选失效。
- `python3 tests/lab-ocr-note-pair-review.test.py -v` 在隔离书籍中验证 GET 绝不建表、POST 建表、CAS 并发/覆盖保护、完整 md_line 不变、书籍间隔离、HTTP 未授权/错误 Origin 拒绝；所有数据变更仅发生在合成 book 的 SQLite。
- `node tests/lab-ocr-note-match-view.browser.test.mjs` 用 Chromium + iPad WebKit 验证蓝色注文 vs 橙红警示的实际 CSS 色值和描边、忽略立即退出、重新进入 View 仍被忽略、显示已忽略后恢复、选择明确注文成为待转换、规则保存和排序保持、MD/Block 保存次数=0。

## WCP43 WP3.2 · CM6 原子脚注转换（2026-11-17）

### 执行合同与 UI

- 「审阅」列中只有 **人工确认配对 = 待转换** 且来源未过期的注引行，才能点击 `执行转换 · 写入 Obsidian 脚注`。自动识别的「已匹配」**不能**直接转换；无可选正文、编号冲突、跨章节重复注号、书籍自定义不支持的注文格式、原文与证据不一致均 fail closed，保留原文。
- 内置可转换：HTML sup（含反斜杠转义）、Markdown `[^N]`、上标数字/括号等注引形式，配对的数字点号/括号/方括号、Notes 标签和现有 Markdown 注文。保留正文所有实际字符，仅替换注文首行标签为 `[^N]: `；多行注文只有续行已有明确缩进才附加四格缩进，拒绝把未缩进的未知段落吞进脚注。一个源行只做一次修改，**不增加或删除物理行**；正文后继行的 LineID、BlockID 及 PDF 覆盖框身份保持不变。其他编号/复杂布局先保留待定，由 WP3.3 对照 OCR 审阅。
- `ui/lab-ocr/note-pair-conversion.js` 唯一导出 `planNotePairConversion({mdRows,blockRows,configuration,referenceId,bodyId,review})`，只生成 `{updates:[{lineId,lineNo,blockId,beforeText,afterText}], convertedReferenceId,convertedBodyId,...}`，不持有第二份可编辑原文、不直接访问 DOM/SQL；重号的 Obsidian 全局 ID 冲突一律拒绝。`ui/frame/layout.js` 扩展 `frame.convertMdNotePair(plan)`，验证 CM6 当前 StateField、源行内容和身份，**一个 `editor.dispatch({changes:[...]})`** 完成所有源行修改；CM6 史栈单次 Undo/Redo 可恢复配对全部更改，后续保存继续走原 `md-persistence.js -> md-save` 版本 CAS。没有单独的 Markdown 落盘接口。
- 一组注文可被多个注引引用。先转换第一个已审阅注引和注文正文；第二个注引经过**重新审阅新 Markdown 注文**后，只修改自己的注引，不重复转换或复制注文。源行同号多引用相互影响位置的高级情况仍留待 WP3.3。注文第一行和续行已经是 Markdown `[^N]:` 时不会再次改写。
- 转换状态为：`待转换`（人工确认、原文还没转）、`转换待保存`（已在 CM6 转换但未获 md-save CAS 回执）、`已转换`（所有目标行的 SQLite 已保存证据通过），以及原文变化后的 `需复核`。已转换不可再点一次，若需回退用现有 CM6 Undo/Redo；Undo 恢复原文本后自动重新识别人工待转换状态，Redo 则恢复已转换。重新进入 View 时 SQLite 只读查询已转换证据，不能把一个尚未实际落盘的准备操作冒充完成。

### 审阅回执与崩溃恢复

- `scripts/v6_lab_ocr_note_pair_conversion.py` 独立 API `arm_note_pair_conversion(book,reference_id,expected_revision,plan)`，挂至**现有** Lab-OCR API `POST note-pair-convert-prepare`；仅依 Main 的 Cookie/Origin/工作目录授权，`BEGIN IMMEDIATE` 校验人工审阅版本、Ref/Body MD 原文、所有计划改动行与 BlockID，**只写审阅表中的可选 `conversion_json` 证据与 revision**。对老书籍表按需 `ALTER TABLE` 新增一列，不复制或改写正文。每个条目仅记录当前行身份和 `before_sha256/after_sha256`，并不保存另一个 Markdown 内容权威。
- prepare 成功后前端再次核查 CM6 `version`、未保存状态与当前书籍，然后调用 **一次** CM6 事务，最后立即 `flushMdChanges()` 走既有 MD CAS；如果窗口在提交前关闭，GET 仍把旧文本识别为 `待转换`；如果只保存部分行，GET 不会报告已转换。若转换发生 SQLite revision 冲突，CM6 未落盘文本留在现有 Undo 栈，状态栏明确报错，不执行不安全的自动覆盖或补偿写入。
- `read_note_pair_reviews` 读取转换回执时通过 SQLite MD 逐行比较全部后态 SHA；判断完毕才把 `conversion.converted_ref_id / converted_body_id` 的当前候选映射为已转换。原始 Row Source 文本证明仍保留，用于 Undo 重现时的审阅状态判断，旧规则与人工忽略记录不被重写。Python 对原文位置使用与 JS/CM6 一致的 **UTF-16 字符偏移**，避免 Unicode 非 BMP 字符造成误选。

### 测试边界

- `node tests/lab-ocr-note-pair-conversion.test.mjs`：多注引语法、内置注文语法、同一注文共享多注引、既有 Markdown 注文不重复改写、强校验拒绝原文/编号冲突、跨行缩进边界。
- `python3 tests/lab-ocr-note-pair-conversion.test.py -v`：隔离临时书籍、准备回执只写 review 表、CAS/原文无变化/冲突、MD 完全落盘后才报告已转换，部分落盘不报告已转换，Undo/Redo 恢复原/后态，真实 HTTP Cookie/Origin/方法隔离。
- `node tests/lab-ocr-note-pair-conversion.browser.test.mjs`：Chromium 与 iPad WebKit 通过真实 Lab Frame + CM6 + 合成 SQL 后端；先人工确认，再执行单次 CM6 改两端、SQL CAS 落盘、Undo 一次还原全文、Redo 恢复，第二个注引共享已转换注文时不重复写注文，重新开 View 仍识别 `已转换`；LineID/BlockID 保持、Block 保存次数为 0。
