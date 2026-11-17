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
- 内置可转换：HTML sup（含反斜杠转义）、Markdown `[^N]`、上标数字/括号等注引形式，配对的数字点号/括号/方括号、Notes 标签和现有 Markdown 注文。保留正文所有实际字符，仅替换注文首行标签为 `[^N]: `；多行注文对已有缩进的续行附加四格缩进；对未缩进的续行，只有首行与续行位于同一不可变 BlockID、MD 物理行连续、前一行非空时才附加四格缩进；跨块或空行后的未知段落仍拒绝吞入脚注。一个源行只做一次修改，**不增加或删除物理行**；正文后继行的 LineID、BlockID 及 PDF 覆盖框身份保持不变。其他编号/复杂布局先保留待定，由 WP3.3 对照 OCR 审阅。
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

## WCP43 · 统一 AG 功能菜单及三态「匹配状态」列（2026-11-17）

- **唯一操作入口**：公共 Frame 在 AG View 选择框的**紧邻右侧**增加 `功能` 下拉，公开 `frame.setAgFunctions([{id,label,onClick}, ...])`。菜单由当前 View 提供，切换 View 时自动替换，其他无操作的 View 下拉禁用；每次执行后选择框返回 `功能`。不为每个 AG View 增建独立工具栏。注释匹配 View 注册 `转换匹配`、`识别规则` 两项；旧版「识别规则」独立按钮和「显示已忽略」单独复选框不再显示。
- **匹配状态三项**：注释匹配 AG 只保留一列可审阅的 **`匹配状态`**，原生 `<select>` 精确为 `已匹配 / 待核实 / 忽略`，不再出现平行的「审阅」列；原有内容/注号/PBS/行号/判断依据、过滤器和四窗定位照旧。自动强证据配对投影为 `已匹配`；弱证据/缺一端/人工待核实投影为 `待核实`；人工忽略为 `忽略`。疑似缺号行保持只读并在「判断依据」说明缺号，不产生虚构端点。转换已经完成时仍显示 `已匹配`，辅以只读 ✓ 标记，回退必须使用 CM6 Undo/Redo。
- 状态下拉是**修改**而非仅列值过滤：三项可切换；`待核实`、`忽略`均可在书籍的 `note_pair_review` SQLite CAS 中持久化；选择 `已匹配` 时，必须存在对应注文候选，唯一则直接保存明确配对为既有 `待转换` 内部状态，多个候选则弹出定位在当前行附近的二级「选择注文」下拉，不猜测最近的正文。已经存在的 `待转换`、`已转换` 回执继续有效。人工忽略行**留在 AG 表内**，可以按「匹配状态」列筛选及恢复，不再自动从表中消失。
- **兼容既有书籍审阅**：旧 SQL `note_pair_review` 的 `CHECK` 只允许 `忽略/待转换`。首次出现人工 `待核实` 决定时，在 SQLite `BEGIN IMMEDIATE` 内创建新临时同结构表并复制所有已有审阅/转换证据，原子替换为支持三态的 schema。失败整体 rollback，不改 MD/Block/用户原始 MinerU 数据；GET 继续只读，不能因打开 View 触发迁移。
- **`功能 → 转换匹配`**：这是用户的显式执行操作，选择当前书籍匹配状态为 `已匹配` 的注引候选（不限当前 AG 页/筛选）。自动强证据已匹配也允许在用户触发此功能时执行；后台首先借助原 WP3.1 CAS 记录明确的一对一候选，再通过 WP3.2 转换准备回执 → **一对脚注一组 CM6 事务** → 原 MD SQLite CAS 保存。多个引用共享同一注文时，转换第二个引用不重复写订单正文。无法找到唯一注文、来源过期、全文注号冲突或无安全规则的候选**保守跳过**；同一源码行多个可安全转换的注引使用后续同行分组事务，状态栏报告已转换和跳过数量；若发生未保存的 MD 保存冲突则立即停止，不覆盖已有正文。每对可独立 Undo/Redo，不谎称整批共用一个历史步。
- 旧的注释匹配 `review` 字段保留为非显示的派生证据，作为已转换/过期/Undo 判断，不再与 `match_state` 并排呈现。「匹配状态」是唯一可编辑分类，不把 SQLite 的技术状态码 `待转换/已确认/需复核` 混入用户选择项。

