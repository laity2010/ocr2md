# OCR2MD · V2 工程契约（当前事实、PBS 目标与开发门禁）

> **接手前必读**：先读本工作树的 `AGENTS.md`，再读本 `README.md`，然后按任务查阅 `docs/v2/`、实际源码和测试。此处区分 **[已实现] / [结构编辑待实现] / [风险已修复]**。历史 WP 文档不得推翻当前契约；README 本身不替代代码和可执行门禁。未经测试，不得把目标描述成已上线功能。
>
> **本轮已直接升级 PBS 数据结构；PDF 拖动归入与 CM6 SQL 写回尚未实施。** V2 工作树：`labs/lab-ocr-v2`；Git 分支：`experiment/lab-ocr-v2`；唯一开发入口：`https://ocr2md.laity.bid/labs/lab-ocr-v2/`。

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

- **初始化现状**：只从最终 `para_blocks` 初始化逻辑行，不把前处理和丢弃块当正文；真实 22 页样本为 539 个原始基础块 / 224 条初始逻辑行。初始化时两表一起生成；已兼容的空逻辑表可按受控导入补全，同源兼容的非空逻辑状态应保留。原始源文件逐字节归档于基础表的 `blockid=0` 记录，可验证、恢复。
- **当前窗口**：框架原导航下拉 `SQL` 组展示 SQLite `sqlite_master` 中真实两表；AG Grid 原生实例按 120 行分页，列由数据库元数据提供，横向虚拟化不等于字段缺失。源码窗为唯一 CM6 文档，逻辑块按 `\n\n` 隔出一个空行，位置映射在内存、不插 CMD 注释。CM6 可编辑、Undo/Redo、保护块间边界，**当前修改仅留在内存，尚未持久化 SQL；刷新后消失**。Markdown 预览由真实 V1 渲染器投影当前 CM6 文档。AG↔CM6↔MD↔PDF 在有唯一、获授权且坐标可验证的 PDF 时同步高亮和定位；PDF 仍**只读**，拖动仅预演，不写逻辑关系。
- **V1 PDF 现状**：直接复用 V1 `lab-ocr` 的 `mountLabOcrPdf` 和 `layoutPbsLabels` 原版动态多轨、引线、手势与 PDF.js。三窗时预览下拉可选 PDF/Markdown；四窗切分时同一个 PDFViewer 和工具栏 DOM 移入独立面板，恢复也不重新建立 PDF 实例。原始 PDF 位置只取基础表的真实 bbox，失配/多来源/无 PDF 时不伪造覆盖框。
- **PBS 三列现状**：`scripts/v2_pdf_projection.py` 已直接读取持久化的 `p、b、s` 生成 `p0b0s0` 等两层标签，禁止孙块，不再从 `logical_order` 连续重算；归入、拆分及其事务写回**尚未实现**。

## 3. PBS 两层逻辑块：[数据结构和只读映射已实施；交互编辑待实现]

**用途**：修正 OCR 块识别时的张冠李戴、跨栏/跨页归属错误、拆分、归入和重组；**只允许“父块分组 → 子块”两层，禁止孙块、递归多层和复杂树结构**。

- **字段与身份**：逻辑表已将 `p`、`b`、`s` **作为三个整数持久化**，对外显示 `pNbMsK`。`pNbM` 为父块**分组**，不另建一条父块 SQL 行；每个实际逻辑行代表 `sK` 子块，`(p,b,s)` 在当前逻辑表唯一。`logical_id` 保留为稳定的内部行身份；AG 首列显示派生 PBS，所有九个 SQL 真实字段仍可检查。`base_blockid` 指向不变的原始基础块 ID，PDF 物理页和原始 bbox 始终来自基础表，跨页逻辑归属不改变物理覆盖框。
- **默认 `s0`**：每个进入逻辑表的 `para_blocks` 基础块，初始化时均为独立父块下的 `s0`；以后可以归入其他父块成为 `s1` 等。允许一个基础块拆出多个逻辑子块，多个逻辑行可指向同一 `base_blockid`，但须保留各自文本及来源关系，不凭空造原始基础块。
- **只局部修改 PBS（规则已测试，用户拖动及 SQL 写回待接入）**：例如 `p1b4s0 → p1b3s1`，仅更新该逻辑块的 `b:4→3`、`s:0→1`；`p1b3s0`、`p1b5s0` **都不动**。PBS 允许空号与非连续编号；不为了“补洞”对其他父块、整页或全文重新编号，不由 `logical_order` 反复连续重算 `p/b/s`。同组编号冲突只处理受影响的子块。
- **结构/状态职责**：`p,b,s` 管当前归属编号，CM6 管当前编辑及 Undo/Redo，SQL 仅存最新状态（写回须经单独安全事务验证）。当前保留 `parent_id`、`logical_order` 兼容原 CM6/Markdown 位置与顺序映射；`p,b,s` 是当前 PBS 权威。后续结构编辑要同步受影响字段，但不得用 `logical_order` 反向重排 PBS。
- **当前范围和起点**：只将 `para_blocks` 初始化为逻辑块；其余原始块组保留在基础表，不自动变成正文。PBS 采用当前 PDF 物理页索引的 **`p0` / `b0`、默认 `s0`**，上面的 `p1b4` 只是局部调整的示例。
- **下一阶段结构编辑的门禁**：验证归入仅改受影响 PBS、缺号合法、跨页 bbox 保持原位、同基础块拆分溯源、无孙块、CM6/AG/MD/PDF 联动、Undo/Redo、增量 SQL 事务与失败回滚。**九列已完成并不等于拖动结构编辑已实现。**

