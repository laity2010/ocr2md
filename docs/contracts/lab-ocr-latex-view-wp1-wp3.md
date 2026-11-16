# Lab-OCR · LaTeX 四窗公式审阅 WP1–WP3（只读）

## 唯一权威与覆盖范围

- 公式**源码**唯一可写权威是当前 CM6 StateField 中的 `md_line` 行文本（保有 LineID、BlockID、实际行号/字符串偏移）；原始 MinerU `minerujson` 不可改写。LaTeX 索引、KaTeX HTML 和图片链接是纯派生，只在浏览器内存，不创建 SQL 公式文本表，不生成 CMD 旁路注释。
- `projectLatexIndex(mdRows,blockRows)`（`ui/lab-ocr/latex-index.js`）读取 CM6 最新行和由后端原始 JSON VIEW 已有的 `block_json.lines[].spans[]`。涵盖 `interline_equation`、`inline_equation`，同时扫描最新 MD 中 `$...$`、`$$...$$`、`\\(...\\)`、`\\[...\\]`、math/tex fence 与未定界候选。每条 MinerU 公式独立占一行，**不能以 Markdown 扫描量替代原始 Span 数量**。
- 匹配依据为相同稳定 BlockID 内的唯一可证明 LaTeX 文本/精确偏移。若原始 Span 拼接的整个文本块与当前唯一非空 MD 行 **逐字符完全相同**，直接用源 Span 顺序及其文本长度无损计算每一个字符范围（即使相同公式在同一块内出现两次也能分别定位）；不满足全文一致性的已人工编辑块不能仅凭相似性强行分配重复公式。“仅 OCR / 仅 MD / 有歧义”仍保留。一个 MD 物理行可以拥有多个独立公式 ID；原始 `block_id:lineIndex:spanIndex` 唯一定位源 Span。PDF span bbox/image_path 来源均取原始 Span JSON，且只接受 HTTPS 原图链接。
- `latexIndexSummary(rows)` 提供可核查的原始公式数、独立/行内/精确匹配/歧义/孤立数量和图片路径数量，不把 KaTeX 成功等同 OCR 正确。

## AG 视图 WP2

- 原有 AG 顶栏三选一：MD 行 / 标题 / LaTeX。LaTeX 使用同一 AG Grid（没有第二表），默认“全部”页打开，支持已有 PBS 页码、类型、来源、渲染状态 checkbox 筛选。每条公式占一行；列：PBS、行号、类型、LaTeX 文本、KaTeX 渲染、原始图片、渲染、来源、错误与隐含来源 ID。
- 首次打开该视图时才动态加载 `ui/lab-ocr/latex-view.js` 与 KaTeX；只渲染自可信 KaTeX 生成的 HTML，原样文本使用 `textContent`。`trust:false`, `throwOnError:true`，失败显示完整报错；不替用户修正数学内容。
- CM6 文本编辑后，公式索引从最新运行态增量更新 AG（按唯一 FormulaID patch，保留过滤器和滚动），不发 SQL 修改、不重复 mount AG 或整个 CM 文档。“PDF 原文截图”列从当前已经授权加载的原始 PDF 用 PDF.js 按公式 bbox 仅在内存裁剪局部 PNG，支持行内与独立公式；**不展示、不请求 MinerU 的远端 `image_path`，也不设置图片 URL 回退**。原始图片路径仅由不可变的 MinerU JSON 保留作为来源证据。局部 PNG 不上传、不持久化，按页/框/加载修订号有限缓存；图片单元仅在可见 AG 行创建。

## 公式级四窗定位 WP3

- AG 选择的公式通过现有 `publishLabFocus` 携带受验证的 `formulaColumn`、`formulaEndColumn` 和 `formulaBBox`，携带 LineID/BlockID/页码；后续 PDF/预览/CM6 仍使用统一消息，不相互读取 DOM。
- CM6 的 `focusMdFormula({lineNo,column,endColumn})` 将光标移动到公式起点（UTF16 位置），同时在同一原始 MD 行中用 CM6 `Decoration.mark` **单独高亮公式全文范围**，直接使用 CM6 `highlightSelectionMatches()` 的 `cm-selectionMatch` 类及其内置样式，不再单独定义颜色、下划线或阴影（与原整行高亮共存，直到下一次导航或正文变化）；Markdown 原文不编辑、不触发保存。PDF 的 `focusFormula({id,page,bbox})` 复用 block 焦点与当前 PDF.js 页面缓存，添加不拦截指针的精确公式橙框并确保公式在可视范围；通用 Block 焦点会清除此暂态框。
- 对 `仅 OCR` 或 `有歧义` 且无精确 MD 偏移者，只高亮 PDF 公式 Span，不把所在 Block 的普通文本伪装成该公式的源码。AG 的图片列只显示 PDF.js 原文局部裁剪；截图不可用时显示明确信息并仍可跳转 PDF bbox，不再生成远端图像链接。

