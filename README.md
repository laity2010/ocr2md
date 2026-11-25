# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## 当前实现

- WP00：空白框架，独立设置名称、标牌、自动更新和发布身份。
- WP01：保存的资料目录通过原 Frame F02 验证后，以现有 V2 公开 GET markdown 接口只读加载，校验完整 SHA、块哈希、逻辑 ID、父子和 UTF-16/字符位置；快照版本包含块顺序及来源映射，暂存在独立会话内。无 V2 写请求；未提交的目录不加载。尚无分句、仲裁、翻译。
- 后续按 WP01–05 逐步验证 V2 快照、三个引擎、仲裁、增量重分及句表输出；WP06–07 为界面与集成，未实施。

- WP01A：F02 验证后显示 SQL → 逻辑表，首次有效快照自动进入，手动重进设置不跳回。AG 列 PBS、Type、MD Block、逻辑身份和顺序字段；原生 V1 EnumCheckboxFilter，PBS 固定，Type 不排序，均可调宽。该表是已验证的只读 Markdown 快照投影，不是完整 SQL 原始证据浏览器（不包含 raw_path / Raw Block）。
- 读者采用 V2 3b9a50bf1f0e181ddbd637f55a74564c82b7a400 的 Git 固定副本：Markdown renderer / scroll-sync / V2 focus、preview slot / PDF evidence adapter / V1 PDF.js viewer；仅本州去掉 PDF 写回/拖动入口，保留公共四窗与原导航。CM6 一份只读文档，不开放编辑/撤销；MD/PDF/AG 按逻辑 ID / 源行定位。PDF 只读 GET，映射身份不符或 PDF 缺失提示失败，不影响逻辑表。无分句或用户文件写入。
- API：logicalRows / logicalColumns 将不可变 snapshot 投影至 AG；validatePDFMap 拒绝过期映射；mountSentenceSource 仅 load/clear/locate/get 读者端口；createSentenceReview 负责加载及原生导航。沿用 v2-cm-session、v2-sync-focus、v2-pdf-status 事件契约。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
