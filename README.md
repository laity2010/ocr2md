# OCR2MD · V2 工程契约（当前事实、PBS 目标与开发门禁）

> **接手前必读**：先读本工作树的 `AGENTS.md`，再读本 `README.md`，然后按任务查阅 `docs/v2/`、实际源码和测试。此处区分 **[已实现] / [仍待实现] / [风险已修复]**。历史 WP 文档不得推翻当前契约；README 本身不替代代码和可执行门禁。未经测试，不得把目标描述成已上线功能。
>
> **WP09 当前范围：以 para_blocks 原始类型和内容直接生成父子两层逻辑行；旧逻辑表可经授权操作明确覆盖重建，基础表不变。保留 WP08 组末空行、WP07 拖动与 CM6 历史；源码窗仍只读。** V2 工作树：`labs/lab-ocr-v2`；Git 分支：`experiment/lab-ocr-v2`；唯一开发入口：`https://ocr2md.laity.bid/labs/lab-ocr-v2/`。仅通过独立测试及本 WP 发布验收后，才能称为已上线。

## 1. 版本身份、框架和边界

| 称呼 | 实际项目 | 权威角色 |
| --- | --- | --- |
| V0 | `main` | 历史主线工作台，**不是** V1 源码；Git 分支/工作树名称不作改名 |
| V1 | `lab-ocr` | 现有已验证交互、PDF 动态多轨 PBS、手势和样式的**复用基线** |
| V2 | `lab-ocr-v2` | 当前**两表 + N View** 独立实验工作台和唯一 V2 发布目标 |
| Frame | `lab-frame` | 原四窗、全局设置、目录授权、导航和 AG Grid 的基础框架 |

- V2 是 **框架型 Lab**，不是 V0/Main 的镜像。优先复用真实 V1 `lab-ocr` 的原组件及公开 API，不得把 V0 的 `ui/pdf-preview.js` 固定双轨误当 V1；业务数据用隔离适配器接入，不额外制作平行 PDF、AG、Settings、导航、状态栏或 CM6 实例。
- 保留已验收 Frame 公共源码（`ui/frame/*`、共享 F02 I/O 与脚本）逐字节隔离；V2 只允许自己受精确签名校验的 Vite 构建适配。不在 V2 实验中修改 V0/V1/Frame 工作树及其持久化数据。
- 工作目录只由 **Frame 原全局设置** `workspace.dataDirectory` 绑定并保存。只在 Frame F02 授权 Cookie、目录白名单及实际读写 `probe` 验证通过后，才可处理书籍数据。原 MinerU JSON、PDF、媒体、其他数据库一律只读保护；禁止假定使用仓库目录或其他 Lab 的数据库。
- 已弃用 V2 的历史证据在 Git 标签 `archive/retired-lab-ocr-v2-20261120`。不得把它的旧业务源码、SQLite 或 UI 当成当前 V2 基线恢复。

## 2. 数据唯一权威：[已实现]

**当前仅有两张应用物理表**：已授权书籍目录内的 `ocr2md.v2.sqlite`。AG/源码/Markdown/PDF/标题等均是视图；不新增第三张业务表、父块表、Markdown 行表或 SQL 历史表。

| 物理表 | 当前列与来源 | 作用 |
| --- | --- | --- |
| `mineru_base` | **18 列**；`blockid` 为全局稳定整数索引；`blockid=0` 是非业务源文件档案 | 无损保留三类 MinerU 原始块（`preproc_blocks`、`discarded_blocks`、`para_blocks`）、原始 JSON 字节及 SHA256、完整 `block_json`、原始页码和 bbox；不因逻辑编辑而改变 |
| `logical_block` | **9 列**：`logical_id`、`base_blockid`、`parent_id`、`logical_order`、`markdown_text`、`block_type`、`p`、`b`、`s` | 当前逻辑块文本、顺序和类型；`logical_id` 为内部稳定身份，`base_blockid` 引用原始基础块，当前类型以 `logical_block.block_type` 为准 |