## 4. 旧 SQLite 原地升级与数据边界：[风险已修复]

- 用户明确当前 V2 **没有任何人工编辑**，同意直接升级 PBS，不要求先建独立 WP05 门禁。已知五列、六列 `logical_block` 在来源不变及 Frame F02 授权验证后，**原地事务升级九列**，保留现有文本、ID、顺序和类型，不执行整体从 MinerU 重建覆盖。
- 已修复早前“未知九列非空逻辑状态被自动重建造成内容丢失”的入口：不兼容且非空的未知逻辑表现在**拒绝覆盖**，仅已确认的五/六列执行可验证迁移；空逻辑表可按原规则补齐。测试见 `tests/test_v2_pbs_upgrade.py` 与 `tests/test_v2_mineru_base.py`。
- 数据读写仍要求已保存资料目录、F02 目录白名单与读写 `probe`，保护 MinerUJSON/PDF 原件、其他书籍和 Lab。活动 SQLite 日志、符号/硬链接、来源 SHA 不一致等情况下拒绝不安全迁移。
- 未验证过的未知旧 Schema 仍可能被拒绝；不能为让它看起来兼容而擅自删除重转。

## 5. 开发、验收与发布门禁

- **按 AGENTS.md 执行**：任务开始先读本 README，查受影响源码、公开 API 和独立测试；先固定可回退 Git 点；在隔离夹具上实验，不以推测修补未定位故障；任何新的结构 Schema 必须有明确迁移与数据恢复测试。README 只记录当前项目契约，开发历史放 `docs/v2/`。
- **Frame/F02**：`ui/frame/*` 基线一致性和 Settings 保存、权限验证、两表导航；旧 `/api/v2/` 不得复活。V2 的业务 API 为 `/labs/lab-ocr-v2/api/mineru-base/{state,import,markdown,pdf-map,pdf}`，只处理本书籍的授权数据；不新设端口、Tunnel、认证或平行文件管理器。
- **现行测试**：`python3 tests/test_v2_mineru_base.py -v`（两表、原始字节与兼容迁移）、`python3 tests/test_v2_pdf_projection.py -q`、`python3 tests/test_v2_pbs_upgrade.py -q`；`node tests/v2-block-source.test.mjs`、`node tests/v2-block-source-fixture.test.mjs`、`node tests/lab-ocr-pbs-layout.test.mjs`、`node tests/v2-pdf-evidence-adapter.test.mjs`；`node tests/v2-mineru-base.browser.test.mjs`、`node tests/v2-real-markdown-preview.browser.test.mjs`、`node tests/v2-clean-frame.browser.test.mjs`、`node tests/v2-clean-frame-isolation.test.mjs`。浏览器回归包括 Chromium 和 iPad-WebKit，特别验证三窗↔四窗两轮切换中 PDFViewer 不换实例、不重复下载、原 PBS 标签恢复；**实机 iPad Safari 仍须单独验收**。
- **Git/发布**：变更经过有依据的定向回归与审计、commit/push 后，按 `AGENTS.md` 第 9 节的唯一 `release/`+manifest 网关发布同一 `lab-ocr-v2` 入口，核对 Git SHA、静态文件 SHA256 和其余 Lab 不变。本轮修改 SQL、投影和 AG，需重新构建、发布并校验同一 V2 入口。

## 6. 既有航点文档（历史证据与模块说明；不得覆盖本 README）

- 本轮 PBS 实施：[PBS 三列直接升级](docs/v2/WP05_PBS_THREE_COLUMNS.md)。
- PBS 三列升级：[PBS 直接升级与两层规则](docs/v2/WP05_PBS_THREE_COLUMNS.md)。
- 两表和 Markdown：[WP01 逻辑契约](docs/v2/WP01_LOGICAL_CONTRACT.md)、[WP02 初始化](docs/v2/WP02_LOGICAL_INITIALIZATION.md)、[WP03 无损往返](docs/v2/WP03_MARKDOWN_ROUNDTRIP.md)、[WP03 类型列](docs/v2/WP03_BLOCK_TYPE_CONTRACT.md)；当时只读阶段与五→六列迁移属于历史，当前 CM6 已可编辑。
- CM6/Markdown/联动：[WP04 CM6](docs/v2/WP04_CM6_SOURCE_CONTRACT.md)、[V1 MD 预览](docs/v2/WP04_V1_MD_PREVIEW.md)、[多窗联动](docs/v2/WP04_V1_MULTI_PANE_SYNC.md)；其早期“PDF 无真实数据/仅三窗”结论已被后续 PDF 接入取代。
- 正确 V1 PDF：[真正 V1 多轨源](docs/v2/WP04_V1_LABOCR_MULTILANE_SOURCE.md)、[单窗与切分恢复](docs/v2/WP04_V1_PDF_PREVIEW_SPLIT_LIFECYCLE.md)。早期 [错误 PDF 映射](docs/v2/WP04_V1_PDF_PBS_SYNC.md)、[错误复用方案](docs/v2/WP04_V1_PBS_DIRECT_REUSE.md) 曾误将 V0/Main 的固定双轨当 V1，**仅保留为失败证据**，不可作为当前复刻依据。
