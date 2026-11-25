# OCR2MD · V3 执行手册（当前实现状态与规划边界）

> **接手前必读**：先读取统一根目录联邦四件套（`../../AGENTS.md` → `../../BUILD.md` → `../../COMM.md` → `../../GIT.md`），再读本州宪法（`./AGENTS.md`）及本州已登记同级专项契约（`./SQL.md` → `./CM.md` → `./VIEWS.md`），最后读本文件与实际源码/测试。本文件只记录事实与现行状态，不覆盖上级规范；未经测试，不得将拟议能力描述为已实现。

## 1. 基本身份与当前阶段

- **Lab ID**：`lab-ocr-v3`（框架型 Lab，自 `lab-frame` 基线 `1dbc2b7` 建立）
- **工作树**：`labs/lab-ocr-v3`；**Git 分支**：`experiment/lab-ocr-v3`
- **目标统一入口**：`/labs/lab-ocr-v3/`（**[WP00-SHELL 尚未发布；WP01 挂载]**）
- **当前阶段**：**WP00-SHELL 空壳基线 [实现与自动化验证中]**。`ui/frame/*` 保持逐字节不变；通过 `labs/lab-ocr-v3/vite.config.mjs` 注入联邦构建前检查、独立 `lab-ocr-v3` 设置/自动更新隔离与 `v3GridPort`，由 `ui/v3-shell-entry.js` 接线 V1 原生 `EnumCheckboxFilter`，并落盘 `scripts/v3_frame_publish.py` 发布器。

## 2. 现状与待实现清单

| 模块 / 能力 | 当前状态 | 说明 |
| :--- | :--- | :--- |
| **工作树与州治理体系** | **[已实现 · WP00-LEGISLATION PASS]** | 独立 worktree、`AGENTS.md`（治理架构）+ 显式登记的 `SQL.md`、`CM.md`、`VIEWS.md` 及本 `README.md` |
| **V3 空壳基线与 `COMM.md` 门禁** | **[WP00-SHELL 已实现]** | `labs/lab-ocr-v3/vite.config.mjs`（含 `check-start`）、`ui/v3-shell-entry.js`（原生 V1 `EnumCheckboxFilter`）、`scripts/v3_frame_publish.py`、`tests/cross-version-ag-filter.browser.test.mjs`、`tests/test_v3_frame_publish.py` |
| **统一网关接入与首次挂载** | **[仍待实现 · WP01]** | 网关“老路冻结 + 新路动态发现与按 commit 局部热重载”及首次发布至 `/labs/lab-ocr-v3/` |
| **V3 SQLite 底座与摘要式 CAS** | **[仍待实现 · WP02–WP03]** | `ocr2md.v3.sqlite`、`zlib` 归档、`structure_sha256` / `before_sha256`、`open_v3_db` |
| **单源 $O(\log N)$ CM6 与局部拖拽** | **[仍待实现 · WP04–WP06]** | 仅读 `structureField`、轻量行索引、二分局部编辑门禁、局部 `ChangeSpec` 拖拽与三窗布局 |
| **AG 双投影与全套审阅 View** | **[仍待实现 · WP07–WP09、WP11]** | 标题/注释/LaTeX/断块/媒体/HTML 表格 View |
| **审阅决策持久化** | **[仍待实现 · WP10，待拍板]** | 待用户选定 `SQL.md` 第 5 节方案 A（`review_meta` 列）或方案 B（`review_state` 辅表） |

## 3. 现行构建与验收命令

- V3 正式构建（自动触发联邦 `git-gate check-start`）：
  `npx vite build --config labs/lab-ocr-v3/vite.config.mjs`
- 发布器隔离单测：
  `python3 -m unittest tests/test_v3_frame_publish.py -v`
- 联邦 `COMM.md` 跨版本组件双浏览器门禁（Chromium + iPad-WebKit）：
  `python3 ../../main/scripts/verify_cross_version_components.py --target lab-ocr-v3 --browser`
- 联邦布局与继承检查：
  `python3 ../../.ops/verify-unified-layout.py`
- 统一发布（需先完成 commit/push 且通过 `check-release` 与组件门禁）：
  `python3 scripts/v3_frame_publish.py --release-root ../../release`

## 4. 历史查询

构建历史与审计证据一律查 `git log --show-notes` 与 `git notes show <SHA>`，不在本文件维护平行开发流水账。
