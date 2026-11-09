# OCR2MD · Lab 翻译（WP2/4）

此 Lab 是与 Main、分句 Lab 同业务源码/构建图的**独立 Git worktree**，独占 `labs/translation-lab/.runtime/translation.db`，不能直读 Main 或分句 Lab 的工作目录。入口 `/labs/translation-lab/translation-lab.html`。

UI：顶部 GPT/Grok/Muse 译文覆盖状态卡；左侧 AG Grid 句表（按缺译/完成/原句搜索、多选强制重译）；右侧任务 / Prompt（CM6）/ 回件；底部全局状态栏。

- 从分句 Lab **只读 HTTP** `GET /labs/sentence-benchmark/api/sentence-units` 导入，也支持用户直接上传同格式 JSON，避免上游服务暂未晋升时被迫去改其他模块。默认上游为 loopback `127.0.0.1:4412`，可用 `V6_SENTENCE_UNITS_URL` 覆盖为同一个确定路径的 loopback URL；不打开其内部目录。
- 迁移旧 402 句历史译表：先导入旧句表 JSON，再分别选择 GPT/Grok/Muse 导入每家的历史译表 JSON，最后导入新版 394 句表，系统逐 AI 继承 386 条、各列出 8 条待重译（已真实核验）。源文本未变、结构身份不变而位置变化则继续继承；原句改变、新增/并句/拆句则重新翻译。
- Prompt 每 AI 独立版本，修改不自动令全篇失效；勾选 AG 句子及「选中句子强制重译」可生成范围内的任务。任务文件为 `ocr2md-ai-translation-task/v1`，回件为 `ocr2md-ai-translation-reply/v1`，必须包含 `taskId`,`aiId`,`unitVersion`,`promptVersion`,`rows[]`，每条包含 `id`,`original`,`corrected`,`translation`。部分回件允许，错误句/版本拒绝；同一任务已成功提交句子不可重复覆盖。回件保留于 SQLite 的 `receipts` 和 `results`，不会改动上游句表。
- 「发布当前 AI 译表」输出独立 `exports/translated-{ai}.json`（`ocr2md-ai-translation-table/v1`，每句含校正英文、译文、缺译/完成状态），缺译永不阻断导出。历史覆盖率来自实际 `effective` 表；历史重译会保留每次 `results`。
- **不在本模块仲裁英文，也不修改 CMD/MD 原文；校译 Lab 读取此 JSON 的衔接留 WP3。** 当前开发 Main 未晋升 WP1+WP2 时，在线完整链路不可宣称已经贯通。

隔离启动（环境端口、解锁令牌和 runtime 均按项目现有 V6 服务保护约定配置）：`python3 labs/translation-lab/server.py`，需要设置 `V6_PORT` 和自己 Lab 的 `.runtime`；同一业务 Vite 构建使用 `V6_LAB_ID=translation-lab npm run build`。验收：`python3 -m unittest discover -s tests -p test_v6_translation_lab.py`、`python3 -m unittest discover -s tests -p test_v6_translation_lab_http.py`、`node tests/translation-lab.browser.test.mjs`。
