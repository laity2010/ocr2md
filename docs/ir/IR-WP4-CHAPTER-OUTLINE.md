# Document IR · IR-WP4/8 · 章节重建与目录树

日期：2026-10-09。状态：**章节提议引擎实现、自动验收通过；人工目视确认尚未进行**。

## 架构决策

- 本航点**只读 IR-WP3 生成的 Document IR**；章节判定仅使用 OCR title/source 以及块阅读顺序，不导入、比对或依赖 MinerU 官方 MD，也不采用既有章节工作稿划分结果。
- `src/documentIrChapters.ts` 提供 `proposeIrChapters`, `listIrChapterTree` 和显式章节编辑操作，均为无 I/O 的纯函数。
- **暂定章节树**由 `IrChapter` 的 `chapterId`, `parentChapterId`, `anchorBlockId`, `depth`, `order`, `name`, `status:"provisional"` 表示。
- `chapterStructure` 记录标题候选及编辑操作日志；**不将算法识别等同人工审核**：所有标题候选均为 `needs-review`；章节即使人工进行了移动/改名，也仍是 `provisional`，待 WP7 设计正式审核凭证。
- 章节和块采用稳定 ID；章节锚点通过 `blockId` 定位，未使用 PDF 页码/MD 行号作为唯一身份。章节边界变化时重新计算逻辑块 `chapterId`，原始 PDF 页码/bbox、OCR 元素、sources、UTF-16 来源区间、正文文本和原始 JSON 均保持不变。
- 允许正文**从一页中间开始**、两章同在一页，以及多页归一章；无需强制一页对应一章。
- WP4 暂不改变 V3 AG 表 / 源码 / PDF 预览 UI；此章节树数据接口供 **IR-WP5** 使用。WP6 才会从 Document IR 生成 MD。

## 标题判定策略与保守边界

1. 先找靠近首页、MinerU `level=1` 且不是明显署名的第一项 `title` 作为**正文主标题候选**，而不是将 level=1 全部视为章节（真实样例第二个 level=1 是作者）。此推断**不保证通用于所有书籍**。
2. `Appendix X`、`References`、`Bibliography`、中文 `附录/参考文献` 等结构性标题提出一级章节候选；只是 OCR 命名模式的提议，不自动标为已确认。
3. 主标题前的原始内容独立收入“**前置内容（待审核）**”容器。它是结构容器而不是凭空制造的 OCR 章节标题。主标题及附录/参考文献下其他 `title` 提议为二级小节。
4. 首页封面/作者署名（以及可能为作者的等级 1 标题）标记 `uncertain`，保留来源证据，不自动切章。特别避免将标题中的 “and” 如“Conclusion and Practical Implications”误识别为作者。
5. 不自动按 `bbox.y` 重排多栏页面；WP3 标注的阅读顺序风险继续保留。章节归属按当前 WP3 **暂定**阅读序列计算，其上层结论也因此是待审核的。

## 主数据模式与验证

- `chapters[]` 为树节点；同一层级的相邻章节可共享同一 PDF 页的不同 OCR 元素。
- `chapterStructure.candidates[]` 包含 `headingBlockId`, `sourceElementIds`, `pageNumber`, `proposedRole` (`root/section/uncertain`), `reason`, `needs-review`。
- `chapterStructure.operations[]` 保留明确人工操作意图/对象/理由，初始为空；未来安全保存需专门的 CAS/UI 航点支持。
- 校验器保证：章/小节各有**唯一锚点**、标题和顺序不重复、深度 1–6、父节点在当前顺序中有效、章节点与块阅读顺序一致、所有块都严格归入当前位置最深层章节、标题候选页码与原始 OCR 来源一致、不得伪造 human reviewed；即使拆段后，原始来源覆盖规则继续生效。
- JSON Schema Draft 2020-12：`docs/ir/schema/document-ir.v1.schema.json`；引用及章节边界交叉不变量在 `src/documentIrV1.ts` 中执行。

## 显式操作 API（当前仅内存测试）

