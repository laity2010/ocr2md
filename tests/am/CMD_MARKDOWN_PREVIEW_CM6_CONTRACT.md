# CMD Markdown 预览 · CM6 单一文本视图 · 模块设计与实验验收

日期：2026-11-09。**这是模块需求和实验事实记录，不修改或替代 AGENTS.md 正式原则。**

## 目标架构（用户确认）

CMD Markdown 预览只使用一个 CM6 `EditorState.doc` 作为可定位、可折叠的文档视图；既有成熟 Markdown 渲染器分别承担 Markdown-it、KaTeX、DOMPurify、highlight.js、Obsidian callout、媒体和脚注。CM6 管理源码行号、可选句 ID Gutter、选区、来源偏移、滚动、标题折叠。不能为渲染后的 HTML 再建立独立的行号栏、焦点、滚动坐标或折叠状态机。

**标题是 Markdown 成品预览中的语义标题，不是普通缩小文字。** H1～H6 保留原 Main Obsidian 视觉层级（字号、字体权重、配色）；折叠后仍显示原 CM6 标题行并保留字号和配色。折叠范围只能通过 CM6 的 `foldService`、`foldGutter`、`foldEffect` 管理，不借独立 DOM `details/summary` 代替。

## 现有公开实验 API

- `ui/cm-markdown-preview-spike.js`：`createCMMarkdownPreviewSpike(text,anchors) → {extensions,metrics,setRendered(view,boolean),setSentenceIDs(view,boolean),foldHeadings(view),unfoldHeadings(view),foldedCount(view),reveal(view,sourceOffset)}`。
- 该 API **只做视图适配**。宿主创建唯一 EditorView，完整 CMD 或清洁投影字节直接传给 CM6；调用者不得通过 HTML DOM 寻找源位置。
- Main `renderMarkdown()` 负责 HTML、KaTeX、媒体和 callout 的实际内容；Main `obsidianHeadingMarkers` 提供 CM6 H1～H6 源行字号和语义样式，渲染模式只隐藏 `# ` Markdown 语法前缀。
- 单行 Markdown 块用 CM6 **行内** `Decoration.replace` + Widget，故原生 CM6 行号和句 ID Gutter 可见；复杂跨行内容暂由 `StateField` 块级 Widget 负责，不能伪报这些行的 Gutter 已完整覆盖。
- `tests/cm-preview-spike.browser.test.mjs` 是可直接执行的 API/集成测试：Chrome / iPad WebKit，402 句真实文档、原始 CMD 完全恒等、行号与句 ID、19 H1/H2 等原生折叠范围、标题样式一致、图片/公式/HTML 表格/callout 渲染与媒体 HTTP200。

## 真实文档实测（2026-11-09）

| 项目 | 新实验 | 验收边界 |
| --- | --- | --- |
| CMD 原文和 Clean 投影 | 388,265 字符 CMD、81,418 字符预览投影，均与 CM6 `view.state.doc` 严格相等 | PASS（不改原文） |
| Markdown 源块 | 423/425 个渲染顶层块成功映射 | 部分 PASS；HTML 脚注尾部两元素仍无源位置 |
| 保留行内预览 | 377 个单行块行内渲染，19 个 H1～H6 原样式 CM6 行，27 个跨行块 Widget | 行号/句 ID 在普通正文的渲染模式可见；跨行块未全部解决 |
| 标题样式与原生折叠 | 实测 H1=31.875px、H2=24.375px；折叠 19 个原生 CM6 范围 | Chrome/iPad WebKit 通过；折叠后标题样式需持续回归 |
| Main 媒体及内容 | 18 张图、41 个公式节点、9 个表格、7 个 callout | 渲染节点可见；完整交互等价仍须进一步复核 |
| 原文句定位 | 402 个句 ID 与 UTF-16 源偏移匹配，CM6 原生定位能到达文末 | 实验可用；旧校译左窗仍使用独立 HTML，尚未替换 |

## 必须解决才可晋升校译正式左窗

1. **跨行块**：HTML 表格、callout、跨页/跨栏、代码/公式的块级 Widget 仍会遮蔽部分 CM6 行号与句 ID；需避免独立 HTML 侧栏，必须由 CM6 自己承载源行位置。
2. **脚注**：`HR.footnotes-sep` 和 `SECTION.footnotes` 是 Markdown-it 渲染生成的合成尾部，目前缺来源定位；注释引用/注文须复用 Main 弹窗协议、与 CM6 多窗定位互通。
3. **手指/选区/滚动**：需要真实 iPad Safari 触摸、长文虚拟化、标题反复折叠、点击正文与右侧 GPT/Grok 译文联动回归，防止 `225|p5b2` 错跳。
4. **版本晋升/审计**：Lab 仍是隔离实验；不得称 Main 或正式校译窗已经切换。须依 AGENTS.md §5／§6 的模块图镜像、直接 API 测试、内外审计再决定晋升。
