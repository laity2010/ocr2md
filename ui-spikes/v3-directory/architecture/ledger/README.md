# OCR2MD V3 架构优化账本

这是**开发过程账本**，不是网页运行埋点。目标是在不影响产品性能、不改动正式 Obsidian 文件的前提下，积累判断“哪个模块最常被修改、哪个共享文件最容易牵连、哪些测试最慢”的客观数据。

## 三本账（保持最小）

1. `changes.jsonl` — **需求与代码改动账**：一个完整需求一条记录，模块、结果、本轮实际新增／修改／删除的生产代码与测试文件、共享文件触达数。文件变化采用开发开始与结束的 SHA-256 比较，不依赖 git clean 状态。
2. `tests.jsonl` — **测试耗时账**：每条命令的场景名称、秒数、退出码；没有自动读取命令、环境变量、密钥或测试输出。
3. `DECISIONS.md` — **技术决策与债务账**：为什么暂不拆、什么证据触发重构、方案效果与回退条件。

`REPORT.md` 由 CLI 自动汇总，属于派生报表；历史人工估计另见 `../../tests/CHAPTER_MODULE_HOTSPOT_LEDGER.md`，**历史不与精确测量混算**。

## 每次开发的标准流程

在仓库根目录执行以下命令（本例为示意，替换 ID 与功能名）：

```bash
LEDGER=ui-spikes/v3-directory/scripts/architectureLedger.py
python3 "$LEDGER" begin --id V3-20261012-media-fix --title "图片下载调整" --modules media
# 修改代码……
python3 "$LEDGER" test --id V3-20261012-media-fix --name media-unit -- npm run test:module:registry
# test 默认运行目录为 ui-spikes/v3-directory，可用 --cwd 指向其他仓库子目录。
python3 "$LEDGER" finish --id V3-20261012-media-fix --outcome passed --note "测试通过，人工 Safari 待审"
python3 "$LEDGER" report --last 10 --write
```

**操作约定**：开始改代码**之前**执行 begin；每个有实质意义的测试都用 test 包装；失败的测试同样会登记，之后可修复并重跑；在完成/阻断/部分完成时执行 finish，不能丢弃基线而声称已完成。任务有未完成的临时状态时不结束本轮；下一次仍沿用同一任务 ID。不同需求使用新 ID。

## 统计边界与解释

- 仅扫描仓库内 `src/`、`ui-spikes/v2/`、`ui-spikes/v3-directory/`、`ui-spikes/integration/`、`docs/v3/`、根目录 AGENTS、ENGINEERING_MEMO、package.json；忽略 node_modules、dist、.tmp、test-results 等生成物。
- 活跃任务的基线文件存在仓库 `.tmp/architecture-ledger/active/`，包含**路径与文件哈希**，不包含源码文本；任务结束后删除该临时基线。JSONL 账本只有路径、模块、说明、测试名称/时长/状态，**不保存命令参数、日志、token、原书内容**。
- 未用账本包装的测试**不会被自动统计**，与实际耗时不可混算。两个任务同时编辑同一文件，会污染相互归因；必要时在 note 标注“并行修改”。
- 报表中“访问”指**开发时跨文件修改**，不是用户访问页面，不代表运行性能、依赖方向或调用次数。
- 一个共享文件在最近 10 个功能中被 **至少 3 个独立需求**改动，标记“应评审拆分”，但不自动开始重构。排序前也要排除纯版本号、自动生成或必要装配改动。
- 核心优先：模块自有文件能解决的改动，不再写入共享 `app.ts` / V2 核心；查看实际跨文件次数和测试花费的趋势来决定下一轮优化。

## 验证

```bash
python3 ui-spikes/v3-directory/scripts/architectureLedger.test.py
python3 ui-spikes/v3-directory/scripts/architectureLedger.py report --last 10
```

这套工具不会被导入浏览器，也不会修改发布产物或启动后台定时监控。
