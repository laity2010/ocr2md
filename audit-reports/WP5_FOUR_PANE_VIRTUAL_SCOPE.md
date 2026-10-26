# OCR2MD WP5/8 — 虚拟章节四窗定位

Branch: experiment/virtual-chapters-wp0-2. Isolated lab only. No formal/public deployment or physical chapter mutation.

## AM interfaces
- A single canonical CM6 Markdown / EditorState remains. CMD HTML comments are persistent facts; WP1–WP2 index provides virtual chapters with stable IDs and full-document UTF-16 [from,to) ranges.
- Original three AG Grids use WP3 virtual-scoped external filters. No fourth AG is added.
- WP5 md-virtual-preview.js slices only the Markdown read-only *rendering input*, reuses the existing Markdown-it/KaTeX/DOMPurify renderer and rebases rendered data-source-start/end to original 1-based full-source lines. AG/CM6/MD/PDF clicks keep the same full-document position contract.
- Event ocr2md:wp4-virtual-scope carries CMD logical range, not the text. Lab-only Workspace adapter rerenders preview after the chapter switch, and its existing ScrollSync remeasures absolute anchors. All mode restores full Markdown; PDF.js continuous viewer and evidence page cache are not reconstructed.
- PDF navigation uses original publishFocus(sourceLine,origin:pdf). The scoped AG adapter identifies the owning virtual chapter, applies the new range, and replays the exact absolute line so the MD/CM6 followers receive a correctly scoped location. Manual chapter selection publishes first-chapter location with click intent; passive PDF scrolling remains independent.
- WP4 CM6 change mapping emits newly mapped scope on document edit with reason:edit. Preview reuses existing 180 ms render delay. Fixes actual stale-scope render exception after typing. CMD full-document reindex remains 700 ms idle-debounced; never reparsed per key.

## Acceptance
- Real 307,662-character mother Markdown; six chapters and 19 headings, 11 media, 42 LaTeX.
- Real original PDF copied only to isolated runtime, 1.4MB / 22 pages. PDF input navigation to page 20 selects virtual chapter mineru:19:0:0 (Chromium and WebKit).
- Chrome / iPad WebKit: WP5_FOUR_PANE_PASS. Chapter 001 MD has 157 source-mapped anchors; their source lines are absolute and fall within that chapter. Markdown heading click locates original title AG; title AG click highlights actual Markdown. Source remains unchanged, page loaded once, original PDF fetched once, no chapter API file loads or business API writes.
- Chrome / iPad WebKit: WP4 CM6 edit/Undo/Redo regression PASS after fix; initial stale-scope DOM exception removed.
- Known adjacent PDF.js detail: after requesting PDF page 20, its current-page indicator sometimes shows 19 due continuous-page visibility heuristic. Chapter attribution and Markdown/source coordinate mappings are correct; do not claim page indicator is fixed.

## Deferred gates
- WP6: fully unified CMD annotation write transactions and stable IDs for unmarked elements.
- WP7: historic 38 chapter-only LaTeX reviews must be reconciled losslessly before any physical chapter deletion.
- Scoped Markdown references/footnotes that resolve across chapter ranges may need full-book reference context support.
- Linux/independent cross-platform audit and full AM/Git review still pending. No mainline merge or public deployment.

## Final same-build regression checkpoint
- WP3_SHARED_AG_QUERY_PASS: Chrome and iPad WebKit (all 19/11/42; chapter 001 10/5/25; 3 original AGs; no physical loads).
- LAB_AG_FILE_MODE_TOOLBAR_PASS: Chrome and iPad WebKit, mother default boundary controls and legacy chapter media/latex/title navigation intact.
- WP4_VIRTUAL_STATE_PASS and WP1_WP2_REAL_MOTHER_PASS, six chapters / unchanged original source SHA.
- WP4_VIRTUAL_CM6_PASS and WP5_FOUR_PANE_PASS: Chrome and iPad WebKit, no uncaught errors after mapped edit-range fix.
