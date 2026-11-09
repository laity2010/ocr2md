# WP2/4 · 独立 Lab 翻译 / SQLite / JSON 接口验收

Lab 物理工作树：`experiment/translation-lab`；与 `experiment/sentence-benchmark` 互不共享 SQLite、可写数据和发布目录，使用同源 V6 应用构建图。Main 的审阅 Markdown、分句 Lab 句表、翻译 Lab SQLite 依次为各自权威源。归属与直接测试在既有唯一 `tests/am/registry.sql` 记为 Y01–Y08。

1. `scripts/v6_translation_lab.py` 的公开 `TranslationStore` 拥有 `translation.db`。SQLite 保留句表版本、Prompt、译文历史、当前有效结果、任务与回件。**绝不通过另一个 Lab 内部路径直接访问其数据库或 CMD**；仅通过显式 JSON 上传和分句 Lab 只读 HTTP API。
2. `scripts/v6_serve.py` 是现有服务 HTTP 装配点，只有 `V6_LAB_ID=translation-lab` 能使用 `/api/translation-lab/*`。同源 POST 须有 `X-OCR2MD-Translation-Lab: 1`。只读 GET 支持 state/table/published。`GET /api/translation-lab/table?ai=` 是内部当前结果快照；`GET /api/translation-lab/published?ai=` 是发布后的供 WP3 消费的独立 JSON。
3. 所有 AI 分别导出任务 JSON，接受**部分回件**（包括零行），未译状态仍出现在完整句表，任何一家缺译不成为发布阻断。AI 校正英文不同并非本模块应仲裁的内容；WP3 对 AI 新回件重新判断。
4. Prompt 修改不触发全文重译。原句原文发生变化须重译，位置变化不影响继承；仅编号变化时，严格要求同一原文在新旧句表均唯一，无法唯一匹配的重复句保守补译。
5. 浏览器布局：顶部状态卡、左 AG 句表、右任务/CM6 Prompt/回件、底部状态栏。禁止另造 Markdown 阅读器或修改分句/校译界面。

验证：`python3 -m unittest discover -s tests -p test_v6_translation_lab.py -v`（真实 fixture 402→394，需显式 `OCR2MD_SENTENCE_LAB_FIXTURE` 或现有同仓私有 fixture），`python3 -m unittest discover -s tests -p test_v6_translation_lab_http.py -v`（真服务/隔离 SQLite），`node tests/translation-lab.browser.test.mjs`（Chrome+iPad-WebKit）。全量 AM 历史 `visibility` schema 阻断不可误报通过；WP2 新入口以直接测试、Git 边界检查证明。

当前 WP1 还未晋升 Main，正式 Main/分句旧运行服务并无完整新版发布能力。因此 WP2 可以隔离验收，但**不得将实验三段接口视为正式在线联动**。不修改 `AGENTS.md` 或正式 Main。
