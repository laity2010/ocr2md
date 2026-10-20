# OCR2MD V6 · 工程备忘

V6 从零开始；旧项目的工程备忘不适用于 V6，也不导入此文件。

## 1. Git 高频构建记录、快速回退与每日审查合并（2026-10-20）

**基本假设：AI 一定会再犯错，因此第一优先级是保存现场并立即回退，而不是在故障版本上连续修补。**

- **每次构建都必须提交一次本地 Git Commit**，包括失败构建。每次提交的说明必须同时明确：本次构建**改了什么**、**为什么改**。即使没有源码变化也保留构建检查点。
- Git 保存源码差异和提交说明；构建执行状态另存于本地记录；只保留一份正式产物，不保存历史产物目录。
- 发现运行故障，优先把运行入口切回**最后一个已知正常构建**；故障源码与产物均保留以便复盘。源码需要恢复时，新建隔离 worktree 查看或修复，不直接重写现有工作区。
- 当天的细小提交只保留在**本地按日期命名的开发分支**。日终由人审查改动、批准后做一次 **squash commit** 进入正式 `v6` 分支；之后才允许推送 GitHub。不能自动日终审批或自动推送。
- 不使用 `reset --hard`、`clean`、`rebase` 或 `push --force` 处理日常回退。历史开发分支继续留在本机，可追溯每个构建。
- Git 已替代 AEL 的**改动追踪职责**，不再开发平行的文件差异账本。Git 不会自动认定变更是否合理，也不记录构建结果，故需明确提交目的与最小构建结果记录。
- **工程备忘上限提醒**：V6 备忘独立编号。条目数量**超过 20** 时必须主动提醒用户，不能静默继续添加。

日常命令见 `README.md`。此备忘为 V6 第 1 条；以后逐条编号，不从旧版复制。

## 2. 唯一源码、唯一发布目录、Git 回退（2026-10-20 更新）

- 只有一个 V6 源码工作区和一个正式目录 `.v6/release/`；不再使用 A/B 槽和分版本产物归档。
- 每次编译前留 Git 本地提交。上线由 `scripts/v6_publish.py` 将完整构建更新至唯一 release 目录。
- 发现故障，以 `scripts/v6_git.py rollback --to <Git提交>` 在临时 Git worktree 重新编译并发布，不修改当前开发分支。
- 公网域名 `ocr2md.laity.bid` 始终指向 V6 本地 4396；不退回 V5。
- V5 专属网关和局域网代理退役；独立于 V5 的 Obsidian 资料与同步不受影响。
- 页面按构建版本自动刷新，先保护未保存的内容。

用户 2026-10-20 明确取消 A/B 和 V5 后备。此决定覆盖本条原方案。

## 3. Attention Is All Your Need！！（2026-10-20）

**attention is all your need！！**

**所有的设计和安排，都必须以不分散 AI 的注意力、不影响其精准操作为前提。**

- 尽量减少开发时需要辨认的目录、版本、入口、工具、规则与上下文；不为防错叠加复杂流程。
- 每次操作聚焦当前明确目标及必要文件，先确认位置和现状，再进行局部修改与验证；避免无关范围的探索或改动。
- 当工程方案与 AI 的专注度、操作精确性发生冲突时，优先简化方案；不得用更复杂的管理系统解决注意力分散。

## 4. Mac / iPad 字体一致性（2026-10-20）

- V6 统一由页面加载**完整字形**的 Sarasa Fixed SC Regular / Bold WOFF2，不再依赖 iPad 用户安装字体，也不使用字形子集。保留 SIL OFL 授权文件。
- 字体文件名包含内容哈希；仅此类字体资源设置 `Cache-Control: public, max-age=31536000, immutable`，其他页面及文档接口仍不缓存。文件内容改变必须换 URL。
- 在 Mac Chrome / WebKit 模拟 iPad 的视口与字体度量，继续以真机 Safari 截图作最终验收依据。

