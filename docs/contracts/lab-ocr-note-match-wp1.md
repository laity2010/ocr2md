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
