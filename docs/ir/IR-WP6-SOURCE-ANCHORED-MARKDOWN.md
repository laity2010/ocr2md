# Document IR · IR-WP6/8 · Markdown generation, provenance, browser navigation

Date: 2026-10-09. Status: **engine and browser UI implemented; automated acceptance as recorded below; human OCR/structural approval remains pending**.

## Technical decision

**Single content authority:** `DocumentIrV1`. No MinerU official Markdown, historical chapter Markdown, old PDF-MD map or filename heuristics are required to construct generated Markdown. On each IR edit the Markdown and source index are regenerated as deterministic pure projections, not patched at MD line numbers.

- 6 root chapter documents (provisional) for `Bufett’s Alpha`; their nested 13 subsections are `##` headings in the owning root chapter. All 224 logical blocks occur **exactly once** in the generated Markdown bundle. Chapter boundaries may lie mid-PDF-page and continue across PDF pages: no page-to-chapter one-to-one assumption.
- Each visible rendered block is preceded by an inert `<!-- ocr2md-ir:block=blk_... -->` identifier (not untrusted OCR text). A parallel manifest maps `blockId` to generated MD file path, `UTF-16 [from,to)` including the marker, `contentFrom,contentTo` for the visible text only, chapter ID, PDF pages, original OCR `elementId`,`jsonPointer`,`bbox`,`normalizedBBox`, optional fine segment pointer and UTF-16 slice, plus render type and `audit:unreviewed`.
- Output bundle binds to original PDF sha256, original OCR JSON sha256 and the exact serialized IR sha256. Every generated file has its own content SHA-256; output indexing and hashes are validated before display/export. If IR changes after splitting, merging, replacing text or moving chapter boundary, all projections are recomputed and old offsets are never reused.
- `DocumentIrV1.outputMarkdown` stays **empty in WP6**, because it is currently a persisted-output locator incompatible with WP1-WP5's non-write validator. WP6 returns a separate `IrMarkdownBundleV1` with canonical MD file paths / content and manifest. WP7 must design the CAS persistence transaction and only then mark an output as durably saved; no fake `outputMarkdown` paths are placed into the source IR.

### Types: content vs source conservation

- `title`: stable #/##/### based on chapter anchors; an OCR cover heading remains rendered even when a generated “前置内容” container heading precedes it. OCR text is escaped against injected raw HTML; headings remain flagged provisional.
- `text` and `ref_text`: preserve full logical text, escape unsafe HTML, no cross-page dehyphenation/claim of OCR correction. Text edits come only from explicit IR operations.
- `interline_equation`: retain original OCR formula notation in fenced `math` block (no guessing formula semantics). Empty equations become explicit PDF-review placeholders.
- `table`: retain each original nested `<table>...` source as **inert fenced HTML**. Original captions/notes appear alongside. `rowspan/colspan` cannot be faithfully flattened into a pipe Markdown table; such output is deliberately flagged for human check.
- `image`/`chart`: preserve captions and safe http(s) media *links* without Markdown image auto-embed; do not make network fetches to MinerU CDN or invent local binary assets. Missing/unsafe media have explicit placeholders and remain traceable in original OCR JSON.
- unknown types: show an explicit evidence placeholder; no block may disappear from the archive silently.

### Real book counts (generated, not manually reviewed)

| Type | Blocks |
|---|---:|
| title | 21 |
| text | 143 |
| ref_text | 20 |
| interline_equation | 20 |
| table | 9 |
| image | 7 |
| chart | 4 |
| **Total** | **224** |

Root files **6**, all **22 PDF pages** represented. 28 content-level warnings (e.g. inert table HTML, no downloaded media). All 224 content ranges have complete PDF/OCR evidence and stable IDs. Root book generated output is repository `.tmp/ir-wp6/preview/` only. No file was created or overwritten in the Obsidian book directory. Original source PDF, OCR JSON and old sidecar hashes still match the WP0 baseline.

### Browser UI

- In V3 `工作台` → `Document IR`, source pane now uses generated Chapter Markdown from `DocumentIrV1` (CodeMirror read-only) rather than an OCR metadata readout or the old official MD. Select the generated chapter in `ir-md-file`.
- Clicking an AG row selects its logical block; source pane displays that block's generated Markdown `contentFrom/contentTo` and PDF.js centers the cited region. Exact OCR pointers and bbox are still visible in `目录/编辑` → `当前块 OCR 来源证据`.
- Clicking the generated Markdown inside CodeMirror uses the manifest to select a logical block and navigate to PDF. Clicking PDF canvas finds matching source regions; auto-selection is allowed only when exactly one block contains the point. Ambiguous hits prompt explicit selection in AG, not guessing.
- `MD 预览` uses existing sanitized preview component, but in IR mode reads **generated** MD; original V3 modes retain their own original MD preview.
- `下载 MD` downloads current generated chapter. `导出 ZIP` includes **6 chapter MD, Markdown provenance manifest, complete IR snapshot** (8 entries in real book). ZIP is deterministic and standard Unicode names are supported. These are explicit browser downloads, not Mac Vault writes and not confirmation of durable CAS.
- Draft text operations regenerate selected Markdown and new manifests; no source mutation, no automated `verified` status.

## Feature contracts

