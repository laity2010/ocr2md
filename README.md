# OCR2MD · V3 执行手册（当前实现状态与规划边界）

> **接手前必读**：先读取统一根目录联邦四件套（`../../AGENTS.md` → `../../BUILD.md` → `../../COMM.md` → `../../GIT.md`），再读本州宪法（`./AGENTS.md`）及本州已登记同级专项契约（`./SQL.md` → `./CM.md` → `./VIEWS.md`），最后读本文件与实际源码/测试。本文件只记录事实与现行状态，不覆盖上级规范；未经测试，不得将拟议能力描述为已实现。

## 1. 基本身份与当前阶段

- **Lab ID**：`lab-ocr-v3`（框架型 Lab，自 `lab-frame` 基线 `1dbc2b7` 建立）
- **工作树**：`labs/lab-ocr-v3`；**Git 分支**：`experiment/lab-ocr-v3`
- **目标统一入口**：`/labs/lab-ocr-v3/`（**[WP01-MOUNT 首次挂载；实机 iPad Safari 尚待验收]**）
- **当前阶段**：**WP07 · 独立语法派生层与标题/注释配对派生审阅视图完成**。在公共行索引修订缓存基础上实现第二层独立语法派生（`ui/v3/syntax-derived.js` 与 `ui/v3/view-adapters.js`），接入标题 View（严格 `MD Line`、`source_line`、`PBS` 前三列顺序并清除继承固定列 `pinned: null`）与跨页注释配对 View（`EnumCheckboxFilter` 状态筛选与 AG -> CM6 联动）；下一阶段进入 **WP08–WP09 · LaTeX/断块/媒体/HTML 表格派生视图**。

## 2. 现状与待实现清单

| 模块 / 能力 | 当前状态 | 说明 |
| :--- | :--- | :--- |
| **工作树与州治理体系** | **[已实现 · WP00-LEGISLATION PASS]** | 独立 worktree、`AGENTS.md`（治理架构）+ 显式登记的 `SQL.md`、`CM.md`、`VIEWS.md` 及本 `README.md` |
| **V3 空壳基线与 `COMM.md` 门禁** | **[已实现 · WP00-SHELL PASS]** | `labs/lab-ocr-v3/vite.config.mjs`（含 `check-start`）、`ui/v3-shell-entry.js`（原生 V1 `EnumCheckboxFilter`）、`scripts/v3_frame_publish.py`、`tests/cross-version-ag-filter.browser.test.mjs`、`tests/test_v3_frame_publish.py` |
| **统一网关接入与首次挂载** | **[已实现 · WP01-MOUNT PASS；待实机核验]** | 网关动态发现与按 commit 局部热重载（V2 零回归）；已挂载 `/labs/lab-ocr-v3/`（停检点 ①） |
| **V3 SQLite 物理底座与单轨初始化** | **[已实现 · WP02 PASS]** | `scripts/lab_backend/`（`ocr2md.v3.sqlite`、`open_v3_db`、`zlib` 归档、单轨 `owned-LF` 初始编译、`structureSha256`、`state`/`import`/`markdown`/`pdf-map`/`pdf`）及 `tests/test_v3_sqlite_foundation.py` |
| **V3 摘要式增量 CAS 写回** | **[已实现 · WP03 PASS]** | `scripts/lab_backend/cas.py`（`md-commit` 基于 `structureSha256` + `beforeSha256` + 局部 `O(k)` 尾换行边界核验；`structure-commit` 含临时坐标停泊、边界块 `beforeSha256` 与外键/不变量复核）及 `tests/test_v3_cas_commits.py` |
| **单源 `O(log N)` CM6 与增量保存** | **[已实现 · WP04B PASS]** | `ui/v3/{cm-structure,md-line-index,boundary-feedback,source-session}.js`（Zero Shadow Cache、两层解耦轻索引、二分局部按键门禁、异步微任务闪烁与 850ms 空闲增量 `md-commit`）及 `tests/v3-cm-structure.test.mjs`、`tests/v3-source-session.browser.test.mjs` |
| **V1 PDF/行号复用与局部拖拽** | **[已实现 · WP05 PASS]** | `ui/v3/{pdf-viewer,preview-slot,structure-move,line-gutter,pane-focus}.js`（默认三窗、四窗不重建实例、局部 `ChangeSpec` 拖拽 + `invertedEffects` Undo/Redo + `structure-commit`）及 `tests/v3-structure-move.test.mjs`、`tests/v3-wp05-layout-and-drag.browser.test.mjs` |
| **AG 双投影与端到端检视** | **[已实现 · WP06 PASS]** | `ui/v3/{ag-router,sql-actions}.js`（逻辑块/MD Line 双投影、自适应列宽、纯焦点护栏、SQL 安全导入）及 `tests/v3-wp06-ag-dual-projection.browser.test.mjs` |
| **标题与注释配对派生审阅 View** | **[已实现 · WP07 PASS]** | `ui/v3/{syntax-derived,view-adapters}.js`（独立修订缓存、ATX 标题 View 严格前三列顺序与清除 `pinned`、跨页注释配对 View）及 `tests/v3-syntax-derived.test.mjs`、`tests/v3-wp07-derived-views.browser.test.mjs` |
| **其余派生审阅 View（LaTeX/断块/媒体/表格）** | **[仍待实现 · WP08–WP09、WP11]** | 挂载于公共行索引与独立语法派生层的只读审阅 View |
| **审阅决策持久化** | **[仍待实现 · WP10，待拍板]** | 待用户选定 `SQL.md` 第 5 节方案 A（`review_meta` 列）或方案 B（`review_state` 辅表） |

