# OCR2MD Sentence Benchmark Lab · WP0–WP4

Stage constraints approved 2026-11-08:
1. Exactly two exported public segmentation operations: `split(md, engine)` and `rebuild(result)`.
2. Swappable engines behind the same projection and output contract.
3. CMD Markdown is the only original document; the Lab never edits Main data.
4. Exact lossless reconstruction is mandatory for every sample/engine.
5. Test in a Main-derived isolated Git worktree and independent Web environment.

Engine adapters and internal validation helpers are not public business APIs.
WP05 incremental updates and PDF-driven block mutation are explicitly out of scope.

The reviewer is a second **page of the same V6 build**, not a different Lab module
configuration. Main/Lab builds at the same Git SHA must have identical source
module graphs. Reviewer samples and decisions are kept in the browser's local
storage and can be exported/imported as JSON. Neither Main's CMD document nor
Lab's PDF/CMD document is altered by benchmark review.

Initial fixture: Buffett Markdown. Other MD files can be imported from disk.

Do not treat engine consensus as human gold; benchmark scores are reported only
for adjudicated candidate boundaries, with reviewed coverage displayed.
