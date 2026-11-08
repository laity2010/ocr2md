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

The built-in Buffett source is used to test actual CMD PBS parent/child
boundaries; unsealed standalone Markdown samples fall back to paragraph blocks.
An ordinary imported MD sample must not be mistaken for sealed CMD evidence.

The reviewer is a second **page of the same V6 build**, not a different Lab module
configuration. Main/Lab builds at the same Git SHA must have identical source
module graphs. Reviewer samples and decisions are kept in the browser's local
storage and can be exported/imported as JSON. Neither Main's CMD document nor
Lab's PDF/CMD document is altered by benchmark review.

Initial fixture: Buffett Markdown. Other MD files can be imported from disk.

Do not treat engine consensus as human gold; benchmark scores are reported only
for adjudicated candidate boundaries, with reviewed coverage displayed.
