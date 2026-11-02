# OCR2MD WCP27 · WP6/8 · PDF overlay correction and CMD document footer

Experimental baseline `e1946aa` (WP5). Only the isolated experiment branch/worktree is modified. Main, actual user document, real PDF and deployment are out of scope. No new local database or remote store.

## Data boundary

- Original MinerU OCR bytes, SHA-256 and original parent/child `bbox` remain the immutable final `<!-- minerujson:source:v1:... -->` archive. The document has one additional **editable, canonical HTML comment footer immediately preceding this archive**, `<!-- cmd:pdf-bbox:v1 {"schema":1,"boxes":{"p0b0":[x0,y0,x1,y1],...}} -->`. Physical archive remains last and unchanged. The source file's final non-OCR annotation stores only user-corrected effective rectangles keyed by stable canonical PBS identity. It does not modify or replace original OCR.
- `ui/cmd-pdf-bbox.js` is the sole read/planning/projection owner: validates full JSON schema, unique footer, canonical PBS presence, original native child identity and page-bounded finite four coordinates. Rejects forged, malformed, duplicate, orphan or mismatched edits. Deterministic sorted footer; one source-exact CM6 transaction. Resetting the last corrected rectangle removes the footer and restores exact original Markdown bytes. No-op idempotence.
- `ui/cmd-text-blocks.js` adds original `nativeChildren` identities to its frozen layout projection; the original cached valid subregion geometry is not changed. A user correction may materialize a true but formerly geometry-invalid child (including OCR conflict suppression), only with a valid original native child index. No invented child identities and no fallback to parent bbox for missing children.
- `CMDocument.queryLayout()` is the one effective, validated layout provider for both AG and PDF; it composes sealed original layout with source footer without changing cached evidence. `CMDocument.queryBlockAnalysis()` also reads the same effective source and reports original OCR `bbox` alongside effective coverage and `bboxSource='人工修正'` for changed PBS rows. Source-body extraction explicitly excludes the correction footer so it cannot become the final OCR block's text.
- Existing `toMineruJSON()` converter strips a single valid CMD PDF footer strictly from visible block Markdown while retaining sealed OCR bytes, rejecting misplaced/malformed/duplicate footer comments. This preserves lossless source conversion and original OCR audit.

## Interaction

- PDF toolbar exposes `修正覆盖框` (toggle), `恢复原框`. Select a real parent/subblock, then move the correction rectangle using the center handle or resize from four corner handles. Pointer mouse/touch capture, page-space normalized coordinates, clamp to page and minimum width/height; commit only on valid release. Pointer cancel or no-op does not write. This uses the existing PDF view plus transient HTML controls and sends an ID/rectangle/expected-source semantic command to Shell; PDF never changes CM6 or persisted content directly.
- AG Text Block Function menu provides `x0,y0,x1,y1`, `应用框坐标`, `恢复原框` for precise numeric correction. This path supports native child whose original bbox was suppressed and cannot be clicked in PDF. AG shows a separate corrected/original provenance column. Other BC actions, group view and original continuation review remain available.
- Both AG and PDF actions delegate through a registered Workspace callback to the same `setPDFBBox` CMD port, preflighted against the current source, original OCR archive, and virtual-chapter guarded whole-document transaction. One source transaction, one Undo/Redo history step, global Save remains the only persistence action. Invalid stale edit is rejected.

## Evidence / limitations

