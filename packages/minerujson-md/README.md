# @ocr2md/minerujson-md — V6 无损转换器

一次性、独立、没有编辑器或文件系统依赖的 MinerU JSON ↔ 标准 Markdown（CommonMark + GFM）转换组件。只导出三个 API：

```ts
import { toMarkdown, toMineruJSON, version } from '@ocr2md/minerujson-md';

const md = toMarkdown(mineruJSONText); // 输入字符串可保留原始 JSON 的每一字节
const json = toMineruJSON(md);         // 输出 MinerU JSON 文本；无修改则原始字节完全相同
const release = version();            // '0.1.0'
```

## 格式契约

输出文件使用后缀 `.minerujson.md`，正文只有 Markdown/GFM 原生节点：标题、段落、图片、HTML 表格，以及带 `math` 语言标记的普通围栏代码块；不自创 Markdown 语法。MinerU 页面/段落单起点块锚点与压缩的完整原始 JSON 仅存于 HTML 注释。原始 JSON 从未被改变：`preproc_blocks`、`discarded_blocks`、坐标、分数、布局和额外字段仍可恢复。

**单起始锚点定界**：每个 `<!-- minerujson:block:v1:pageIndex:blockIndex -->` 标识原始 OCR 块的开始；正文到下一 `block` 起始锚点为止。跨页时先结束上一块，再独立验证下一页 `minerujson:page` 等原始证据注释；最后一个块到 `minerujson:source` 原文备份之前结束。格式不再生成 `minerujson:end`。不自动合并跨页、跨栏块，人工段落续接属后续阶段。

**当前无损注释投影**：`toMarkdown()` 在每个 PDF 页的正文块之前追加普通 HTML 注释，记录该页原始元数据、所有 `discarded_blocks`（含页眉、页脚、印刷页码、页脚注释和侧栏）、以及与最终 `para_blocks` 不一致的前处理块。注释包含 PDF 页码、块类型、bbox、识别文字和完整块 JSON。相同的 `preproc_blocks` 与正文只保留一份可见投影，原始字节仍在文档末尾 `minerujson:source:v1` 中；没有未知类型被悄悄改写成正文。

这些备注属于**审阅证据，不是自动确认的正文或注释**。它们在 CM6 源码可见，标准 Markdown 阅读预览不渲染。未经人工决策，不把页眉、页脚或 `page_footnote` 混入正文；直接改动/删除证据注释会使严格 `toMineruJSON()` 往返校验拒绝，而不会默默丢失原始 JSON。对于旧版母文档，可用 V6 根目录 `scripts/v6_annotate_document.mjs` **只插入**这些证据注释：完整保留既有手工修改与章节标定，并在应用前做强制校验和备份。

复杂合并单元格保留为合法的 HTML `<table>`（CommonMark 允许 HTML），而不是伪造 GFM 单元格。数学公式作为标准的 `math` 围栏代码块，**不是**宣称 GFM 原生支持 LaTeX 数学语法。

严格逆转换：一切锚点必须按原来顺序存在；HTML 注释中的原始 JSON SHA-256 必须匹配。支持修改文本、标题层级、图片路径、表格 HTML、独立公式等已有元素，并仅修改对应 JSON 字段。为保留坐标对应关系，**跨多个 OCR span 的文字改动、拆合原有块、添加新的未锚定 Markdown 节点及新富文本嵌套暂时拒绝**，不会默默修改或丢失 MinerU 元数据。后续要扩大编辑能力须通过独立验证，不掩盖为「已无损」。

完整转换是**首次生成**的操作，CM6 负责后续编辑与整篇 MD 保存；该组件不维护编辑状态，也不承担 CM6 的 I/O。HTML 注释记录的是 OCR 原始证据，不是第二份编辑正文。

## 内置真实样本与验收

`fixtures/buffetts-alpha.mineru.json` 是只读样本（22 页，2,347,546 字节）；对应的 `fixtures/buffetts-alpha.minerujson.md` 是单起点、尚未附加页级审计的只读基线，新版可由原 JSON 动态生成，不覆盖旧样本。`npm test` 验证逐字节往返、全部块、Markdown 语法、可支持的各种编辑和数据损坏的拒绝。

```bash
npm ci
npm test
```
