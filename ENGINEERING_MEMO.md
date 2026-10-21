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
- **发布后模拟器维护**：Chrome 155 原生 Mac iPad 模拟 CDP 虽已成功注入 `maxTouchPoints=5`，但不再保证 `ontouchstart in window` 为 true；旧控制脚本会误判失败并退出、使视口恢复 Mac 尺寸。改为接受 `navigator.maxTouchPoints>0` 为有效触控模拟信号，保持本机控制器长连接。此项只是 Mac 测试环境修复，无需更改网页正式版或重新部署。

## 12. AG 列冻结、标题单行与原生筛选约束（2026-10-20）

- PDF 页码列使用 AG Grid `pinned:'left'`、`lockPinned:true`、`lockPosition:'left'` 固定；标题列移除自动行高/自动换行，CSS 改为单行省略，仍按 Everforest 标题层级着色。Chrome/WebKit 1032×642 三窗原功能回归通过。
- 上一版列值 `all` 下拉是工程自定义 `ValueFilterHeader` + `isExternalFilterPresent/doesExternalFilterPass`，**不是 AG Grid 原生列筛选**。AG Grid 36 的官方按列枚举值 `agSetColumnFilter` 属于 Enterprise，需要授权，目前仓库只有 Community 包，未配置授权。必须与用户明确选择许可证/Community 原生 Text/Number 条件筛选后再更换，不应自作主张另造筛选器或者部署无授权水印。未确定前不覆盖已经发布的三窗版本。

## 13. 采用 V4 同款 AG Grid Community 自定义列值筛选（2026-10-20）

- 更正第 12 项的筛选结论：AG Grid 自带的 Enterprise **Set Filter** 需要授权，但通过官方 `IFilterComp` 扩展接口创建的 **EnumCheckboxFilter** 不需要。V4 原本就用 `getGui`、`getModel/setModel`、`doesFilterPass`、`onNewRowsLoaded`、`params.getValue`、`params.api.forEachLeafNode` 和 `filterChangedCallback` 实现列值 checkbox/All；V6 在本仓独立实现同一公开接口，避免跨版本模块依赖。
- 从 V6 AG 模块彻底删除 `ValueFilterHeader`、手写 `select`、`isExternalFilterPresent/doesExternalFilterPass` 和独立 `filters` 状态，由 AG Grid 管理筛选图标、弹窗、筛选模型、筛选结果。五列均默认无筛选（`all`），支持多值勾选；标题层级经 `filterValueGetter` 显示 `H1`/`H2`，章节标定草稿改变时使用 `api.onFilterChanged()` 通知 AG Grid 重新判定。
- 保留已经验收的 PDF 页码 `pinned/lockPinned`、标题单行、Dockview 三窗和 Zustand 三窗定位；Chrome/WebKit 使用项目隔离的 Buffett’s Alpha 样本验证真实 AG 弹窗、五列筛选、选择、标题修改、撤销和脚本无异常。

## 14. 修复 CM6 标题层级修改后 AG 标题样式未实时更新（2026-10-20）

- 故障根因：`outline-grid.js` 已在文档变更后通过 `buildOutline` 得到更新的标题层级和 AG 行数据，但相同 MinerU 行 ID 的标题文本未变时，AG Grid 的正常值相等检查会跳过 `titleCell` 的重绘；旧的 `ocr-outline-h1` 样式留在 DOM 中。新增标题会创建新行，因此此前新增标题正常。
- 修复遵守 AG Grid API：对比刷新前后相同 ID 的 `level`，只对变更层级的行调用 `api.refreshCells({rowNodes,columns:['title'],force:true})`；仅在跨越 H1 行高边界时调用 `api.resetRowHeights()`。不重新创建 AG Grid，不修改 CM6、Zustand、文件保存或 MOPJO。
- 用隔离的 Buffett’s Alpha 实际文档复现旧版 H1→H2 样式残留，修复后 Chrome 和 WebKit 验收 H1→H2→H3→H4→H5→H6→H1，各步 AG DOM 层级样式和字体大小即时更新，随后原有筛选、三窗定位、撤销和文档不落盘测试全部通过。

## 15. 紧凑单一全局状态栏（2026-10-21）

