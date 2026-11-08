# OCR2MD Sentence Benchmark Lab · WP0–WP4

Stage constraints approved 2026-11-08:
1. Exactly two exported public segmentation operations: `split(md, engine)` and `rebuild(result)`.
2. Swappable engines behind the same projection and output contract.
3. CMD Markdown is the only original document; the Lab never edits Main data.
4. Exact lossless reconstruction is mandatory for every sample/engine.
5. Test in a Main-derived isolated Git worktree and independent Web environment.

## Block-level consensus, arbitration and sidecar persistence (WP04 Lab)

- Three engines still rerun \`split(md,engine)\` on each load. Their full
  sentence outputs are not stored.
- A PBS text block is **automatic** only when all three successful engines
  cover that block with sentence fragments and propose the same ending
  coordinates. A fully missed/empty block is **not** automatically approved.
- For a disputed PBS block, click its text in the left or right CM6 pane (or
  navigate to its p prefix in 分歧块 mode), then tick the \`采用\` checkbox
  in exactly one engine header. This adopts the full per-block set of sentence
  boundaries from that engine. Ticking another replaces the selection;
  unticking returns the block to pending.
- \`已仲裁\` filters for *manually adopted* exact PBS atoms (including
  child blocks); it does not label the automatic blocks as human-reviewed.
  The selector shows only PBS p prefixes visible in the filtered view.
- \`分歧块\` is a **pending arbitration queue** at exact PBS atom level.
  Checking \`采用\` removes that one PBS block from \`分歧块\` immediately
  and shows it under \`已仲裁\`. A second disputed child of the same parent
  remains pending and visible; a p-prefix disappears from its dropdown only
  when no unresolved subblock remains on that p. Unchecking in \`已仲裁\`
  returns just that child to \`分歧块\`. The three engines' original
  divergence statistics remain unchanged, and no CMD source is rewritten.
- The Lab-only server persists auto and arbitrated blocks to
  \`labs/sentence-benchmark/.runtime/document.sentences.review.json\` and
  mirrors manually reviewed Gold boundaries there. Stored data: saved CMD
  SHA-256, status, chosen engine (when human), accepted UTF-16 offsets,
  Gold overrides. No sentence text or CMD content is duplicated.
- Saves use a version compare-and-swap under a lock, atomically replacing
  the sidecar file; stale clients or changed source hashes fail visibly.
  PUT requires the Lab's own HTTPS/localhost origin and non-simple custom
  header. Main returns 404 for the Lab-only review route. Existing local
  Gold/JSON export remains available and manual Gold overrides any chosen
  engine boundary. The review file is never placed into Main's document.

Engine adapters and internal validation helpers are not public business APIs.
WP05 incremental updates and PDF-driven block mutation are explicitly out of scope.

## Lab 统一首页与独立校译模块

- Lab 根路径 `/labs/sentence-benchmark/` 打开独立模块首页。
- `sentence-benchmark.html` 仍是原有分句模块，保留此前的 Gold、采用、导出流程；`index.html` 仍能直接打开 V6 工作台。
- `translation-review.html` 是独立校译模块，左侧为去工作标签的单语 Markdown，右侧按导入 AI 数量增加 CM6 校正英文／中文译文面板，所有窗体共享当前记录 ID，而不是共用滚动像素。
- 校译数据有独立的 `.runtime/translation-review/input/`、`output/`，不是分句的审阅或临时导出文件。输入 `document.md`、`translation-units.json`、`translated-gpt.json`、`translated-grok.json`；后续 AI 可增 `translated-muse.json` 后重新载入。
- 校译阶段目前只读比较；人工英文与中文采用、结果保存及双语重组尚未开发。测试和接口边界见 `tests/am/TRANSLATION_REVIEW_PUBLIC_CONTRACT.md`。
- **WP1 单语原文已接入**：校译左窗使用独立、可逆的清洁 Markdown 投影，隐藏所有工作标签并按句表每句一行；内部保存来源坐标的变更记录以恢复完整审阅 MD。右侧仍是只读的各家校译对照；中英交替排版留待 WP2。可通过 `node tests/translation-review-clean-real.test.mjs` 验证完整 402 条及媒体/注释不变。
- **WP1 成品预览**：左窗不再显示 CM6 Markdown 源码，而是复用 Main 的 `renderMarkdown()` 阅读器，显示图片、KaTeX 数学公式、HTML 表格和原生折叠 Obsidian callout；句子 ID 继续同步定位。图片从与 Main 相同站点的 `/media/<文件名>` 只读读取，Lab 不建立第二套媒体目录。直接测试 `node --test tests/translation-review-reading.test.mjs`，浏览器测试 `node tests/translation-review-lab.browser.test.mjs`。
- **预览行号与句 ID**：左阅读预览新增双栏（映射源行号、句块 ID）；绝对定位标签不改变 Markdown 布局，图片、表格展开后会随同正文重新测量位置。手动滚动只更新当前句高亮，不反复触发其他窗定位。实测 `node tests/translation-review-reader-gutter.browser.test.mjs`。
- **选中焦点与注释阅读**：滚动只是浏览，不能修改主动选中的句 ID 和高亮；明确点击句子或句 ID、选择工具栏记录才更新焦点。注释引用复用 Main `createFootnotePopover` 弹窗，点击不跳哈希；可在弹窗显式定位注文，通过左窗 `↩ 返回注引` 回到原来的阅读滚动位置。真实测试 `node tests/translation-review-reader-gutter.browser.test.mjs`。

## One AI-ready sentence/block table (Lab, on-demand)

- **待翻译句块表** opens one combined table; **导出 AI JSON** downloads the
  same single `rows[]` table (`ocr2md-translation-units/v1` schema),
  bound to the unchanged CMD SHA-256.
- Each row contains its own ID, its literal PBS `blockId`, `type`
  (`sentence` or `text_block`), `elementType`, decision provenance,
  exact original UTF-16 source offset ranges, source `original`,
  and null `corrected` and `translation` fields to fill via AI.
- Consensus/arbitrated blocks are divided using saved accepted sentence
  boundaries. Any unarbitrated block is **one valid whole text block**;
  even if no engine segments it, it is ready for error correction and
  translation without forcing an engine selection.
- Headings, note-body prose and captions omitted from segmentation are
  included as whole blocks in this same table. HTML tables, media, LaTeX
  and MinerU evidence remain only in the original CMD.
- This is an on-demand AI exchange projection, not a second persisted
  copy of the article or a replacement for the review sidecar.
  Import of AI translations and bilingual Obsidian reconstruction are
  subsequent operations, not implied by exporting the table.


## Four-pane reviewer (Main-style UI revision)

The reviewer uses the **same Dockview engine, CodeMirror 6 editor extensions,
Everforest theme, Sarasa font, global strip and source-coordinate conventions**
as V6 Main. It no longer owns a parallel light-theme layout.

- Left: one read-only CMD original CM6 with `全文 / 分歧块` in its own title bar.
- Block-type filter now supports `全文 / 分歧块 / 无分句块`.
  `无分句块` includes a text-bearing PBS parent block only when **none**
  of the successfully run engines produced any sentence fragment within
  it. Empty structural-only CMD labels and preamble metadata are omitted.
  The underlying sentences and Gold stay unchanged; unsegmented prose is
  deliberately *not* folded in this inspection mode.
- The literal PBS `p` selector sits **directly above** the native block-ID
  gutter, and its width equals that gutter's width; the width is derived from
  the longest existing block ID. In filtered modes the selector lists only
  `p` values represented by visible blocks, and choosing a value keeps the
  filter active. Four-pane source-coordinate navigation remains read-only.
- Each of the three engine pane headers displays the sentence count plus
  milliseconds spent by that engine's **latest split() invocation**. The
  value is refreshed when a sample is segmented, not when the reviewer
  scrolls or switches filters.
- The global release badge uses the same abbreviated format as Main,
  `lab-YYMMDD-HHMM`, derived from the active Lab service `./healthz`
  version. No fixed "Sentence Lab" badge is displayed.
- The left source CM6 reuses Main's Everforest/Sarasa source styling,
  `obsidianHeadingMarkers`, `mineruCommentFolding` and the native CM6 fold
  gutter. Non-sentence lines are also folded by the exact read-only
  `extractTextBlocks` projection; PBS anchor rows stay visible. Click the
  fold placeholder/gutter to inspect any omitted structure. Manual expansion
  stays until the sample or the 全文/分歧块 projection changes. Folding alters
  neither the stored CMD Markdown nor the splitter's source offsets, Gold,
  or 100% lossless reconstruction.
- Markdown document headings are **never** auto-folded merely because they
  are excluded from NLP segmentation: ATX H1–H6 and both lines of Setext
  headings remain readable in the original source, in Main's heading style.
  Ordinary non-sentence media, tables and MinerU evidence keep their existing
  folding behavior. The regression checks all 19 headings of the saved
  reviewed CMD, including the first article title and final References.
- The left CM6 has two independent native gutters: source line numbers and
  exact CMD parent/child block IDs. In disagreement-only mode, line numbers
  remain the original CMD's line numbers; view-only separators are shown
  with a middle dot, not assigned fabricated source line numbers. CMD block
  labels use the public read-only PBS/BC projection, with a syntax-validated
  tag-only fallback for unsealed scratch samples. No labels are inserted in
  the Markdown and the three engine panes have no additional gutters.
- The source title bar has a **PBS p selector** next to \`全文 / 分歧块\`.
  The only options are p-prefixes already present in CMD block IDs:
  \`p5b1\` contributes \`p5\`, with both label and value \`p5\`. No conversion
  to PDF page index or OCR physical origin takes place. Selection navigates
  to the first content line carrying that p-prefix and synchronizes all four
  read-only CM6 panes; disagreement filtering first switches to \`全文\`.
  Scroll/click tracks the current p-prefix. A sample with no CMD block tags
  displays a disabled \`无 PBS p\`. The original Markdown stays untouched.
- Right: three **vertically stacked** read-only CM6 engine panes
  (Intl.Segmenter, sentence-splitter, winkNLP), split by two horizontally
  draggable Dockview dividers; the whole right side is separated from the
  left by one vertical divider.
- All panes share one source snapshot and a read-only per-sample source-to-view
  position projection. Engine and Gold boundaries are visual CM6 Decorations,
  **never inserted into the Markdown source**.
- Click in any pane to highlight/locate all four at the same original source
  position. User-driven scroll is projected to the other three. The current
  source is never saved or edited through these CM6 views.
- Review/Gold is a collapsible secondary panel, not a replacement layout.

The Lab's **default** comparison sample is the saved and PDF-reviewed CMD
Markdown document returned by Main's `GET /api/document`, copied once into
the Lab's isolated `.runtime/document.md`. Its exact origin SHA-256, ETag,
document name and copy timestamp are held in the private Lab runtime file
`.runtime/main-reviewed-snapshot.json` (not in Git). At startup the viewer
loads this local Lab document via its own `./api/document`, verifies it has
CMD v1 block tags and displays its SHA-256 prefix. It never requests Main's
origin or writes Main's persistent document.

The bundled Buffett MinerU fixture is retained *only as an explicit
unreviewed comparison sample*, not the default. No reviewed text is embedded
in the bundle, versioned in the repository, or persisted in localStorage.
Subsequent changes to Main do **not** silently alter the Lab snapshot;
a new snapshot requires an explicit controlled copy and fingerprint check.
Unsealed standalone Markdown samples fall back to paragraph blocks.

## Reviewed CMD text-block seam regression (p5b1 / p6b6)

- Masking an inline note reference and Obsidian footnote must not make a
  complete prose line appear to end with a Markdown hard break. Detect real
  trailing hard-break spaces on the original text, not the masked NLP view.
- The incoming CMD \`lb="m"\` is the already-reviewed illegal-line-break
  **merge decision**. Consecutive child prose segments can form a single
  NLP sentence while remaining distinct CMD source ranges and child IDs;
  \`lb="i"\` and pending have no such effect.
- The original Markdown and all CMD tags are preserved exactly; no
  physical PDF block relationship or Main saved document is edited.
- Nested Obsidian table callouts may contain ordinary prose annotations:
  `>><!-- cmd:block:v1 id="p4b0s2" -->` followed by
  `>>Notes: ...`. The quote chevrons are masked **only in the NLP
  projection**, so the s2 note is segmented while `>> [! ds]` callout
  headings, `>><table>...` HTML and blank quote rows remain raw. Escaped
  superscript note markers (`\\<sup>a\\</sup>`) are masked at their
  original offsets too. Regression covers the same pattern in
  p4b0s2/p7b0s2/p8b0s2/p10b0s2/p14b0s2/p20b0s2.
- Direct tests: \`node --test tests/sentence-benchmark-public.test.mjs\`.
  UI regression uses the same small reviewed-seam fixture in
  \`tests/fixtures/sentence-benchmark-reviewed-seams.mjs\` for Chrome/WebKit,
  rather than committing any private full-length reviewed document.
An ordinary imported MD sample must not be mistaken for sealed CMD evidence.

The reviewer is a second **page of the same V6 build**, not a different Lab module
configuration. Main/Lab builds at the same Git SHA must have identical source
module graphs. Imported reviewer samples remain in localStorage; explicit Gold retains
JSON export/import and is also mirrored to the Lab-only review sidecar for the
saved reviewed CMD. The three engines' temporary full split results are not
persisted. Neither Main's CMD document nor Lab's PDF/CMD document is altered
by benchmark review.

Initial fixture: Buffett Markdown. Other MD files can be imported from disk.

Do not treat engine consensus as human gold; benchmark scores are reported only
for adjudicated candidate boundaries, with reviewed coverage displayed.
