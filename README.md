# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## 当前实现

- WP00：仅空白框架，独立设置名称、标牌、自动更新和发布身份；无分句、数据导入、仲裁或翻译能力。
- 后续按 WP01–05 逐步验证 V2 快照、三个引擎、仲裁、增量重分及句表输出；WP06–07 为界面与集成，未实施。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
