# WP14B · 恢复父组末空行、消除 SQL 重建歧义

## 原问题与根因

- WP13 规则：成为子块仅撤掉一条**额外**组间 LF；同一 `(p,b)` 之内只一 LF，不同父组之间保持双 LF（一个空白行）。WP14 规范了每个 `md_block` 的**正文内部换行**，却误把所有父组分隔也改成了一 LF、末组不再有空行。这样重建逻辑表时经 CM6 投影显示完全没有组间空行，违背原有验收。
- SQL 弹窗并非真的有两个相同的「重建逻辑表」按钮，但「重建逻辑表」与「整理逻辑块为单行」用途和措辞易混淆；前者从原始 `para_blocks` 重建整个 `logical_block`，**会覆盖已编辑 MD Block 和 PBS**；后者仅使用 CM6 单次历史事务纠正当前块文本，持久化 `md_block`，**不触碰 PBS**。

## 当前契约与安全门禁

1. `composeLogicalSource()` 严格按 PBS `(p,b)` 判定边界：**同组补足至少 1 LF，父组末（包括最后一组）补足至少 2 LF**。块内部来源于 WP14 新导入的一行 Markdown；只有一个**正文行号**，但独立父组之间可以有额外的**空白行号**。不得以 CM6 全文 `doc.lines === logical_block rowCount` 为验收条件。旧 SQL `md_block` 中原有换行不在加载、拖动中静默删除，虚拟 LF 不写入 SQL。
2. CM6 编辑时的虚拟补尾 `transactionFilter` 与结构拖动使用同一个组边界判定；Undo/Redo 恢复源文本、PBS 及正确组末空行。Markdown 预览仅从唯一 CM6 文本做只读投影，位置映射保持按 logical_id。V1 PDF/AG/Frame 公共源码不改。
3. SQL 组菜单的三个动作：`导入基础表`、`重建逻辑表（覆盖编辑）`、`仅整理正文断行（不重建）`。危险重建首次点击只显示具体覆盖警告，**第二次显式点击**才调用 `logical-rebuild`。正文整理仍二次确认并使用 CM6 Undo/Redo 和 SQL 增量提交。关闭重开对话框必须清除二次确认状态。未授权的用户书籍数据库不自动修改。
4. 浏览器回归曾触发 iPad-WebKit 的 PDF.js 页 DOM 重建后标签丢失：在 V2 `v2-pdf-viewer.js` 的原有 split/unsplit `layout()` 适配层增添一次 500ms **有条件**补绘——只有当前 PDF 页仍然无 PBS 标签时才调用 V1 公共 `repaintOverlayPage()`。不修改 V1 的 PDF 源码、图层算法、书籍/PBS 数据，也不创建第二个 viewer。对应原生 WebKit 两次拆合回归重新通过。

## 必须验收

- 纯 JS：父子归入删除**且仅删除**一条组间 LF，原文及逻辑块 ID 不变；独立父组有空白行，最后一组也保留一条空白行。
- 真实 267 MinerU 逻辑块：每个 `md_block` 文本单行、原始 MinerU 归档不变；源文投影可以有组间空白行，无需 267 个绝对 CM6 行号。
- Chromium/iPad-WebKit：两个 SQL 动作名称区别明确、重建首次点击不发送请求；CM6 编辑/Undo/Redo、PDF 原版标签拖动、Markdown 表格/公式预览、SQL 局部保存与跨版本 AG Grid 过滤门禁均通过。
