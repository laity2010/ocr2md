# Lab-OCR · LaTeX 四窗公式审阅 WP1–WP3（只读）

## 唯一权威与覆盖范围

- 公式**源码**唯一可写权威是当前 CM6 StateField 中的 `md_line` 行文本（保有 LineID、BlockID、实际行号/字符串偏移）；原始 MinerU `minerujson` 不可改写。LaTeX 索引、KaTeX HTML 和图片链接是纯派生，只在浏览器内存，不创建 SQL 公式文本表，不生成 CMD 旁路注释。
- `projectLatexIndex(mdRows,blockRows)`（`ui/lab-ocr/latex-index.js`）读取 CM6 最新行和由后端原始 JSON VIEW 已有的 `block_json.lines[].spans[]`。涵盖 `interline_equation`、`inline_equation`，同时扫描最新 MD 中 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]`、math/tex fence 与未定界候选。每条 MinerU 公式独立占一行，**不能以 Markdown 扫描量替代原始 Span 数量**。
- 匹配依据为相同稳定 BlockID 内的唯一可证明 LaTeX 文本/精确偏移。若原始 Span 拼接的整个文本块与当前唯一非空 MD 行 **逐字符完全相同**，直接用源 Span 顺序及其文本长度无损计算每一个字符范围（即使相同公式在同一块内出现两次也能分别定位）；不满足全文一致性的已人工编辑块不能仅凭相似性强行分配重复公式。“仅 OCR / 仅 MD / 有歧义”仍保留。一个 MD 物理行可以拥有多个独立公式 ID；原始 `block_id:lineIndex:spanIndex` 唯一定位源 Span。PDF span bbox/image_path 来源均取原始 Span JSON，且只接受 HTTPS 原图链接。
- `latexIndexSummary(rows)` 提供可核查的原始公式数、独立/行内/精确匹配/歧义/孤立数量和图片路径数量，不把 KaTeX 成功等同 OCR 正确。

## AG 视图 WP2

- 原有 AG 顶栏三选一：MD 行 / 标题 / LaTeX。LaTeX 使用同一 AG Grid（没有第二表），默认“全部”页打开，支持已有 PBS 页码、类型、来源、渲染状态 checkbox 筛选。每条公式占一行；列：PBS、行号、类型、LaTeX 文本、KaTeX 渲染、原始图片、渲染、来源、错误与隐含来源 ID。
- 首次打开该视图时才动态加载 `ui/lab-ocr/latex-view.js` 与 KaTeX；只渲染自可信 KaTeX 生成的 HTML，原样文本使用 `textContent`。`trust:false`, `throwOnError:true`，失败显示完整报错；不替用户修正数学内容。
- CM6 文本编辑后，公式索引从最新运行态增量更新 AG（按唯一 FormulaID patch，保留过滤器和滚动），不发 SQL 修改、不重复 mount AG 或整个 CM 文档。“PDF / 原图”列首先从当前已经授权加载的原始 PDF 用 PDF.js 按公式 bbox 仅在内存裁剪局部 PNG，支持行内与独立公式；优先保证与原始页面一致，若 MinerU 远端 `image_path` 返回 HTTP 403 也能对照。保留原始图片的 HTTPS 链接供另开查看，PDF 裁剪不可用时才回退尝试远端图片并显示失败状态。原始 URL 不属于用户数据所有权，不声称能保证远端可达。局部 PNG 不上传、不持久化，按页/框/加载修订号有限缓存；图片单元仅在可见 AG 行创建。

## 公式级四窗定位 WP3

- AG 选择的公式通过现有 `publishLabFocus` 携带受验证的 `formulaColumn`、`formulaEndColumn` 和 `formulaBBox`，携带 LineID/BlockID/页码；后续 PDF/预览/CM6 仍使用统一消息，不相互读取 DOM。
- CM6 的 `focusMdFormula({lineNo,column,endColumn})` 将光标移动到公式起点（UTF16 位置），同时在同一原始 MD 行中用 CM6 `Decoration.mark` **单独高亮公式全文范围**（与原整行高亮共存，直到下一次导航或正文变化）；Markdown 原文不编辑、不触发保存。PDF 的 `focusFormula({id,page,bbox})` 复用 block 焦点与当前 PDF.js 页面缓存，添加不拦截指针的精确公式橙框并确保公式在可视范围；通用 Block 焦点会清除此暂态框。
- 对 `仅 OCR` 或 `有歧义` 且无精确 MD 偏移者，只高亮 PDF 公式 Span，不把所在 Block 的普通文本伪装成该公式的源码。AG 图片列优先显示 PDF.js 原文局部裁剪；如果原始 MinerU `image_path` 存在则附原始链接，截图不可用才尝试远端图片；原始链接只作额外校对，不能替代 PDF 坐标证据。

## 验收与权限

- 单测 `tests/lab-ocr-latex-index.test.mjs` 保证独立/行内/孤立/歧义/只读；`tests/lab-ocr-four-pane-location.test.mjs` 保证总线校验；`tests/lab-ocr-latex-view.browser.test.mjs` 用独立假书籍在 Chromium 和 WebKit 做公式索引、KaTeX、PDF.js 本地裁剪图像、CM 光标列偏移、PDF 精确 bbox、无 SQL 写入端到端验收；`tests/lab-ocr-pdf-formula-crop.test.mjs` 验证源坐标映射、边界、页面尺寸错误拒绝。
- 真实 sample 源数据扫描基线：20 个独立+22 个行内 Span、20 个原图地址；40 个精确匹配、2 个同块重复的行内公式标记有歧义；42 个公式 KaTeX 结果为 41 成功/1 失败（`p7b1s0` 行内原文）。原图 CDN 以实际 HTTP 403 为例，不能单纯依赖远端。重新生成索引不是数据迁移，禁止直接初始化逻辑块或 MD 表。
- WP4 的审阅状态、人工仲裁与回写**未在本次开启**；本轮只是 WP1–WP3。

## WCP42 行内公式定位修复验收

- 当前 sample 的 `p19b5` 同一行存在两处完全一致的 `r _ { t + 1 } ^ { P r i v a t e }`，原先因为相同文本重复被标为歧义、不给 MD 光标。修正规则只在整块 OCR 拼接文本与**当前** MD 行完全相同时按源 span 起点映射，得到源码第 394 行两个不同字符位置；全书 20 独立 +22 行内共 42 条 OCR 公式，当前可全部精确匹配；人工编辑后无法证明同一性时仍保留待定。
- Chromium / iPad WebKit 的 `lab-ocr-latex-view.browser.test.mjs` 覆盖同一 MD 行两个公式分别点击、CM6 精确范围标记、PDF 不同 bbox、高亮清除、零保存；`lab-ocr-latex-index.test.mjs` 直接验证重复公式与原文不一致时拒绝猜测。
