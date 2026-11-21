# OCR2MD · V2 工程契约（当前事实、PBS 目标与开发门禁）

> **接手前必读**：先读本工作树的 `AGENTS.md`，再读本 `README.md`，然后按任务查阅 `docs/v2/`、实际源码和测试。此处区分 **[已实现] / [已确认目标·未实施] / [BLOCKED·已发现风险]**。历史 WP 文档不得推翻当前契约；README 本身不替代代码和可执行门禁。未经测试，不得把目标描述成已上线功能。
>
> **本次文档整理不代表 PBS 数据结构迁移或已修复风险。** V2 工作树：`labs/lab-ocr-v2`；Git 分支：`experiment/lab-ocr-v2`；唯一开发入口：`https://ocr2md.laity.bid/labs/lab-ocr-v2/`。

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
| `logical_block` | **6 列**：`logical_id`、`base_blockid`、`parent_id`、`logical_order`、`markdown_text`、`block_type` | 当前逻辑块文本、顺序和类型；`logical_id` 为内部稳定身份，`base_blockid` 引用原始基础块，当前类型以 `logical_block.block_type` 为准 |

- **初始化现状**：只从最终 `para_blocks` 初始化逻辑行，不把前处理和丢弃块当正文；真实 22 页样本为 539 个原始基础块 / 224 条初始逻辑行。初始化时两表一起生成；已兼容的空逻辑表可按受控导入补全，同源兼容的非空逻辑状态应保留。原始源文件逐字节归档于基础表的 `blockid=0` 记录，可验证、恢复。
- **当前窗口**：框架原导航下拉 `SQL` 组展示 SQLite `sqlite_master` 中真实两表；AG Grid 原生实例按 120 行分页，列由数据库元数据提供，横向虚拟化不等于字段缺失。源码窗为唯一 CM6 文档，逻辑块按 `\n\n` 隔出一个空行，位置映射在内存、不插 CMD 注释。CM6 可编辑、Undo/Redo、保护块间边界，**当前修改仅留在内存，尚未持久化 SQL；刷新后消失**。Markdown 预览由真实 V1 渲染器投影当前 CM6 文档。AG↔CM6↔MD↔PDF 在有唯一、获授权且坐标可验证的 PDF 时同步高亮和定位；PDF 仍**只读**，拖动仅预演，不写逻辑关系。
- **V1 PDF 现状**：直接复用 V1 `lab-ocr` 的 `mountLabOcrPdf` 和 `layoutPbsLabels` 原版动态多轨、引线、手势与 PDF.js。三窗时预览下拉可选 PDF/Markdown；四窗切分时同一个 PDFViewer 和工具栏 DOM 移入独立面板，恢复也不重新建立 PDF 实例。原始 PDF 位置只取基础表的真实 bbox，失配/多来源/无 PDF 时不伪造覆盖框。
- **当前 PBS 不是新标准**：`scripts/v2_pdf_projection.py` 仍根据 `parent_id`、`logical_order` 和原始物理页动态生成 `p0b0` 等父编号及递归 `s` 后缀；**没有**持久化 `p,b,s`、没有逐基础块的 `s0`，移动时也**没有**实现局部不重排。当前视觉标签能显示 ≠ 下述新 PBS 数据契约已实施。

## 3. PBS 两层逻辑块：[已确认目标·未实施]

**用途**：修正 OCR 块识别时的张冠李戴、跨栏/跨页归属错误、拆分、归入和重组；**只允许“父块分组 → 子块”两层，禁止孙块、递归多层和复杂树结构**。