- 顶栏 Mac/iPad 1032×642 视口固定 40px，只保留撤销、重做、保存；移除原 37px 文件副栏、29px 页脚状态栏和 AG 内部状态提示，Dockview 填满腾出的高度。窄屏必要时让三按钮与构建状态在同一顶栏内紧凑换行，不增加额外状态栏。
- 全部可见状态由构建号右侧唯一 #status 汇总：加载、授权、保存、更新、错误、CM6 行数字数、文档名、AG 标题数、章节草稿未保存和同步状态。AG 只将 outlineCount 作为 Zustand 展示元数据，绝不复制文档。过长状态单行截断，完整文本保留 title。
- 删除顶部的结构提取和同步滚动按钮，但后端结构提取仍可向全局状态汇报，现有滚动协调及 Zustand 开关仍正常，默认保持开启。CM6、AG Grid 自定义列筛选、Dockview 三窗不重构。
- 独立的 tests/compact-shell-browser.test.mjs 在 Chrome 与 WebKit iPad 模拟视口核验 40px 顶栏、完整三窗、只三个按钮、全部状态信息、撤销/保存和滚动状态；旧同步测试改为调用 Zustand API，而不是点击已删除的按钮。保存只使用隔离测试样本。

## 16. cm-html Lab 冻结、CMDocument 晋升 V6 主线（2026-10-21）

- 用户确认 cm-html 技术验证通过并授权晋升。已创建**本地不可改写基线标签** `cm-html-lab-frozen-20261021`，指向提交 `c9a9764`；`labs/cm-html/` 后续不再参与 V6 业务开发、构建迁移或修复，保留独立 URL 作为参考实验。不修改原 Lab 文件、不以运行时引用它替代主线模块。未经用户单独批准，不删除该目录及其持久文件。
- V6 主线独立拥有 `ui/cm-document.js`（唯一 CM6 编辑状态的薄包装）、`ui/chapter-markers.js`（HTML 注释/标签业务编码）、`ui/chapter-files.js`（章节归属/安全切分）、`ui/outline-grid.js`（AG 交互）。不建立第二份 Markdown，不在 CM 包装类里增加章节业务逻辑。新写入默认 HTML 注释；原始 MinerU JSON → Markdown 继续调用已验收的 Node 转换器，V6 只做代理适配而不重写。
- AG 的“独立章节”不再是临时草稿：勾选经 CM6 事务写入标定；标题行号每次按 MinerU 稳定 ID 解析；AG 选中行原位优先、必要时最小滚动；保存授权与母文档机制沿用主线。章节文件名实时投影，只有点击“导出章节”才经过授权生成实际 Markdown 和 manifest。
- `scripts/v6_chapters.py` 将导出产物限制于当前**主线母文档所在目录下** `chapters/`，只替换已存在合法 manifest 的托管目录，拒绝覆盖不受管理的目录；先校验保存文件 SHA256 再分块暂存与整体替换。导出章节保留 MinerU block 锚点、不复制尾部原始压缩 JSON。与 Lab 的 `.runtime/chapters/` 完全隔离。
- V6 升级须同时通过 Chrome/WebKit 真实 Buffy Alpha 的章节勾选、重开、20→19 文件导出、越界保护、三窗定位、布局与公共 `/` 服务测试，再使用既有 Git 构建检查点及单目录发布；实体 iPad Safari 人工视觉验收仍由用户完成。

## 17. V6 模块工具条与章节文件起始编号（2026-10-21）

- 模块按钮区最左侧是统一模块选择下拉。初期仅有「章节定界」；选择模块决定右侧 `.module-actions[data-module]` 所显示的工具，不能把任意业务按钮永久加入全局工具栏。全局的撤销、重做、保存仍在原顶栏。
- 章节定界模块工具严格只有「导出章节」和「起始编号」输入框。默认 `000`，输入框中的数字字符串原样保留位数（如 `0`、`00`、`0000`、`0025`），失焦与重开也不强制补成三位；合法数字输入实时修改 AG「章节文件」列，按独立成章的标题从起始编号逐次递增（仅按实际输入宽度补零，进位可以自然扩展宽度）。标定格式默认 HTML 注释，不再暴露实验用切换或语法检查按钮；包装类保留 HTML 注释/标签支持。
- 编号属于**派生显示参数**而非 CM6 文档修改，改变编号不能触发 Markdown 编辑、未保存状态或写盘。更改编号应令旧导出链接失效；切回原编号可恢复匹配的导出链接。点击导出时使用当前编号。已经导出的文件清单可在下次打开母文档时恢复其起始编号，防止页面刷新后显示不一致。
- 章节命名从 `000-…md` 开始，范围允许增长到超过三位；服务器文件名校验与前端保持一致。所有更新先做无数据写入的实时编号验收，再使用 Chrome/WebKit 测试 20/19 章导出、重开和主线数据隔离；`labs/cm-html/` 保持冻结只读。