- **WP09 初始化现状**：仅取最终 `para_blocks` 作为逻辑来源，不把前处理和丢弃块当正文；每个顶层 para 为 s0 原始父块，原始 `blocks[]` 内每个 caption/body/footnote 等直系元素生成独立 s1+ 子行。真实 22 页样本为 539 个原始基础块 / 224 个 para 根 + 43 个直系子元素 = **267 条逻辑行**。Raw Txt 只取该元素自身 span 的 `content/html/image_path` 与原有行结构，不再生成 Markdown 标题/围栏/媒体标记或合并不同类型；原始 JSON 字节归档于基础表 `blockid=0`。新书初始化产生新结构；同源非空旧库不会自动覆盖，用户可在 AG 逻辑表明确执行「重建逻辑表」。
- **当前窗口**：框架原导航下拉 `SQL` 组展示 SQLite `sqlite_master` 中真实两表。AG 基础表仍每次从 SQL 读取 120 行分页；**AG 逻辑表取消翻页，完整加载当前逻辑表供视图过滤**，默认按 CM6/Markdown/PDF 当前焦点逻辑块的 **PBS `p` 值**只显示同一逻辑页，AG 工具栏最左端「全部」checkbox 勾选时显示全部逻辑块，取消勾选恢复当前焦点 `p`。这里的 `p` 是逻辑归属页，不是跨页块的原始 PDF 物理页；过滤不修改 SQL，列由数据库元数据提供，横向虚拟化不等于字段缺失。**逻辑表 AG 显示列序固定以 `PBS`、`Type`（`block_type`）、`Raw Txt`（`markdown_text`）开头**，其余九列中的其他物理字段全部保留在后；只改变视图，不调整 SQLite 表结构，基础表原有列序保持不变。源码窗为**唯一 CM6 文档，只读显示，暂不允许文字编辑**；WP08 起**块与块直接拼接，没有任何固定分隔符**，仅父块组的最后子块末尾保障至少一个可见空行，全部空行归属具体逻辑块（见下述 WP08 约定）。位置映射在 CM6 内存、不插 CMD 注释。**仅 PDF 逻辑块拖动可修改 CM6 内存中的块序与父子关系；CM6 原生 Undo/Redo 管结构历史，850ms 空闲后增量更新 SQL 逻辑表**。Markdown 预览由真实 V1 渲染器投影当前 CM6 文档。AG↔CM6↔MD↔PDF 同步高亮定位和结构；PDF 原始几何只读，但 PBS 拖动关系可编辑。
- **V1 PDF 现状**：直接复用 V1 `lab-ocr` 的 `mountLabOcrPdf` 和 `layoutPbsLabels` 原版动态多轨、引线、手势与 PDF.js。三窗时预览下拉可选 PDF/Markdown；四窗切分时同一个 PDFViewer 和工具栏 DOM 移入独立面板，恢复也不重新建立 PDF 实例。原始 PDF 位置只取基础表的真实 bbox，失配/多来源/无 PDF 时不伪造覆盖框。
- **PBS 三列现状**：`scripts/v2_pdf_projection.py` 从持久化 `p、b、s` 生成 `p0b0s0` 等两层标签，禁止孙块，不从 `logical_order` 全页重编号。WP07 复用 V1 PDF 拖动可调整根块组前后顺序、归入为子块、调整同组子块前后顺序（含 V1 支持的相邻跨页归入）；**插槽处及其后所有同级编号统一顺延，不跳过空号**；结构经 CM6 内存事务、AG/PDF 即时显示和空闲 SQL 增量更新。**源码编辑、手工拆分子块、任意脱离父组操作仍未开放**。

## 3. PBS 两层逻辑块：[WP07 结构拖放；WP08 组末空行拼接；文本编辑和拆分未开放]

