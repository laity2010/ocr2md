# V3 章节模块改动热点台账

> **此文件保留 BO/BP 手工历史观察**。2026-10-12 起的可复算账本位于 `../architecture/ledger/`：`changes.jsonl`（真实文件变动）、`tests.jsonl`（测试耗时）、`DECISIONS.md`（架构决策）、`REPORT.md`（热点排行）。历史估计与自动采样分开，不伪装为同一口径。


记录每一次后续的章节功能需求，便于按实际反复访问的文件决定拆分优先级，而不是凭感觉大重构。

## 模块入口和所有权（2026-10-12 第一轮）
| 模块 | 唯一入口 | 自有职责 | 当前仍依赖的公共核心 |
| --- | --- | --- | --- |
| 章节定界 | `src/modules/chapterBoundary.ts` | DIRjson 阶段入口、章节文件枚举与切换来源 | `irWorkbenchPanel.ts`、`documentIrChapters.ts` |
| 章节标题 | `src/modules/chapterHeading.ts` | 标题扫描入口、标题序号工具和提示 | `textBlocks.ts`、`workbench.ts` |
| 章节媒体 | `src/modules/chapterMedia.ts` | 图片扫描入口、串行下载、失败分类、进度任务所有权 | `chapterElementCatalog.ts`、`workbench.ts`、V2 AG 表格 |
| 章节表格 | `src/modules/chapterTable.ts` | 表格清洗扫描入口、工具声明 | `chapterElementCatalog.ts`、`fencedHtmlTablePreview.ts` |
| 章节 LaTeX | `src/modules/chapterLatex.ts` | 数学清洗扫描入口、工具声明 | `chapterElementCatalog.ts`、`fencedMathPreview.ts` |

注册表：`src/modules/registry.ts`。接口：`src/modules/contracts.ts`。源 MD 编辑、AG、PDF、文件 CAS 写入都**不在模块内复制实现**。

## 访问热度记录方法
每次用户提出一项模块需求，Agent 应追加一行表格，记录：日期 / 功能 / 涉及模块 / **实际编辑过的**入口文件 / 实际编辑过的共享文件 / 验收耗时或症结。不将 `git status` 里之前的 WIP 当作本次编辑。连续 3 次功能都被迫修改的共享文件是优先拆分候选；一次性测试执行不计为修改，不添加生产埋点追踪用户浏览习惯。

## 基线观察
| 轮次 | 功能 | 模块入口修改 | 被访问的共享层 | 候选热区 |
| --- | --- | --- | --- | --- |
| 2026-10-12 BO（上一轮） | 图片下载状态转顶部、逐项原因入 AG | 尚无单独入口 | `app.ts`、`workbench.ts`、V2 `calibrationGrid.ts`、`moduleActivitySummary.ts` | 状态汇总、AG 适配器 |
| 2026-10-12 BP（本轮） | 首次拆为五个入口并收拢媒体任务 | 五个模块与 registry | `app.ts`、`workbench.ts`（装配所必需） | `app.ts` 仍有过多导航/视图逻辑；`irWorkbenchPanel.ts` 仍承载定界核心 |

首次实测回归耗时（本轮独立会话的近似 wall time，不能相加视为总等待时间）：五模块 Chromium/WebKit ~70 秒；章节定界 Chromium/WebKit ~64 秒；媒体四场景 Chromium/WebKit ~167 秒；模块注册纯核心 ~0.05 秒。说明耗时热点之一是**端到端测试粒度过大**，不是五个模块自身的扫描时间。

这不是运行时“用户访问次数”；它记录的是**开发时跨文件修改的频度**。当前只积累两轮，尚不足以认定某个共享文件应立刻拆分。