**FC-IR6-1** Input WP4 IR; render one logical block exactly once with trace marker and full span/region index. Fails on missing or duplicate provenance. Output deterministically reproducible.  
**FC-IR6-2** Fenced HTML table and equation preservation, media link-only fallback with explicit warnings, HTML escaping. Never silently discard complex OCR types.  
**FC-IR6-3** After explicit IR text edits, split/merge or chapter-boundary changes, recompute file contents, locations and SHA manifest. A stale digest/range must be rejected.  
**FC-IR6-4** Generated MD is displayed in the IR mode's CodeMirror with bidirectional AG/PDF navigation; does not depend on official MD and does not collide with old review state.  
**FC-IR6-5** Export current chapter and all chapter+manifest+IR ZIP without allowing new hidden Vault writes or silently claiming saved/published state.

## UI interaction contracts

**UIC-IR6-1:** Load real book → `Document IR` → source CodeMirror displays the first generated chapter MD; `ir-md-file` offers root chapters. AG row click reveals the corresponding MD content and locates PDF, without old chapter MD reads; statuses remain provisional. Browser automation.

**UIC-IR6-2:** Change generated chapter → source CodeMirror and Markdown preview switch consistently. In source MD click a visible block → resolve its UTF-16 `contentFrom/contentTo`, select related IR block and PDF region. In PDF click unique OCR bbox → AG and source MD update; ambiguous point → caution, no automatic choice. Browser automation.

**UIC-IR6-3:** Edit/split/merge in IR draft with reason → regenerate MD + index; download chapter MD and ZIP → manifest refers to current IR SHA, original PDF sha and block ranges. Save to Vault remains unavailable; no false approval. Browser automation + unzip verification.

**UIC-IR6-4:** Switch to original text/legacy review → original panes preserved; return to IR → same in-memory draft. iPad 834×1194 no horizontal overflow. Browser automation.

**UIC-IR6-5:** Manual inspection of PDF figure/table/footnotes and author headings, plus the 38 WP3/4 candidate records, is mandatory before calling the generated Markdown *reviewed*. This is `manual-external`, and no automatic test may mark it done.

## Test commands

```bash
npm --prefix ui-spikes/v3-directory run test:ir:markdown
npm --prefix ui-spikes/v3-directory run test:ir:markdown:real
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:ui:real
npm --prefix ui-spikes/v3-directory run test:ir:structure
npm --prefix ui-spikes/v3-directory run test:ir:chapters
npm --prefix ui-spikes/v3-directory run test:review
npm --prefix ui-spikes/v3-directory run test:bidirectional
```

Expected test markers: `IR_WP6_MARKDOWN_UNIT_PASS`, `IR_WP6_REAL_MARKDOWN_PASS`, and enhanced IR browser marker with `markdownExport`, `zipValidated`. Real ZIP stored at `.tmp/ir-wp6/preview/ir-chapters-provenance.zip` for testing. `unzip -t` verifies all 8 members.

## Limitations and deferred items

- **No Obsidian persistence** in WP6. WP7 must address 2.2 MiB IR files vs 512 KiB server limit; do not broaden a hidden path allowlist in this phase. Commit/recovery/mtime-CAS/multi-device conflict are separate concerns.
- All MD is a provisional *rendered projection* of OCR content, not verified final OCR text. Table semantics remain HTML evidence, not GFM cells; formulas are raw MinerU math notation; image assets are not mirrored; attachment fetch/export is deferred.
- High-quality heading normalization, footnote association, cross-page word repair and ambiguous two-column reading order are **not** automatically resolved by rendering. The 17 structural + 21 heading candidates need human audit before final MD release.
- Official MinerU MD remains accessible only in original legacy mode; the IR mode does not use it as input. No unintended changes to prior v2/v3 review behavior.

## Final acceptance log (2026-10-09)

- **PASS** `IR_WP6_MARKDOWN_UNIT_PASS`: Markdown projection, stable offsets, raw HTML safety, math/media preservation, edits/splits/merges/section changes, tamper checks.
- **PASS** `IR_WP6_REAL_MARKDOWN_PASS`: source-only real book, 6 generated Markdown documents, 224/224 indexed blocks, 22 page references, 28 warnings, source files unchanged.
- **PASS** `IR_WP5_BROWSER_FIXTURE_PASS` (enhanced WP6 cases): actual PDF canvas → IR row → generated MD; generated CodeMirror line → IR row/PDF; real file download + standard unzip + manifest SHA/offset evidence; both legacy modes and iPad remain operable, **0 Vault writes**.
- **PASS** `IR_WP5_REAL_BROWSER_PASS` with WP6 deployed: 224 real rows, 19 chapter nodes, 6 generated MD options, selected block content provenance, PDF overlay, chapter filter, iPad layout, sources unchanged.
- **PASS** prior WP3/WP4 unit tests, legacy `test:review`, `test:bidirectional`, archive `unzip -t`, source PDF/JSON/old mapping hash check, local preview HTTP 200, `git diff --check`.
- Preview shell published `https://ocr2md.laity.bid/v3-directory/`; service worker cache `ocr2md-v3-ir-wp6-20261009a`; no server restart or hidden-path permission escalation.
- **Manual book/figure audit outstanding**, source document OCR defects not auto-fixed. WP7 must not treat downloaded bundles as saved-to-Obsidian or human-reviewed.
- No Git commit, no reset/clean/rebase/force push; existing WIP preserved.