- **WP08 空行归属与 CM6 拼接 [代码及定向测试已实现]**：在唯一 CM6 文档中直接拼接每个 `logical_block.markdown_text`，**不在块间插入换行或分隔符**。只有父块组最后的逻辑子块（无其他子块时为 `s0`）负责组末可见空行：若原文不以双换行结尾，则仅在 CM6 投影中补足到 `\n\n`；原文已含足够空行则不额外添加。所有原有的空行（包括同组非末子块内部和末尾）保留且属于各自文本块。补足的最小尾部空行归属组末块的 CM6 显示区间，保留 `groupEndPad` 长度以和原始 SQL 文本严格区分，**本航点不改写 SQL 的 `markdown_text`，不能将视图补全误当 SQL 已保存**。拖动归入/移出时依据新的末块重算这段仅用于显示的尾部，保证旧自动空行不会继续夹在同组子块之间；原文已有空行不裁剪。未来独立开放源码编辑时，在该空行输入的文本应归于末块，并按编辑事务将改动连同空行写入逻辑表，不得凭空行拆分块；WP08 仍只读。

**用途**：修正 OCR 块识别时的张冠李戴、跨栏/跨页归属错误、拆分、归入和重组；**只允许“父块分组 → 子块”两层，禁止孙块、递归多层和复杂树结构**。

- **字段与身份**：逻辑表已将 `p`、`b`、`s` **作为三个整数持久化**，对外显示 `pNbMsK`。`pNbM` 为父块**分组**，不另建一条父块 SQL 行；每个实际逻辑行代表 `sK` 子块，`(p,b,s)` 在当前逻辑表唯一。`logical_id` 保留为稳定的内部行身份；AG 首列显示派生 PBS，所有九个 SQL 真实字段仍可检查。`base_blockid` 指向不变的原始基础块 ID，PDF 物理页和原始 bbox 始终来自基础表，跨页逻辑归属不改变物理覆盖框。
- **默认 `s0` 与 `s1+`**：每个 `para_blocks` 顶层基础块仍是唯一 `s0`，其原始 JSON 直系子元素分别是同组 `s1+`（table_caption/body/footnote、image_body、chart_caption/body/footnote 等）。子行可以和父行共用 `base_blockid`，但 `logical_id` 各自唯一，不能把多个原始类型的文本合并到一个 Raw Txt。没有第三级。
- **插入槽位顺延（WP07 已接入 V1 手势与 SQL 事务）**：父块 `before` 在目标 `b` 腾槽（目标及后续 `b+1`），`after` 在目标 `b+1` 腾槽（后续 `b+1`）；父块带所有子块一起移动，其 `s` 和 `parent_id` 保持原关系，受顺延的父块子块同步更新 `b`。例如 `p1b3s0` 移至 `p1b4s0` **之后**：目标保持 `p1b4s0`，移动块成为 `p1b5s0`，原 `p1b5s0` 及其后所有同页父块成为 `p1b6s0` 等。旧 `p1b3` 留空不补号。子块 `before/after` 对目标 `s/s+1` 腾槽，后续同组 `s+1`；`child` 在目标 `s+1` 腾槽，归入多行父块组时按插入行数顺延后续 `s`，不产生孙块。**即使原编号有空号，也统一顺延，不因空号停止**。不在整个页上重新从零编号；只修改受影响的逻辑行。PBS 可有空号，不要求连续。
- **WP07 iPad 实机 no-op 修复**：CM6 文本顺序不变**不等于**结构没变化。旧版曾只移动 `logical_order`、PBS 保持旧编号；遇到此类已按目标排列但 `b/s` 仍颠倒的状态，拖动必须允许**只更正 PBS**，经同一 CM6 StateEffect/Undo/Redo 和空闲 SQL 差量事务写回。只有块序已符合目标且 PBS 同级顺序也正确时，重复放置才是真正无操作；不创建 CM6 历史、不标脏、不写 SQL，状态栏提示「已在目标位置」，不可报「写入失败」。回归见 `tests/v2-structure-move.test.mjs` 和 `tests/v2-mineru-base.browser.test.mjs`。
- **结构/状态职责**：`p,b,s` 管当前归属编号，`logical_id` 不变；CM6 的 StateField / StateEffect 负责内存结构与同一原生 Undo/Redo，源码 DOM 不可编辑、拒绝无结构效果的文字修改；SQL 仅存最新状态，不加历史表。空闲后 `structure-commit` 使用 Frame F02 目录权限、旧值乐观冲突检查、`BEGIN IMMEDIATE` 事务、局部五列 `UPDATE`，冲突回滚、CM6 当前状态保留并警告；已保存的 Undo/Redo 也作为新的增量变更写回。
- **当前范围和起点**：只将 `para_blocks` 根及其直接子元素初始化为逻辑块；其余原始块组保留在基础表。PBS 根按原始 PDF 页顺序初始化 `p/b/s0`，原生子元素依源顺序标 `s1+`。PDF 子块优先投影自己的原始 bbox，没有可用子 bbox 再沿用原始父块 bbox。
- **WP07 验收门禁**：真实 V1 PDF 标签拖动，包括 `p1b3s0 → p1b4s0 之后` 的根块和后续 `b+1`、同组子块 `s+1`、父块带子块、缺号仍顺延、跨页原 bbox 保持原位、无孙块、AG/CM6/MD/PDF 联动、同源 CM6 Undo/Redo、SQL 延迟增量事务、冲突回滚；并单独验证 iPad-WebKit 和源码只读。**拆分新文本子块不属于 WP07**。