验收：`tests/lab-ocr-note-match-view.browser.test.mjs` 逐项验证状态三值、跨 View 菜单、忽略仍可见/可恢复、多个同号注文必须二次选择、识别规则仍可用、MD/Block 不写；`tests/lab-ocr-note-pair-conversion.browser.test.mjs` 验证统一转换入口对多个已匹配引用共享一个注文执行安全转换、MD CAS、Undo/Redo、重开 View 和物理行身份；`tests/lab-ocr-note-pair-review.test.py` 验证旧表原子迁移、三态 CAS 且源文本不变。

补充公共 API 直接测试：`node tests/lab-frame-layout.direct.browser.test.mjs` 在 Chromium/iPad WebKit 中实际调用 `frame.setAgFunctions`，核验菜单选项列表、两个回调、执行后复位、无功能禁用和非法定义拒绝；不依靠注释 View 的端到端测试冒充 Frame API 直接覆盖。

## WCP43 · 同行多注引合并转换 / 已转换及转换失败筛选（2026-11-17）

### 原因与修复边界

- 旧 `convertMatchedNotes` 将所有注引按 MD 行号逆序处理，以 `touchedReferenceLines` 强行跳过同一 LineID 的第二个注引。Buffett 可复核样本（不以动态 PBS 作稳定主键）实际 MD 第286行、BlockID 388 **同时包含 `<sup>9</sup>` 与 `<sup>10</sup>`**，注号 9、10 的注文位于 346、348 行。旧程序先改 10 后无理由跳过 9；并且后续单独改 9 会令 10 的整行 SHA 回执失效。新实现撤除该粗粒度跳过，按**稳定 LineID**分组、保守审阅、同时规划。
- `ui/lab-ocr/note-pair-conversion.js` 新增唯一纯函数 `planNotePairGroupConversion({mdRows,blockRows,configuration,pairs,anchors})`：对**同一物理行**的多个已匹配注引先分别使用旧独立安全规划确认 ref/body 及正文证据，再把各 `<sup>N</sup>` 原始范围无重叠地拼成一条源行 afterText，其他注文行依原顺序加入（共享注文只一次）；多个新注引的新 `ref.md-footnote` CandidateID 必须根据所有前置改写后的 UTF-16 offset 重新计算。所有更新最终作为一个 `{updates}` 交由 `frame.convertMdNotePair`，**一个 CM6 Undo/Redo 事务 + 一次原 MD CAS 保存**，不生成或删除物理行，LineID/BlockID/PDF 框不动。
- 若当前行已存在经过审阅并已转换的注引（例如此前 10 成功、9 被跳过），它作为 `anchors` **不被二次改写**；规划把该注引的已转换新坐标随前置改写修正，分组准备在一个 SQLite 原子事务中同时更新新 9 的回执、既有 10 的坐标及新的整行 SHA。原先的已转换回执作为限量 `alternates` 保留；`receipt_state` 根据 SQLite **全部行 SHA** 精确选择当前版本：执行新改写后 9/10 都已转换，而 Undo 恢复到仅 10 已转换的文本时，10 仍为「已转换」、9 回到待转换。旧被保存的读物并不要求用户先 Undo 再转换 9。
- 后端新单一服务 API `POST note-pair-group-prepare` 接受精确成员、CAS revision、转换后 candidate id、旧 anchor 回执与共享行 changes；在 `BEGIN IMMEDIATE` 同时核对原文、身份、各注号的新 marker 坐标和所有候选修改行，失败全部 rollback，只保存不可编辑的转换 SHA 元数据，不触碰 MD/Block。旧单对 `note-pair-convert-prepare` 继续保留，适用于只有一个未转换注引且没有历史 anchor 的行。
- 对一个物理行中的匹配候选，任何已匹配注引无法获得安全注文或证据不一致时，整行暂不执行修改，并把每条被跳过注引的 **注号及原因** 反馈状态栏。安全判断失败依 `missing-body/ambiguous-body/source-conflict/unsafe-layout/unsupported-rule/duplicate-number/prepare-rejected/save-conflict` 分类；用户下次检查后可重新手动标记 `已匹配` 再试。不允许为了扩大转换数而忽略源证据。

