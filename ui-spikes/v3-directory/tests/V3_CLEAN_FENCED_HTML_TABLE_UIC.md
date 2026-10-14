# V3 章节清洗 · OCR fenced HTML table 可视化回归

- Feature Contract `FC-V3-FENCED-HTML-TABLE-PREVIEW-001`
- UI Interaction Contract `UIC-V3-FENCED-HTML-TABLE-PREVIEW-001`
- 状态：自动化 Chromium/WebKit 验证通过，iPad Safari 真实阅读体验 **待用户审核** (`manual-external`)

## 起因与复现

打开工作目录 `Obsidian/ocr2md/ocr2md/Bufett’s Alpha`，工作台导航进入 `chapters/01 Buffett’s Alpha.md`，在源码第 85–87 行有如下 MinerU 产物：

````md
```html
<table><tr><td rowspan="2">Stock/Fund Measure</td><td colspan="5">A. Sample Distribution of Sharpe Ratios</td>...</tr></table>
```
````

旧 `BasicMarkdownPreview` 使用标准 MarkdownIt 把 ` ```html ` 解释为代码围栏，因此预览显示字面量 `<table>` 而不是表格；此前只复用 V2 的 CSS 对此毫无作用，用户在 iPad 截图复现。源书籍包含 **7 个**这样的 HTML table fenced block，且另有 `[表格图片来源（仅链接，不自动载入）]` 的证据链接。

## 操作 / 需要 / 效果

在 V3 章节清洗 **MD 预览窗** 以既有 V2 `BasicMarkdownPreview` 和 CSS 正常呈现真实表格：保留原始表格行、单元格、`rowspan`、`colspan`、文本、自动横向溢出。用户仍可滚动表格、点击标题回到对应源码位置、切到 PDF 对照。原文不改，文件的行号、注释和证据链接继续有效；不会自动抓取外部图表图片。

V3 仅在**预览字符串**中识别信息标识恰为 `html` 的围栏，并且内容经安全过滤后仍是**一个单独的顶级 `<table>`** 且含有表格单元格时，才把其转换为可显示的 HTML。原始围栏起止位置及内容行数都用同数量空行保留，因此 `data-source-line` 指向同一原文位置（真实书籍首表第 86 行）。其余 ` ```js `、Python、非表格 HTML 代码、无效围栏均保持普通代码块。HTML 围栏的普通 XML 示例不是表格，不进行隐式执行。

仅允许表格及少量**静态文本格式标签**，允许的属性仅为 `rowspan`、`colspan`、`align`、`scope`、`headers`、`abbr` 等表格布局属性。使用 DOMPurify 白名单过滤（不允许链接、图片、脚本、style、事件属性、自动访问外域资源），然后**仍走 V2 原本的 DOMPurify 预览清洗**。源文件的 Markdown 字节保持不变；已保存的 MD、DIRjson、PDF 与 Obsidian 数据不得发生新写入。V2 原有渲染器及普通代码围栏语义不改变；只加 V3 章节清洗预览适配层。

## 测试与结果

- `cd ui-spikes/v3-directory && npm run test:clean:preview-v2`：受控临时 Vault 中同章含真实多行 HTML 表格、合法 `rowspan`/`colspan`、恶意 IMG/link/onerror/script、非表格 HTML、JS 示例、其他 Markdown 元素；检查表格 DOM、表格 CSS、源码位置、净化结果、源码/文件无改动、V2 样式及 Callout 交互；分别 Chromium/WebKit。
- `OCR2MD_TEST_REAL_FENCED_TABLE_PATH="<本机 Buffett's Alpha chapters/01 Buffett’s Alpha.md 绝对路径>" node tests/chapterHierarchyBrowser.cjs`（以及 WebKit 环境）：**仅读取真实源文件**，在临时 Vault 副本中打开 V3 清洗，必须有 7 张表，首表包含 `Stock/Fund Measure`，源码锚为 `86`，保留证据链接且不加载原始图片、不发起 Vault 写操作。不同机器没有此真实文件时不运行本场景，不以伪造 fixture 替代。
- `node tests/chapterHierarchyBrowser.cjs`：H1–H6 清洗表不退化；`node tests/irWorkbenchBrowser.cjs`：DIRjson、源码/PDF 定位不退化；`node tests/chapterPublishBrowser.cjs`：章节发布不退化。
- iPad Safari 真实操作：进入目标章节后，滚至 Table 1，检查横向滑动与表格内容、链接仍可打开但外部图片不会被自动加载；结果待用户审核。


**2026-10-11 · 独立数学围栏渲染契约**：同一实际 Buffett 章节另有 12 个 ` ```math `，现在由与 HTML 表格并列的 `src/fencedMathPreview.ts` 仅在预览期间渲染为 KaTeX；安全规则及双浏览器验证见 `tests/V3_CLEAN_FENCED_MATH_KATEX_UIC.md`，不更改此 HTML 表格的白名单和源码保留规则。
