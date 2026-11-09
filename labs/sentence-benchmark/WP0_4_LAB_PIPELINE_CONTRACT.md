# OCR2MD · Main / 分句 Lab / 翻译 Lab / 校译 Lab · WP0 交接审计与实施合同

审计日期：2026-11-09。阶段：**WP0/4，仅审计与接口设计；不代表功能已经实现、通过全量 AM、正式晋升或部署。**
当前依据：Main `9649cebdfd4a`、分句实验 Lab `29c952a0c54c` 的源码与独立运行目录。
本文是本轮工程的工作说明，不是 `AGENTS.md` 新增的跨版本正式原则；WP1～WP3 实施时才按现有 AM/Git 流程登记和验证受影响的公开接口。

## 1. 现状：已验证与必须重整

| 环节 | 现状（2026-11-09） | WP0 认定 |
| --- | --- | --- |
| Main | 保存 CMD，`GET /api/document` 可供受控快照导入；未发现 Main 自有 `reviewed.md` 发布接口或正式产物 | **欠缺 Main 审阅 MD 出口** |
| 分句 Lab | 三引擎与句界仲裁已运行；`buildTranslationTable()` 导出 `ocr2md-translation-units/v1`；当前还自行发布 `reviewed-source/v1` | **句表能力复用；审阅 MD 生产权回 Main** |
| 当前新版句表 | `exports/translation-units-c94b0e8c0d8a-reviewed-seams.json`：394 条，已纳入 8 处审阅的 `lb="m"` 合并，来源 CMD SHA `c94b0e8c0d8a` | **新基准候选** |
| 历史句表/译表 | `translation-review/input/` 的 402 条 + GPT/Grok；Muse 402 条另在 `exports/` | **保留原样为历史来源** |
| 翻译 Lab | 尚未建成独立模块/SQLite 数据仓；先前编写的 `scripts/v6_translation_incremental.py`、对应测试为**未跟踪实验文件**；运行目录已有三家 8 条试验任务 JSON | **不得当作已交付模块** |
| 校译 Lab | `GET /api/reviewed-source` 展示新 394 条 **但没有新译表**；`GET /api/translation-review-data` 严格读取旧 402 条完整译表；现有 `prepareTranslationReview()` 拒绝缺译 | **上游入口/完整性门禁必须改造** |

事实校验：402 → 394；新表 **386 条原句可与旧表按已核实来源关联并继承**，8 条原句改变须重译，8 条被合并的旧记录不进入新版。原 CMD SHA 未变，**仅凭 CMD SHA 无法识别句界版本**。这仅是本次样本，不得把 386/8 写死。

## 2. 单向所有权与最小交接

`Main 审阅 MD` → `分句 Lab 句表` → `翻译 Lab AI 译表` → `校译 Lab 仲裁及最终 Markdown`

- **Main**：原 CMD、OCR/版面、断行、文本块及最终审阅 MD 的唯一权威来源。对外发布**只读、带版本的审阅 MD 快照**；保留 PBS/文本块/源坐标对应证据。若干净 MD 脱去 CMD 标签，必须连同可逆映射或锚点映射交付；不能只交纯文本让下游猜回块 ID。
- **分句 Lab**：只读导入 Main 的固定快照，运行三引擎、人工仲裁，发布确定版本的句表。只维护句界及来源映射；不维护 Prompt、AI 任务或译文。
- **翻译 Lab（新建）**：只读导入确定版本句表；SQLite 为该 Lab 唯一的翻译任务/Prompt/历史回件/覆盖状态仓库；经 JSON 向每家外部 AI 独立派发和接收；发布当前句表对应的**各 AI 译表 JSON（允许缺译）**。
- **校译 Lab**：只读取得匹配版本的 Main 审阅 MD/来源映射、分句句表、翻译 Lab 译表。仅比较与仲裁 AI **校正英文**；全部已获得中文译文保留，不比较、不采用中文。生成交叉互译 MD；无需所有 AI 到齐。
- Lab 与 Main **不得相互读写持久化工作目录**；用户所说“从上游目录取”按**显式发布→只读导入/复制固定快照（或公开 API）**执行，而非跨工作树直连内部文件。保持现有 Lab=Main 镜像及模块 API 测试约束；不新建独立变体应用、私有 Tunnel 或并行的 CMD 权威源。

