# PDF ↔ Markdown 元素关联 · WP0/8 基线与映射契约（2026-10-08）

状态：**WP0 只读基线与规范已完成，固定脚本复验 39/39 通过；元素高亮的像素级坐标可视化仍留待 WP5 审核**。
范围：仅定义 PDF/MinerU JSON/原始 MD/章节 MD/working MD 的身份、坐标和关联关系。**不写入源文档，不改 PDF.js Viewer，不提前假定匹配成功。**

## 0. 唯一真实样例

工作区逻辑路径：`/ocr2md/Bufett’s Alpha/`（挂载根是 Obsidian Vault Root）。具体 Mac/iCloud 物理路径只由 WorkspaceFS 授权适配层掌握，绝不写进业务索引。

| 相对路径 | 职责 | 当前实测 |
| --- | --- | --- |
| `Buffett s Alpha.pdf` | 原始证据 / PDF.js 显示 | 1,474,904 B，22 页 |
| `json/MinerU_Buffett s Alpha__20261008112941.json` | OCR 结构和定位基线 | 2,347,546 B，MinerU 3.4.4、hybrid、`_ocr_enable=false` |
| `md/MinerU_markdown_Buffett_s_Alpha_2108158143412957184.md` | MinerU 原始 MD 文本基线 | 83,966 B |
| `.ocr2md-merged.working.md` | 合并工作文本 | 83,966 B，**字节数相同但 SHA 不同** |
| `chapters/**/{chapter}.md` / `{chapter}.working.md` | 章节与人工修改的工作文本 | 主章节原稿 67,670 B，working 64,009 B，**不得覆盖** |

固定只读期望值：PDF 22 页；`pdf_info[].page_idx` 完整为 0…21；`para_blocks` 共 **224** 个（title 21、text 143、image 7、table 9、chart 4、interline_equation 20、ref_text 20）；`discarded_blocks` 共 **91** 个（header 24、footer 39、page_number 21、page_footnote 1、aside_text 6）；正文 999 行 / 1,041 spans；全部 315 个顶层 bbox 四元数组有效且落在对应 JSON 的 page_size 内。

## 1. 页码、页面尺寸与坐标（必须先于高亮）

- JSON 的 `page_idx` 从 **0** 开始；PDF.js `currentPageNumber` 从 **1** 开始。关系为 `pdfPageNumber = page_idx + 1`，**不等于 PDF 页脚印刷页码**。
- `page_size=[W,H]` 采用 MinerU 读取的页面视觉坐标尺寸；`bbox=[x0,y0,x1,y1]` 是该坐标系中的矩形。WP0 只验证 JSON 内边界；**坐标与真实页面内容的像素级重合度尚需 WP5 可视化验证**。
- 第 1 页：JSON `[634,833]`；PDF.js `page.view=[0,0,634.32,833.04]`，取整差是预期情况。常规页面 PDF.js 视口 `594×783`。
- **第 8、11 页 PDF.js `page.rotate=90`**、源页框 `594×783`、可视 viewport `783×594`，MinerU 的 `page_size` 也是 `[783,594]`。绝不可假设全部 PDF 都未经旋转，也不可重复旋转这两页的 bbox。
- WP5 的优先实现：用相对于**PDF.js 已旋转可视页面内容区域**的归一化坐标，`[x0/W,y0/H,x1/W,y1/H]`；叠加层尺寸跟随实际 page viewport，与页面外边框、居中 margin 和 CSS padding 分离。缩放/旋转/裁剪要复验实际 DOM 和 `getViewport().transform`；存在尺寸比或裁剪异常时停止自动定位并提示待校准，不能假高亮。
- 空 bbox、NaN/Inf、坐标倒置、越界、未知页面均应在 WP1 检查时显式报告；**不得静默 clamp 后误称准确匹配**。同一 PDF 元素可由多个 span、line 或子 block 构成；分级坐标必须保留。

## 2. 来源元素身份（WP1 实施要求）

- 只将 `pdf_info[].para_blocks` 计入正文基线；`preproc_blocks` 是相同阶段的另一视图，**不重复计数/渲染**。`discarded_blocks` 独立保留为审计候选，不自动合并进 MD。
- 唯一来源键使用 `(ocrJsonSourceHash, page_idx, collection, arrayPosition)`，例如 `mineru:<jsonSHA256>:p3:para_blocks:0`。集合只能是 `para_blocks` 或 `discarded_blocks`，不要使用可能重号的原始 `index` 替代 arrayPosition。另保存 `jsonPointer` 如 `/pdf_info/3/para_blocks/0` 方便回溯；原始 `index` 仅为元数据。
- 源元素指纹 `ocrJsonSourceHash` 根据 JSON 原文件的 SHA-256 生成；同一次导入的 ID 不因工作 MD 编辑改变。**JSON 重新 OCR/重导入会生成新身份空间**；旧映射只能做候选迁移，不可以静默沿用旧 ID。
- 每个来源元素至少保留 `type, page_idx, page_size, bbox, lines/spans or blocks`、规范化内容指纹和原始 JSON 指针；表格/图表须保留 `table_caption/table_body`、`chart_caption/chart_body` 的子块，避免只定位表体而漏掉题注。图片保留 `image_path`；公式保留原始表示，不擅自改写。