- `explicitMoveChapterBoundary`：指定章节和新的逻辑块起点，整体移动连续区间归属；不能跳过父/子章节约束、不能重复锚点，旧块/来源保持。
- `explicitRenameChapter`：修正 OCR 章节标题在逻辑层的展示名称，不回改原始 OCR `rawBlock`。
- `explicitDemoteLeafSection`：删除一个叶子小节节点，并让其块回到父章节的有效区间。
- `explicitPromoteTitleToSection`：根据真实 OCR title 建立新小节，要求给出父一级章节 ID；所有顺序重新按真实锚点编号。
- 操作需要非空审核理由、结果重新调用完整 `validateDocumentIrV1`；不向真实书籍落盘，也不自动标记人工完成。

## Bufett’s Alpha 实机结果

原始来源：**PDF 22 页；315 OCR 元素（224 正文、91 discarded）**。旧版 17 项 WP3 疑点全部保留，仍为 `needs-review`。

| 暂定一级章节 | PDF 来源页 | 文本块（含子节） | 子节数量 |
|---|---|---:|---:|
| 前置内容（待审核） | 1–2 | 18 | 0 |
| Buffett’s Alpha | 2–17 | 146 | 9 |
| Appendix A: Data Sources and Methodology | 18 | 11 | 4 |
| Appendix B: Decomposing Berkshire Hathaway’s Returns | 19 | 12 | 0 |
| Appendix C: Implementable Systematic Buffett Strategies | 20–21 | 16 | 0 |
| References | 22 | 21 | 0 |
| **总计** | **22** | **224** | **13** |

识别到 **21 个 OCR `title` 标题候选**（含 2 个作者署名等模糊项）：19 个形成暂定章节/小节，**21/21 仍待人工审核**。全部 224 个块已有归属，无孤儿块，没有做任何自动文本改写。

- JSON 语义往返还原 MinerU 原始数据：通过（包括源 metadata、discarded、preproc、rawBlock）。
- 真实书籍上显式边界移动、改名、升降级仅做**纯内存模拟**；生成的 WP4 IR 没有操作应用记录，不会混入假审核结果。
- 生成预览：仓库 `.tmp/ir-wp4/document-ir.v1.json`，大小 **2,256,623 字节**，SHA-256 `f9b25a3d24a88638ab73ece17b04bc2b48d957bdb2a6450849d9d31901188633`，文件权限 0600；同内容重复运行只读，无差异则通过，内容不同则拒绝覆盖。
- Obsidian 工作目录**没有**创建 `.ocr2md/document-ir.v1.json`，原始 PDF/JSON、官方 MD（仅检查摘要，不作为算法输入）、既有 PDF-MD map 的 SHA+mtime 均保持一致。未重启部署、未开放隐藏目录写权限。

## 功能规范与 UIC

- **FC-IR4-1**：提供原始 OCR 标题到章/节结构的保守重建候选，保留每项证据与审核状态，不依赖官方 MD。
- **FC-IR4-2**：为 224 个逻辑块赋予连续章节归属，树视图可按层级列出名称、起始块、PDF 来源页、直辖块和子树总块数；不改变任何来源锚点。
- **FC-IR4-3**：允许显式移动章节边界、恢复/去除叶子节及重命名；非法父子关系、重复锚点、内容覆盖丢失、伪造审核结果必须被拒绝。
- **UIC-IR4**：本航点**没有新增正式 UI 交互**。IR-WP5 加入 AG 表章节列/目录树/标题候选审核入口时，再实现浏览器 UIC 并由用户验收；不可用纯单元测试代替最终目视审核。

## 可重复验收

```bash
npm --prefix ui-spikes/v3-directory run test:ir:chapters
npm --prefix ui-spikes/v3-directory run test:ir:chapters:real
npm --prefix ui-spikes/v3-directory run test:ir:structure
npm --prefix ui-spikes/v3-directory run test:ir:structure:real
npm --prefix ui-spikes/v3-directory run test:ir
npm --prefix ui-spikes/v3-directory run test:ir:real
npm --prefix ui-spikes/v3-directory run test:mapping
npm --prefix ui-spikes/v3-directory run test:review
```

本航点验收状态：**自动测试通过；逻辑章节划分的人工确认待办**。下一航点 IR-WP5 将使 AG 表读取这份统一 IR，而不再仅操作旧 OCR 元素 Sidecar。
