# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## 当前实现

- WP00：空白框架，独立设置名称、标牌、自动更新和发布身份。
- WP01：保存的资料目录通过原 Frame F02 验证后，以现有 V2 公开 GET markdown 接口只读加载，校验完整 SHA、块哈希、逻辑 ID、父子和 UTF-16/字符位置；快照版本包含块顺序及来源映射，暂存在独立会话内。无 V2 写请求；未提交的目录不加载。尚无分句、仲裁、翻译。
- WP01B：独立 Dockview 四源码窗：原文左侧整高 40%，右侧 60% 按 Intl / Sentence Splitter / Wink NLP 自上而下等高，使用原生分割线。默认打开空白工作台；原 Frame Tom Select、全局设置、F02 与 WP01 只读快照请求仍保留，可在设置与工作台间切换。暂不将逻辑表展示为已加载的源码；WP01C 才接入正文。
- 源码视觉复用 V2 3b9a50b 同版 Sarasa 全局字号、Everforest、Markdown/Obsidian CM6 扩展、iOS 原生选择及 V2 背景和焦点 CSS；四窗只读，真实行号与折叠保留，不开放 V2 编辑动作菜单、Undo/Redo、图片粘贴或 PDF。工作台不挂载 AG、PDF 或 MD 渲染预览；设置模块自身保持不变。
- API：ui/sentence/layout.js 的 createFrameWorkspace(container,{onStatus,onModuleChange}) 返回 activate/dispose；Frame composition 仅替换该布局接线。尚不实现分句、候选显示、仲裁；后续 WP01C / WP02A / WP02B / WP03–07。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