### AG 匹配状态及审阅持久化

- 可编辑的三态仍是 `已匹配 / 待核实 / 忽略`；**自动派生**两种只读、不能由下拉手工伪造的值：`已转换`（严格按现有 SQL MD 全部后态 SHA + 当前 CM6 行证据判定）和 `转换失败`（源证据仍有效且当前人工作业保留失败代码与具体说明）。所以「匹配状态」下拉显示五个值，但只有前三项可人工选择；后两项对应原有 AG `EnumCheckboxFilter`，点击列筛选即可得到仅成功行或仅失败行，包含对应注引和注文。
- 新列 `转换失败原因` 只放逐条原因；`判断依据` 继续包含候选规则原始证据及失败提示。失败写入新 API `POST note-pair-convert-issues`，只修改**已有** `note_pair_review` 的可选 `conversion_issue` 字段，未审阅候选按来源证据创建 `待核实` 扩展记录；CAS revision、Main Cookie/Origin 和书籍隔离仍生效。GET 只读，旧书籍扩展表在首次写入时安全新增列；用户显式重设匹配状态时自动清除过时失败记录。失败理由与每个候选 LineID、BlockID、UTF-16 范围和整行原文 SHA 绑定，原文变动后不会继续显示旧失败为新事实。
- 批量运行的最终状态栏报告已转换/失败跳过/未执行数量，并附前 8 条实际注号与原因，其余可在 AG 筛选「转换失败」。AG 筛选仅改可见投影，不删除 Markdown 或书籍人工审阅记录。不把技术状态当作“自动转换成功”的判断。

### 直接及浏览器验收

- `node tests/lab-ocr-note-pair-group.test.mjs`：独立同一行 9/10 的纯规划、正确 UTF-16 新偏移、两个订单正文不重复、旧 10 anchor + 新 9 组合、不允许重复/无效候选。
- `python3 tests/lab-ocr-note-pair-group.test.py -v`：隔离合成书籍中整组两人审阅 CAS 原子准备、前态只读、后态两成员成功、Undo/Redo、先 10 成功再 9 加入及 Undo 后旧 10 仍成功、失败原因持久化和显式状态清除、实际单一 HTTP Cookie/Origin/405 方法边界。
- `node tests/lab-ocr-note-pair-group.browser.test.mjs`，及通过 `NOTE_PARTIAL_MODE=1`、`NOTE_FAIL_MODE=1` 分别在 Chromium 与 iPad WebKit 运行：新 9/10 同行原子转换、先成功 10 后补转 9 的回执跟随、已转换五态下拉只读、模拟某个非同行脚注转换失败且在 AG `EnumCheckboxFilter` 勾选「转换失败」后仅剩失败行；CM6 Undo/Redo、原 MD CAS、重开 View、Block 保存次数 0。
- 真实 Buffett 样本**只读**运行同组纯规划：第286行的 9、10 与第346、348行注文恰好生成三条行更新；测试阶段没有执行任何 `md-save` 或人工审阅 `POST` 写入真实书籍。


## WCP43 · 注号 7 OCR 续行补齐与匹配状态禁排序（2026-11-17）

