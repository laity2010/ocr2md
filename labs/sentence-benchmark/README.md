# OCR2MD Sentence Benchmark Lab · WP0–WP4

Stage constraints approved 2026-11-08:
1. Exactly two exported public segmentation operations: `split(md, engine)` and `rebuild(result)`.
2. Swappable engines behind the same projection and output contract.
3. CMD Markdown is the only original document; the Lab never edits Main data.
4. Exact lossless reconstruction is mandatory for every sample/engine.
5. Test in a Main-derived isolated Git worktree and independent Web environment.

Engine adapters and internal validation helpers are not public business APIs.
WP05 incremental updates and PDF-driven block mutation are explicitly out of scope.

## Four-pane reviewer (Main-style UI revision)

The reviewer uses the **same Dockview engine, CodeMirror 6 editor extensions,
Everforest theme, Sarasa font, global strip and source-coordinate conventions**
as V6 Main. It no longer owns a parallel light-theme layout.

- Left: one read-only CMD original CM6 with `全文 / 分歧块` in its own title bar.
- The left CM6 has two independent native gutters: source line numbers and
  exact CMD parent/child block IDs. In disagreement-only mode, line numbers
  remain the original CMD's line numbers; view-only separators are shown
  with a middle dot, not assigned fabricated source line numbers. CMD block
  labels use the public read-only PBS/BC projection, with a syntax-validated
  tag-only fallback for unsealed scratch samples. No labels are inserted in
  the Markdown and the three engine panes have no additional gutters.
- A **PDF page** dropdown sits next to \`全文 / 分歧块\` in the original
  CM6 title bar. It enumerates only verifiable physical OCR pages using CMD's
  existing C63 \`projectCMDAtomLocations\` API (\`origin\` + \`pageIndex+1\`),
  never the renumberable logical PBS ID. The page target is the earliest
  valid content line on that original PDF page (or its tag line if empty).
  Selecting a page focuses the corresponding original CMD source offset in
  all four CM6 panes. If disagreement filtering hides that page, the action
  switches to \`全文\` before navigating. As users scroll/click the four
  synchronized panes, the dropdown tracks the physical page containing the
  focused original source offset. Unsealed standalone Markdown shows a
  disabled \`无 PDF 页码\`, not fabricated page numbers. This is read-only and
  never seeks into or writes a physical PDF document.
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
- Direct tests: \`node --test tests/sentence-benchmark-public.test.mjs\`.
  UI regression uses the same small reviewed-seam fixture in
  \`tests/fixtures/sentence-benchmark-reviewed-seams.mjs\` for Chrome/WebKit,
  rather than committing any private full-length reviewed document.
An ordinary imported MD sample must not be mistaken for sealed CMD evidence.

The reviewer is a second **page of the same V6 build**, not a different Lab module
configuration. Main/Lab builds at the same Git SHA must have identical source
module graphs. Reviewer samples and decisions are kept in the browser's local
storage and can be exported/imported as JSON. Neither Main's CMD document nor
Lab's PDF/CMD document is altered by benchmark review.

Initial fixture: Buffett Markdown. Other MD files can be imported from disk.

Do not treat engine consensus as human gold; benchmark scores are reported only
for adjudicated candidate boundaries, with reviewed coverage displayed.