## 4. 旧 SQLite 原地升级与数据边界：[风险已修复]

- 用户明确当前 V2 **没有任何人工编辑**，同意直接升级 PBS，不要求先建独立 WP05 门禁。已知五列、六列 `logical_block` 在来源不变及 Frame F02 授权验证后，**原地事务升级九列**，保留现有文本、ID、顺序和类型，不执行整体从 MinerU 重建覆盖。
- 已修复早前“未知九列非空逻辑状态被自动重建造成内容丢失”的入口：不兼容且非空的未知逻辑表现在**拒绝覆盖**，仅已确认的五/六列执行可验证迁移；空逻辑表可按原规则补齐。测试见 `tests/test_v2_pbs_upgrade.py` 与 `tests/test_v2_mineru_base.py`。
- 数据读写仍要求已保存资料目录、F02 目录白名单与读写 `probe`，保护 MinerUJSON/PDF 原件、其他书籍和 Lab。活动 SQLite 日志、符号/硬链接、来源 SHA 不一致等情况下拒绝不安全迁移。
- 未验证过的未知旧 Schema 仍可能被拒绝；不能为让它看起来兼容而擅自删除重转。

## 5. 开发、验收与发布门禁

- **按 AGENTS.md 执行**：任务开始先读本 README，查受影响源码、公开 API 和独立测试；先固定可回退 Git 点；在隔离夹具上实验，不以推测修补未定位故障；任何新的结构 Schema 必须有明确迁移与数据恢复测试。README 只记录当前项目契约，开发历史放 `docs/v2/`。
- **Frame/F02**：`ui/frame/*` 基线一致性和 Settings 保存、权限验证、两表导航；旧 `/api/v2/` 不得复活。V2 的业务 API 为 `/labs/lab-ocr-v2/api/mineru-base/{state,import,markdown,pdf-map,pdf,structure-commit,logical-rebuild}`；最后一个仅允许带 Frame 会话/同源来源/旧值校验的 POST 结构字段提交，只处理本书籍的授权数据；不新设端口、Tunnel、认证或平行文件管理器。V2 的 F03 自动更新在 CM6 结构未保存时延后执行，不依赖 iOS 的离开页面弹窗。
- **现行测试**：`python3 tests/test_v2_mineru_base.py -v`（两表、原始字节与兼容迁移）、`python3 tests/test_v2_pdf_projection.py -q`、`python3 tests/test_v2_pbs_upgrade.py -q`、**`python3 tests/test_v2_structure_commit.py -q`**；`node tests/v2-block-source.test.mjs`、`node tests/v2-block-source-fixture.test.mjs`、`node tests/v2-focus-map.test.mjs`、`node tests/v2-logical-ag-filter.test.mjs`、**`node tests/v2-structure-move.test.mjs`**、`node tests/lab-ocr-pbs-layout.test.mjs`、`node tests/v2-pdf-evidence-adapter.test.mjs`；`node tests/v2-mineru-base.browser.test.mjs`、`node tests/v2-real-markdown-preview.browser.test.mjs`、`node tests/v2-clean-frame.browser.test.mjs`、`node tests/v2-clean-frame-isolation.test.mjs`。WP08 重点手势回归可用 `V2_TEST_WP08_ONLY=1 node tests/v2-real-markdown-preview.browser.test.mjs`，保留不加标志的全量 WP07 PDF 手势测试。浏览器回归包括 Chromium 和 iPad-WebKit，重点检查真实 V1 PDF 标签拖放、CM6 源码只读、Undo/Redo 后 SQL 再次写入、PDFViewer 不换实例、不重复下载及原 bbox 不变；**实机 iPad Safari 仍须单独验收**。
- **Git/发布**：变更经过有依据的定向回归与审计、commit/push 后，按 `AGENTS.md` 第 9 节的唯一 `release/`+manifest 网关发布同一 `lab-ocr-v2` 入口，核对 Git SHA、静态文件 SHA256 和其余 Lab 不变。WP07 修改 SQLite 写入接口，发布后必须通过既有 V2 发布脚本同步刷新常驻 Gateway 的 Python 业务模块。
- **V2 后端运行版本同步**：Gateway 使用常驻 Python 进程导入 V2 模块；静态资源发布不等于更新其 `sys.modules` 缓存。V2 的正式发布脚本 `scripts/v2_frame_publish.py` 对比上次发布 SHA 与本次 Git SHA，若 V2 五个 Python 业务模块发生变化，发布后只通过既有 `launchctl kickstart -k` 刷新 **同一个统一 Gateway**，并核验 `/labs/healthz` 的发布 ID；纯静态变更不重启。禁止清理用户书籍 SQLite 或建立第二个 Gateway。直接测试：`python3 tests/test_v2_gateway_publish_sync.py -q`。

