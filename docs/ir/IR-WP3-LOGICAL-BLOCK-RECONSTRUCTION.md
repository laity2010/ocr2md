# IR-WP3/8 · Logical block reconstruction & conservative evidence candidates

Status: **engine implemented; automated tests PASS; human logical-structure review pending** (2026-10-09).

## Scope and contract

Input: **IR-WP2 `document-ir.v1.json` only**, still rooted in original PDF + raw MinerU JSON; **not** MinerU official Markdown or chapter Markdown. Original raw PDF, JSON and all old sidecars remain immutable. Nothing deployed to public V3 in WP3; AG Grid switching to IR is reserved for WP5.

### Design: no forced one-to-one alignment

IR-WP2 introduces one *provisional* block per OCR body element, which is **only an import scaffold**. IR-WP3 supplies the transformation API and records candidate structure anomalies. A correct reading/paragraph model can represent:

- `many OCR elements -> one block`: `explicitMergeAdjacentTextBlocks`, concat original OCR text exactly, append all original source references, retain first block's immutable ID and record the retired ID;
- `one OCR element -> many blocks`: `explicitSplitBlockAtUtf16`, produce two logical blocks with **exact per-OCR-segment UTF-16 ranges**; retain the left block's identity and mint a stable new right ID; reject surrogate-pair cuts, gaps, overlaps, unsupported HTML/formula/image data;
- `page array order -> logical reading order`: `explicitReorderBlocks` accepts only a complete permutation of existing block IDs; never silently sort a two-column PDF by page y coordinate.

All explicit operations require an **explicit reason** and append provenance into `reconstruction.appliedOperations` (mode `explicit`). Even when the transformation is mechanically correct and reversible, the resulting block's `audit` is still `unreviewed` until a future real human confirms content and structure. Such operations are demonstrated by **in-memory tests only** on the real book, not applied to the canonical preview.

### Candidate generation (`proposeIrReconstruction`)

1. **Cross-page continuation candidate**: only consecutive pages whose final/initial body elements are plain text, with page-end/page-top geometry, nonterminal preceding text and lowercase continuation. Source `merge_prev:false` is preserved as explicit contrary evidence and does **not** trigger automatic merge. This heuristic may miss genuine cases; it is not exhaustive.
2. **MinerU merge hint**: `merge_prev:true` on two adjacent same-page plain text elements; still a hypothesis requiring audit, not an automatic merge.
3. **Multi-column risk**: sufficient left/right non-overlapping text boxes relative to page center; flags page-wide review rather than assigning guaranteed correct order. The initial `readingOrder` is a numbered **provisional MinerU array sequence**, not a verified reading order.
4. **Empty text risk**: `type:"text"` whose OCR `content` contains no text; raw blocks and source coordinates remain retained for PDF comparison, no invented replacement.

Each candidate records its kind, stable candidate ID derived from source element IDs, involved immutable OCR element IDs, page-relative evidence, description, `status:"needs-review"`. No confidence number is fabricated from heuristics.

## Schema / safeguards

`src/documentIrV1.ts` (`DocumentIrV1`) adds optional `reconstruction` for `importState:"logical-review"` and validates:

- uniquely numbered provisional reading order;
- all body source elements represented, never lost;
- after explicit splits, every original text-containing segment is covered **once and only once** by UTF-16 ranges with no gap or overlap; reject mixing a whole-element reference and partial refs for that element;
- no extraction of rich nontext data to fake plain text slices;
- no artificial chapters, generated MD, or human `verified` audit states during WP3;
- operation metadata and proposal candidates have valid source identities;
- source SHA, original pages, geometry and nested raw source blocks remain unchanged.

Portable Schema Draft 2020-12 extended at `docs/ir/schema/document-ir.v1.schema.json`; cross-array/source range invariants are enforced by TypeScript `validateDocumentIrV1`, not by ordinary JSON Schema alone.

## Real book acceptance: `Bufett’s Alpha`

Source OCR SHA: `e7371434b168a68c77e8b26370327670abb150aed63f2989c9f5e7e4336ee4a5`; PDF SHA: `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`.