- `node tests/cmd-pdf-bbox-wp6.test.mjs`: parent, native child and recovered-invalid-child corrections; reread effective bbox; identical sealed OCR bytes and original cached layout; invalid coordinates, unknown PBS, duplicate footer and invalid schema rejected; remove-all byte-exact reset. PASS.
- `node tests/cmd-pdf-bbox-wp6.browser.test.mjs`: actual Chrome and simulated iPad WebKit AG input → Shell CMD footer → effective bbox → Undo/Redo → source-exact reset; temporary disk document unchanged without Save. PASS on both.
- `node tests/cmd-pdf-bbox-wp6-save-reload.test.mjs`: isolated authenticated real HTTP save/load, matching revision, stale HTTP 412, missing If-Match 428, restored effective bbox and byte-exact reset. PASS.
- Original PDF double-frame real interaction and physical iPad Safari touch/drag handles are **NOT** certified here because source PDF is not mounted in the experiment. The PDF overlay drag implementation is included but needs native PDF acceptance in WP7; real PDF page zoom/resize handling is not claimed PASS. Independent Linux / full AM/Git dynamic audit also remain WP7 gates. AM static checks, Vite and converter suite are not evidence for full independent audit.
- Additional PDF-owned pointer gesture acceptance in the same Chrome/iPad-WebKit test uses a synthetic isolated page DOM and real `PdfPreview.drawBBoxEditor()` handles, dispatches `pointerType=touch`, verifies one ID-bound corrected rectangle and same-port reset (`syntheticPDFPointer:true`). This does **not** constitute real PDF.js document or physical touch certification.
- Converter upstream regression: `npm test --prefix packages/minerujson-md` all 20 tests PASS. WP3 authenticated HTTP BC save/reload regression PASS on isolated rerun; first sequential run encountered an environment EPIPE and was not counted PASS until rerun. WP5 Chrome drag including synthetic pointer and WP4 legacy review Chrome/iPad-WebKit PASS after WP6. 19 targeted static AM tests PASS. Full AM/Git, Linux external and physical PDF/iPad remain unverified.

## WP6 completion notes

- Reused the same AG/CMD source transaction for visual and numeric edits. The original parent row's corrected `bbox` enters the PDF coverage projection, while its `originalBBox` remains separately inspectable; formerly hidden native child rectangles are recoverable with a verified matching child PBS ID.
- The five PDF move/corner pointer handles have been extracted to `ui/pdf-bbox-gesture.js` (PDF presentation owner). The source port does not know about pointer/DOM details; the gesture receives only a semantic commit callback. The same component has a simulated `pointerType=touch` acceptance on Chrome and iPad WebKit without importing an unrelated PDF.js Viewer into the test fixture.
- WP6 browser tests run the real Vite AG/CMD application on a temporary Markdown document; synthetic PDF handle testing uses a temporary page-like DOM rather than a genuine PDF file. Do not interpret this as PDF.js zoom/drag device acceptance; the complete native PDF interaction remains BLOCKED until PDF source is available.
- Converter suite: 20/20 PASS. AM ownership: new PDF gesture helper assigned to module P, semantic callback and footer/planner contracts registered; static 19/19 boundary cases PASS. Vite build PASS. Original PDF visual QA, real iPad Safari and independent Linux audits remain WP7 gates.

## Final regression matrix (experimental branch)

| Evidence | Chrome | Simulated iPad WebKit |
| --- | --- | --- |
| WP6 AG bbox → CMD footer → effective layout → Undo/Redo → reset, synthetic PDF pointer | PASS | PASS |
| WP4 original 267 PBS, grouping, merge/split, no-auto-save | PASS | PASS |
| WP4 legacy 224 source blocks / five continuation candidates / migration not automatic | PASS | PASS |
| WP5 atomic drag, cross-chain, extract, Undo/Redo, synthetic pointer | PASS | Previously certified on e1946aa; not separately rerun on this WP6 SHA |

Additionally: `CMD_PDF_BBOX_WP6_PURE_PASS`; `CMD_PDF_BBOX_WP6_HTTP_PASS` (authenticated save/reload, If-Match 412/428); `npm run test --prefix packages/minerujson-md` 20/20; targeted AM static boundary tests 19/19; `npm run build` PASS with only pre-existing large chunk warning; `git diff --check` PASS. These are targeted results, NOT the full AM/Git or real PDF native acceptance.

The test harness now waits for the real application/editor to initialize before selecting the hidden native element dropdown, avoiding an unrelated startup race under concurrent headless browsers. No production assertion was removed. Main worktree, original user PDF and document, and production deployment remain untouched.