- **字段与身份**：目标逻辑表将 `p`、`b`、`s` **作为三个整数持久化**，对外显示 `pNbMsK`。`pNbM` 为父块**分组**，不另建一条父块 SQL 行；每个实际逻辑行代表 `sK` 子块，`(p,b,s)` 在当前逻辑表唯一。`logical_id` 继续可作为隐藏、稳定的内部行身份；面向用户的逻辑编号是 PBS。`base_blockid` 指向不变的原始基础块 ID，PDF 物理页和原始 bbox 始终来自基础表，跨页逻辑归属不改变物理覆盖框。
- **默认 `s0`**：每个被纳入逻辑层的原始基础块，初始是对应独立父块下的 `s0`；以后可以归入其他父块成为 `s1` 等。允许一个基础块拆出多个逻辑子块，多个逻辑行可指向同一 `base_blockid`，但须保留各自文本及来源关系，不凭空造原始基础块。
- **只局部修改 PBS**：例如 `p1b4s0 → p1b3s1`，仅更新该逻辑块的 `b:4→3`、`s:0→1`；`p1b3s0`、`p1b5s0` **都不动**。PBS 允许空号与非连续编号；不为了“补洞”对其他父块、整页或全文重新编号，不由 `logical_order` 反复连续重算 `p/b/s`。同组编号冲突只处理受影响的子块。
- **结构/状态职责**：`p,b,s` 管当前归属编号，CM6 管当前编辑及 Undo/Redo，SQL 仅存最新状态（写回须经单独安全事务验证）。`parent_id`、`logical_order` 是否保留、是否仅负责读序，须在 PBS Schema 航点先设计/测试，不能为实施方便自作主张。
- **待确认范围，不得猜测**：用户说“每个基础块默认是 s0”，但**当前仅 `para_blocks` 进入逻辑表**；是否把 `preproc_blocks`、`discarded_blocks` 也纳入可编辑逻辑层尚未确认，不得自动把 539 个原始记录全部当正文。编号起点也须核对 V1 原有约定：**当前 V2 PDF 投影从 `p0`/`b0` 开始**，这里的 `p1b4` 仅为结构举例，不能据此偷偷改成从 1 开始。
- **迁移验收要求**：初始 `s0`、归入只变受影响行、PBS 唯一与缺号合法、跨页移动仍指向原始物理 bbox、同基础块拆分保留溯源、禁止孙块、CM6/AG/MD/PDF 原生联动、Undo/Redo、事务失败回滚、两表恒定及历史用户状态保护。**不能直接用当前六列表或递归 PBS 投影的测试 PASS 冒充目标契约验收。**

## 4. 数据保护阻断项：[BLOCKED · 已证实风险 · 尚未修复]

**不得启动 PBS 三列 SQL 迁移，直到修复并验证这一风险。**

- **复现事实**：当前 `scripts/v2_mineru_base.py` 的 `dispatch(import)` 发现现有 SQLite 的逻辑表为不兼容结构时，可能进入 `new_book(overwrite=True)`。此前已使用**临时测试库**模拟“非空九列逻辑表 + 人工改动文本”，导入后被重建为六列表，文本修改丢失。**这不是理论风险；也不是已修复状态。**
- **保护目标**：凡已有非空 `logical_block`，无论源文件相同与否、列数或 Schema 是否兼容，自动初始化/导入不得直接清除用户编辑。对未知结构，应**拒绝自动重建**并报告原因，须通过明确授权、数据备份及受测的非破坏迁移/恢复方案处理；普通重新打开、只读查询、PDF 预览、选择导航均不能触发非空状态覆盖。对**空库或明确废弃且证明确无待保存逻辑状态**的重建，仍须按 F02、源校验、原子替换等门禁执行。
- **当前安全状态**：README 提出的保护目标**尚未由执行代码完全保证**。修复 `import` 的不兼容 Schema 覆盖路径、加入非空九列人工编辑不丢失的直接回归测试，必须先于 PBS Schema 迁移；**本文档更新不关闭 BLOCKED，也不改变现有 import 行为**。
- 输入 MinerUJSON/PDF 原件和其他 Lab 工作目录绝不可写；仅对当前用户已保存、F02 验证成功的书籍目录执行受控写入，遇活动 WAL/journal、符号链接/硬链接、源变化或其他安全不确定性应拒绝并保留旧库。

