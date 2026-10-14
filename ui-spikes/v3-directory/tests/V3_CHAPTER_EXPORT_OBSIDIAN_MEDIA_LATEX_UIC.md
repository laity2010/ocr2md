# OCR2MD V3 · 章节导出 Obsidian MD / 媒体与 LaTeX 三窗清洗

- Feature Contract: `FC-V3-OBSIDIAN-CHAPTER-MEDIA-LATEX-001`
- UI Interaction Contract: `UIC-V3-OBSIDIAN-CHAPTER-MEDIA-LATEX-001`
- 自动化状态：纯函数、Chromium、WebKit、隔离 Vault 图片下载及完整 IR/章节发布回归 **已通过**。iPad Safari 真机阅读、真实外网图片服务受网络和用户授权约束，`manual-external`，**待用户审核**。

## 用户目标

1. **章节定界 → 保存 DIRjson → 发布 chapters/*.md**。生成的章文件应该是 **Obsidian 兼容的 Markdown**，而不是要求阅读器解释 MinerU 私有的 ` ```math ` / ` ```html ` 围栏。
2. `章节清洗` 模块有 `章节标题`、`媒体`、`LaTeX` 入口。媒体包含图片/图表来源、原生 HTML 表格和需要审核的外部媒体。LaTeX 包含行内 `$...$`、`\(...\)`、独立 `$$...$$`、`\[...\]`、`math/latex/tex` 围栏及表格 `<eq>` 残留/未清洗公式。AG 行选中定位到可编辑 CodeMirror 源码和有**唯一证据**的 PDF 原文，PDF 反点能回到对应模块元素；无准确 OCR 来源不猜 PDF 页码/位置。
3. 只在用户明确按“下载图片”时复用 V2 的 HTTP(S)、公有 DNS、重定向及最终地址校验、图片类型嗅探、20 MiB 大小限制、下载进度/失败处理，保存到本书 `chapters/imgs/<内容哈希>.png|jpg|webp|gif`，将该章节中该来源的 MD 图片引用改为本地 `imgs/...`。重复来源去重；已下载项不能重复下载。
4. 原文、已保存的 DIRjson、MinerU JSON、PDF、其它章节一字节都不修改。章清洗只在**已发布的章文件**上操作，CAS 校验、保存后版本复查，撤销重做支持人工源码编辑。任何已存在人工编辑过的 `chapters/`，再次发布严格禁止覆盖；下载中版本变化时不覆盖，新图可能暂时成为可清理的未引用附件。

## 初始状态 / 操作 / 预期 UI

- 进入 `Obsidian/ocr2md/ocr2md/Bufett’s Alpha`，在章节定界确认独立章界、执行“保存标定”和“发布章节”。在 Mac 侧使用已保存的不可变 DIRjson 来生成章 MD，不上传 iPad 上的大 ZIP，不重新猜章名、不覆盖原有用户章节。
- 生成 `interline_equation` 的正文使用 `$$\n<原样 TeX>\n$$`；安全且结构完整的 HTML 表格输出 `<table>` 原生块，保留行列合并。MinerU 的 `<eq>TeX</eq>` 是非标准 HTML，导出为 `<code class="ocr2md-latex-pending">TeX</code>`，TeX 内容保持原样、可在 LaTeX 模块定位并手动校对；不冒充公式已成功解析。不支持的 HTML/危险资源保留原始代码围栏以待审核，不执行脚本、不下载外域资源。来源映射仍在 IR 和各块 `<!-- ocr2md-ir:block=... -->` 中，不丢失。
- 未下载的外部图片按来源链接保留（仅链接、不自动载入），媒体模块列明未下载。点击“下载图片（N）”前如章节有未保存草稿，按钮禁用；点击下载后单个文件逐条下载、写入并 CAS 替换，失败不吞掉先前成功的项目；成功源链接变成本地内嵌图片，Obsidian 可随 iCloud 同步读取。网络不可用/图片来源失效时保留外链和明确失败状态，不伪造本地图片。
- `媒体` AG 列出表格与图片；`LaTeX` AG 列出所有标准和非标准公式；点击 AG 行定位到**源码当前物理行**，其中 `ocr2md-ir:block` 仅在已验证的章归属和稳定保存状态下作为 PDF 来源使用。行内/单行公式仍是源码中的实际编辑范围；编辑保存后 AG 列表即时重算，撤销重做恢复。
- 章节定界原有 `章节标题` 筛选与编号，工作台 PDF 预热，MD 预览 V2 样式，DIRjson 全书源码、IR 校验等不退化。

## 自动化场景

- Pure projection: `src/documentIrMarkdown.test.ts`，`src/chapterElementCatalog.test.ts`，`src/obsidianTableSanitize.ts`。重复投影必须确定性；生成归属、block/range、UTF-16 范围、SHA、IR 字节和 PDF 来源一致。恶意/不支持 HTML 拒绝转换，行列合并保留，数学原文不被修复/吞掉。
- 真实书籍**只读**检查已保存 DIRjson：Buffett’s Alpha 投影 6 章、8 张原生 HTML 表、40 条标准 display math、0 ` ```html ` / ` ```math ` 残留，其中 3 个 `<eq>` 标明待清洗；19 个外部来源链接保留。只把由 IR 计算的第一章 MD 临时写到系统 tmp 用于 UI 测试，绝不回写真实 `chapters/`。
- `OCR2MD_TEST_MEDIA_LATEX_MODULES=1 OCR2MD_TEST_REAL_FENCED_TABLE_PATH=".../chapters/01 Buffett’s Alpha.md" node tests/chapterHierarchyBrowser.cjs` + `OCR2MD_TEST_WEBKIT=1`：真实已发布的老 MinerU 第一章为只读测试副本，媒体 AG 19 项，LaTeX AG 至少 12 项、实际 20 项；AG 可定位编辑器，切换不触发任何 Vault 写入或自动下载。
- `OCR2MD_TEST_CANONICAL_ONLY=1 OCR2MD_TEST_REAL_FENCED_TABLE_PATH=/tmp/ocr2md-v3-buffett-canonical-review-only.md node tests/chapterHierarchyBrowser.cjs` + WebKit：原生 Obsidian 格式第一章 7 张 HTML 表、12 个 KaTeX display math、0 代码围栏、原远端图片来源仍作为 12 条 inert 链接，0 图片自动载入/写入。
- `python3 ui-spikes/v2/tests/v3ChapterMediaDownloadSmoke.py`：在隔离 Vault 与 mock 图片字节中执行**真实 Mac 保存代码**，本地 imgs/ 落盘、两个引用正确替换、版本一致；旧 CAS 必须拒绝且不会再次下载，未引用图片 URL 必须拒绝。
- `node ui-spikes/v3-directory/tests/irWorkbenchBrowser.cjs`、`chapterPublishBrowser.cjs`、`chapterHierarchyBrowser.cjs`：完整 IR 编辑、章节发布幂等与禁止覆盖用户修改，V2 样式回归。

## 安全及非目标

- 不能直接重发覆盖用户现有 `chapters/`；更新投影只对尚未发布的章节生效，旧章只能人审清洗。
- 下载不得在打开工作目录、生成 IR、切换模块、预览时自动启动；按钮是独立显式行为。受限图片二进制从未写入不可变 DIRjson。
- 不根据 OCR 文字推断缺失 PDF bbox，不声称不可靠 Math OCR 已自动修好。
- 真实 iPad Safari 和实际 MinerU CDN 下载需要人工/联网确认；测试中没有对用户 Vault 执行下载/写入。


## 2026-10-11 · 已发布旧章节为什么仍是 MinerU，以及显式规范化升级

**现场复核**：`Bufett’s Alpha/chapters/` 的最初发布时间是 2026-10-10，发布来源 `.ocr2md-published.v1.json` 指向此前旧投影；文件内仍有 ` ```math ` / ` ```html `。`01 Buffett’s Alpha.md` 在 2026-10-11 22:44 又经人工编辑，当前 SHA 与发布源不同。新 `obCompatible:true` 投影在此之后上线，而且现有章节发布器有禁止覆盖整个 `chapters/` 的明确约束；因此**已部署新转换代码不等于覆盖旧书籍**。界面过去只写“章节已保存/发布”，不清楚地传达这一差异。

**改进交互**：进入任意 `chapters/*.md` 章节清洗，UI 检查当前可编辑源码中残留的 MinerU `math`/`latex`/`tex` / 安全 HTML table 围栏；有可转换条目时显示 **「规范化 Obsidian MD」** 按钮与待处理数，顶部章节状态明确提示“旧 MinerU 格式：N 条公式、M 张表格待规范化”。点击按钮必须再确认，列明可以转化的公式、表格、无法解析的表格与表格内 LaTeX。转换**仅暂存于当前源码编辑草稿**：数学围栏变成 `$$` 多行公式，安全表格成为原生 HTML，复杂/危险表格原样保留、表格内 `<eq>` 原文保留为 `<code class="ocr2md-latex-pending">` 等待 LaTeX 人工审核。其他文字、已做的人工修改、图片路径和注释原封不动。整章**物理行数不变**，AG/PDF 原始块标识不变。

- 规范化是一次可撤销的源码编辑事务，执行后「保存章节」才开放；不自动提交，也不二次执行章节发布，不触及其它文件。
- 原生 V3 章节保存 CAS 检查磁盘版本，防止用户从 Obsidian/iCloud 外部修改后误覆盖；保存成功后再关闭待处理提示。修改草稿期间可以撤销/重做，规范化重复执行无二次改动。
- **自动 UIC**：`OCR2MD_TEST_LEGACY_NORMALIZE_ONLY=1 OCR2MD_TEST_REAL_FENCED_TABLE_PATH="<真实 Buffett 第一章>" node ui-spikes/v3-directory/tests/chapterHierarchyBrowser.cjs`，以及 `OCR2MD_TEST_WEBKIT=1` 在独立、持有正式发布 marker 的临时 Mac Vault 中实际运行按钮、确认、草稿、撤销/重做、显式 CAS 保存与磁盘读回；真实源文件只读，保存前字节不变，保存后 12 个公式、7 张表格规范化，3 处 `<eq>` 可编辑待核，章节行数、其它原文保持不变。
- iPad Safari 用户审核：在真实 Buffett 第一章点按钮、检查 MD 预览和来源对照，确认后才执行「保存章节」。不要自动批量改写全部 6 章，因为这些文件中可能有人工清洗成果。


## 2026-10-12 · 现有已发布 MinerU 章节的升级缺口与修复

**Bug 复现**：Buffett’s Alpha 的 `chapters/` 最早于 2026-10-10 发布，发布 marker 的 `sourceGeneration` 指向当时 MinerU 样式的快照；其中 `01 Buffett’s Alpha.md` 已由用户于 2026-10-11 22:44 编辑，因此 marker 对此章的初始字节 SHA 不再匹配。现在重新点击「发布章节」，按照禁止覆盖人工章节规则只允许对应生成版本完整一致时幂等成功；它既不会、也不应迁移现有文件。升级转换器仅影响今后首次发布/新版本投影，未添加已有文件清洗操作时，旧 MD 永远不会自动改为 Obsidian 格式。

**新增操作/UIC**：用户在工作台目录导航进入现有 `chapters/*.md` 的「章节清洗」。顶部出现「规范化 Obsidian MD」按钮（仅本章仍有可规范化的 MinerU 数学/表格围栏、当前未在保存期间时可按）。状态栏指出多少旧围栏待清洗；点击弹出确认，其中报告公式、可安全转换的 HTML 表格、无法安全转换的表格以及仍待审查 `<eq>` 单元格数量。确认后**仅转换源码草稿**，AG、V2 MD 预览跟随更新，顶部保存启用，Undo 可完全还原、Redo 恢复；用户须显式再按「保存章节」后经 Mac CAS 协调写入。没有批量改写整书、不删除或重建 `chapters/`、不覆盖其他章节、不自动下载图片。

**精确定界**：` ```math`/`latex`/`tex` 围栏只换为 `$$`，内部 TeX 逐行原样保留；` ```html` 围栏只转换安全、结构完整、可排版的 `<table>`，用源文本行数相同的空行保留所有后续原 PDF／MD 对照行号；不符合安全白名单的围栏保留原样供人工清洗。非标准 `<eq>` 中的 TeX 不被丢弃，以 `<code class="ocr2md-latex-pending">原式</code>` 标记待人工核对。用户已经改写的正文段落、表格外行内公式、图片地址、注释、标题均不受影响；二次运行无变化（幂等）。提交使用原章节的 CAS、已发布白名单和协调替换，不改变原 `DIRjson` 与原 PDF/OCR。

**自动验证**：
- `src/normalizeMineruChapter.test.ts`：真实 Buffy 第一章只读源；预期 12 `math`、7 `html` 转换，3 个 `<eq>` 留待校对，物理行数严格不变，二次运行无变化；恶意图片标签拒绝转换。
- `npm run test:clean:normalize-old`：Chromium 和 WebKit 在临时授权 Mac Vault 中**复制**真实旧章节及其发布标记；先确认源文件原样，再点击规范化，草稿显示待保存、撤销恢复、重做生效。显式保存恰好 1 次版本化提交；退出本章再重新进入，MD 预览中 7 张标准 HTML 表格 + 12 个 KaTeX 独立公式，0 旧围栏兼容公式、0 未渲染数学代码；按钮变为不可用。**真实用户文件不写入**。
- 完整 `irWorkbenchBrowser.cjs`、`chapterPublishBrowser.cjs`、`chapterHierarchyBrowser.cjs`：DIRjson/章节定界保存和禁止覆盖、V2 Markdown 预览风格、AG↔源码↔PDF 的原有能力不退化。
- 真实 iPad Safari 点击确认、源文本审查、Undo/Redo、人工保存和渲染属于 `manual-external` 待用户审核。


## 2026-10-12 · 已发布旧章节迁移（防覆盖修复）

不要以重新发布最新 DIRjson 来覆盖已在 2026-10-10 发布且经人工编辑的 `chapters/`。旧章节现在另有 `规范化 Obsidian MD` 操作，在「章节清洗」只暂存当前章并提供撤销/重做，用户检查后才经原 CAS `保存章节` 落盘。真实 Buffett 首章 12 数学围栏与 7 HTML 表格可安全转换，三处表格内 `<eq>` 原文保留。参见 `V3_EXISTING_CHAPTER_OBSIDIAN_NORMALIZATION_UIC.md` 与 `npm run test:clean:normalize-legacy`。


## 2026-10-12 · 用户指定新版直接覆盖旧版（替代原“已发布不覆盖”约束）

**明确用户授权的行为变更**：在“章节定界”点击“发布章节”时，不论已发布 `chapters/` 的文件被人工清洗过还是旧版 MinerU 格式，只要保存的 DIRjson 及 OCR/PDF 来源校验通过、`chapters/` 有匹配本书的 OCR2MD 发布标记，就重新从 **不可变 DIRjson** 投影 Obsidian 兼容 MD，直接替换 `chapters/` 对应的全部旧章节。对于已经 `confirmed-chapters` 的旧快照也要重新运行当前投影 CLI，不能继续读取旧 ZIP 中的非兼容 ` ```math`/` ```html` 文件。旧章覆盖是**有意的**，新发布版本优先，不再以编辑过的章节为拒绝理由。

- 初始状态：若 `chapters/` 不存在则首次发布；若存在有效 OCR2MD 发布标记则允许覆盖；若存在无标记／错误书籍标记／符号链接目录，仍拒绝以免覆盖不相关用户目录。
- 操作：用户点击“发布章节”并确认“旧章节将被新版覆盖，备份保存”。不修改原 PDF、原 OCR 或 DIRjson 实体；仅更换可编辑章节与当前 IR 的版本化 Markdown 投影指针。
- 原有数据：服务器先生成和验证完整 Obsidian 版章节至 staging；覆盖前将整个旧 `chapters/` 目录**重命名保留到** `.ocr2md/chapter-backups/<UTC时间>-<来源版本前缀>/`，包含旧版 MD、人工修改、旧发布标记及旧 imgs。新版本保留合法 `imgs/`，从备份复制给新章节，避免已有本地图片引用断开。安装阶段发生错误，若旧发布目录尚未被替代则自动恢复。禁止清理用户备份、重置工作区及强制覆盖非 OCR2MD 文件。
- 同步/幂等：校验已生成目录中所有章节的字节 SHA；重复点击当前完全一致的发布版本，不产生新备份。若人工再次修改已有章节，再次显式发布则再次备份并覆盖。
- UI：显示“新版已覆盖旧章节”、新文件数量及完整备份相对路径；失败显示原因且不承诺覆盖成功。已有源码/预览三窗必须在重新进入章节时读回新版文件。
- 自动化：`OCR2MD_TEST_PUBLICATION_ONLY=1 node ui-spikes/v3-directory/tests/chapterPublishBrowser.cjs` 及 `OCR2MD_TEST_WEBKIT=1`，在**完全隔离的临时 Vault** 验证首次发布→重复幂等→人工编辑保存→再次发布覆盖→旧人工修改可从备份恢复→新章节不含人工改动→后续幂等，PDF 未变且不写真实书籍；`test:chapters:overwrite` 两浏览器合并脚本。还有直接旧快照投影升级场景确保曾经发布的 MinerU 文件升级后为标准 $$ / table，未加载任何未保存浏览器草稿。真 iPad Safari 真实书籍变更需要用户复核。
