# CM6 Markdown 成品预览 Spike：工程报告

日期：2026-11-09。**实验，不是正式校译左窗，也不是 AGENTS.md 正式规范。**

## 问题与事实

用户期望校译的文本始终由 CMD/CM6 管理，而不是给 HTML 预览另建行号、滚动和折叠协调器。被撤销的自研标题折叠违规见 `TR12_HEADING_FOLD_VIOLATION.md`。

CodeMirror 6 不内置完整 Markdown 成品渲染引擎，但提供 `EditorState.doc`、`Decoration.replace({block:true,widget})`、`WidgetType`、原生 `foldService`/`foldGutter`/`foldEffect`、`GutterMarker` 和文档位置 API。实验将 Main 已有的 `renderMarkdown()` HTML 放进 CM6 视口块组件，**不是另外生成 HTML 主阅读窗**。

## 路径与契约

- URL：`/labs/sentence-benchmark/cm-preview-spike.html`，校译 Lab 顶栏可进入。普通校译左窗不替换；Main 无工作树/服务/数据改动。
- 数据来自只读 `/api/translation-review-data`；完整 CMD、校译 Clean MD、402 句表均不写回。
- 两个模式：① 清洁预览投影，② **完整 CMD 原文**。两者分别验证各自 `view.state.doc.toString()` 与输入字符串完全一致。CM6 管理文档、定位、折叠、源码行号和 Gutter；Main 管理 Markdown HTML、图片、公式、表格和 Obsidian callout 的解析渲染。
- 全文 HTML 中的 `data-source-start/end` 对应块级 CM6 `Decoration.replace`，未能映射的元素必须明示，不能报全覆盖。原生 CM6 `foldService` 与 `foldEffect` 折叠每个标题到下一个标题，保留标题层级导航。
- 同源 `/media/` 继续由 Main 提供。模板内容必须使用浏览器原生惰性的 `<template>`，避免 Chromium 解析未挂载图片时误请求 Lab 相对 media。

## 第一轮真文档数据（2026-11-09）

| 项目 | Chromium + iPad WebKit |
| --- | --- |
| 校译预览源文长度 | 81,418 字符，CM6 EditorState.doc 精确匹配 |
| 渲染顶层块映射 | Clean 423 / 425；原始 CMD 214 / 216，**不可跨模式直接比较比例** |
| 完整原始 CMD | 388,265 字符，CM6 EditorState.doc 与 CMD 原文完全一致 |
| 句块与来源位置 | 402 条，两种模式均能建立 ID→原始 CM6 源位置映射 |
| 标题折叠 | 19 个，使用 CM6 原生 fold；实际挂载占位符约 17 个，受虚拟视口影响 |
| CM6 源码 Gutter 句 ID | 源码模式当前视口可见 12 个；**块替换后的预览模式为 0**，尚不达标 |
| 图文显示 | 全文 HTML 包含图片、KaTeX、HTML 表格和 callout，CM6 Widget 在真实文档对应位置可显示；公网 `/media/` 图片请求成功 |
| 未映射 HTML | `HR.footnotes-sep` 和 `SECTION.footnotes`。脚注定义是 Markdown-it 重排后生成的内容，尚无等价 CM6 来源映射及 Main 注释弹窗。 |

**423/425 只是块映射统计，不代表 99.5% 的功能完成度。** CM6 虚拟滚动会只挂载当前视口 Widget；首屏 DOM 不等于全文媒体总数。

## 验收与下一步门槛

直接测试 `node tests/cm-preview-spike.browser.test.mjs`（Chrome + iPad WebKit，公网实验页）。既有校译点击回跳、注释、分句/译文回归测试不能因实验被削弱。

技术可行，但当前**不得晋升原文左窗**。必须先验证或解决：① CM6 原生行号／句 ID 在成品视图仍可见；② 注释引用、脚注定义、popup/返回及正文 CM6 源码位置的一致性；③ 18 张图片、公式、9 表格、7 callout 在 iPad Safari 实机的语义和交互等价；④ 大文件性能、编辑模式与 `AGENTS.md` §5/§6 的镜像性和 API 边界。可研究现有 CM6 live-preview 扩展（尽量使用行内修饰，避免整行 block replace），不应再为左右窗另写一套 DOM 同步层。
