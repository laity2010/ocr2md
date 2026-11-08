# 分句翻译 · 最小对外契约

以最新 `AGENTS.md` 第 6 节和 Media 已验收契约为参考，不重复 Media 的施工阶段，也不建立第二套 AM 表。

**U01** `prepareSentenceTranslationTask(source, sentenceRows)`：只从现有 CMD 句子锚点/片段提取纯文本任务；返回给 AI 的 `task.sentences` 仅有 `sid/source`，不含 HTML、公式、CMD 或私有来源坐标。来源结构留在本地 `mapping/sourceSnapshot`，不随 AI JSON 导出。

**U02** `validateSentenceTranslationReply(prepared, reply, currentSource)`：每个已发送句子必须回传一次相同 `sid`、检查后的 `checked` 和 `translation`；严格拒绝未知/重复 ID、源文修改、结构语法注入；结果仅进入待审阅表，**不写源、不自动接受拼写修订**。行内数学公式的译文位置必须人工复核。

**U03** `createSentenceTranslationModule(host,{readSource,readSentences,getChapter,onStatus})`：独立 AG 视图、中文「分句翻译」模块及 JSON 文件交换；所有输入均是 CMD 的窄只读 getter，Grid 不持有 CM6/EditorView、CMD port 或其他模块的内部实例；全局状态通过注入 callback；不自行持久化翻译。

直接测试：`node tests/sentence-translation-core.test.mjs`（U01/U02）；`node tests/sentence-translation-public.browser.test.mjs`（Chromium/WebKit 直接 mount U03、文件导出/导入和过期拒绝）。更大范围的分句/Media/Web 主界面联动另测，不因这三个 PASS 而自动获得全 AM 认证。

**本次范围**：只实现 AI 语言交换与 AG 待审阅入口。非法断行仍应首先在既有模块人工审阅并修正；分句锚点继续由既有 CMD 模块生成。本次**没有**直接调用外部 AI、把检查结果覆盖 CM6、实现行内公式在译文中的自动重插、生成完整双语 Obsidian MD。这些需要独立的后续真实 API、审阅/无损导出验收，不能把预留映射误报为回填完成。
