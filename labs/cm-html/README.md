# OCR2MD V6 · cm-html 实验：同一工作台、多文件上下文

本实验只在 `experiment/wcp-lab` 分支修改实验模块与可选 HTTP 适配接口，主线 `ui/`、工作数据和正式发布不变。沿用主线 WCP、CMD、AG、CM6、PDF.js、MD Preview、所有模块控件；**绝不建立章节只读影子编辑器**。

- 文件导航：`章节定界/母文档`、`全局设置/settings.json`、`章节chapter/<编号>-<标题>.cmd.chapter.md`。
- 选择章文件：利用 URL 查询参数 `?chapter=<文件名>` 标示当前文档，在页面内即时切换每个文件独立的 CM6 EditorState（含历史、选择及未保存内容）；Dockview、AG、CM6 EditorView、Markdown 预览、PDF Viewer 与按钮均保持同一实例，**不刷新整个工作台**。
- 章节保存：`/api/document?chapter=<文件名>` 通过实验路由限定在清单登记的章节，复用 `v6_chapters.export` 原子更新全部章节及 SHA 清单；母文档及其他章节不能被覆盖。切换不同文件时遵循原生浏览器未保存提醒，不能将两个文件的撤销历史混到一个 EditorState。
- 章节导出：母文档仍用原 `export-chapters`，输出实验数据目录的 `chapter/*.cmd.chapter.md`；章节内再次导出/初始化被拒绝，以防误覆盖母文档章节目录。
- `*.cmd.chapter.md` 只是已定界、允许后续元素模块处理的文件格式，不会改变 CM6 内容的其他解析规则。
- 工作台在文件切换时常驻，因此左右和上下分隔条位置不变；原实验 Dockview 布局适配器仍用于浏览器页面刷新后的同标签比例恢复。各文件撤销历史与尚未保存的编辑状态互不混淆。
- `settings`、`chapterFiles` 仍是单独模块覆盖。实验分支的通用 `scripts/v6_serve.py` 仅增加可选实验 `document-router.py` 钩子，生产没有开启；通过 `V6_LAB_RUNTIME` 明确复用已经部署的实验 `.runtime/`，无需复制用户数据。

## 验收

- `modules/chapter-export.browser.test.mjs`：真实 Chrome/WebKit 授权导出 → 选择章节 → 原生 AG/CM6/预览 → 编辑、Undo/Redo、保存、重开、回母文档，核对父文档及旁章字节不变。
- `modules/source-file-navigation.browser.test.mjs`、`modules/ag-module-toolbar.browser.test.mjs`：原工作台交互回归。
- 现有实验公网/内网入口仍为 `/labs/cm-html/`（内网 HTTPS 4443 反代 4408）。