## 5. 原生 Chrome iPad 模拟：滚动性能优先（2026-10-20）

- 手工验收浏览器以**普通 Google Chrome 进程**启动，保留其原生 GPU/Metal 加速，不使用 Playwright 的 Chromium 启动器及其自动化启动参数。
- 独立 Profile + 本地回环 CDP 小连接仅负责 iPad 视口/触控模拟；截图工具按需连接，不接管或关闭浏览器。新控制器重连现有窗口不得刷新未保存内容。
- 滚动流畅度以用户在 Mac 上直接操作为验收依据；页面加载时间不能替代滚动体验的评估。

## 6. 项目初始化 Git 基线（2026-10-20）

- 将已验证的**发布流程、Git 构建检查点与回退、Mac 原生 Chrome iPad 模拟环境**固定为本地 Git 初始化标签 `ocr2md-init-v1`。后续 V7/V8 从此标签克隆到独立目录，而不是复制当前运行目录或临时缓存。
- 该标签是完整 V6 源码基线，不是业务无关模板；启动新版本必须改独立端口、域名、Profile、调试端口、版本标识及运行凭据，不得覆盖现有 V6。
- 精确克隆步骤和边界以 `PROJECT_INIT.md` 为准。GitHub 推送、当日 squash 以及正式发布仍须用户分别批准，不能因创建初始化标签而自动执行。

## 7. Obsidian 外观先接 CM6 源码窗（2026-10-20）

- V6 第一阶段只将 Mac OCR2MD Obsidian 库的 Everforest 暗色主题 Markdown 源码配色与启用的 daisor snippet 相关规则接入 CM6，不另起 Markdown 阅读渲染器，也不改 MinerU/CM6 唯一编辑状态。
- **Sarasa Fixed SC 完整 WOFF2、12pt/16px 与原行距为固定约束**；Obsidian 的桌面/平板字号设置不能覆盖。
- 样式局部作用于编辑器，独立 CSS 和 CM6 语法高亮扩展；保留 Git 测试，Chrome/WebKit 使用相同 1032×642 视口检查。此阶段不宣称已完整复刻 Obsidian Live Preview 或 Reading View。

## 8. Everforest 标题比例、CM6 软换行与硬回车可视化（2026-10-20）

- 标题使用 Everforest 原始六级比例，16px 的 Sarasa Fixed SC 为基线；标题文字和 `#` 标记统一放大，保留 Markdown 源码，不转换 HTML。
- 仅启用 CM6 原生自动折行；每个真实换行以视口范围内的零宽、不可编辑 `↵` Widget 着色提示。窗口宽度改变只影响布局，不改 `view.state.doc`、保存文件、撤销历史或逻辑行号。
- Chrome 与 WebKit 验证标题精确字号、缩窄视窗后的折行变化和硬回车数量；继续对 3,560 行 Buffett’s Alpha 文档验收撤销/重做、保存、选区、滚动和刷新恢复。

## 9. Dockview + CM6 + Zustand Vanilla + Markdown-it（2026-10-20）

- V6 新增 Dockview 左源码/右预览双窗；文档、撤销历史和保存流程只存在于 CM6。Dockview 只负责布局，Zustand Vanilla 只发出跨视图修订、活动窗和选区位置通知，不复制全文。
- 预览为可重建的只读 HTML 投影，采用 markdown-it、KaTeX 和 DOMPurify。验证当前 Buffett’s Alpha 的图片、HTML 表格和 math fenced 数学块；远程媒体链接、inline LaTeX 和跨窗元素定位留给后续独立验收。
- 各组件互不越界：布局在 workspace，视图通知在 view-store，渲染在 markdown-preview，main.js 仅连接它们并保留原 CM6/保存逻辑。不增加新文档内核。
- Mac Chrome 与 WebKit 1032×642 回归双窗显示、编辑同步、撤销、布局和 HTML 安全过滤；真实 iPad Safari 仍需要视觉验收。

## 10. 元素锚点与 Zustand Vanilla 双向滚动同步（2026-10-20）

