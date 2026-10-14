# IR-WP1/8 · Document IR v1 schema and rules

Status: **schema & validator implemented; source data still unreviewed**.

Canonical JSON identifier: `kind: "ocr2md/document-ir", schemaVersion: 1`. Planned durable name: `.ocr2md/document-ir.v1.json`; IR-WP2 writes only an isolated **preview** in project `.tmp/ir-wp2/`, not a real-book Sidecar.

## Data model

- `workspaceId`, `pdf: {path,sha256}`, `ocr: {path,sha256}`, `sourceMetadata`: original root-level keys except `pdf_info`; `importState`: `page-import-provisional`.
- `pages[]`: `pageIndex`, `pdfPageNumber` (1-based), `pageSize`, `pageMetadata` (unknown extra page keys), `preprocBlocks` (original MinerU preprocessing view, *not* counted as logical blocks), lists of body/discarded source IDs (order matches their original arrays).
- `sourceElements[]`: **every** `para_blocks` and `discarded_blocks` element; `id`, `pageIndex`, `jsonPointer`, `collection`, `collectionPosition`, `type`, `bbox`, `normalizedBBox`, `segments` with nested JSON pointers, `normalizedContentSha256`, `rawBlock` including formulas, HTML tables, captions and image paths. These are immutable OCR evidence.
- `chapters[]`: initially empty. Future IR-WP4 fills stable chapter identities, hierarchy and names.
- `blocks[]`: unique `blockId`, `type`, `chapterId: null`, `readingOrder: null`, `text` from original OCR `content` segments only (no Markdown reconstruction yet), `status: "provisional"`, `audit: "unreviewed"`, `sources[]` with full element refs or future fine-grained segment UTF-16 selections. In initial import each body source element has exactly one provisional block; discarded evidence has none by default.
- `summary`: counts of pages, body and discarded evidence, total provisional blocks. `outputMarkdown: []` for WP2. **No invented MD file locations or offsets**.

## Invariants / validation

1. Exact OCR sha matches source elements; all source IDs unique and canonical, anchored to valid page + collection + source array position + JSON pointer. Collection identities must not be confused with MinerU's frequently duplicated `index` field.
2. All pages are continuous and all original source items accounted for **once** in the matching page's collection; every body block owns valid references. No duplicated top-level data claimed as extra content.
3. Source geometry valid for each page; rotated pages use the OCR *visual* page coordinate system. Formula/table/image payload preserved without lossy conversion to plain text.
4. A block may refer to multiple source elements; future `segmentPointer` and UTF-16 range must resolve within its own element; no invented source pointer or empty range accepted.
5. Human content edit will not change `blockId`; element attribution and source hashes allow checking provenance, but never imply OCR is correct. Page reading sequence (OCR physical array order) is **not** the final logical reading order.
6. Version and source hash mismatch, illegal source pointer, duplicate ID, missing source items, wrong bbox or unknown chapter reference fail fast. Reject malformed JSON rather than silently repair.
7. Roundtrip proof reconstructs *semantic* original MinerU JSON, including root/page metadata and `preproc_blocks`, `para_blocks`, `discarded_blocks`; original JSON bytes remain untouched and are the authority for exact-byte replay.

## Feature / UI contracts

- FC-IR1: Given original OCR JSON and PDF identities, create and validate Document IR v1 with physical source evidence and provisional blocks without depending on MinerU Markdown.
- UIC-IR1: No new V3 UI in WP1/2; AG Grid remains legacy. Later IR-WP5 must display block-level rows with a separate `unreviewed` audit state. Test in WP1 is deterministic API validation, no live UI side effects.

Next: IR-WP2 importer and isolated real-book roundtrip proof, then IR-WP3 true paragraph merging/splitting and sequence restructuring.

## Portable schema

- Draft 2020-12 schema: [`schema/document-ir.v1.schema.json`](schema/document-ir.v1.schema.json).
- Authoritative cross-reference/hash checks: `src/documentIrV1.ts:validateDocumentIrV1` (JSON Schema alone cannot assert cross-array IDs, exact OCR source SHA, page collection ordering or per-page bbox validity).
- The initial `text` field is an OCR `content` snapshot for preview only; table HTML, image paths, equations and captions remain separately preserved in raw OCR evidence until the IR-WP3 logical-renderer design. **No final Markdown is generated here.**