## 3. MD 文本身份与范围

- MD 是独立的**可编辑**文件，MD 元素与 JSON 元素 **不能以相同下标/行号默认为匹配**。MinerU 导出的 MD、章节 MD、工作 MD 在拆章/清洗后可能不同。
- 定位文本锚必须带 `workspaceId + vaultRelativePath + revision/contentHash + ranges`；`range` 采用 **UTF-16 code unit 的半开区间 [from,to)**（与 JS/CodeMirror 一致），如需行列辅助显示则采用 1-based line/column。禁止从 byte offset 与 Unicode 字符下标直接混用。
- 为抵御工作 MD 编辑，除了文本范围，还记录规范化文本哈希、上下文（前后邻居）哈希、文档结构与类型。重新打开时先校验 `revision`、再尝试用文本/上下文恢复；不能唯一恢复则 `stale/ambiguous`，要求人工确认。
- 映射关系是**多对多**：跨页段落、拆段、合段、题注、列表都可为 `1:N / N:1`，一条关系容纳多个 PDF bbox 与多个 MD ranges。不将元素 ID、隐藏标签或定位标记写入用户的 MD。
- 文本/公式/HTML 表格/图片比对须按类型做保守规范化，只有高置信度且无冲突的候选才可自动关联；重复标题或相似段落必须保留歧义。

## 4. WP4 sidecar 预定协议（此 WP **不创建**）

预定 `.ocr2md/pdf-md-map.v1.json`，写入之前需先完成安全 CAS/版本检测；内容是**派生索引**，可依据 PDF/JSON 和当前 MD 重建，不能成为独一份的业务原文。其记录至少包含：

```json
{
  "schemaVersion": 1,
  "workspaceId": "obsidian-ocr2md",
  "pdf": { "path": "/ocr2md/Bufett’s Alpha/Buffett s Alpha.pdf", "sha256": "<sha256>" },
  "ocr": { "path": "/ocr2md/Bufett’s Alpha/json/<source>.json", "sha256": "<sha256>" },
  "relations": [
    {
      "ocrElementIds": ["mineru:<ocr-hash>:p3:para_blocks:0"],
      "pdfRegions": [{ "pageIndex": 3, "bbox": [68,111,538,458], "pageSize": [594,783] }],
      "mdAnchors": [{ "path": "/ocr2md/Bufett’s Alpha/chapters/<chapter>/<chapter>.working.md", "revision": "<revision>", "rangesUtf16": [[0,10]], "contextHash": "<hash>" }],
      "matchStatus": "unverified",
      "evidence": { "method": "type-and-content", "confidence": null }
    }
  ]
}
```

示例中的占位符和文本范围**不是实际匹配结果**，只说明模型。状态至少区分 `unverified`、`candidate`、`verified`、`ambiguous`、`unmatched_pdf`、`unmatched_md`、`stale`、`ocr_error`；人工审核标记独立于自动评分。文件写入/版本冲突处理不属于 WP0。

## 5. 固定验收入口与未决风险

- 只读检查：`node ui-spikes/v3-directory/tests/pdfMdMappingWp0.mjs "<真实工作目录>"`。
- 元数据期望：`ui-spikes/v3-directory/tests/fixtures/buffett-alpha-wp0.json`。该夹具只含统计/页面元数据和 SHA-256，**不拷贝用户 PDF/JSON/MD 内容到仓库**。源文件 SHA 改动应明确报告新版本，需要人工决定更新基线，测试不能自动覆盖期望。
- 样例页面：第 1 页标题、第 4 页表格、第 6 页公式、第 8/11 页旋转表格、第 22 页参考文献。
- 当前已确认 **PDF↔JSON 页数/尺寸兼容**和 JSON bbox 结构完整；尚未完成坐标的可视化重合度、JSON→MinerU 原始 MD 的逐元素输出等价、MD→chapter/working 锚点匹配，也尚未完成任何 PDF↔MD 关联。
- **WP1 门禁**：实作类型保真的 element extractor，给 224+91 个来源块唯一 ID，保留原始 JSON 指针和位置，测试 8/11 页旋转、题注与 discarded 单独分类；只读输出，不生成/覆盖任何 MD。
- 旧的 `WP5-PDF-ORIGINAL-WORKBENCH.md` 记录过单页渲染初期架构；当前官方 `PDFViewer` 已另行接入。后续定位扩展基于官方 Viewer，不退回自制单页渲染。

**人工审核：待用户审核 WP0 规范；WP1–WP8 不会被标记为已完成。**
