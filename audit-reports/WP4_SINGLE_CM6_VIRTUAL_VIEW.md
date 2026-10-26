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

## Final isolated-build verification (2026-10-26)
- Build badge: v6-lab-cm-html-20261026-163617, based on Git 689c4a3. Vite build PASS.
- Synthetic original mother index: WP1_WP2_SYNTHETIC_PASS, WP1_WP2_REAL_MOTHER_PASS, six virtual chapters, 72 elements; original mother checksum 33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc.
- CM6 transaction guards: WP4_VIRTUAL_STATE_PASS; hidden edit denied; select-all scoped; normal edit mapped; boundary mutation and unfiltered external changes fail open.
- Browser viewport + editing + native Undo/Redo: WP4_VIRTUAL_CM6_PASS Chrome and iPad WebKit. Original mother length 307,662; Chrome source scroll height 39,553 -> 29,953 scoped; iPad WebKit 47,277 -> 35,920 scoped. Source restored exactly after undo; one document load, zero chapter-file API calls and zero API writes.
- CMD/AG query regression: WP3_SHARED_AG_QUERY_PASS Chrome and iPad WebKit. 19/11/42 whole book, 10/5/25 for chapter 001, no fourth AG.
- Old toolbar compatibility: LAB_AG_FILE_MODE_TOOLBAR_PASS Chrome and iPad WebKit. Mother chapter export controls and bounded chapter column ownership unchanged.
- All tests run against local-isolated lab copied fixture on Mac. No Linux execution, public deployment, GitHub push, or mainline merge.
