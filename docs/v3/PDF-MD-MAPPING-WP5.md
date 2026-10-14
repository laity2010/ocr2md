# PDF ↔ Markdown 元素映射 · WP5/8 PDF.js OCR 候选定位（2026-10-08）

## 航点范围 / Feature Contract

- FC-V3-PDFMD-WP5-01（只读）：打开一个已经授权的工作目录。**需要** WP4 版本化 Sidecar、PDF 原文及一致的 15 份来源文件。**效果**：通过 WorkspaceFS 校验所有 SHA-256，在当前 PDF 页的“当前页 OCR 元素”选择框中列出元素类型及候选匹配状态；来源失效、Sidecar 缺失、权限错误、PDF 不匹配时不得画框。
- FC-V3-PDFMD-WP5-02（只读）：切换 PDF 页码，选择任一 OCR 元素并点击“定位高亮”。**需要** PDF.js 页面视图尺寸与 MinerU bbox 视觉坐标一致。**效果**：滚动到该 PDF 页候选位置并显示橙色透明框；明确标记“未人工审核”。**禁止**：修改 PDF、MD、JSON 或 Sidecar，错误旋转 bbox，未校验尺寸时以模糊坐标代替。
- FC-V3-PDFMD-WP5-03（只读）：用户清除高亮、换 PDF、翻页、切工作目录。**效果**：不保留旧页/旧工作目录的误导性高亮；重新打开 PDF 时只能从新授权映射开始，旧异步加载结果作废。

## UI Interaction Contract

- UIC-V3-PDFMD-WP5-01：初始无工作目录 → 选中 `Bufett’s Alpha` 并设为工作目录 → PDF 显示原文且映射状态从“校验中”到“已校验映射 224 项”；数据副作用：WorkspaceFS `stat/readRange`，**无 commit**；自动化：Chrome 实机只读脚本 `tests/pdfElementOverlayReal.cjs`；人工审核：待用户审核。
- UIC-V3-PDFMD-WP5-02：PDF 第 4、8、11、22 页切页 → 选择候选元素 → 定位高亮。预期：bbox 百分比与 WP4 Sidecar 同一 `elementId`、`pdfPageNumber`、`normalizedBBox` 吻合；90° 页不二次旋转；无对应元素则禁用；自动化：同脚本的 DOM 页面/像素尺寸/旋转矩形校验；人工审核：待用户审核。
- UIC-V3-PDFMD-WP5-03：清除框选 → 仅删除视觉叠加层；切页/换 PDF 清除旧高亮。无持久化或写请求。自动化：同脚本；人工审核：待用户审核。
- UIC-V3-PDFMD-WP5-04：来源发生外部改动，或 PDF 页 viewport 纵横比和 OCR 不匹配 → 禁止画框，状态显示 STALE/COORDINATE_MISMATCH；自动化：`npm --prefix ui-spikes/v3-directory run test:regions` 与 WP4 Sidecar CAS 单测；人工审核：待用户审核。

## 关键技术约束

- 使用官方 PDF.js `PDFViewer` 的 `.page` 容器叠加层，不接管 canvas、不把 PDF 导出成图片。bbox 来源是 MinerU 已旋转的**视觉坐标**，归一化转换 `[x0/W,y0/H,x1/W,y1/H]`；绝不对第 8、11 页二次旋转。
- 调用 PDF.js `getPage().getViewport({scale:1})` 检验纵横比，与真实 DOM page 内容尺寸同时比较。差异超过 2% 或 normalizedBBox 与 bbox 不相符，拒绝绘制。
- 浏览器数据只读。选择工作目录时校验 Sidecar 的全部来源文件；定位不写入人工确认状态。WP6 才做 MD/AG 行触发及反向 PDF→MD 跳转，避免把 WP5 候选框当成双向校对已完成。
- 真实 PDF/JSON/MD 仍保留在用户 Vault，测试脚本只从中读取；不向代码库复制任何文档正文。

## 验收命令

```bash
npm --prefix ui-spikes/v3-directory run test:regions
npm --prefix ui-spikes/v3-directory run test:mapping
npm --prefix ui-spikes/v3-directory run test:ui
node ui-spikes/v3-directory/tests/pdfElementOverlayReal.cjs
```

## 自动验收记录

- `WP5_PDF_OVERLAY_GEOMETRY_UNIT_OK`：常规页面与第 8、11 页旋转页；非法 bbox、坐标不一致拒绝。
- `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`：既有工作台目录、授权、PDF/MD 预览、分栏和临时目录安全操作回归通过；修复了测试对 PDF.js canvas 私有属性 `data-pdf-page` 的错误依赖，改为官方页面容器 `data-page-number`。
- `WP4_SIDECAR_CAS_UNIT_OK`：V3 Sidecar 创建、替换、版本冲突、失效与权限回归通过。
- `WP5_REAL_PDF_OVERLAY_BROWSER_PASS`：Chrome 实机连续检验 PDF 第 1、4、8、11、22 页，逐页真实 canvas 坐标对齐误差 < 2%，实际观察值接近 0（DOM 子像素舍入）；每页 canvas 均已实际渲染；iPad 宽度下水平溢出 0。
- 此验收只能证明 OCR 候选 bbox 已准确绘制于 canvas 的指定位置，**不能证明 MinerU 已经识别对了文本内容或 bbox 围住了正确语义对象**；人工目视对照仍必要。
- 不引入人工审核写回，且只读浏览器脚本明确拒绝 WorkspaceFS 非 GET 请求。

自动化验收：**通过**。人工审核状态：**待审核**（用户仍需目视确认候选框确实对应正确内容）。浏览器服务链接：`https://ocr2md.laity.bid/v3-directory/`。