| Item | Real result |
|---|---:|
| PDF pages | 22 |
| Raw traceable OCR elements | 315 (224 body + 91 discarded) |
| Initial logical blocks | 224, still `unreviewed` |
| Cross-page continuation *proposals* | 1, pages **16–17** |
| Multi-column order review *proposals* | 8 |
| OCR text-empty review *proposals* | 8 |
| Total open proposals | **17** |
| Actually applied merges, splits, reorders to book | **0** |
| Chapters / generated Markdown | **0 / 0** |

Synthetic fixture exercises true split, merge and reorder (including nested OCR spans and astral Unicode); real case runs **in-memory simulated** cross-page merge and text split, validating reversible JSON semantics without writing the edit to the review preview.

- Full original MinerU JSON reconstituted semantically unchanged from the WP3 preview (including root metadata, raw preproc, discarded + nontext payloads); 224/224 body source references accounted for; no added/missing evidence.
- Isolated **project-local** preview: `.tmp/ir-wp3/document-ir.v1.json`, **2,235,731 B**, SHA `99dec9270a967cc4c195dad4ca3cdd5a89455d9b0bea07b71c25056decb6dd68`, permissions `0600`. `wx` create-only, reruns require byte-for-byte equality.
- Test snapshots SHA+mtime of real PDF, OCR JSON, old MinerU MD and legacy `.ocr2md/pdf-md-map.v1.json` before and after; no original document writes. No `.ocr2md/document-ir.v1.json` created in Obsidian.

## Test commands

```bash
npm --prefix ui-spikes/v3-directory run test:ir:structure
npm --prefix ui-spikes/v3-directory run test:ir:structure:real
npm --prefix ui-spikes/v3-directory run test:ir
npm --prefix ui-spikes/v3-directory run test:ir:real
```

Expected outputs: `IR_WP3_RECONSTRUCTION_UNIT_PASS`, `IR_WP3_REAL_RECONSTRUCTION_PASS`, and earlier WP1/2 pass markers.

## User-visible / future integration contracts

- **FC-IR3-A:** Propose conservative structural anomalies from OCR-only evidence; never claim suggested cross-page merge is correct. Row auditing can distinguish `needs-review` from human `verified`.
- **FC-IR3-B:** Given an explicit human-confirmed boundary or order, produce valid logical blocks, preserving complete source element and UTF-16 segment provenance; reject unsafe operations.
- **FC-IR3-C:** Generate WP3 review preview without modifying source PDFs, OCR JSON, existing markdown or existing V3 workspace UI.
- **UIC-IR3-A:** No UI change until IR-WP5. Future AG Grid must show each candidate as review task with both PDF source regions and the original OCR text; manual acceptance remains pending. A positive human confirmation in the future should be a separate action from pure merge/split provenance and CAS save.

## Known limitations (do not mask)

- Candidate detection has false negatives and false positives: e.g. a paragraph can continue across pages despite layout interruptions, OCR text may be partial or missing, and page columns require visual reading-order decisions. These 17 are **not** a claim of exhaustive issue detection.
- IR-WP3 deliberately does **not** auto-merge any real blocks where intent is uncertain. Therefore the number of logical blocks remains 224 until humans resolve proposals; **true final paragraph count is unknown**.
- Word-level OCR error repair, table HTML->Markdown, formulas, captions, link/image export, note association, chapter tree and final Markdown generation remain later steps (IR-WP4/6 etc). No official Markdown is a required input.
- Existing PDF↔MD sidecar is a different legacy relation system, not silently folded into the new IR; a deliberate migration/audit will be needed once the new IR pipeline is proven.

## Final regression note

- Focused strict `tsc --noEmit` with `noUnusedLocals` and `noUnusedParameters` covering the new IR modules and the new unit test passed.
- Legacy `test:mapping` and `test:review` passed without changes to the existing WP4/7 data paths.
- A separate **repository-wide** `tsc --noEmit` remains failing at the pre-existing unrelated `src/v3HttpWorkspaceFs.ts(84,42)` (`string` cannot be assigned to `WorkspaceV3ErrorCode`). This was **not** changed as part of the isolated IR-WP3 task, and repo-wide green is **not** claimed.
- Human review of proposed cross-page merging and true reading order is pending; this WP3 build is an auditable **engine and draft preview**, not a human-approved fully restructured book.
