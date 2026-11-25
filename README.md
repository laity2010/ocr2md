# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## 当前实现

- WP00：空白框架，独立设置名称、标牌、自动更新和发布身份。
- WP01：保存的资料目录通过原 Frame F02 验证后，以现有 V2 公开 GET markdown 接口只读加载，校验完整 SHA、块哈希、逻辑 ID、父子和 UTF-16/字符位置；快照版本包含块顺序及来源映射，暂存在独立会话内。无 V2 写请求；未提交的目录不加载。尚无仲裁、翻译。
- WP01B2：原文左侧整高40%，右侧60%三个引擎 CM6 上下等高，Dockview 原生分割；工作台默认打开，设置仍通过原 Tom Select 导航进出。四窗使用 V2 同版 Sarasa、Everforest、Markdown/Obsidian 扩展、行号及 iOS 原生选择，全部只读，不提供编辑行号按钮。工作台不挂载 AG、PDF、MD 渲染；全局设置页保留原组件。WP01 快照接入仍独立。
- API：本州 ui/frame/layout.js 的 createFrameWorkspace(container,{onModuleChange}) 返回 activate/setSourceMarkdown/setReview/dispose；Frame 入口直接接线，不再用 Vite 字符串生成业务代码。
- WP01C2：原有目录授权与快照读取成功后，直接将 Markdown 全文交给左侧只读 CM6；导航 SQL / 逻辑表 · logical_block，右三窗留空。未新增目录管理、快照管理或数据库写入。

- WP02A：原有三引擎适配器来自已验收的 Sentence Benchmark 84dfe75，固定版本依赖见 ui/sentence/package-lock.json（独立安装 npm ci --prefix ui/sentence）。每个逻辑块独立分句，保护公式、表格、媒体等非正文，保持块内 UTF-16 来源区间及原始片段；引擎跳过的点状省略符归入相邻句，不吞掉非标点遗漏。公开 API：splitBlock(block,engine)、rebuildBlock(result)、splitSnapshot(snapshot) 返回 documentVersion 与 blocks/candidates；每个候选含 units/sourceRanges 和完整原文 pieces 或显式 error。载入快照后在内存生成候选，状态栏报告成功/总数，不写 SQL、不仲裁。

- WP02C：复刻原 Sentence Benchmark 84dfe75 的 BreakWidget 与句界颜色（全三引擎一致绿 │，分歧橙 │；左原文分歧 ┆），四窗均显示同一份 V2 完整 Markdown；按同一绝对 UTF-16 位置双向点击定位与同步滚动。保留 V2 的原生行号、字体、语法着色、布局与只读保护；各窗当前行复用原版橙色高亮，当前逻辑块其余行淡橙色。不引入旧 CMD 标签、旧 PBS gutter、旧折叠或仲裁；块筛选/页码与采用在 WP03。display.js API：blockAtOffset(blocks,offset)、boundaryDisplay(snapshot,results)，后者把已有候选的最后源片段末端转换成全篇句界 Widget 投影，候选失败明确计数，不变更原文或分句算法；setReview 只接同一快照版本。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
