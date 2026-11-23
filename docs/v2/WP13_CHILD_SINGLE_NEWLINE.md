# WP13 · 子块归入时保留一个换行，不接成一行

> **历史阶段说明**：WP14 已进一步统一所有逻辑块的 CM6 单行规则，包括跨父组严格一个 LF、不再组末补双 LF。以当前 V2 README 和 WP14 文档为准，保留本页为当时修复记录。

## 用户验收要求

- 从独立父块归入另一父组成为子块时，**只去掉自动提供的空白行，不抹掉换行**。示例：原 `父块\n\n子块` 归组后在 CM6 中为 `父块\n子块`，不能成为 `父块子块`。
- 同组 s0/s1/s2 每个逻辑块各起一行。组末仍保证一个可见空白行，不加入第三层子块。
- **原始正文无损是更高的数据安全约束**：如果 SQL `md_block` 本身以多个 `\n` 结束，这些真实保存的空行不因结构操作被裁掉；该例外必须与显示时补出的虚拟 LF 区别清楚。不得为了单行外观悄悄改写书籍正文。

## 实施路径

1. `ui/v2-block-source.js` 是 CM6 唯一拼接函数：相邻同组行不再直接 `A` + `B`；若 A 原文不以 LF 结束，在 A 的显示尾部补一个 `\n`。组末依旧通过 `groupEndPadding` 补齐 `\n\n`。后端 WP03 的 UTF-16 传输 `\n\n` 仍非显示分隔符。
2. 保留已有 `groupEndPad` 接口名以免破坏 CM6 区间映射；语义拓展为块尾**虚拟 LF 数量**（同组 0/1，组末 0/1/2）。`logicalTextRows()` 剔除这一部分，保证 SQL 中每个 `md_block` 与 `logical_id` 不变。
3. `ui/v2-source-session.js` 在实际 CM6 文本编辑中同样维持同组单 LF 和组末双 LF 的**最低显示要求**；用户在显示尾部输入的文本按既有 WP10 逻辑晋升为当前块自己的文字。结构拖动、原生 Undo/Redo、SQL 差量提交仍使用既有 API，无新物理表、额外 CM6 或新历史机制。
4. V1 PDF 标签和 AG Grid 组件、固定源文件及发布流程完全不变。旧 WP08 同组无换行描述归为历史，不得当成当前需求。

## 验收和风险说明

- 直接测试：`tests/v2-block-source.test.mjs`（中文样例、已有 LF/空行、映射与禁止跨块编辑）；`tests/v2-block-source-fixture.test.mjs`（267 真实逻辑行的原文回读）；`tests/v2-structure-move.test.mjs`（拖动、父子编号、原文保留）；`tests/v2-focus-map.test.mjs`。
- 浏览器测试：`tests/v2-mineru-base.browser.test.mjs`、`tests/v2-real-markdown-preview.browser.test.mjs`（真实 CM6、V1 PDF 拖动、AG/PDF 定位及 Undo/Redo，并在 Chromium / iPad-WebKit 运行）。
- 原始 `md_block` 自带多个 LF 时，因为数据保护不得裁剪，投影中仍可能显示人为留出的空白行；**自动补尾**则不会导致父子之间产生空白行。这是明示的边界，不作数据迁移。
