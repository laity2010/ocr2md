# PDF ↔ MD 元素关联 · WP1/8 MinerU 原始元素提取（2026-10-08）

状态：**已实现纯数据提取 + 合成样例 + 《Buffett’s Alpha》22 页真实只读验收**。不涉及 PDF Viewer 高亮、MD 还原/匹配、sidecar 存储、UI 状态改变，下一站 WP2。

## 1. 工程交付

- `src/mineruElementExtractor.ts` — `extractMineruElements(source: Uint8Array): MineruElementIndex`。输入必须是**原始 MinerU JSON UTF-8 字节**，而不是重新 stringify 的对象；结果不保存任何文件。
- `src/mineruElementExtractor.test.ts` — 2 页纯内存固定样例，证明 source hash 稳定、ID 唯一、同 `index` 不碰撞、preproc 不重复计算、嵌套题注/表格/公式/图片保留、旋转页尺寸、无效数据明确失败。
- `ui-spikes/v3-directory/tests/mineruElementWp1Real.mjs` — 实际读入真实 JSON，按 WP0 fixture 复验 315 个来源对象并确认 PDF/JSON/MD 文件哈希在提取前后不变。
- `ui-spikes/v3-directory/package.json` — 只读单元与真实测试命令；**不启动服务、不需要 OAuth、不做文件写入**。

## 2. 元素模型 / 不变量

每个元素：`id`、`sourceSha256`、`collection`、`collectionPosition`、`jsonPointer`、`pageIndex`（从 0）、`pdfPageNumber`（从 1）、`pageSize`、`bbox`、`normalizedBBox`、`type`、`mineruIndex`（只作元数据）、`segments`、`normalizedContentSha256`、`rawBlock`。

- **稳定唯一来源 ID**：`mineru:<sha256-of-raw-json-bytes>:p<page_idx>:<para_blocks|discarded_blocks>:<arrayPosition>`。原 JSON 格式化/内容变化都会产生不同的来源版本 ID；规范化内容摘要只用于后续寻找迁移候选，绝不代替来源 ID。
- **保真优先**：`rawBlock` 包含整个 MinerU JSON 元素原貌，包括层级的 `blocks / lines / spans`、原始 `content`、`html`、`image_path`、score、题注和脚注等；额外 `segments` 按原嵌套顺序展平带指针的内容/HTML/图片路径，便于 WP2 还原。
- **正文与审计分流**：`bodyElements` 仅来自 `para_blocks`；`discardedElements` 仅来自 `discarded_blocks`；`preproc_blocks` 不加入，防止重复计数。丢弃项不自动当作已匹配 MD。
- **坐标防护**：验证所有出现的顶层/嵌套层级 bbox 均为有限的 4 数字、`x0≤x1,y0≤y1` 且在 page_size 内；错误抛带 `jsonPointer` 的 `MineruElementExtractionError`，绝不钳制或默默忽略。归一化位置只对 MinerU 视觉页面有效，**没有宣称与 PDF.js overlay 像素完全对齐**。
- **MD 还未匹配**：此 WP 无 MD UTF-16 锚点，无候选置信度和 sidecar；不要把已提取数量当作匹配成功数。

## 3. 实书只读验收

PDF：`Buffett s Alpha.pdf`；JSON：`json/MinerU_Buffett s Alpha__20261008112941.json`；MD：`md/MinerU_markdown_Buffett_s_Alpha_2108158143412957184.md`。

| 项目 | 结果 |
| --- | ---: |
| JSON/PDF 页数 | 22 |
| 正文元素 | 224 |
| 被排除元素 | 91 |
| 全部唯一来源 ID | **315 / 315** |
| 内容 segments | 1,229 |
| 嵌套 blocks | 43 |
| 含 HTML table 的 spans | 8 |
| 公式内容 segments | 20 |
| 图片路径 segments | 39 |
| 正文 lines / spans | 999 / 1,041 |
| 旋转页面样例 | 第 8 / 11 页 |
| PDF / JSON / MD 提取前后 SHA256 | 完全一致 |

**已发现输入本身的不完备性：** 第 5 页的 1 个 `table`（`/pdf_info/4/para_blocks/0`）包含 `table_caption/table_body/table_footnote` 子块，但这些子块都没有 `lines`/HTML；提取器忠实保存它们和 bbox，**不能无中生有还原表格内容**。WP2 应记录为「无可还原文本/结构候选」，并与原 MinerU MD 对照后决定如何处理。

## 4. 复验指令

在仓库根目录：

```bash
npm --prefix ui-spikes/v3-directory run test:elements

npm --prefix ui-spikes/v3-directory run test:elements:real -- \
  "/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha"
```

测试会仅在仓库忽略的 `.tmp/wp1` 下编译测试代码；**不会写入 Obsidian 工作库**，不会自动重建 MD、关联或标记审核。

全仓 `npm run compile` 当前遇到另一条已有 WIP 的编译错误（`src/v3HttpWorkspaceFs.ts:84`，字符串与 `WorkspaceV3ErrorCode` 类型不匹配），WP1 采用仅编译本模块与测试的方法通过验收。后续根仓回归应独立处理该阻塞，不应修改不相关业务实现来掩盖错误。

## 5. WP2 接口

以 `MineruSourceElement.segments` + `rawBlock` 生成 **只读 MD 候选元素**。对标题、文本、图片、公式、表格/图表、引用分别实现类型保真的还原或占位状态；与原始 MinerU MD 进行语义与顺序对照，不允许覆盖任何 `md/` / `chapters/` / working 文件；第 5 页不完整表格必须作为固定异常用例。

人工审核：**待用户审核**。WP1 自动验收并不代表 WP2–WP8 已完成。