- Buffett 书籍的只读 SQLite 样本确认：注号 7 注引在第136行，注文第341行和第342行同属 `BlockID=471`（PBS 当前 `p17b8`），第341行结尾为句中 `... delivered an `，第342行开头是 `underwriting profit.`，没有 Markdown 缩进。此前 `planNotePairConversion` 的“只接受已有明确缩进的订单续行”规则误将这一 OCR 行折行判为需人工处理，导致 AG 显示「转换失败」。
- 修复仅允许 **同一不可变 BlockID 内**的未缩进连续正文参与安全转换；相邻 `line_no` 必须精确递增、上一物理行非空、中间不得存在空白段落；既有扫描器仍负责判定候选所属的注号、章节/Notes 范围，转换规划不另猜订单关系。对于跨块、空白段落后、来源位置错乱的未缩进续行继续 fail closed。转换保留英文内容和全部 MD 行结构，注引/首行/续行用一次 CM6 事务修改；第342行只在开头添加四格缩进。BlockID、LineID、PBS、PDF 覆盖框不变，保存仍走原 MD CAS。
- **「匹配状态」列** `sortable:false`：禁用列头触摸排序以避免误操作，但保留原先的 `EnumCheckboxFilter`，仍可按「已匹配 / 待核实 / 忽略 / 已转换 / 转换失败」筛选。默认按数字注号排序，PBS 和源码行仍可人工排序；已转换是只读派生状态，不能手动伪造。
- 直接回归：`node tests/lab-ocr-note-pair-conversion.test.mjs` 验证同块未缩进续行通过、跨块拒绝和空行后拒绝；真实 Buffett SQLite 的 **只读** 调用 `planNotePairConversion` 确认第136、341、342行恰好三条改动；`tests/lab-ocr-note-7-continuation.browser.test.mjs` 通过 Chromium/iPad-WebKit 验证一次 CM6 事务、单次 MD CAS、Undo/Redo、重开仍为已转换、Block 保存 0；`tests/lab-ocr-note-match-view.browser.test.mjs` 点击匹配状态列头两次不会改变默认注号排序，匹配状态列的现有筛选按钮不消失。

## WCP43 · Safari「转换匹配」选择后无动作（2026-11-17）

- **用户实机线索**：iPad Safari 截图中注号 7 的 AG `匹配状态=已匹配`，而左上角的原生「功能」`<select>` **持续显示「转换匹配」而非复位为「功能」**；现有 `setAgFunctions` 仅监听 `change`，当 iPad 上的 native picker 继续保持上次选中值、再次选择同一项时，浏览器不会产生新 `change`，导致命令不执行且状态栏没有新反馈。不能把这个界面上的无动作误报为订单续行逻辑又失败。
- 公共 Frame 维持**唯一 API `setAgFunctions([{id,label,onClick}])` 不变**，内部从 `<select>` 改成**触摸点击的菜单按钮 `功能 ▾` + `role=menu` 下的真正 `<button role=menuitem>`**。按钮每次点击都打开动作列表，动作项每次点击立即调用回调；执行后自动关闭并复位标签为「功能 ▾」，没有保留上次选中的 native option 状态。点击外部或 Escape 关闭、切换 AG View 或销毁 Frame 自动关闭、无功能时禁用。菜单渲染为独立的 document-layer popup，避免 iPad 窄栏的 AG/Dockview overflow 截断；异步动作异常进入现有全局状态栏，不被静默吞掉。
- `功能 → 转换匹配` 的入口**收到实际点击后立即**发送全局状态 `已收到转换匹配命令，正在核对 N 个注引`；无 MD/View、未保存、无匹配、重复点击、异步失败均有明确全局状态。原转换计划、人工确认、SQL CAS 与 CM6 单事务不修改；实际真实书籍仍由用户点击后写入，本次测试不自动写用户书籍。
- `tests/lab-frame-layout.direct.browser.test.mjs` 用 Chromium 和 WebKit 对同一个功能连点**两次**，验证两次都触发、菜单关闭与角色/复位正确、切 View 清理菜单。`tests/lab-ocr-note-7-continuation.browser.test.mjs` 用 iPad WebKit/Chromium 验证注号 7 成功转换、再次点击同一功能返回「没有可转换」而非静默，以及先有「转换失败」审阅记录、重新设为「已匹配」后执行转换的真实交互序列。旧注释 View、同一行 9/10、独立多注引等全部通过相同点击菜单回归。

## WCP43 · 注释格式配置极简化（2026-11-17）

