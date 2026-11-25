# OCR2MD · V3 执行手册（当前实现状态与规划边界）

> **接手前必读**：先读取统一根目录联邦四件套（`../../AGENTS.md` → `../../BUILD.md` → `../../COMM.md` → `../../GIT.md`），再读本州宪法（`./AGENTS.md`）及本州已登记同级专项契约（`./SQL.md` → `./CM.md` → `./VIEWS.md`），最后读本文件与实际源码/测试。本文件只记录事实与现行状态，不覆盖上级规范；未经测试，不得将拟议能力描述为已实现。

## 1. 基本身份与当前阶段

- **Lab ID**：`lab-ocr-v3`（框架型 Lab，自 `lab-frame` 基线 `1dbc2b7` 建立）
- **工作树**：`labs/lab-ocr-v3`；**Git 分支**：`experiment/lab-ocr-v3`
- **目标统一入口**：`/labs/lab-ocr-v3/`（**[仍待实现 / 尚未发布]**）
- **当前阶段**：**WP00 州立法阶段 [已完成立法草案，待用户审阅]**。目前仅完成独立工作树建州、州宪法与三份州级同级专项契约落地；尚未修改业务源码、统一网关或发布产物。

## 2. 现状与待实现清单

| 模块 / 能力 | 当前状态 | 说明 |
| :--- | :--- | :--- |
| **工作树与州治理体系** | **[已实现，待审阅]** | 独立 worktree、`AGENTS.md`（治理架构）+ 显式登记的 `SQL.md`、`CM.md`、`VIEWS.md` 及本 `README.md` |
| **空白框架底座** | **[继承自 `lab-frame`]** | 保留 `lab-frame` (`1dbc2b7`) 原始壳层与共享联邦 Git 执法配置，尚未改写为 V3 入口 |
| **统一网关接入与首次挂载** | **[仍待实现]** | 待用户批准网关放行/动态发现方案后实施（WP01） |
| **V3 SQLite 底座与摘要式 CAS** | **[仍待实现]** | `ocr2md.v3.sqlite`、`zlib` 归档、`structure_sha256` / `before_sha256`、`open_v3_db`（WP02–WP03） |
| **单源 $O(\log N)$ CM6 与局部拖拽** | **[仍待实现]** | 仅读 `structureField`、轻量行索引、二分局部编辑门禁、局部 `ChangeSpec` 拖拽与三窗布局（WP04–WP06） |
| **AG 双投影与全套审阅 View** | **[仍待实现]** | `EnumCheckboxFilter` 门禁、标题/注释/LaTeX/断块/媒体/HTML 表格 View（WP07–WP09、WP11） |
| **审阅决策持久化** | **[仍待实现，待拍板]** | 待用户选定 `logical_block.review_meta` 列或独立 `review_state` 辅表方案后实施（WP10） |

## 3. 开工前待用户审阅确认项

1. **州治理文本审阅**：审阅本州 `AGENTS.md` 及登记的 `SQL.md`、`CM.md`、`VIEWS.md` 边界是否符合预期。
2. **审阅决策持久化选型**：确定采用 `SQL.md` 第 5 节的方案 A（主表加 `review_meta` JSON 列）还是方案 B（两表 + 唯一 `review_state` 辅表）。
3. **网关接入方式**：确认是否在 `agent-link-monitor/bin/ocr2md-labs-gateway.py` 执行“老路冻结 + 新路动态发现”一次性升级。

## 4. 验收与历史查询

- 联邦布局与继承检查：`python3 ../../.ops/verify-unified-layout.py`
- 联邦构建记录与执法状态：`python3 ../../.ops/git-gate.py check-start --tree .`
- 构建历史与审计证据一律查 `git log --show-notes` 与 `git notes show <SHA>`，不在本文件维护平行开发流水账。