- 同步位置以 Markdown **逻辑行及行内比例**描述，而不是滚动条百分比。markdown-it 的块级 token.map 给标题、段落、公式、HTML 表格生成源码范围锚点；MinerU 的无损注释只在邻近内容间插值，不生成大量不可见预览元素。
- ui/scroll-sync.js 负责元素位置索引和坐标转换。Zustand Vanilla 只发布 origin、revision、sequence 与位置；两种 View 各用自己的 API 处理滚动，不复制文档状态或重新实现编辑器。
- CM6 虚拟行高在远距定位时采用官方 scrollIntoView，再做少量稳定位置修正。跟随引起的滚动事件短暂屏蔽，用户输入立即接管控制权。RAF 合并滚动，ResizeObserver 处理视口宽度和媒体高度变化。
- Buffett’s Alpha 的第 1427～3560 行是 minerujson:source 无损压缩数据，阅读预览只对应前约 1423 行的真实正文。这是数据格式边界，而非预览正文丢失。
- Chrome/WebKit 真样本验收双向定位、关闭与重新开启、编辑同步、Dockview 缩放及无循环；上线后真实 iPad Safari 的手工滚动仍需用户确认。

## 11. AG Grid 全高大纲与三窗定位（2026-10-20）

- Dockview 布局固定成左侧全高 AG、右侧源码在上/预览在下，继续只使用同一 CM6 文档。AG Grid Community 以独立 `outline-grid.js` 模块接入，五列：PDF页码、层级、标题、独立章节、章节文件；每列独立按列值下拉筛选，默认 all；复用 Sarasa Fixed SC 和 Everforest 六级标题字号/颜色。
- `outline-index.js` 以 Markdown token 重新构建可选中标题和其源码行范围，PDF 页码只从真实 `minerujson:block` 的零基页索引加 1 获取，不加载/改写后半段压缩来源数据。
- Zustand Vanilla 的 focusTarget 发布行号、来源窗、元素 ID、文档修订与递增事件序号；AG/CM6/预览分别订阅，只定位与高亮，不相互持有 View 或额外保存 Markdown。保留已验收的双窗连续滚动，AG 订阅其位置来选择当前标题行。
- “独立章节”当前仅 UI 草稿（默认全勾、首项不能取消），未接 MOPJO 增量落盘，用户不应以为已保存。没有真实章节导出文件时，“章节文件”显示未导出。正式章节定界时再连接持久化与导出服务，不在导航阶段虚构文件。
- 使用 Buffett’s Alpha 21 个真实标题验收五列筛选、三向定位、标题编辑后重建、撤销及 Dockview 三窗几何，Chrome/WebKit 模拟 iPad 截图；未通过之前不修改正式发布。
- 三窗专项 Chrome/WebKit 已实测通过；旧双窗滚动回归在缩小的 CM6 视口下暴露远距反向定位问题，已加立即像素估值纠偏且在较小文档实测对应行号。完整 3560 行回归因 Mac 负载过高发生过行号不一致及后续测试初始化超时，**不能记为通过**；未经完整回归不得发布此变更。
- **后续正式复验（2026-10-20 22:34 后）**：Mac 负载下降后，以实际 3560 行 Buffett’s Alpha 隔离副本分别跑 `V6_ONLY_CHROME=1` / `V6_ONLY_WEBKIT=1` 的 `tests/scroll-sync-browser.test.mjs`，两者均为 `SCROLL_SYNC_PASS`：源码→预览、预览→源码、HTML 表格、公式、同步开关、编辑后元素锚点保持、Dockview 缩放及无浏览器错误全部通过。另 `npm run test:preview` 的 Chrome/WebKit 均为 `DOCKVIEW_PREVIEW_PASS`（11 图片、8 表格、20 math、撤销和 DOMPurify）。上述回归阻塞已解除，允许按 V6 既定单目录发布流程发布；仍需真 iPad Safari 人工体验流畅度。