## 3. 接口的数据约定（逻辑合同，具体函数/路由名由 WP1～WP3 纳入 AM 登记）

### 3.1 Main → 分句 Lab：审阅文档快照

- 最小字段：`documentVersion`（审阅 MD 的内容校验值）、`reviewedMd`（全文）、`sourceCmdSha256`、`sourceMap`（PBS 块/原始范围→审阅 MD 范围，含跨块 `lb="m"`）；也可以提供等价版本化文件和映射文件。
- 原文、媒体、公式、注释与非翻译元素由 Main 交付；不由句表反向拼造。审阅 MD 更新即是新的输入快照，禁止静默改写已发布版本。
- **需要在 WP1 验证**：现有 `clean`/`reading` 投影可否直接改用 Main 快照和映射；不得因迁移而丢失现有可逆性和定位。

### 3.2 分句 Lab → 翻译 Lab：标准句表 JSON

- 保留已用的 `ocr2md-translation-units/v1` 字段：`id`、`blockId` / 跨块 `blockIds`、`type`、`elementType`、`decision`、`original`、`sourceRanges` 和来源位置。
- **另必须提供句表版本 `unitVersion`**（由实际句子集合、顺序、原文、来源关系、仲裁版本确定），以及上游 `documentVersion`。这两个版本不可混同；特别是 CMD SHA 相同但句界改变时，`unitVersion` 必须变化。
- 句表为**只读输入**；`corrected`、`translation` 如为现有兼容字段，保持空值，不在分句模块写入。受保护的 Markdown 结构不作为待翻译句子。

### 3.3 翻译 Lab ↔ 外部 AI：增量任务/回件 JSON

- 对每家 AI 独立管理，以 `unitVersion + aiId + promptVersion + taskId` 绑定一次任务；任务仅携带需翻译的 `id`、`original` 及必要上下文，不携带/改写历史其他译文。
- **原句文字变化即重译；原句未变且同一来源单元可核对的，继承旧译文。** 只移动位置不触发重译；拆句/并句后原句变化则重译；不能拿相同文字的另一处句子冒充原句。没有该家历史译文的句子补译。调整 Prompt 后可按人工指定范围主动重译。
- AI 回件仅包含本任务的 `id`、**原句回显**、`corrected`（英文校正）、`translation`（中文译文）和任务版本标识；接收时校验 ID、原句、任务及版本，拒绝错位、重复、跨版本结果。允许分批、失败和未返回；**不得编造空白译文冒充已完成**。
- SQLite 记录每家 AI 的当前有效结果与历次回件、Prompt 版本、任务及覆盖状态。外部原始 JSON 仍归档；模块之间只通过公开 JSON/API，**下游不直连 SQLite**。

### 3.4 翻译 Lab → 校译 Lab：当前版本翻译快照

- 快照绑定 `documentVersion`、`unitVersion`，包含**完整句 ID 目录**、各 AI 的当前有效 `corrected` / `translation`（有则提供）以及缺失状态；可为多家独立 JSON 或一套版本化包。
- 译文历史可追溯，但校译只使用每家 **当前有效结果**。一条 AI 结果在历史中存在，不代表适用于新 `unitVersion`；必须经增量匹配或重新翻译后才列为当前有效。
- **缺译是数据状态，不是发布阻断**。覆盖率由已验证结果计算；仅对缺失/失败的 AI 及句子提示，不要求全家全篇到齐。

### 3.5 校译 Lab → 最终 Markdown：英文仲裁及译文保留

