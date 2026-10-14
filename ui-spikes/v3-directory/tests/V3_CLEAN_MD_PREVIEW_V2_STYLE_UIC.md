# OCR2MD V3 · 章节清洗 MD 预览继承 V2 元素样式

- Feature Contract: `FC-V3-CLEAN-PREVIEW-V2-001`
- UI Interaction Contract: `UIC-V3-CLEAN-PREVIEW-V2-001`
- 状态：**待用户审核**；桌面 Chromium、WebKit 可自动验收；真实 iPad Safari 标记为 `manual-external`。

## 入口 / 需要 / 动作

工作目录指向 `Obsidian/ocr2md/ocr2md/<书籍>`；在工作台顶部章节文件导航选择 `chapters/*.md`，进入「章节清洗」。源码窗负责编辑，右下 MD 预览窗同步展现 **与 V2 一致的文档元素**。测试文档包括 H1–H6 标题、普通段落、粗体/斜体、超链接、块引文、V2 HTML Callout、无序列表、GFM 表格、 fenced code、行内与块级 KaTeX、Markdown 图片、注释引用及正文、HTML 块。

用户可以滚动预览、点击 Callout 展开/折叠、点击预览标题跳转同一 MD 源码行，勾选/取消「标题序号」仅影响 AG 显示，绝不改原文。

## 预期界面与架构

- **唯一渲染器**：继续使用 V2 `ui-spikes/v2/src/basicMarkdownPreview.ts` 的 `BasicMarkdownPreview` 实现 MarkdownIt、KaTeX、HTML sanitization、footnote、callout、embed。禁止额外引入第二套 Markdown 解析器或修改原 Markdown 来修复视觉问题。
- **唯一元素样式基准**：V2 `ui-spikes/v2/index.html` 内 `#markdown-preview` 元素样式（首个包含 `min-width: 0` 的真实阅读预览规则至 `.ocr2md-reading-preview` 前）。V3 构建前使用 `scripts/syncV2PreviewStyles.mjs` 从原始 V2 CSS 提取、映射两个 V3 预览容器 ID，并生成 `src/v2MarkdownPreview.css`；V3 不再维护此前复制但可能落后的大段 CSS。样式涵盖颜色、引文/HTML Callout、链接、注释弹出层、代码块、表格、图片及 KaTeX 溢出处理；V2 原有 CSS 或元素缺失时构建要显式失败，不能静默退回较弱版本。
- **适配仅限 V3 容器**：工作台分栏尺寸、AG/CodeMirror 样式及其独立 Undo/Redo 不改变；V3 的 `--v3-preview-font-size`、`--v3-preview-line-height`、`--v3-md-font-family` 和 Sarasa 字体设置继续生效。代码、图注等元素字体回退统一指向 V3 Sarasa UI 字体。V3 有全局标题/段落布局样式（导航会用到），但 V2 阅读预览并无这些全局覆盖；因此只在预览文本作用域恢复正常浏览器标题/段落间距和标题字距，避免之前 V3 的 `h1/h2/h3{margin:0...}`、`p{margin:5px...;color:#9eb0c5}` 污染 V2 预览。
- **不变量**：保留已配置的 H1–H6 字号/颜色、AG↔源码↔预览定位、高亮焦点、滚动位置、PDF.js/MD tab 切换、章节清洗保存 CAS 和 V2 允许的 HTML 清洗保护；此改动无任何对 Obsidian/iCloud、MD、DIRjson 或 PDF 的额外写入。不会把原来 V2 不支持的普通 note Callout 误当成 V2 HTML Callout 的折叠样式，也不会通过公开未授权的图片 URL 绕过 Vault。

## 自动化 / 人工审核

- `npm run test:clean:preview-v2`：Chromium 与 WebKit 在独立临时受控 Mac Vault 上加载 `chapters/*.md`，断言丰富 Markdown 的实际 DOM 结构及 computed styles：V2 的段落 1em 间距、非零标题 margin、H2 颜色、超链接色、引文 3px 左边框、HTML Callout 1px、表格边框、代码背景、脚注圆形样式、KaTeX 可横向滚动、图片最大宽度 100%，同时验证 Callout 可展开/收起、默认 Markdown 预览、未提交任何真实写入。
- `npm run test:clean:hierarchy`：原章节标题 H1–H6、AG 层级、标题序号 checkbox 与预览标题点击定位正常。
- `node tests/irWorkbenchBrowser.cjs`、`node tests/chapterPublishBrowser.cjs`：DIRjson、PDF/MD 导航、章节发布未退化。
- iPad Safari 真实触控与复杂书籍 Markdown 排版需用户在发布后审核，状态：待用户审核。


## 2026-10-11 · 实际 OCR HTML 表格围栏补充

Buffett 真实章节指出仅有元素样式不足：V2 MarkdownIt 会按规则把 ` ```html ` 包裹的表格显示为代码。现单独在 V3 章节清洗的**预览层**加了保留行号的受限 HTML 表格围栏适配，不改 V2 BasicMarkdownPreview，也不修改源 MD。七张真实表格已经在临时 Vault 上渲染为 DOM `<table>`；更详细的安全边界及完整 UIC 见 `tests/V3_CLEAN_FENCED_HTML_TABLE_UIC.md`，iPad Safari 待审核。

## 2026-10-11 · MinerU `math` 围栏补充

Buffett 原文第 126–128 行的 ` ```math ` 曾在预览显示未渲染的 `\frac` 代码。V3 章节清洗现加了 preview-only 的 KaTeX `math/latex/tex` 围栏解析，与 HTML 表格适配并列，保留所有原始 MD 行号及保存逻辑。完整 contract 见 `tests/V3_CLEAN_FENCED_MATH_KATEX_UIC.md`；真实章节 12 个有效公式均通过 Chromium/WebKit，iPad 待人工审核。

## 2026-10-11 · 与 Obsidian 规范化章节发布的边界

本来的 MinerU fenced HTML/math 预览转换只用于兼容旧章节。**新发布的章节**改由保存的 DIRjson 产生 Obsidian 原生 `<table>`、`$$...$$`；具体规范、媒体/LaTeX AG 双模块及图片本地化见 `V3_CHAPTER_EXPORT_OBSIDIAN_MEDIA_LATEX_UIC.md`。仍需保留旧章节预览能力，但不把预览层转换写入 MD 或 DIRjson。


**2026-10-11 · 老章节升级**：原 `chapters/` 先于 Obsidian 投影发布，因此原本仍含 MinerU 围栏。章节清洗现提供“规范化 Obsidian MD”显式操作，先生成可撤销草稿，经确认保存后才变更本章文件，禁止重发覆盖旧章；完整保护规则参见 `V3_CHAPTER_EXPORT_OBSIDIAN_MEDIA_LATEX_UIC.md`。


**2026-10-12 · 老章节的 Obsidian 源文件规范化**：因现有章节已经发布且可能含用户改动，“发布章节”不能覆盖旧 MinerU 章文件。在章节清洗增加“规范化 Obsidian MD”按钮，转换仅进入可 Undo/Redo 的源码草稿，需用户再次保存；详细 UIC 和 Chromium/WebKit 实际文件重新打开回归见 `tests/V3_CHAPTER_EXPORT_OBSIDIAN_MEDIA_LATEX_UIC.md` 及 `npm run test:clean:normalize-old`。
