# PDF ↔ Markdown 元素映射 · WP6/8 双向定位与来源验证（2026-10-08）

状态：**WP6 双向定位实现完成，自动化验收通过；人工审核待用户确认。**

## Feature Contracts / 业务操作·条件·效果

- FC-V3-PDFMD-WP6-01：工作目录已经由 Mac Vault 授权并载入 WP4 Sidecar，15 份 PDF/JSON/章节源文件均校验一致后，列表应加入映射允许的 MinerU 原始 MD 与 6 组章节 `.md`/`.working.md` 文件，**不递归遍历**隐藏目录、不把其他文件混入映射。用户通过选择器打开任何这些文件时，必须由 WorkspaceFS stat + 分块 readRange(expectedRevision) + stat + 原文件 SHA256 完整校验；旧版本禁止导航。
- FC-V3-PDFMD-WP6-02：从工作台源码光标位置、AG 文本块行，或 `MD 对应元素` 下拉框定位 PDF。必须由 Sidecar 的唯一 UTF-16 半开锚点得到元素 ID，使用 PDF.js 视口证实 bbox 几何坐标后框选。若一个 AG 行覆盖多个元素，不允许猜一条，改为显式选择。
- FC-V3-PDFMD-WP6-03：从当前 PDF 内容点击一个唯一 bbox，或选择 OCR 元素后按 `定位到 MD`，优先选取唯一工作稿锚点，未唯一则尝试唯一章节稿，再尝试唯一 MinerU 原稿；若同一层有多个候选，必须手动选择。直接打开该来源 MD 并验证 SHA，准确选中 `[from,to)`，仍保留 PDF 高亮。
- FC-V3-PDFMD-WP6-04：切书、切 PDF、源码有外部编辑、歧义、无完整锚点或超过长度限制时，拒绝旧偏移/位置；不会将候选标为人工已审。不提交 WorkspaceFS mutation，不修改 PDF、OCR JSON、MD 或 Sidecar。

## UI Interaction Contracts

- UIC-V3-PDFMD-WP6-01：进入 `Bufett’s Alpha`，当 WP4 校验通过后，`Markdown 文件` 选择器应包含 13 个被授权的映射 MD（原始 1 + chapter 6 × 2）；选中嵌套 working 文件后 CodeMirror 和校对 AG 表显示真实字节内容（只读），源 SHA 必须匹配。检查非映射文件仍按旧限制展示，不借 Sidecar 提权。
- UIC-V3-PDFMD-WP6-02：点击 PDF 第一页一个独占的文本 bbox → 显示该元素唯一 working MD 的源码，选中 UTF-16 真实范围；通过独立 status 与稳定 `data-pdf-md-*` 属性报告 sourcePath 和 from/to；视图区仍停留 PDF 原文，绝无 write 请求。
- UIC-V3-PDFMD-WP6-03：在 MD 对应元素下拉框选择上述元素 → 定位 PDF → 高亮框的 `data-element-id`、PDF 页码匹配原候选；再次按 PDF `定位到 MD` 可返回该章节工作稿。
- UIC-V3-PDFMD-WP6-04：在 CodeMirror 点光标或 AG 行 → 唯一锚点自动跳到 PDF；行覆盖多个锚点显示歧义并要求手选。PDF 点击重叠框亦拒绝自动归因并保留原始选择器。缺失/过期版 Sidecar 或 SHA 不符时只读报错。

## 契约与实现说明

- 独立纯索引 `src/pdfMdBidirectional.ts`：`pdfElementMdTargets`、`mdElementAtOffset`、`mdElementsOverlappingRange`、`pdfElementAtPoint`。不执行文件 I/O，也不把人工状态写入 Sidecar。
- 章节按需加载：`ui-spikes/v3-directory/src/workbench.ts` 只展示 Sidecar 已校验的 13 个候选文件；打开时 stat/read/sha 复检，要求完整读取后才可选择 UTF-16 锚点。
- CodeMirror `WorkingEditor.selectionOffsets()` 暴露当前合法 UTF-16 `from/to`，不从屏幕像素估计源码位置。PDF.js 页点击从已渲染 canvas 的 DOMRect 取得相对坐标，而非页容器/页边距。
- 未唯一锚点由用户明确选择目标；换书/PDF 时撤销 pending navigation 和旧框选。
- 未来 WP7/8 才承接永久人工校阅/标定与状态回写：**WP6 的导航仅代表自动候选，不代表识别结果已经正确。**

## 验收命令

```bash
npm --prefix ui-spikes/v3-directory run test:bidirectional
npm --prefix ui-spikes/v3-directory run test:mapping
npm --prefix ui-spikes/v3-directory run test:regions
npm --prefix ui-spikes/v3-directory run test:ui
node ui-spikes/v3-directory/tests/pdfMdBidirectionalReal.cjs
```

## 2026-10-08 实测结果

- `WP6_BIDIRECTIONAL_INDEX_UNIT_OK`：唯一锚点、重叠元素、跨多个锚点的行选择与不唯一文本证据均按契约处理。
- `WP6_REAL_PDF_MD_BIDIRECTIONAL_BROWSER_PASS`：真实 `Bufett’s Alpha` 第 1 页 `para_blocks:2`，PDF 内容点击 → `/ocr2md/Bufett’s Alpha/chapters/00 Bufett’s Alpha/00 Bufett’s Alpha.working.md` → CodeMirror 精准选中 `[288,453)` → 光标/元素下拉框返回 PDF → 再点击 PDF `定位到 MD`；PDF 框选在 MD 跳转后仍保留、明确清除后正常恢复。13 个真实映射 MD + 一个下拉占位共 14 个选项。全过程 WorkspaceFS 0 次非 GET 请求。
- `V3_MAC_VAULT_HTTP_BROWSER_E2E_PASS`：旧目录、工作台、PDF、MD、授权、配置与布局回归通过。
- `WP4_SIDECAR_CAS_UNIT_OK`：来源哈希、CAS 和冲突保护回归通过。
- `WP5_PDF_OVERLAY_GEOMETRY_UNIT_OK`：90° 旋转页及 bbox 坐标拒绝逻辑回归通过。

人工审核：**待用户审核**。必须目视确认框选与 PDF 的正确文字对应，自动定位只能确认坐标，不会把 OCR 候选写成“人工已审核”。

手动审核入口：https://ocr2md.laity.bid/v3-directory/ （仍需 Mac Vault 的既有授权）。
