# OCR2MD · WP4/8 · 单 CM6 文档虚拟章节视图

Branch: experiment/virtual-chapters-wp0-2. Isolated lab only, no public/mainline deployment.

## Technical contract
- The existing CMDocument / EditorView owns the whole original Markdown and HTML comments. No duplicate document, EditorState, physical chapter file or automatic save.
- cm-virtual-view.js uses StateField, StateEffect, Decoration.replace(block:true), EditorView.atomicRanges, changeFilter and transactionFilter. Only outer chapter ranges are visually hidden; editor coordinates always refer to the entire original document.
- On an ordinary edit, ChangeDesc.mapPos tracks the live selected chapter bounds without reindexing on every key. Browser tests show native CM6 undo/redo recovers the original source.
- Chapter boundary / heading / block marker edits and unfiltered cross-chapter history changes fail open to All. Out-of-scope ordinary edits are refused, and hidden selection / Select All is clamped. Switching chapter scopes bypasses the *old* scope's selection clamp.
- V6 experimental build profile injects only this extension, subscribing to one explicit WCP event: ocr2md:wp4-virtual-scope carrying either the CMD-derived chapter {id,from,to} or null. The core CMD, source editor and formal worktree are unchanged.

## Performance
- Real mother document 307,662 UTF-16 code units. One full CMD index build measured about 650 ms on this Mac. WP3 now debounces full rescanning after 700 ms of inactivity. During typing the CM6 selected range maps using native ChangeDesc; no full Markdown parser call inside the CM6 update.
- Incremental/off-thread CMD indexing must be designed separately before declaring production latency acceptance.

## Verification and scope
- Synthetic CM6 EditorState PASS: blocked hidden text editing, scoped select-all, live offset mapping, structural boundary fail-open, unfiltered outside-history fail-open.
- Real isolated mother text: 6 logical chapters, 19 titles, 11 media, 42 formulae. Chrome and iPad WebKit browser PASS for chapter viewport reduction, in-chapter user typing, global undo/redo, switching to All, one HTML load and zero physical chapter reads/writes.
- WP3 AG and legacy chapter mode regression must also pass on the final build.
- WP5 Markdown/PDF preview range, WP6 transactional unified scanner, WP7 38 chapter-only LaTeX review markers and single save, and WP8 Linux/AM audits remain pending. No deployment or merge authorized by this report.