## 验收与权限

- 单测 `tests/lab-ocr-latex-index.test.mjs` 保证独立/行内/孤立/歧义/只读；`tests/lab-ocr-four-pane-location.test.mjs` 保证总线校验；`tests/lab-ocr-latex-view.browser.test.mjs` 用独立假书籍在 Chromium 和 WebKit 做公式索引、KaTeX、PDF.js 本地裁剪图像、CM 光标列偏移、PDF 精确 bbox、无 SQL 写入端到端验收；`tests/lab-ocr-pdf-formula-crop.test.mjs` 验证源坐标映射、边界、页面尺寸错误拒绝。
- 真实 sample 源数据：20 个独立+22 个行内 Span、原始 JSON 内仍有 20 个公式图片路径；原生 `$...$` 和重复 Span 精确偏移修复后 42/42 匹配；42 个公式 KaTeX 结果为 41 成功/1 失败（`p7b1s0` 行内原文）。原图 CDN 以实际 HTTP 403 为例，不能单纯依赖远端。重新生成索引不是数据迁移，禁止直接初始化逻辑块或 MD 表。
- WP4 的审阅状态、人工仲裁与回写**未在本次开启**；本轮只是 WP1–WP3。

## WCP42 行内公式定位修复验收

- 当前 sample 的 `p19b5` 同一行存在两处完全一致的 `r _ { t + 1 } ^ { P r i v a t e }`，原先因为相同文本重复被标为歧义、不给 MD 光标。修正规则只在整块 OCR 拼接文本与**当前** MD 行完全相同时按源 span 起点映射，得到源码第 394 行两个不同字符位置；全书 20 独立 +22 行内共 42 条 OCR 公式，当前可全部精确匹配；人工编辑后无法证明同一性时仍保留待定。
- Chromium / iPad WebKit 的 `lab-ocr-latex-view.browser.test.mjs` 覆盖同一 MD 行两个公式分别点击、CM6 精确范围标记、PDF 不同 bbox、高亮清除、零保存；`lab-ocr-latex-index.test.mjs` 直接验证重复公式与原文不一致时拒绝猜测。

## 行内公式淡色高亮（2026-11-16）

- 公式级定位消息的 `formulaKind` 限定为 `inline` 或 `display`。仅 `inline` 使用统一 CSS 变量 `--ocr-inline-formula-fill`，在 CM6 精确源码范围及 PDF 对应 Span bbox 上同时使用；透明度降低，PDF 仅保留柔和 1px 边缘，取消旧橙色光晕。
- 独立公式继续使用既有 CM6 选区匹配 / PDF 独立公式配色；不改变父块边界、公式坐标、数据写回，也不修改 Main 或 lab-frame 的外观。
- Chromium / iPad WebKit 端到端测试需核验两个视图计算出的 rgba 完全一致、透明度与外框、独立公式不受影响以及无数据库写入。

## MinerU 原生行内数学定界符（2026-11-16）