- 用户操作仅需 **注号格式**和**注文格式**两个单选下拉，选择框选项即包含内置名称和可辨识样本；当前选择下方显示其样例与**对应的实际内置 Regex source/flags**，来自唯一 `ui/lab-ocr/note-match-index.js` 规则字典，避免界面写一套看似正确但与运行态不同的表达式。取消规则 checkbox 阵列、章节设置、弱匹配开关及自定义 JSON 编辑入口，不另建规则引擎/SQL 表。
- 单项选择在既有 per-book `note-match-rules` CAS 中仍使用同一个 `referenceRules`、`bodyRules` 数组；选择单一来源格式时**同时保留**规范化的 `ref.md-footnote`/`body.md-footnote` 引擎规则以显示、定位、复核**已经转换**的 Obsidian `[^7]`、`[^7]:`，不能让已转换内容在 AG 中消失。选择标准 Markdown 格式本身时去重，不添加第二份同规则。
- 已存储的旧书籍可能是多种格式组合或自定义 Regex：在其首次打开新版规则弹窗时用一个 `当前书籍的原有多格式组合（保留不变）` 选项，**不自动更改**当前匹配；用户选择某个内置规则时仅替换该方向，另一方向未修改的内置规则和自定义配置保留。`scope/chapterLevel/continuation/weakAutoMatch` 等既有结构设置隐藏但原样透传，避免悄悄改变笔记章节、续行边界。
- 保存成功立即更新 AG 候选，不更改 CM6 MD/Block，也不删除人工审阅与转换回执；重新打开规则界面能识别已保存的单个源格式，并可再次选择新格式。
- 验收：`tests/lab-ocr-note-rule-presets.test.mjs` 检查全部 14 个内置样例与真实正则一致、单一选择与已转换 Markdown 共存；`tests/lab-ocr-note-match-view.browser.test.mjs` 在 Chromium 和 iPad WebKit 验证弹窗只有两个 `select`、没有 checkbox/textarea、自带样例与 Regex、当前多格式书籍不自动覆盖、选择源格式+注文格式保存后立即去掉未启用的原生候选且保留标准 Markdown、切回 View 后从书籍 SQL 规则读取且 `scope`/续行设置不变。现有 Python `note-match-rules` CAS 测试继续通过。

## WCP43 · Markdown 注释阅读弹窗沿用 Main（2026-11-17）

- **无需新模块/新解析器**：Main 与 Lab 均已有完全相同 SHA 的 `ui/footnote-popover.js`、`.css`，Markdown 渲染器也已使用同一份 markdown-it + markdown-it-footnote。Lab 的缺口仅在 `ui/frame/layout.js` 对这个已有组件的**装配、生命周期和导航**。
- Frame 预览的 `mdArea` 原位作为 `createFootnotePopover({root,onLocate})` 的 Markdown root，原 Main 模块负责定位 `sup.footnote-ref a[href^="#fn"]`、读取 sanitizer 输出的 `li.footnote-item`、克隆正文、移除回链及动态 Floating UI 浮窗定位；鼠标悬停、点击、关闭及 Escape 都遵从 Main 模块的现有逻辑。没有复制模块或另建一份脚注正文数据。
- 点击注引只显示原只读卡片，**不让浏览器跳 hash 或改变四窗焦点**。卡片里的「定位注文」触发 Frame 已有 `setMdPreviewNavigation` 语义回调，Lab-OCR 的 `locateReview({origin:'preview',lineNo})` 再负责 AG/CM6/PDF 的唯一定位消息；Frame 同时把 Markdown 预览的真实 `li` 带进可见范围。新增 `↩ 返回注引`（Main 现有样式）保持并恢复最初的引用行、预览精确 scrollTop 和键盘 focus；不对 Markdown/SQL/Block 持久化做任何写入。
- `setMarkdownPreview`、`clearMdRuntime`、`setMdPreviewNavigation(null)`、Frame `dispose` 会关闭浮窗并清理返回状态；数据变更时先关闭再执行延迟的 Markdown 重绘，防止原注释坐标绑定到已经过期的 DOM。切换 PDF 模式时也按 Main 的现有方式关闭浮窗，不改动原 PDF 组件的加载与预热。
- API 保持最小：只沿用 Frame 原有的 `setMdPreviewNavigation(lineNo)`/`setMarkdownPreview`，内部复用原 Main `createFootnotePopover`。独立的 `tests/lab-frame-footnote-popover.browser.test.mjs` 在 Chromium/iPad-WebKit 实际 Markdown 渲染上测试重复注引、浮窗不跳转、不更改 scrollTop、正文加粗/链接、显式定位及返回、长文滚动、Escape、重绘/销毁清理；`tests/lab-ocr-note-7-continuation.browser.test.mjs` 验证转换后的 `[^7]` 在 Lab 四窗中点击、定位注文、返回注引与 Undo/Redo。
