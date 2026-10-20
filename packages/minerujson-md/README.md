# @ocr2md/minerujson-md — V6 WP0

一次性、独立、没有编辑器或文件系统依赖的 MinerU JSON ↔ 标准 Markdown（CommonMark + GFM）转换组件。只导出三个 API：

```ts
import { toMarkdown, toMineruJSON, version } from '@ocr2md/minerujson-md';

const md = toMarkdown(mineruJSONText); // 输入字符串可保留原始 JSON 的每一字节
const json = toMineruJSON(md);         // 输出 MinerU JSON 文本；无修改则原始字节完全相同
const release = version();            // '0.1.0'
```

## 格式契约

输出文件使用后缀 `.minerujson.md`，正文只有 Markdown/GFM 原生节点：标题、段落、图片、HTML 表格，以及带 `math` 语言标记的普通围栏代码块；不自创 Markdown 语法。MinerU 页面/段落锚点与压缩的完整原始 JSON 仅存于 HTML 注释。原始 JSON 从未被改变：`preproc_blocks`、`discarded_blocks`、坐标、分数、布局和额外字段仍可恢复。

复杂合并单元格保留为合法的 HTML `<table>`（CommonMark 允许 HTML），而不是伪造 GFM 单元格。数学公式作为标准的 `math` 围栏代码块，**不是**宣称 GFM 原生支持 LaTeX 数学语法。

严格逆转换：一切锚点必须按原来顺序存在；HTML 注释中的原始 JSON SHA-256 必须匹配。支持修改文本、标题层级、图片路径、表格 HTML、独立公式等已有元素，并仅修改对应 JSON 字段。为保留坐标对应关系，**跨多个 OCR span 的文字改动、拆合原有块、添加新的未锚定 Markdown 节点及新富文本嵌套暂时拒绝**，不会默默修改或丢失 MinerU 元数据。后续要扩大编辑能力须通过独立验证，不掩盖为「已无损」。

完整转换是**首次生成**的操作，CM6 负责后续编辑与整篇 MD 保存；该组件不维护编辑状态，也不承担 CM6 的 I/O。HTML 注释记录的是 OCR 原始证据，不是第二份编辑正文。

## 内置真实样本与验收

`fixtures/buffetts-alpha.mineru.json` 是只读样本（22 页，2,347,546 字节）；对应的 `fixtures/buffetts-alpha.minerujson.md` 只初始化一次。`npm test` 验证逐字节往返、全部块、Markdown 语法、可支持的各种编辑和数据损坏的拒绝。

```bash
npm ci
npm test
```
