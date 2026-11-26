# Lab-Sentence · 分句工作台

继承统一根目录 AGENTS.md、BUILD.md、COMM.md、GIT.md 及本州 AGENTS.md。
独立框架型 Lab，以已验收 Frame 1dbc2b7 为基线，保留四窗和 F02 授权。唯一入口 /labs/lab-sentence/；设置和运行数据独立。不写 V2 逻辑表或旧分句 Lab。

## 当前实现

- WP00：空白框架，独立设置名称、标牌、自动更新和发布身份。
- WP01：保存的资料目录通过原 Frame F02 验证后，以现有 V2 公开 GET markdown 接口只读加载，校验完整 SHA、块哈希、逻辑 ID、父子和 UTF-16/字符位置；快照版本包含块顺序及来源映射，暂存在独立会话内。无 V2 写请求；未提交的目录不加载。尚无翻译。
- WP01B2：原文右侧整高40%，左侧60%三个引擎 CM6 上下等高（WP03A），Dockview 原生分割；工作台默认打开，设置仍通过原 Tom Select 导航进出。四窗使用 V2 同版 Sarasa、Everforest、Markdown/Obsidian 扩展、行号及 iOS 原生选择，全部只读，不提供编辑行号按钮。工作台不挂载 AG、PDF、MD 渲染；全局设置页保留原组件。WP01 快照接入仍独立。
- API：本州 ui/frame/layout.js 的 createFrameWorkspace(container,{onModuleChange}) 返回 activate/setSourceMarkdown/setReview/dispose；Frame 入口直接接线，不再用 Vite 字符串生成业务代码。
- WP01C2：原有目录授权与快照读取成功后，直接将 Markdown 全文交给右侧只读 CM6；导航 SQL / 逻辑表 · logical_block，三个引擎窗在分句前留空。未新增目录管理、快照管理或数据库写入。

- WP02A：原有三引擎适配器来自已验收的 Sentence Benchmark 84dfe75，固定版本依赖见 ui/sentence/package-lock.json（独立安装 npm ci --prefix ui/sentence）。每个逻辑块独立分句，保护公式、表格、媒体等非正文，保持块内 UTF-16 来源区间及原始片段；引擎跳过的点状省略符归入相邻句，不吞掉非标点遗漏。公开 API：splitBlock(block,engine)、rebuildBlock(result)、splitSnapshot(snapshot) 返回 documentVersion 与 blocks/candidates；每个候选含 units/sourceRanges 和完整原文 pieces 或显式 error。载入快照后在内存生成候选，状态栏报告成功/总数，不写 SQL、不仲裁。

- WP02C：复刻原 Sentence Benchmark 84dfe75 的 BreakWidget 与句界颜色（全三引擎一致绿 │，分歧橙 │；右原文分歧 ┆），原版全篇对比随后由 WP03B 调整为右窗焦点驱动左三窗单句对比。保留 V2 的原生行号、字体、语法着色、布局与只读保护；各窗当前行复用原版橙色高亮，当前逻辑块其余行淡橙色。不引入旧 CMD 标签、旧 PBS gutter、旧折叠或仲裁；块筛选/采用见 WP03A；页码后续。display.js API：blockAtOffset(blocks,offset)、boundaryDisplay(snapshot,results)，后者把已有候选的最后源片段末端转换成全篇句界 Widget 投影，候选失败明确计数，不变更原文或分句算法；setReview 只接同一快照版本。

- WP03A：右源码原有导航和 Undo/Redo 原位（原文只读故保持禁用），左三个引擎上下等高；高亮句界，源码栏「全部」默认不勾选，仅显示尚未仲裁的分歧逻辑块；勾选全部恢复完整原文。三引擎栏「采用」对当前分歧块互斥，采用后移出待审范围；全部模式可以改选/取消。独立会话 Map 按 logicalId 记录选择，同 documentVersion 保留，版本变化重置；未持久化，刷新丢失，WP04 才落盘。isDisputed(row) 和 reviewProjection(snapshot,results,all,adopted) 为纯显示投影；右窗使用筛选文档与源位置映射，左窗单句见 WP03B。引擎错误不伪装成分歧，在全文显示失败计数。未改变原逻辑表、分句算法、设置。

- WP03B：右窗焦点唯一决定左三窗所显示的各引擎当前句。sentenceAtOffset(block,candidate,offset,marks) 只截取已有候选首末源片段之间的原始 Markdown，保留句界颜色；句间空隙取后一句，块末取最后一句，无分句或失败则留空并显示状态。右窗光标、筛选、块高亮和采用语义保持；左窗不再全文滚动或反向改变右窗焦点。未变更分句算法或数据。

- WP03C：逻辑表导航由成功载入的已保存 V2 快照生成，未绑定仅全局设置，空白四窗不预设 SQL 项。已保存目录变更、解绑或读取失败时清除旧原文及候选、移除两处导航中的 SQL 组；未保存目录仅探测，不加载。仍用原生 select + 公共 Tom Select 适配器，不改变设置、分句或数据库。

## 构建和验收

使用联邦 .ops/git-gate.py；正式构建使用 labs/lab-sentence/vite.config.mjs，发布使用 scripts/sentence_publish.py。无用户资料测试。F02 使用原 Frame 公共授权 API。
