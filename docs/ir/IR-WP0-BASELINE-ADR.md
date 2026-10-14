# Document IR · IR-WP0/8 · Baseline / ADR-IR-0001

Status: **implemented baseline; original files frozen by policy, not filesystem-locked**. 2026-10-09.

## Decision and purpose

This is a new series `IR-WP0…8`; older `PDF-MD-MAPPING-WP0…7` remain an independent, functioning reference workflow. This series replaces its *future content ownership*, not the installed V3 workbench yet.

- Inputs: the original PDF and the **original MinerU page-oriented OCR JSON bytes**. They are read-only evidence. No MinerU-produced Markdown is imported or compared in this series.
- Canonical document content after future human corrections: `document-ir.v1.json`. Markdown is a regenerable projection, not a parallel editable canonical store. Obsidian edits to generated MD must be recognized as external changes and reconciled explicitly in future work; **never silently overwrite**.
- A new logical `blockId` joins one or more source OCR elements/segments, can cross pages, and belongs to a chapter and a reading order *after* IR-WP3/4. PDF bbox is traceable source evidence, **not** proof of OCR correctness.
- Source IDs from legacy `mineruElementExtractor.ts` are tied to *exact original JSON byte hash*. Provisional IR blocks minted on first import retain their `blockId` through later edits within that IR; re-OCR creates a new source identity space and needs explicit migration, not an ID collision or silent reuse.
- `para_blocks` supply body candidates, `discarded_blocks` are preserved as separate inspectable evidence, `preproc_blocks` is a separate raw MinerU preprocessor view and **must not be double-counted**. For genuinely lossless structured import, also retain top-level/page metadata and raw `preproc_blocks`, plus `rawBlock` and nested spans from both body and discarded collections. Raw **bytes** remain in original JSON; IR guarantees semantic-JSON roundtrip, not byte-for-byte whitespace recreation.
- **No invented information** in WP2: one provisional logical block per body `para_block`, no merges or splits, no inferred chapter, no final reading order, no confirmed confidence/MD anchor. Explicit `draft/unassigned/unverified` states. IR-WP3/4 will change these only after evidence and validation.
- AG Grid remains on existing V3 data through WP2. WP5 will use the new IR for main editing UI. Old PDF↔MD map and review Sidecars remain frozen/untouched; do not combine old element-level review claims with new block-level audit without explicit conversion.
- Real document IR stays in project-local `.tmp/ir-wp2/` during WP0–2, not in the Obsidian Vault. A later guarded WorkspaceFS CAS + scoped hidden-path allowlist requires its own implementation/acceptance.

## Real frozen baseline · `Bufett’s Alpha`

Logical directory: `/ocr2md/Bufett’s Alpha`.

| source | bytes | SHA-256 |
|---|---:|---|
| `Buffett s Alpha.pdf` | 1,474,904 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |
| `json/MinerU_Buffett s Alpha__20261008112941.json` | 2,347,546 | `e7371434b168a68c77e8b26370327670abb150aed63f2989c9f5e7e4336ee4a5` |
| preexisting `.ocr2md/pdf-md-map.v1.json` | unchanged | `168d6bb0a5a957dc2bb797be481f47edf7a9746bf12e01eea4e4bf7cac5ee1e2` |

MinerU `3.4.4 / hybrid`: 22 physical PDF pages; 224 `para_blocks`; 91 `discarded_blocks`; another 224 `preproc_blocks` entries stored as preprocessing evidence rather than extra logical blocks. Page 8 and 11 are rotated; retain MinerU visual `page_size` and normalized bbox instead of double rotating. Existing Markdown and 6 chapter working pairs remain protected as legacy references, but they **will not** be read by the new importer.

## IR-WP0 acceptance

- Baseline source locations/hash and counts verified from actual bytes.
- `git status` reveals large intentional WIP (many tracked edits and untracked files). Never `reset`, `clean`, `rebase`, `force push`, bulk stage, or restart infrastructure for this series.
- No production server/deployment changes in IR-WP0–2.
- Human data/content audit is **not done** and should never be described as verified in IR-WP0–2.
