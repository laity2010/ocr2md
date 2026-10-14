# V3 · 已发布 MinerU 旧章节 → Obsidian Markdown（安全迁移）

> 2026-10-12 产品规则更新：清洗顶栏不再显示“规范化 Obsidian MD”按钮。新章节由“发布章节”直接输出 Obsidian MD；已发布旧章节的可撤销转换内核保留供兼容测试/将来明确迁移流程使用，**本文件以下所述按钮流程仅为历史验收记录，不再是当前 UI 契约**。现行顶栏规则见 `V3_CLEAN_MODULE_TOOLBAR_UIC.md`。

Feature Contract: `FC-V3-LEGACY-OBSIDIAN-MIGRATE-001`
UI Interaction Contract: `UIC-V3-LEGACY-OBSIDIAN-MIGRATE-001`
状态：**自动回归通过；iPad Safari 用户验收待完成** (`manual-external`)

## 原因与复现

Buffett’s Alpha 的 `chapters/` 首次由旧版投影于 2026-10-10 发布，保存的 `chapters/.ocr2md-published.v1.json` 带有首次发布 SHA。2026-10-11 22:44 第一章人工编辑过，现有 6 个 MD 中仅第一章不再匹配发布标记原始 SHA。虽然 V3 新规范化投影已在发布管线生成 `$$...$$` 与原生 `<table>`，**严格防覆盖**导致不能把它重新发布进已有 `chapters/`；旧章节仍含 12 个 ` ```math ` 与 7 个 ` ```html `。该问题不是 Markdown 样式未同步，是“已发布章节安全迁移操作缺失”。

## 用户操作 → 需要 → 效果

用户在 V3「章节清洗」使用章节导航进入原先发布的 `chapters/*.md`，顶部有 `规范化 Obsidian MD` 按钮：

- 只有当前章节有可识别的 MinerU `math/latex/tex` 或安全的 HTML `table` 围栏时按钮可用；否则禁用。选择该按钮显示确认框，明确**只规范化当前章节的草稿**，不会覆盖其它章节。确认框报告可转换公式数、表格数、不能安全转换的表格数及保留待审核的表格内公式数。
- 对每条 ` ```math `、`latex`、`tex` 数学围栏，仅把首尾分隔符改为 `$$`，公式主体不修改、行号不移动。合法 HTML 表格围栏使用白名单转为 Obsidian HTML，并把表格内 `<eq>` 保留为 `<code class="ocr2md-latex-pending">原 TeX</code>`，交 LaTeX 模块逐个修正；外域图片、危险 HTML 与未知格式保留原代码围栏（绝不把恶意代码放入 Obsidian 文档执行）。
- 用户历史的段落人工校对、标题修改、Markdown 图片、注释锚、`<!-- ocr2md-ir:block=... -->` 和不相关代码块逐字符保留。规范化后**仅更新浏览器源码草稿**，真实 Vault 旧章节尚未变化，AG/源码/MD 预览同步、撤销一次可恢复，重做可重新应用。人工检查后点击原 `保存章节`，通过现有 CAS、Mac 协调替换和保存 SHA 读回落盘。其它 5 个章文件、DIRjson、PDF、MinerU JSON、发布原始标记不可改动。
- 完成后重新打开章文件能直接以 Obsidian 原生 Markdown 渲染公式和表格，不再依赖 V3 预览器的旧版围栏兼容适配。再次点击规范化按钮应处于禁用状态（幂等）。
- `saveChapter` CAS 如果检测文件被 iCloud/Obsidian/另一页面同时修改，必须拒绝覆盖，并在草稿保持可恢复；未授权、未进入章节、正在保存时不允许修改。该操作不进行图片外链下载，图片下载只属于媒体模块的独立显式操作。

## 实际书籍只读确认与回归

- 真实 Obsidian Buffett 第一章 **只读**样本：`79,299` 字节、12 个 math 围栏、7 个 html 表格、3 个表格内待审核公式；投影后不残留上述围栏，内容幂等、物理行数 506 → 506，不触动实际文件。
- `src/normalizeMineruChapter.test.ts`: 纯函数测试保证代码围栏不会误转换、损坏表格保留、表格内 TeX 不丢、保留用户修正文本、行数不变、幂等。
- `npm run test:clean:normalize-legacy`（Chromium + WebKit）：使用 Buffett 第一章**复制到随机临时 Vault**并写入测试发布标记，打开清洗后按钮可用；确认后源码草稿修改、旧真实文件字节不变；Undo → Redo；用户显式保存后 CAS 生效、章文件落盘；从目录重新打开，7 张 HTML 表格与 12 个 KaTeX 公式原生渲染、V3 临时 Math 围栏适配计数归零；恢复后规范化按钮禁用。两个内核均需通过。
- 原有 `chapterPublishBrowser.cjs` 继续保证：新章节发布时生成为 Obsidian 格式，旧章节不能通过重复“发布”覆盖修改；`irWorkbenchBrowser.cjs` 保证 DIRjson 和 PDF 关联不退化。
- 真实 iPad Safari 对按钮、弹框、源码定位、撤销/重做、保存后显示的验证为**待用户审核**。没有触碰真实 Buffett chapters/。