## 3. 现行构建与验收命令

- V3 正式构建（自动触发联邦 `git-gate check-start`）：
  `npx vite build --config labs/lab-ocr-v3/vite.config.mjs`
- 发布器隔离单测：
  `python3 -m unittest tests/test_v3_frame_publish.py -v`
- V3 SQLite 底座与动态后端包直接测试：
  `python3 -m unittest tests/test_v3_sqlite_foundation.py -v`
- V3 摘要式增量 CAS（`md-commit` / `structure-commit`）直接测试：
  `python3 -m unittest tests/test_v3_cas_commits.py -v`
- V3 单源 `structureField`、轻量行索引与 3000 块按键性能测试：
  `node --test tests/v3-cm-structure.test.mjs`
- V3 CM6 会话双浏览器回归（Chromium + iPad-WebKit）：
  `node tests/v3-source-session.browser.test.mjs`
- V3 局部 `ChangeSpec` 结构拖拽规划器直接测试：
  `node --test tests/v3-structure-move.test.mjs`
- V3 默认三窗、四窗不重建及拖拽提交双浏览器回归（Chromium + iPad-WebKit）：
  `node tests/v3-wp05-layout-and-drag.browser.test.mjs`
- V3 AG 双投影、自适应列宽及纯焦点护栏双浏览器回归（Chromium + iPad-WebKit）：
  `node tests/v3-wp06-ag-dual-projection.browser.test.mjs`
- V3 第二层语法派生（ATX 标题与跨页注释配对）直接测试：
  `node --test tests/v3-syntax-derived.test.mjs`
- V3 标题与注释配对派生审阅 View 双浏览器回归（Chromium + iPad-WebKit）：
  `node tests/v3-wp07-derived-views.browser.test.mjs`
- 联邦 `COMM.md` 跨版本组件双浏览器门禁（Chromium + iPad-WebKit）：
  `python3 ../../main/scripts/verify_cross_version_components.py --target lab-ocr-v3 --browser`
- 联邦布局与继承检查：
  `python3 ../../.ops/verify-unified-layout.py`
- 统一发布（需先完成 commit/push 且通过 `check-release` 与组件门禁）：
  `python3 scripts/v3_frame_publish.py --release-root ../../release`

## 4. 历史查询

构建历史与审计证据一律查 `git log --show-notes` 与 `git notes show <SHA>`，不在本文件维护平行开发流水账。