## 18. 版本标牌工程菜单与数据文档初始化（2026-10-21）

- 点击 V6 顶栏版本标牌（`#build-version`）打开「工程菜单」；菜单初期提供「初始化数据文档」。必须经现有 V6 编辑授权，并在独立确认框输入完整「初始化」才能启动，打开菜单、取消确认、未授权或文档版本不符都不得写盘。
- 初始化只操作**当前 V6 母文档**（`V6_DOCUMENT_PATH`），用仓库受保护的 Buffett's Alpha MinerU→Markdown 原始 fixture 恢复。恢复前先把**已经保存的**旧母文档字节逐字节备份到同级 `.initialize-backups/`；尚未保存的 CM6 编辑无法由服务端备份，必须在确认框显式告知。采用 SHA-256 乐观并发校验、同源检查、服务器写入互斥与原子替换。原文件已经等于初始数据时不重复写入或生成新备份。
- `chapters/` 生成物不归初始化功能清理、不会删除或覆盖；已导出章节因内容哈希不匹配而失效。初始化成功后重载当前页面并重新创建 CM6 EditorState，历史 Undo/Redo 从零开始，这是显式的工程重置边界，与日常保存不清历史不同。
- 测试必须使用临时 V6 文档路径，不对公共 `.v6/workspace/` 执行初始化。Chrome/WebKit 检查标牌、授权、确认取消、备份、新版重载和源 fixture/主线文档哈希隔离。Lab 冻结版本不得修改。

## 19. V6 四窗 PDF 原文对照与 V4 方案只读参考（2026-10-21）

- 用户要求在 V6 正式主线增加**第四窗 PDF 原文**，与 AG、CM6 Markdown 源码、Markdown 渲染预览构成四个实际 Dockview 面板。保持 AG/源码原生无标签头；底部的 Markdown 预览与 PDF 原文各有自己的标签头、可拖动调整大小，不退回 V4 的旧业务数据与存储接口。
- 只读参考 V4 `ui-spikes/v4-directory/plugins/chapter-cleaning/pdfPreview.ts` 及 `src/pdfMdRegionGeometry.ts`：沿用 Mozilla 官方 PDF.js `PDFViewer + EventBus` 连续分页/优先渲染、OCR 视觉页面 `page_size + bbox` 归一化高亮，**绝不可对已旋转页再次旋转 OCR 坐标**。首阶段使用 Buffett's Alpha 的 22 页、224 个正文块；第 8、11 页旋转方向及尺寸须专项验收；高亮属于 OCR 候选区域，不声称逐字 PDF 字形校对或人工审计完成。
- `ui/pdf-preview.js` 单独处理 PDF 浏览器只读显示、深色 Canvas、50–300% 缩放和滚动，不拥有可编辑文档；`ui/view-store.js` 仍只传递 transient focus/scroll 事件（`origin:pdf`），`ui/scroll-sync.js` 把 PDF 点击送回 CM6 和 Markdown，AG 仍根据源码行号映射章节，不维护第四份 Markdown 文本。`ui/workspace.js` 仅负责在 Dockview 创建第四组和面板挂接。
- V6 的 `/api/pdf` 只读取**被指定的**原始 PDF 并支持 HTTP 206 Range，`/api/pdf-map` 只从受控 MinerU JSON 生成页尺寸及块 bbox 派生数据；通过 `V6_PDF_PATH` 可选路径覆盖。没有 PDF 或页面尺寸/旋转不兼容时明确报告失败，不画假高亮。Vite 开发服务提供相同两个**只读**接口，避免开发测试与正式环境分歧。
- PDF.js 重绘可能销毁自己托管的 `.page` DOM。V6 高亮挂在独立滚动容器层，位置由当前 PDF 页 DOM 视觉坐标推导，页面重绘或 Dockview 尺寸变化重新定位；只在实际宽度变化时重排 PDF Viewer，防止持续重绘丢高亮。高亮仅在对应 PDF 块坐标经过严格有效性和页面宽高比校验后显示。
- 自动测试 `tests/four-pane-pdf-browser.test.mjs` 在 Chrome 和 WebKit 分别验证：22 页、224 块、深色显示、Range、缩放、AG→PDF bbox 框选、旋转页 8 PDF 点击→AG/CM6/Markdown 回跳、PDF 和 MD 原件不修改；旧 AG/三窗测试同步升级为四窗检查。冻结 Lab 不能修改，实体 iPad Safari 视觉验收仍须用户完成。
- 正式 V6 LaunchAgent 的 macOS TCC 权限无法直接读取 iCloud Obsidian PDF：先送出 Range 响应头再读取会导致连接中断及 Cloudflare 520。已将原始 PDF 逐字节 SHA-256 校验复制为 `.v6/workspace/buffetts-alpha.original.pdf`（只读、Git 忽略），默认由正式 V6 服务从工作区快照只读提供 Range；源 iCloud PDF 不修改。服务在发送 HTTP 200/206 之前必须先成功打开证据文件，失败统一明确返回 503，不能伪装 PDF 加载成功。变更工作区 PDF 时须显式更新该受控副本及哈希，而不是在组件内绕开 macOS 授权。

