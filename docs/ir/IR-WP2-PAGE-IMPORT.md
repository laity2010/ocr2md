# Document IR · IR-WP2/8 · MinerU OCR page importer

Status: **implemented, non-destructive real-book validation complete** (2026-10-09).

## Data route (new independent chain)

`Original PDF bytes (hash) + original MinerU JSON bytes -> extractMineruElements -> documentIrImport -> Document IR v1 draft (project-local)`. The importer does **not** call `mineruMarkdownReconstruction`, `mineruChapterMapping`, `mineruMappingSidecar`, read MinerU official Markdown, or read existing chapter/working Markdown. Older V3 review UI remains unchanged. No Markdown is emitted.

`importMineruDocumentIrFromBytes(workspaceId,pdfPath,pdfBytes,ocrPath,ocrBytes)` is pure and read-only. The original JSON parser/element extractor is reused so that page/bbox/type/segments/ID rules stay consistent with the existing proven PDF.js overlays; the old MD matching strategy is **not** reused.

- Every `para_blocks`/`discarded_blocks` item becomes one immutable source element. Total in real case: 315. Every `preproc_blocks` item is retained as raw preprocessing evidence per page; never double counted as a body block.
- One **provisional** `IrLogicalBlock` per body element; total in real case: 224. `readingOrder=null`, `chapterId=null`, `status=provisional`, `audit=unreviewed`, `outputMarkdown=[]`. One-to-one at first import does not assert document paragraph boundaries and is not a forced alignment.
- Each logical block references one real OCR element ID. Blocks have stable first-import IDs minted from the exact source revision ID and retained in the future IR. On re-OCR, the changed source hash creates new identity space; mapping old IDs requires an explicit future migration.
- Raw nested OCR block/segment contents, table HTML, formula notation, media paths and metadata remain intact. Preliminary `block.text` is only concatenated plain OCR `content` spans — **not** final semantic text or markdown; table HTML must not be flattened without a type-specific renderer in IR-WP3 or later.
- Source semantic fidelity tested by reconstructing the entire original MinerU JSON including `pdf_info`, page metadata, `preproc_blocks`, discarded and raw body blocks. The original source bytes remain the sole authority for byte-exact replay; reconstructed JSON may differ in indentation/key order.

## Real-book acceptance (source identities frozen in IR-WP0)

- Input PDF: 1,474,904 B; SHA `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`.
- Input original MinerU JSON: 2,347,546 B; SHA `e7371434b168a68c77e8b26370327670abb150aed63f2989c9f5e7e4336ee4a5`.
- Pages: 22 including rotated visual-coordinate pages 8 and 11; body: 224; discarded: 91; additional preprocessing evidence: 224.
- Provisional logical blocks: 224; chapters: 0; generated Markdown: 0; artificial human-approved elements: 0.
- Original JSON reconstructed semantically identical; 315 source refs traceable to physical PDF pages/bboxes; independent real OCR JSON and PDF content SHA validated before import.
- Preview: `.tmp/ir-wp2/document-ir.v1.json` **inside the repository only**, 2,217,099 B, SHA `6ae3a6574c7ddce186755234c69a565e9166f4aae5b5d282bda7b38fffc7fc1c`. Default file permissions owner-only. Preview write `wx` (create-if-absent); repeated import allows only exact-byte no-op and refuses mismatching contents.
- No user Vault `.ocr2md/document-ir.v1.json` created. Original PDF, OCR JSON, old official MD and legacy PDF-MD mapping SHA+mtime checked unchanged after import. No server restarts/deployment/WorkspaceFS hidden-write permissions added.

## Feature contract

- **FC-IR2-1**: When given original PDF bytes and MinerU JSON bytes from the same authorized book, generate provisional IR in memory preserving every source reference and metadata without consulting any MD file.
- **FC-IR2-2**: In real book test, assert fixed 22/224/91/224, verify exact-source SHA and page types, reconstruct the input JSON semantically from serialized IR. Fail if a source block, metadata key, discarded element or preprocessor view is lost.
- **FC-IR2-3**: Permit preview output only into repo-local `.tmp/ir-wp2/` and never overwrite a changed output. Do not modify original book files, initialize any human audit, or enable new Vault write access.

## UI interaction contract

- **UIC-IR2-1**: No new V3 UI through WP2; existing AG Grid continues to show the legacy mapping/review modes. In IR-WP5 it will switch to the IR block store after user-visible tests. Existing GUI's PDF/MD navigation is not affected by this importer.
- **UIC-IR2-2**: Read-only CLI can produce an isolated IR JSON preview. No UI save button or live-book side effect exists during WP2. Existing human review must not silently migrate as `verified`.

## Test commands

```bash
npm --prefix ui-spikes/v3-directory run test:ir
npm --prefix ui-spikes/v3-directory run test:ir:real
npm --prefix ui-spikes/v3-directory run test:elements
npm --prefix ui-spikes/v3-directory run test:mapping
```

Limitations deferred to **IR-WP3/4**: page-to-paragraph reading order, cross-page concatenation, split/merge, footnote attachment, multi-column ordering, chapter boundaries and structured Markdown renderer. **Human visual acceptance remains pending**; automated semantic roundtrip establishes evidence conservation, not OCR correctness.
