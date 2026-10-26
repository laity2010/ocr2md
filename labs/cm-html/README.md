# OCR2MD V6 · cm-html 实验：同一工作台、多文件上下文

本实验只在 `experiment/wcp-lab` 分支修改实验模块与可选 HTTP 适配接口，主线 `ui/`、工作数据和正式发布不变。沿用主线 WCP、CMD、AG、CM6、PDF.js、MD Preview、所有模块控件；**绝不建立章节只读影子编辑器**。

- 文件导航：`章节定界/母文档`、`全局设置/settings.json`、`章节chapter/<编号>-<标题>.cmd.chapter.md`。
- 选择章文件：利用 URL 查询参数 `?chapter=<文件名>` 标示当前文档，在页面内即时切换每个文件独立的 CM6 EditorState（含历史、选择及未保存内容）；Dockview、AG、CM6 EditorView、Markdown 预览、PDF Viewer 与按钮均保持同一实例，**不刷新整个工作台**。
- 章节保存：`/api/document?chapter=<文件名>` 通过实验路由限定在清单登记的章节，复用 `v6_chapters.export` 原子更新全部章节及 SHA 清单；母文档及其他章节不能被覆盖。切换不同文件时遵循原生浏览器未保存提醒，不能将两个文件的撤销历史混到一个 EditorState。
- 章节导出：母文档仍用原 `export-chapters`，输出实验数据目录的 `chapter/*.cmd.chapter.md`；章节内再次导出/初始化被拒绝，以防误覆盖母文档章节目录。
- `*.cmd.chapter.md` 只是已定界、允许后续元素模块处理的文件格式，不会改变 CM6 内容的其他解析规则。
- **AG 工具栏按当前文件类型显示**：母文档 `.minerujson.md` 固定章节定界，显示原始「导出章节／起始编号」按钮与输入框；章节 `.cmd.chapter.md` 显示原 `module-select`，选择「标题／媒体／LaTeX」三类元素模块并在 AG 工具栏显示该模块已有操作按钮。打开章节立即扫描当前文件的标题／媒体／LaTeX 元素，下拉切换 AG 可见视图；整个工作台共用一个元素下拉状态，章节之间切换保持当前「标题／媒体／LaTeX」选择；进入母文档暂时显示章节定界，返回章节时恢复之前的元素选择。全局设置仍走文件导航，不作为章节元素模块。
- 实验 AG 章节元素选择器物理上只有「标题／媒体／LaTeX」三项；全局设置仅由源码文件导航负责，内部仍复用原始模块路由。媒体预览列在模块切换中保留图片 DOM，后台重复扫描不重复赋值相同行数据，避免缩略图闪动。
- Lab `NavigationSelect` 采用 Tom Select 2.6.2（Apache-2.0），统一文件导航（工作区/章节分组及搜索）、AG 元素（标题/媒体/LaTeX）和预览类型（Markdown/PDF）的暗色 Web 浮动菜单。Tom Select 只操作其私有选项副本；原生 `<select>` 保持原值、选项与 change 事件业务契约；菜单挂到 body 避免 Dockview 裁切，iPad WebKit 实测无需系统原生选择菜单。全局设置只在文件导航中。

- 工作台在文件切换时常驻，因此左右和上下分隔条位置不变；原实验 Dockview 布局适配器仍用于浏览器页面刷新后的同标签比例恢复。各文件撤销历史与尚未保存的编辑状态互不混淆。
- `settings`、`chapterFiles` 仍是单独模块覆盖。实验分支的通用 `scripts/v6_serve.py` 仅增加可选实验 `document-router.py` 钩子，生产没有开启；通过 `V6_LAB_RUNTIME` 明确复用已经部署的实验 `.runtime/`，无需复制用户数据。

## 验收

- `modules/chapter-export.browser.test.mjs`：真实 Chrome/WebKit 授权导出 → 选择章节 → 原生 AG/CM6/预览 → 编辑、Undo/Redo、保存、重开、回母文档，核对父文档及旁章字节不变。
- `modules/source-file-navigation.browser.test.mjs`、`modules/ag-module-toolbar.browser.test.mjs`：原工作台交互回归。
- 现有实验公网/内网入口仍为 `/labs/cm-html/`（内网 HTTPS 4443 反代 4408）。

- 章节「媒体」AG **只显示当前 `.cmd.chapter.md` 正文引用的媒体**；工作区已下载但未出现在该章的本地文件不混入本章元素表。空章节必须显示空媒体表。该规则由 `chapter-empty-media.browser.test.mjs` 用真实 001→002→001 验证。