## 20. 共用预览窗：三 Dockview 窗格、四个持续同步的视图（2026-10-21）

- 顶层 Dockview **永远只有 AG、CM6 源码、共用预览这三个窗格**。共用预览窗自己的工具条左端是 `Markdown 预览 / PDF 原文` 下拉；切换哪种预览，就在下拉右侧呈现该预览独有的功能按钮（当前 Markdown 无独立功能按钮，PDF 有缩小、适宽、放大、倍率、页码与状态）。共用预览不再使用 Dockview 原生标签，AG 和 CM6 也继续没有标签栏。
- **四个逻辑视图始终存在并接收定位事件**：`PreviewPanel` 同时拥有 Markdown DOM 阅读层和单一 PDF.js 实例，切换用 `visibility:hidden`，不能 `display:none`、销毁或重新构造 PDF.js，否则 PDF 页面尺寸、已绘制页面、缩放及高亮会丢失。CM6 始终是唯一文本编辑状态，Zustand 只传递临时位置；正常 MD 预览重绘与 PDF 模式切换不清空 CM6 Undo/Redo。
- 滚动同步 `lastDriver` 必须严格区分 `cm6`、`preview`、`outline`、`pdf`：仅 **preview** 实际用户滚动才可把 MD 位置反向用于纠正 CM6；PDF/AG 的主动位置是源码坐标驱动，绝不可从旧 MD 预览滚动状态反向覆盖 PDF 跳转。`scroll-sync` 绑定持续存在的 `.ocr-preview-md-scroll`，即使隐藏仍保持 DOM 几何。
- PDF 收到定位时不可只比较页码，必须同时比较 `pageIndex + blockIndex`，同一 PDF 页的不同文字块也须切换高亮。PDF 切到可见时，立刻依据最新 CM6/AG/MD/PDF 位置事件恢复对应 OCR bbox 高亮；较小的高亮框必须完整可见；高亮框大于预览窗（如第 8 页宽大的图表）时应居中显示最大可见部分，**不能为了完整容纳强制改动用户保存的缩放比例**。PDF.js 重绘后应恢复独立高亮层，不能指望 Canvas DOM 不发生替换。
- PDF.js 在缩放后可能发生迟到的页面滚动校正，程序性滚动结束时必须重新定位/展示高亮；用户自己滚动时不得强迫预览跳回选区。
- PDF 只读源、当前 Markdown 母文档以及冻结 Lab 均不得由布局和定位测试改写。`tests/shared-preview-browser.test.mjs` 用 Chrome、WebKit 验收 3 个实际窗格、4 个逻辑视图、唯一模式下拉、MD/PDF 互切、工具栏、PDF 对象复用、缩放保持、隐藏状态同步、同页 block4→6 以及跨页至第 8 页后切回仍可见。既有三窗/四窗回归同步修改为此约束；实体 iPad Safari 仍须人工视觉验收。

- 2026-10-21 追加：**PDF 的定位与滚动彻底解耦**。`scrollTarget` 只用于 CM6 ↔ Markdown 阅读预览及 AG 表持续联动，`PdfPreview` **不得订阅**此事件；进入/退出 PDF 模式不从当前 MD 滚动位置推导 PDF 页码或高亮。仅显式点击 AG/勾选标题、Markdown 阅读块、CM6 源码内容或 PDF 页码/文字区域可建立 PDF 定位；CM6 仅移动光标（包括键盘导航）、保存、撤销/重做导致的焦点变化不应触发 PDF 自动导航。被点击的 OCR 高亮目标在 PDF 视口可容纳时完整可见，超出视口时居中显示；切换回 PDF 时仅处理之前隐藏期间尚未展示的点击锚点，不重走实时跟随。PDF 自身平滑滚动只改变 PDF 阅读位置，不再发起反向 `publishFocus`。`tests/pdf-click-only-browser.test.mjs` 双浏览器验证 CM6/MD 滚动不带动 PDF、模式切换不跳页、显式点击才定位及 PDF 阅读不拖动其他窗。
