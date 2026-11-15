# Lab OCR · four-pane location and scroll contract

Scope: experimental `lab-ocr`, not a Main feature or a second document store.

## Roles and single authority

- CM6 MD StateField owns the loaded Markdown document and its row identities. Block CM6 StateField owns reviewed block relationships. SQLite is persistence only.
- Main's `ui/view-store.js` Zustand Vanilla singleton transports one ephemeral `labFocusTarget` via `publishLabFocus`. It stores no document bytes, HTML, AG rows, PDF geometry or view instances.
- `ui/lab-ocr/four-pane-location.js:resolveReviewLocation` resolves stable `LineID` / `BlockID` into the current MD line, reviewed Block page and display-only PBS. Unmapped source lines never receive an invented page; PDF-only blocks never receive invented MD rows.

## Public messages

`publishLabFocus({origin, intent, lineId, blockId, lineNo, page, pbs})`

- `origin`: `ag`, `cm6`, `preview`, `pdf`.
- `intent`: `click` or `edit`. Click requests source/preview/PDF reveal; edit updates selection and highlights without stealing scroll from the editor.
- IDs: nullable stable LineID (string), BlockID (integer). `lineNo` (1-based) and `page` (1-based) are derived, not keys. PBS is mutable display text.
- `sequence`: strictly increasing in `viewStore.labFocusTarget`, including repeated clicks. Subscribers ignore messages whose object is unchanged.
- **Only user-originated interactions publish.** Applying a message may select, reveal or highlight panes, but MUST NOT publish a second event. CM6 programmatic dispatch is excluded from user-selection callbacks.

## Lab Frame public ports and subscriptions

- `setMdPreviewNavigation(callback)` accepts click-derived source lines and `null` on disposal.
- `highlightMdPreview(lineNo,{reveal})` marks precisely mapped rendered blocks; absent anchors receive no fabricated preview highlight.
- `highlightMdSource(lineNo,{reveal})` paints an orange CM6 line decoration without changing document content/selection.
- `selectMdLine(lineId)` selects the currently AG-visible row without clearing filters and marks the CM6 table-row selection without transferring keyboard focus.
- `setSqlPdfPage(page)` preserves the AG page checkbox and other active filters.
- `focusPdfBlock({id,page,reveal})` uses the PDF viewer's existing stable BlockID API and its parent/child highlights. `clearPdfFocus()` removes stale PDF highlight for unmapped MD rows; no overlay geometry or SQL changes.
- `clearMdAgSelection()` clears stale AG selection for hidden/absent rows while leaving the full filter model untouched.
- Main's `createScrollSync` continues to coordinate high-frequency CM6 and MD preview scroll using Markdown renderer `data-source-start/end` anchors, without broadcasting every scroll pixel to PDF or AG. PDF pagechanging already follows AG page filter through `onPageChange`.

## Shared review-focus presentation

The Lab OCR root `.ocr-review-focus-unified` opts into `ui/lab-ocr/focus-theme.css`.
Every directly focused object uses a solid 2px `#ffd46c` edge and `rgba(231,183,83,.20)` fill; the AG row, CM6 source line, Markdown block and PDF geometry use one pair of CSS custom properties. This is *not* hover or keyboard-cell focus. PDF family/descendant highlights retain their softer amber treatment, whereas unselected PDF geometry continues to honor the global overlay-opacity setting. The PDF selected geometry is outside that opacity fade, so its color is not artificially weaker than the other panes. PDF PBS labels retain the Main parent/child base palette.

## Acceptance / evidence

`tests/lab-ocr-four-pane-location.test.mjs`: pure mapping + message contract; `tests/lab-ocr-md-full-source.browser.test.mjs`: four directions in a real Chromium and iPad WebKit browser, persistent highlights, PDF page transition, AG filter preservation and CM6/SQLite save/reload. `tests/lab-ocr-ag-pbs-page.browser.test.mjs` protects existing Block AG page filtering and all-pages switch.