- 仅对**已返回的 AI 校正英文**做严格文本一致性比较；**一致自动通过，分歧才人工选方案**（还可选 Main 原始英文）。中文译文不同不触发人工审阅。
- 仅一家有结果时不谎称多家共识；无任何 AI 英文结果时保留 Main 原文，并标记**未经 AI 原文校准**；没有中文译文时明确标记缺译。渲染器据结构化状态着色提示。
- 新版 AI 回件如果改变了校正英文候选，**尊重新 AI 结果，受影响句重新仲裁**；历史选择仅留作追溯，不直接沿用为新选择。只有中文变化而英文候选不变时不强制重审。
- 最终 Markdown = **选定英文（或原文） + 全部已有各家中文译文 + 锚点/来源 + 机器可识别的缺失标记**。任何缺译不得阻塞生成；缺失值不能伪造成翻译文本。保留图片、公式、注释等原始结构。

## 4. 具体 WP 划分与验收

| 阶段 | 允许改动的范围 | 最低验收证据 |
| --- | --- | --- |
| **WP0（当前）** | 只读事实审计 + 本合同；不重接路由、不迁数据、不开发 UI | 核对旧/新数据及冲突接口，形成受影响文件/测试清单；Git 留痕 |
| **WP1：分句输出重整** | Main 审阅 MD 生产/只读发布；分句 Lab 固定快照导入、标准句表与独立 `unitVersion`；不动 AI 翻译及校译 UI | 394 行、8 处断行、CMD/MD 可逆映射、来源锚点、版本变更、旧分句功能回归 |
| **WP2：Lab 翻译新模块** | SQLite、Prompt、增量任务/回件 JSON、覆盖状态与只读快照 API；界面先按实际工作流作最小化设计 | 真实 402→394 得出三家各 386 继承/8 重译；错误回件拒绝；部分回件允许发布缺译；独立补译与 Prompt 定向重译 |
| **WP3：校译输入重整** | 改读 WP2 完整句 ID/部分 AI 数据，英文分歧仲裁、选择版本和最终 MD；保留现有阅读器/跨窗定位 | 英文分歧重审、中文差异不触发、全译文保留、缺译可着色、断行/标题/媒体/注释/锚点 Chrome/WebKit 回归 |
| **WP4：集成验收（仅规划）** | 四阶段联调、模块 API/消息边界与 Git/AM 审计，按既有流程晋升/发布 | Main 修订→句界改变→增量补译→校译更新→缺译仍可导出；Mac/Chromium/WebKit 按已跑证据判定 |

## 5. 当前隔离与明确不做

- **不修改 `AGENTS.md`、Main 工作目录、正式发布目录、现有 API 或实际用户审阅数据。**
- **不重写旧 402 句表/译表，不把实验用 8 条任务当作已返回的新译文。** 当前 394 模式没有真正的三家新版译表。
- `scripts/v6_translation_incremental.py` 和相应测试为早先未获明确工程授权而产生的**未提交试验代码**，不属于 WP0 成果或已验收功能；尤其其“必须收到全部增量行才合成”的规则，与新商定的**缺译不阻塞**原则冲突。WP2 必须先核对、决定重用或废弃，不能自动晋升。
- 不在 WP0 决定 Lab 翻译的具体界面，不建立第二套 Markdown 渲染器、不增加第二个业务应用或 Tunnel。

## 6. 将影响的现存测试/接口（供 WP1～WP3 定向处理）

- 分句导出：`ui/sentence-benchmark-translation-table.js`、`ui/sentence-benchmark-app.js`、`ui/sentence-benchmark-reviewed-package.js`、`/api/sentence-review`、`/api/reviewed-source`、`tests/sentence-benchmark-translation-table.test.mjs`。
- 校译旧入口：`scripts/v6_translation_review.py`、`GET /api/translation-review-data`、`ui/translation-review-core.js`、`ui/translation-review-app.js`、`tests/am/TRANSLATION_REVIEW_PUBLIC_CONTRACT.md` 及旧 402 句真数据浏览器测试。
- 复用既有 Markdown `renderMarkdown()`、CM6/Dockview、来源坐标和跨窗同步；在受影响阶段更新 AM API/消息登记及直接测试，不放宽原断言以求通过。
