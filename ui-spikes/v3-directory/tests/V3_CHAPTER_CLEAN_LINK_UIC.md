# FC-V3-CLEAN-LINK-001 / UIC-V3-CLEAN-LINK-001

- 功能：章节清洗 AG / Markdown 源码 / Markdown 预览 / PDF 原文双向定位
- 初始状态：Mac Vault 授权；书籍已保存有效 DIRjson；已发布 chapters/*.md；进入章节清洗 → 章节标题。
- 操作：点击 AG 标题；点击 Markdown 预览标题；点击源码中的 Markdown 标题；或点选 PDF 上唯一的本章标题来源框。
- 需要：实际 Markdown 标题行；`<!-- ocr2md-ir:block=... -->` 紧邻标题并且在文件内唯一；DIRjson 已持久化、来源校验通过；PDF 为同一书籍的文件。
- 界面效果：AG 的 H1–H6 样式、字号、颜色、行高与章节定界共用设定；AG 激活标题后 CodeMirror 仅滚动定位该行、不抢夺源码键盘焦点、Markdown 预览滚动并高亮该标题；PDF 关联以原始 OCR 坐标框选或人工页码定位（保留用户选择的预览 tab，不自动抢走 MD）；反向点击明确定位到唯一标题时回到 AG / 源码 / 预览。
- 数据副作用：无；标题序号开关、定位和高亮不修改 Markdown / DIRjson / PDF。编辑源码仍经原有保存/撤销链路。
- 不变量：不得通过相同标题文字、最近页码、旧 WP4 章节路径做模糊配对；未保存或来源不一致的 DIRjson 不自动定位；多个 PDF 命中不擅自选择。PDF 坐标始终按 PDF 页，不是 OCR JSON 页序号。
- 自动化：browser；在临时 Vault 用真实 DIRjson 保存与章节发布流程，不写正式书籍。
- 证据：`tests/chapterPublishBrowser.cjs` 发布后四窗关联回归；`tests/chapterHierarchyBrowser.cjs` H1–H6 展示和没有 DIRjson 时不假造 PDF 链接；`src/chapterHeadingAnchor.ts` 严格来源判定。
- 人工审核：待用户审核（特别是 iPad Safari、真实章节编辑后的 PDF 来源坐标）。
