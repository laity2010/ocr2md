# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## 当前实现

- WP00：空白框架，独立设置名称、标牌、自动更新和发布身份。
- WP01：保存的资料目录通过原 Frame F02 验证后，以现有 V2 公开 GET markdown 接口只读加载，校验完整 SHA、块哈希、逻辑 ID、父子和 UTF-16/字符位置；快照版本包含块顺序及来源映射，暂存在独立会话内。无 V2 写请求；未提交的目录不加载。尚无分句、仲裁、翻译。
- WP01B2：原文左侧整高40%，右侧60%三个引擎 CM6 上下等高，Dockview 原生分割；工作台默认打开，设置仍通过原 Tom Select 导航进出。四窗使用 V2 同版 Sarasa、Everforest、Markdown/Obsidian 扩展、行号及 iOS 原生选择，全部只读，不提供编辑行号按钮。工作台不挂载 AG、PDF、MD 渲染；全局设置页保留原组件。WP01 快照接入仍独立。
- API：本州 ui/frame/layout.js 的 createFrameWorkspace(container,{onModuleChange}) 返回 activate/setSourceMarkdown/dispose；Frame 入口直接接线，不再用 Vite 字符串生成业务代码。
- WP01C：授权且已保存的目录自动读取 V2 逻辑表快照，左 CM6 以原始 Markdown 整体载入（保持字符及行分隔，不接受编辑事务），导航显示 SQL / 逻辑表 · logical_block；右三窗仍空。目录未保存不载入；保存换目录或读取失败清除旧原文，异步过期请求不能覆盖。源快照仍是唯一逻辑块身份与位置映射，CM6 仅展示。snapshot session 的 cancelPending 保留已接受快照并取消过期请求。下一步 WP02A/B 分句与显示，WP03–07 仲裁及集成。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
