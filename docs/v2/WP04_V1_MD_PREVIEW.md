# OCR2MD V2 · WP04 修订：V1 Markdown 预览 + 一个空行

基线 `da2c33e`，V2 Lab-Frame 隔离工作树内修正。此次不是 WP05 SQL 持久化；仍然只有两张应用物理表，源码 CM6 是未保存编辑的唯一当前文本来源。共享 `ui/frame/*`、V1 `ui/markdown-preview.js`、Main 及其他 Lab 不作源码改写。

## 1. 逻辑块空行约定

原 WP04 块结束序列为 **三换行符 `\n\n\n`**，因而普通相邻非空逻辑块中间有**两个空行**。修订后每块末尾恰追加 **两换行符 `\n\n`**，即**一个空行**，包括尾块。原有逻辑 Markdown (`logical_block.markdown_text`) 的文本内容严格保留，无删除源段、跨块编辑、SQL 回写或破坏 UTF-16 外部位置清单的行为。对本身含内部换行的 OCR 块不做静默文本规整：用户输入的真实正文换行属于内容；零文本逻辑块仍保留自己的两换行符及独立 ID，连续空块可能出现更多连续空白，这是保留空块的结果而非额外插入两个空行的旧缺陷。

## 2. V1 唯一渲染器

- 预览窗仍为 Frame 原来那个 `ocr-preview-md-scroll`，V2 构建阶段通过**严格文本匹配适配器**只替换预览挂载点，创建一个 `article.ocr-markdown`（与 V1 PreviewPanel 相同），不改 Frame 共享源码或 Dockview 布局。
- 唯一 Markdown 解析器是 V1 `ui/markdown-preview.js` 公开 API **`renderMarkdown(markdown)`**，以及它已注册的 Markdown-it、KaTeX (`$$` 和 `math`/`latex`/`tex` 代码围栏)、Markdown-it footnotes/任务清单、Obsidian callout、Obsidian 图片、highlight.js 代码高亮和 DOMPurify 白名单 HTML 净化。所有 V1 样式来自原 `ui/markdown-preview.css`（该模块已自行导入 CSS），并非新造一个 `marked` 或 Markdown-it 实例。
- 采用 V1 的 180ms 更新节流、`morphdom` 原位 DOM reconciliation、渲染前关闭脚注浮窗、保留已展开的 callout 状态与预览滚动比例；真实源 `<script>` 不得变成可执行 DOM。
- 直接复用 V1 `createFootnotePopover` 的脚注浮窗；点击有 `data-source-start` 的预览块/“定位注文”通过 V2 原有 CM6 会话 `locateSourceLine` 跳转到对应行（只更改选区、滚动位置，不改内容）。PDF 与 AG 的完整双向同步仍未迁入。
- **预览输入永远读取 `#workspace #editor.v2SourcePort.getMarkdown()` 当前值**，由现有 `v2-cm-session` 文档加载、编辑、Undo、Redo 和清空事件驱动。禁止订阅 SQL 或单独缓存另一份可编辑 Markdown 状态；Frame 顶栏的保存仍只操作全局设置。

## 3. 验收

- 真实原始 MinerU 22 页 fixture：539 基础块→224 逻辑块、其中 9 个空块，CM6 源码的有效分隔由旧三换行变为两换行，全文少 224 个展示换行字符，保持每个 `logicalId` 和对应 `markdown_text` 及 UTF-16 来源信息。
- Chromium + iPad UA WebKit：V1 H1 色/排版、KaTeX、HTML 表格、Obsidian callout、加粗/代码、脚注浮窗、源行定位和 DOMPurify XSS 防护正常；源码输入/Undo/Redo 后仅当前 CM6 文档变化，预览重渲染而 SQL 的所有数据仍不写入；页面刷新丢弃未保存的 WP04 编辑属预期。
- WP00～WP04 数据与界面回归、Frame 源码身份、GitHub commit/tag、统一发行与公网静态文件 SHA256 校验通过后才可发布。