## 5. 开发、验收与发布门禁

- **按 AGENTS.md 执行**：任务开始先读本 README，查受影响源码、公开 API 和独立测试；先固定可回退 Git 点；在隔离夹具上实验，不以推测修补未定位故障；任何新的结构 Schema 必须有明确迁移与数据恢复测试。README 只记录当前项目契约，开发历史放 `docs/v2/`。
- **Frame/F02**：`ui/frame/*` 基线一致性和 Settings 保存、权限验证、两表导航；旧 `/api/v2/` 不得复活。V2 的业务 API 为 `/labs/lab-ocr-v2/api/mineru-base/{state,import,markdown,pdf-map,pdf}`，只处理本书籍的授权数据；不新设端口、Tunnel、认证或平行文件管理器。
- **现行测试**：`python3 tests/test_v2_mineru_base.py -v`（两表、原始字节与兼容迁移；**现有通过不表示上面的 BLOCKED 已消除**）、`python3 tests/test_v2_pdf_projection.py -q`；`node tests/v2-block-source.test.mjs`、`node tests/v2-block-source-fixture.test.mjs`、`node tests/lab-ocr-pbs-layout.test.mjs`、`node tests/v2-pdf-evidence-adapter.test.mjs`；`node tests/v2-mineru-base.browser.test.mjs`、`node tests/v2-real-markdown-preview.browser.test.mjs`、`node tests/v2-clean-frame.browser.test.mjs`、`node tests/v2-clean-frame-isolation.test.mjs`。浏览器回归包括 Chromium 和 iPad-WebKit，特别验证三窗↔四窗两轮切换中 PDFViewer 不换实例、不重复下载、原 PBS 标签恢复；**实机 iPad Safari 仍须单独验收**。
- **Git/发布**：变更经过有依据的定向回归与审计、commit/push 后，按 `AGENTS.md` 第 9 节的唯一 `release/`+manifest 网关发布同一 `lab-ocr-v2` 入口，核对 Git SHA、静态文件 SHA256 和其余 Lab 不变。**仅改 README 的工程契约，不等于运行代码变化；不需要为文档-only 更改重新发布应用。**

## 6. 既有航点文档（历史证据与模块说明；不得覆盖本 README）

- 两表和 Markdown：[WP01 逻辑契约](docs/v2/WP01_LOGICAL_CONTRACT.md)、[WP02 初始化](docs/v2/WP02_LOGICAL_INITIALIZATION.md)、[WP03 无损往返](docs/v2/WP03_MARKDOWN_ROUNDTRIP.md)、[WP03 类型列](docs/v2/WP03_BLOCK_TYPE_CONTRACT.md)；当时只读阶段与五→六列迁移属于历史，当前 CM6 已可编辑。
- CM6/Markdown/联动：[WP04 CM6](docs/v2/WP04_CM6_SOURCE_CONTRACT.md)、[V1 MD 预览](docs/v2/WP04_V1_MD_PREVIEW.md)、[多窗联动](docs/v2/WP04_V1_MULTI_PANE_SYNC.md)；其早期“PDF 无真实数据/仅三窗”结论已被后续 PDF 接入取代。
- 正确 V1 PDF：[真正 V1 多轨源](docs/v2/WP04_V1_LABOCR_MULTILANE_SOURCE.md)、[单窗与切分恢复](docs/v2/WP04_V1_PDF_PREVIEW_SPLIT_LIFECYCLE.md)。早期 [错误 PDF 映射](docs/v2/WP04_V1_PDF_PBS_SYNC.md)、[错误复用方案](docs/v2/WP04_V1_PBS_DIRECT_REUSE.md) 曾误将 V0/Main 的固定双轨当 V1，**仅保留为失败证据**，不可作为当前复刻依据。
