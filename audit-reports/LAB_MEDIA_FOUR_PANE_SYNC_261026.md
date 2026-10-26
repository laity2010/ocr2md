# OCR2MD V6 Lab — Media 双向四窗定位专项（2026-10-26）

- Scope: `experiment/virtual-chapters-wp0-2`, isolated `/labs/cm-html/` only. Formal V6 mainline and user data untouched.
- Product commits: `91f2d8a` (media AG preview thumbnail emits native focus) and `fe6bde8` (media AG follows PDF/Markdown/CM6 focus).
- Public deployment: `v6-lab-cm-html-20261026-202912`, base commit `fe6bde8`; existing content-addressed browser assets preserved.
- Actual fixture: mother Markdown SHA-256 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc` before and after, 6 CMD virtual chapters, PDF original 22 pages.

## Defects & changes

1. Media preview-cell link previously stopped AG row click and opened original image, so no CM6/Markdown/PDF focus. Ordinary tap now selects original Media AG row and publishes the same media click focus; Cmd/Ctrl click still opens original image. An unreferenced inventory image cannot be linked to a source line and still opens original.
2. Media AG previously published focus but did not consume focus from other panes. It now follows visible source-coordinate focus (exact line/containing Markdown block), matches PDF origin by exact MinerU page/block identity, and selects only rows in the current native AG filter. CM6 caret within media URL selects matching media AG row. No AG-to-CM6 direct writes or feedback events.
3. Test formerly clicked only an AG source-line cell and verified a heading's PDF page; added actual Media thumbnail, real PDF canvas click (not noninteractive overlay synthetic click), Markdown click and CM6 caret click, with exact media row, chapter, PDF page, 1 CM6 editor, unchanged source, no physical chapter API GET and zero business writes asserted.

## Tests

- Local Chrome and iPad WebKit: `media-four-pane-focus.browser.test.mjs` PASS after each full end-to-end click round trip, source line 555 / actual PDF page 14, AG 全部 persists, parent chapter navigation transitions to `mineru:1:1:0`.
- Local Chrome and iPad WebKit: `ag-all-cross-chapter-focus.browser.test.mjs` PASS after product changes; media source line 63, LaTeX line 898, title line 910, 3 distinct AG grids; absolute Markdown highlight, PDF 22nd-page heading overlay, no business writes.
- Public Chrome: `media-four-pane-focus.browser.test.mjs` PASS against `https://ocr2md.laity.bid/labs/cm-html/`.
- Public iPad WebKit: `media-four-pane-focus.browser.test.mjs` PASS against `https://ocr2md.laity.bid/labs/cm-html/` (source line 555, PDF page 14, true bidirectional selection, no writes).
- Formal public release version: `v6-20261026-102651` unchanged (HTTP 200). Public Lab version `v6-lab-cm-html-20261026-202912` (HTTP 200).

## Gate

This is a Lab-specific targeted functional regression, **not** a grant to merge to formal mainline. Existing Grok/Muse WP8 independent audit/signoff remains open. AGENTS.md principles untouched.
