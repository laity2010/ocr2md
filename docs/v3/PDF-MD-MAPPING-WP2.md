# PDF ↔ Markdown 元素关联 · WP2/8 MinerU JSON → 原始 Markdown 候选（2026-10-08）

状态：**WP2 数据层已实现，单元+实书只读验收通过，业务 UI 与工作 MD 尚未关联；人工审核待执行。**

## 1. 目标及严格边界

- 接受 WP1 已提取的 `MineruSourceElement`（保有 JSON 来源 ID、PDF 页、bbox、类型、rawBlock/segments），还原为**可追溯的原始 Markdown 候选片段**。
- 与 `md/MinerU_markdown_*.md` **只读**比对，生成元素级证据、匹配状态和原始 MD 中 UTF-16 半开文本范围。不基于文件行号猜页面，不将“唯一文本出现”冒充真实 PDF/MD 审核确认。
- **明确排除** `discarded_blocks` 的普通 Markdown 自动匹配，保留其作为单独审计来源；**不写 `.ocr2md` sidecar / 原始 MD / working MD**，不修改 PDF Viewer，不重构章节文件。

工程接口：
- `src/mineruMarkdownReconstruction.ts`：`reconstructMineruMarkdown(element)`、`compareMineruCandidateWithOriginalMd(candidate,originalMd)`、`compareMineruIndexWithOriginalMd(index,originalMd)`。
- 候选保留 `elementId`、`pageIndex`、`type`、`parts[]`（子元素类型、来源 JSON 指针、提议 Markdown、检索文本）、`proposal`、`reconstruction`、`warnings`。
- 对照结果保留 `state`、每个子片段的定位 `rangesUtf16` / `fragmentEvidenceUtf16`；所有偏移均为原始 MD 的 JavaScript UTF-16 索引。WP3 将凭 `elementId` 回查 WP1 的 PDF 坐标、凭原始 MD 范围对接章节与工作稿。

## 2. 类型还原规则（保守、不重跑 OCR）

| MinerU JSON | Markdown 候选 | 注意 |
| --- | --- | --- |
| `title` | 原始 heading level + `#...`，文本独立候选 | 原始 MD 中可能有重复标题；不得默认为同一元素 |
| `text` | 按 OCR lines/spans 顺序拼段落；保留 `merge_prev` 警告 | 不擅自合并跨页/跨块段落 |
| `ref_text` | 引文/参考文献正文 | 当原始 MD 字符有纠正或拆行时可能无法直接找到 |
| `interline_equation` | `$$` 包围的原始 LaTeX 内容 | 不计算/改写公式、不把公式截图强制当 MD 内容 |
| `image` | `![image](image_path)` | 只保留 URL 字面量，不发起网络请求/下载 |
| `table` | 依次保留 `table_caption`、表体 HTML、`table_footnote` | 如果 JSON 不提供 HTML 或文本，**报缺失**，不猜表格内容 |
| `chart` | caption、图路径及注释为分离 parts | 多子块可能不相邻或顺序不同，不能直接认定全体匹配 |

**多 part 独立定位**：一个 PDF 表格可拆成标题、HTML、表注，获得多个原始 MD 范围；单一 `elementId` 可以对应多个范围。生成 `proposal` 仅作校验/候选展示，不将其写回原始 MD。

## 3. 对照状态与置信边界

- `unique`：类型化候选的全部 parts 在原始 MD 内**各只有一个完整字符串/空白规范化匹配**，且 part 的定位顺序单调。**仅表示原始 MD 唯一文本位置候选，绝不等于经人工验证的 PDF/MD 真匹配。**
- `ambiguous`：相同证据有多个出现位置，或完整 parts 位置顺序冲突；不自动选择第一项。
- `partial-evidence`：仅有部分子元素能完整定位；或长段落有两处独立且按顺序出现的局部片段。局部片段**不会**产生一个冒充完整文本的 `rangesUtf16`。
- `not-found`：现有还原文本未能在原始 MD 获得足够强的证据。并不证明 OCR 错误、MD 缺失或定位不可恢复。
- `unavailable`：JSON 本身无法重建 Markdown 片段（例如 `lines:[]` 或空表）。不伪造表格/文本内容。

