# OCR2MD virtual chapters · WP0–WP2 read-only checkpoint

Scope: independent `experiment/virtual-chapters-wp0-2` worktree; **no application wiring, disk migration, document modification, branch merge, or deployment**. The code only indexes an externally supplied Markdown snapshot in memory. The existing CMD HTML-comment schema remains authoritative.

## WP0 · Verified snapshot and migration blocker

- Sample: lab-isolated `document.md` and manifest-managed six `chapter/*.cmd.chapter.md` files (read-only).
- Mother UTF-8: **308,370 bytes**, SHA-256 `33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc`, manifest source SHA identical.
- All six physical chapter SHA-256 checksums matched the manifest.
- Main source: 19 headings, 13 `ocr2md:chapter:v1` markers and **zero** `ocr2md:latex` review markers.
- Physical chapters contain **38** LaTeX review annotations: chapter 001 has 24, chapter 003 has 8, and chapter 004 has 6.
- Existing exporter reconstruction is byte-identical to three physical chapters (000, 002, 005), **not** to the three reviewed chapters (001, 003, 004). All six chapter-wise heading/media/LaTeX counts agree between the new virtual index and persisted chapters. Equal element counts **do not** prove equal contents or edits.
- **BLOCKER for WP7**: these chapter-only annotations and any other independent textual edits must undergo anchored, conflict-aware lossless reconciliation. Never delete the chapter files or assume concatenation recovers their changes.

## WP1 · CMD full-document index experiment

- `labs/cm-html/wp0-2/document-index.js` uses the existing `buildOutline`, `findMedia`, `findLatex`, `scanAnnotations` and `findReviewMarkers`; does not define a new persistent format or alter the HTML-comment grammar.
- One Markdown string yields **72 elements: 19 headings, 11 media references, 42 LaTeX formulae**. Every indexed record carries full-document UTF-16 offsets, type, virtual chapter ID, and relevant read-only attributes.
- The source-backed `createIndexProjector(getMarkdown)` memoizes a *derived read-only index* for an unchanged snapshot and recalculates it after the source changes. It does not own or save a second editable Markdown document.
- Headings retain MinerU block identity; confirmed LaTeX formulas with existing `ocr2md:latex id=...` have persisted element IDs. Unreviewed LaTeX/media IDs are **derived from block provenance + occurrence ordinal**, and are not guaranteed stable after edits/reordering *within* the same block. Stable persistent identification of those elements remains a later WP6 decision, not something to disguise with a new JSON file.

## WP2 · Virtual chapter mapping experiment

- Existing chapter boundary comment semantics (`ocr2md:chapter:v1`, with historical tag compatibility) determine where independent chapters start. Their persistent chapter IDs reuse the first heading's MinerU ID, not export filenames or mutable section numbers.
- All six chapter ranges are ordered nonoverlapping source offsets. Their virtual text slices concatenate byte-for-byte (in JS source code points / UTF-16 string representation) to the *body* of the original Markdown. The 215,262-character MinerU original-evidence tail remains in the **same** main document and is never rewritten, split or silently assigned to an editable chapter.
- `queryElements({chapter:'all'|chapterId,type:'all'|'heading'|'media'|'latex'})` provides the new AG data contract without instantiating another AG or opening a physical chapter. Section ownership derives from element source position.
- Reclassifying a chapter boundary changes element ownership, not element HTML annotations. The experiment does **not** yet change the CM6 viewport, AG display, preview, save or existing public lab.

## Commands / gate

```sh
node --no-warnings --experimental-loader ./labs/cm-html/wp0-2/css-loader.mjs labs/cm-html/wp0-2/audit.mjs "$MOTHER_MD" "$CHAPTER_DIR"
WP02_MOTHER_DOCUMENT="$MOTHER_MD" node --no-warnings --experimental-loader ./labs/cm-html/wp0-2/css-loader.mjs labs/cm-html/wp0-2/document-index.test.mjs
```

`css-loader.mjs` is only a Node test shim for the already-existing CSS-importing Media scanner; the production CSS import stays intact. No Node path or browser installation is embedded in the module.

**Gate WP2:** all physical files verified; six virtual partitions + full source conservation + equivalent six-by-three element counts. **Gate WP7 remains blocked** by the confirmed chapter-only review history. WP3 will integrate the CMD query with the actual WCP/AG view behind an independently tested feature switch.
