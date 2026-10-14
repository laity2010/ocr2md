# OCR2MD V3 · 五模块后台活动摘要 UIC

功能契约：`FC-V3-BACKGROUND-STATUS-001`。交互契约：`UIC-V3-BACKGROUND-STATUS-001`。状态：**待用户审核**（Chromium、WebKit 自动验证通过；真实 iPad Safari 标记为 `manual-external`）。

## 操作 / 需要 / 效果

用户进入 `/v3-directory/` 时，原 `ocr2md v3` 和版本号右侧必须始终有**且仅有一个**顶部后台状态汇总带，依固定顺序列出 **设置 / 工作目录 / 工作台 / DIRjson / PDF** 五个模块。其含义是“各个模块当前最近一次后台进度/结果摘要”，而非当前选中标签的消息，也不是五个新进度条或五份重复的内页状态。版本号仍显示；最右侧旧 `#status` 仍供当前操作文字通知和旧测试使用。

页面启动时，工作目录先初始化，设置后置 idle 加载；因此可同时见到 `工作目录 · 已就绪` 和 `设置 · 正在后台加载`。切换不同标签不会重置别的模块的进度；设置完成加载不会抢走工作目录标签。工作目录独立提示授权/连接/目录读取与条目数量；工作台提示书籍选择、扫描、文件读取或清洗/定界工作模式；DIRjson 提示快照读取、同步、草稿待保存、保存/失败；PDF 提示按需读取、渲染页数、就绪的“第 N / M 页”或失败原因。点击 AG、源码、PDF 或保存均沿用原流程。

模块进度由真实回调（controller.subscribe、V3Workbench view callback、V3PdfPreview phase callback、共享设置 `settingsGate`/保存历史）或已有模块**隐藏状态节点的 MutationObserver**推进；**没有任何新的 fetch、定时轮询、iCloud IO 或 SQLite 写入**。`#ir-status` 等隐藏源节点继续存在，便于原业务操作和旧测试观测，但不再画出重复状态栏。摘要错误、未保存、工作中、就绪使用不同文字；结构化 `data-level` / `data-summary` 与 `title` 提供验收/完整细节。不要依据共享设置 CodeMirror 在首次初始化时产生的“实时预览 · 未保存”提示虚报草稿：只有实际编辑历史后才能标记设置草稿。

窄屏（390px 和 iPad）必须保留版本号及五模块可发现的摘要，通过**汇总条内横向滚动**查看全部模块，不允许整页水平溢出、遮挡 AG/源码内容，也不向页面额外添加第二状态栏。真实 iPad 手指横向滚动待用户审核。

## 不变量与故障路径

- 有密码/授权提示时，工作目录摘要显示等待授权，不得错误显示已连接；PDF/IR 未加载前显示空闲，不能凭页面存在就标记成功。
- 在设置加载失败、PDF range 失败、DIRjson 校验不一致或目录错误时，只对应模块报错，不污染其他模块摘要。工作目录仍可单独使用。
- 默认 `Obsidian/ocr2md/ocr2md`、设置 idle 调度、共享 Sarasa 字体、统一撤销/重做、章节起始序号、AG↔源码↔PDF 定位、DIRjson 保存发布等一切业务状态保持原样。
- 不添加每个模块的历史日志或额外消息表：这是最小、只读的事件驱动摘要视图。

## 自动 UIC / 用户人工审核

- `cd ui-spikes/v3-directory && npm run test:status:modules`：Chromium 和 WebKit；真实 read-only Mac Vault 目录首屏+故意延迟共享设置网络文件；验证五个模块顺序/首屏就绪/设置后载入；用模块原有隐藏状态节点验证后台更新、跨标签独立性、PDF 页码、DIRjson 错误、保留当前操作消息与 390px 横向滚动。
- `node tests/irWorkbenchBrowser.cjs`：真实 OCR JSON/PDF 临时夹具验证 DIRjson 模块就绪、PDF 原文加载后反馈；章节所有用户操作及发布流程不退化。
- `node tests/settingsUndoRedoBrowser.cjs`（Chromium/WebKit）：编辑历史中的设置未保存摘要、显式保存后显示已保存。`node tests/chapterPublishBrowser.cjs`、`node tests/directoryHomeBrowser.cjs`：业务保护与目录导航不退化。
- 真实 iPad Safari：请用户核实滚动摘要、加载过程、状态完整性、重试/错误提示（状态：待用户审核）。


## 2026-10-11 · 后台活动结束自动退出状态栏

- **用户诉求**：已经完成的后台工作立即从顶部状态栏退出，不能让五个模块长期占住一整行。状态栏是活动视图，不是完成日志或历史记录。
- **状态规则**：`busy` 正在执行或排队的后台工作显示；`dirty` 未保存草稿显示；`error` 尚未处理的故障显示；`ready` 已完成与 `idle` 未启动/无任务均**隐藏**。一个模块完成时立即隐藏自己的条目；五个模块都无活动时，连整个摘要带也收起，不留五个空槽位。新任务开始时自动重新出现，无“完成后延时消失”的定时器。
- **数据与回归**：保留五个源模块全部快照、DOM 稳定 ID 和 title，**仅收起视觉呈现**；不删实际数据、不丢错误、不触发保存、不添加轮询。操作即时消息 `#status` 仍由原业务负责（本功能只处理五模块后台活动摘要）。设置初始等待空闲加载属于待执行后台任务，待加载完成即退出；工作目录已就绪后退出；PDF 页渲染完成退出；DIRjson 错误/草稿持续显示直至解决/保存。
- **自动化**：`npm run test:status:modules` 的 Chromium 和 WebKit 场景额外检查：初始仅显示待开始的设置和连接中的工作目录；工作目录就绪退出；设置就绪后摘要条整体折叠；后台再次启动工作台、DIRjson、PDF 时自动重现；PDF 完成退出、DIRjson 出错继续显示、改为待保存后继续显示、保存完成退出；390px 下多任务时条内可横向滚动，所有任务结束后无空槽。iPad Safari 真实触控与滚动仍待用户审核。


对于后台自动完成事件，原有 `#status` 也不再残留“已连接 Root”“当前目录”“模块已就绪”等持久成功信息；它仍保留**实际前台操作的必要提示以及正在处理、未保存、错误信息**。这不影响手动保存时的必要反馈。HTML 首屏隐藏尚未开始的工作台、DIRjson、PDF 三个静态占位条目，避免 JS 初始化前的短暂闪烁。


**2026-10-11 · PDF 可见首帧才标记完成**：之前 `pagesinit` 提前终结 PDF 后台摘要；现在必须等 `pagerendered` 及真实非空 Canvas，非首页 AG 目标页也可以在 MD 背后按需预热，PDF 标签切换不重复宽度不变的布局更新。失败保留 error，后台目标页绘制期间保留 busy。详见 `tests/V3_PDF_WARM_FIRST_FRAME_UIC.md`、`test:pdf:warm-start`/`test:pdf:target-warm`，真 iPad 待用户审核。