在 WP2 中不执行多文档段落合并/重排、模糊语义匹配、翻译匹配或对工作稿的写回。此处**完全不生成 verified 关联**；后续 WP3 对接 MD / chapters / working 时才能结合上下文、唯一性、人工审计推进。

## 4. 《Buffett’s Alpha》真实只读结果（22 页）

输入仍为 WP0 固定 SHA-256 的 PDF / MinerU JSON / 原始 MinerU MD。

| 状态 | 数量 |
| --- | ---: |
| 全部来源正文块 | 224 |
| 唯一位置候选 `unique` | **128** |
| 局部证据 `partial-evidence` | **41** |
| 歧义 `ambiguous` | **7** |
| 未找到足够证据 `not-found` | **39** |
| 无内容可还原 `unavailable` | **9** |
| `discarded_blocks` 独立保留，不参与正文对照 | **91** |
| 人工确认的完整 PDF ↔ MD 关联 | **0（WP3 之后）** |

分类型重要现象：
- 标题 21 个：15 唯一、6 歧义；不能凭标题文本相同决定 PDF 页来源。
- 正文 text 143 个：66 唯一、31 局部证据、38 未找到、**8 个 JSON 的 `lines` 为空**；部分正文在 MD 中经过合并、样式转换或 OCR 清洗，原因尚未逐项核实。
- 图片 7 个：7 个唯一（以 Markdown 图片链接为证据）。
- 公式 20 个：20 个唯一（以原 LaTeX 内容为证据）。
- 表格 9 个：8 个部分匹配、**第 5 页 1 个完全不可还原**（`/pdf_info/4/para_blocks/0` 子块虽有 caption/body/footnote 分类但 `lines` 全空）。完整 HTML 可从其他 8 个表格读取，但有题注/表注差异，因此不误称整张表已唯一对应。
- 图表 4 个：1 唯一、2 局部证据、1 歧义。
- 参考文献 20 个：19 唯一、1 未找到。

特别注意：`39 not-found`、`41 partial-evidence` 都是**目前规则没有获得完整且唯一的文本证据**，不是 80 个错误，也不代表 JSON→MD 的丢失数量。WP3 需要区分 MinerU 本身合并/拆段、文本格式转换、标题引用重复、缺失等原因。

## 5. 自动验证命令

仓库根目录：

```bash
npm --prefix ui-spikes/v3-directory run test:markdown
npm --prefix ui-spikes/v3-directory run test:markdown:real -- \
  "/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha"
```

- `src/mineruMarkdownReconstruction.test.ts` 覆盖正文断行、`merge_prev`、重复标题、UTF-16 emoji 范围、内嵌图像、HTML 表格、图注与公式、子块乱序、空表/空文本、文本插入格式导致的局部证据与 `discarded_blocks` 排除。
- `ui-spikes/v3-directory/tests/mineruMarkdownWp2Real.mjs` 从指定真实库只读打开 PDF/JSON/原始 MD，依据 WP0 fixture 复核 SHA、224 元素归因、原始 MD UTF-16 定位边界、独立表格/公式/图片异常及提取前后源文件哈希一致；**只在 stdout 打印汇总**。
- TypeScript 独立编译输出在仓库已有的 `.tmp/wp2`，**不会写入工作目录**。全仓 `npm run compile` 仍存在上一阶段发现的无关 `src/v3HttpWorkspaceFs.ts:84` WIP 类型报错；本航点不改动它。

## 6. WP3 接口和限制

WP3 以 `unique` / `partial-evidence` 与原始 MD UTF-16 anchor 为输入，建立 MinerU 原始 MD → 章节 MD → 工作 MD 的有版本关系；优先处理**可严格验证的唯一锚点**，再靠上下文/邻接顺序处理歧义和被合并的段落。未匹配、不完整和重复元素应在 AG Grid 的独立审核队列显示，不得按 PDF 页码/数组序号盲连。

人工审核：**待用户审核（非自动标记已通过）**。