- 对新建 MD，`scripts/v6_lab_ocr_md.py:_span_text` 保留原 MinerU `span.content` 不变，仅将 `type=inline_equation` 的可证明安全内容包成 `$...$`；原始 MinerU、bbox、score、source Span 完整保留。原来已有单对 `$` 不再重复包裹；具有不安全内部美元符号或缺少文本的原始 Span 不做猜测。
- 既有 MD 禁止自动重初始化：显式一次性 `scripts/v6_lab_ocr_reconcile_inline_math.py` 首先只读计划，再用 `--apply --backup <唯一的备份路径>` 进行 SQLite online backup + 单事务 CAS。只有单条 MD 非空行与该 Block 原始拼接正文**逐字符完全一致**时允许加 `$`；人工改动、不同源 Block、重建风险等直接跳过。保持所有 LineID、行号、BlockID、其他原文行、原始表不变，revision 只增加一次。重跑无差异即 no-op。
- 公式索引 `exactInlineOffsets` 同时支持无定界遗留 MD 与原生 `$...$` MD；新格式在每个公式的 `$` **内部**定位 CM6 字符列，按完整段落与原始 Span 序列无损比对，可正确区分重复的行内公式。不存在确定的块级对应关系时继续标记未匹配。
- Lab-OCR 的 MD 预览使用 `renderMarkdown(...,{nativeInlineMath:true})` 原生渲染无审阅标记的 `$...$`。Main 继续使用原来默认的 review-gated 行为，显式 `忽略` 的公式保持普通文本；渲染仅改变预览，不再写回任何 CMD 注释。
- sample 已在独立 SQL 快照与 WebKit/Chromium 验证：原始 22 行内 Span 分布在17个块，现有 478 行 MD 中仅17行被修改、revision `77→78`，全部 LineID 未改。完整原库备份存放于 `.ops/backups/lab-ocr-inline-math-20261116/`（不要向外分发用户书籍）。

## 公式图链接清理（2026-11-16）

- 用户已确认 AG 可自行用 PDF 覆盖框截图，无须在源码和 AG 图像列提供 MinerU 公式图片链接。**新建 MD 的 `interline_equation` 默认只输出 `$$...$$` 或 `math` fence，不再附 `[原始公式图]`；行内 `inline_equation` 有 `image_path` 时优先输出 `span.content`（`$...$`），不能用 URL 替代数学内容。其他 `image` / `table` 等媒体仍照旧保存原链接。**
- 现有 `sample` 禁止重新初始化全文。`scripts/v6_lab_ocr_reconcile_formula_links.py` 对照完整 Block 的旧生成文本与当前单个公式块的 MD 非空行，精确匹配后仅把旧 `[原始公式图]` 物理行文本设为空（保留 LineID、BlockID、行号、空行语义），前置完整 SQLite 在线备份。revision/BlockRevision/来源再次核对后单事务 CAS 更新，手改或不匹配即跳过；重复运行 no-op。
- AG 的“PDF 原文截图”只从原 PDF 渲染 Data URI，不产生任何指向 MinerU CDN 的 DOM 链接或请求。原始 `image_path` 在 MinerU JSON 中保持原样，只有不可变来源数据保留链接。Chromium/iPad WebKit 测试覆盖图片像素、公式级定位、零远程请求及零 MD 保存。

## 人工修订公式回流 AG（2026-11-16）

- `p7b1s0` 实际故障：MinerU `ocr:207:0:0` 的行内公式 KaTeX 失败，CM6 MD 第128行已人工改写成合法 `$...$`。旧索引以 **公式文本相同** 为绑定条件，造成 AG 仍显示原始失败公式（`仅 OCR`）且另生成一条 `仅 MD`。
- 修正：严格限定在 **稳定 BlockID + 相同公式类型** 中恰有 **1 条原始 OCR Span 和 1 条显式定界的 MD 公式**，且无法按原字符串匹配时，使用这个唯一稳定结构关系关联，标为 `已修订`；AG 的 `formula`、KaTeX 渲染结果、CM6 起始和全文字符范围均以**当前 CM6 MD**为唯一权威；保留原始 `formula_id`、`original_formula`、`pdf_bbox` 和页码便于核验原 PDF。禁止按相似字符串、相邻 Block、多个候选公式顺序猜测关联。
- `latexIndexSummary.matched` 同时统计 `已匹配` 和 `已修订`，新增 `revised` 便于识别修改量；无匹配时 `仅 OCR` / `仅 MD` / `有歧义` 仍如实显示。
- 测试以真实 `sample` p7b1s0 校核：修订后仅一条公式，`ocr:207:0:0` → MD 第128行、公式字符列1，KaTeX 可解析，原 PDF bbox `[53,216,226,234]` 保持。另有合成书浏览器测试覆盖 corrected MD / malformed OCR、AG 状态着色和点击定位，防止修正后继续显示旧的「渲染失败」。