## 6. 既有航点文档（历史证据与模块说明；不得覆盖本 README）

- 当前航点：[WP07 PDF 拖放、CM6 结构历史与 SQLite 空闲写回](docs/v2/WP07_PDF_DRAG_CM6_STRUCTURE_IDLE_SQL.md)。
- 当前 WP08：[CM6 父块组末尾空行与无分隔拼接](docs/v2/WP08_CM6_GROUP_END_BLANK_LINE.md)。
- 当前 WP09：[para 原始类型/内容与仅重建逻辑表](docs/v2/WP09_PARA_RAW_LOGICAL_REBUILD.md)。
- 本轮 PBS 实施：[PBS 三列直接升级](docs/v2/WP05_PBS_THREE_COLUMNS.md)。
- PBS 三列升级：[PBS 直接升级与两层规则](docs/v2/WP05_PBS_THREE_COLUMNS.md)。
- 两表和 Markdown：[WP01 逻辑契约](docs/v2/WP01_LOGICAL_CONTRACT.md)、[WP02 初始化](docs/v2/WP02_LOGICAL_INITIALIZATION.md)、[WP03 无损往返](docs/v2/WP03_MARKDOWN_ROUNDTRIP.md)、[WP03 类型列](docs/v2/WP03_BLOCK_TYPE_CONTRACT.md)；当时的文字可编辑 CM6 属于历史，**WP07 起 CM6 只读文本、只允许结构事务**。
- CM6/Markdown/联动：[WP04 CM6](docs/v2/WP04_CM6_SOURCE_CONTRACT.md)、[V1 MD 预览](docs/v2/WP04_V1_MD_PREVIEW.md)、[多窗联动](docs/v2/WP04_V1_MULTI_PANE_SYNC.md)；其早期“PDF 无真实数据/仅三窗”结论已被后续 PDF 接入取代。
- 正确 V1 PDF：[真正 V1 多轨源](docs/v2/WP04_V1_LABOCR_MULTILANE_SOURCE.md)、[单窗与切分恢复](docs/v2/WP04_V1_PDF_PREVIEW_SPLIT_LIFECYCLE.md)。早期 [错误 PDF 映射](docs/v2/WP04_V1_PDF_PBS_SYNC.md)、[错误复用方案](docs/v2/WP04_V1_PBS_DIRECT_REUSE.md) 曾误将 V0/Main 的固定双轨当 V1，**仅保留为失败证据**，不可作为当前复刻依据。
