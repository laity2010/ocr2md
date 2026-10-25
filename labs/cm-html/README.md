# OCR2MD V6 · cm-html 实验：同一工作台、多文件上下文

本实验只在 `experiment/wcp-lab` 分支修改实验模块与可选 HTTP 适配接口，主线 `ui/`、工作数据和正式发布不变。沿用主线 WCP、CMD、AG、CM6、PDF.js、MD Preview、所有模块控件；**绝不建立章节只读影子编辑器**。

- 文件导航：`章节定界/母文档`、`全局设置/settings.json`、`章节chapter/<编号>-<标题>.cmd.chapter.md`。
- 选择章文件：以 URL 查询参数 `?chapter=<文件名>` 建立独立的当前文档上下文，重新运行原生 V6 组件初始化；AG/源码/预览/PDF/撤销重做/保存全都来自同一 CM6 章节文档。
- 章节保存：`/api/document?chapter=<文件名>` 通过实验路由限定在清单登记的章节，复用 `v6_chapters.export` 原子更新全部章节及 SHA 清单；母文档及其他章节不能被覆盖。切换不同文件时遵循原生浏览器未保存提醒，不能将两个文件的撤销历史混到一个 EditorState。
- 章节导出：母文档仍用原 `export-chapters`，输出实验数据目录的 `chapter/*.cmd.chapter.md`；章节内再次导出/初始化被拒绝，以防误覆盖母文档章节目录。
- `*.cmd.chapter.md` 只是已定界、允许后续元素模块处理的文件格式，不会改变 CM6 内容的其他解析规则。
- 文件切换（母文档 ↔ 章节）会重新初始化同一 V6 工作台，但 Dockview 的 AG 左右宽度和源码／预览上下高度比例通过实验布局适配器保存在当前浏览器标签的 sessionStorage；同标签切换保留分隔条位置，互不混入文件正文或设置 JSON。
- `settings`、`chapterFiles` 仍是单独模块覆盖。实验分支的通用 `scripts/v6_serve.py` 仅增加可选实验 `document-router.py` 钩子，生产没有开启；通过 `V6_LAB_RUNTIME` 明确复用已经部署的实验 `.runtime/`，无需复制用户数据。

## 验收

- `modules/chapter-export.browser.test.mjs`：真实 Chrome/WebKit 授权导出 → 选择章节 → 原生 AG/CM6/预览 → 编辑、Undo/Redo、保存、重开、回母文档，核对父文档及旁章字节不变。
- `modules/source-file-navigation.browser.test.mjs`、`modules/ag-module-toolbar.browser.test.mjs`：原工作台交互回归。
- 现有实验公网/内网入口仍为 `/labs/cm-html/`（内网 HTTPS 4443 反代 4408）。
