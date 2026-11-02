# OCR2MD CMD PBS/BC · WP1 format migration and evidence (2026-11-02)

Baseline: `e7fd4d2` Main. Worktree: `experiment/text-block-pbs-bc-wp0`, created at WP0 commit `c906111`. This is **experiment-only**; it is not merged into Main or deployed.

## Result

The MinerU JSON converter now emits one `<!-- cmd:block:v1 p="P" b="B" -->` parent annotation and one `<!-- cmd:block:v1 p="P" b="B" s="S.PATH" -->` annotation per native child. The sealed MinerU JSON and PDF geometry stay at the tail, without duplicate inline bbox. The original parent and child IDs retain their zero-based original MinerU identities; BC membership is a separate optional `bc`, `seq`, `type`, `role`, `review`, `note` set on that SAME CMD line. Default singleton BC has no explicit metadata.

The reverse converter accepts old `minerujson:block/subblock` AND canonical new `cmd:block` annotations without rewriting legacy source. It preserves the sealed JSON byte-for-byte on untouched documents, and validates original block order, child ancestry, complete source evidence, typed BC member order, uniqueness, and metadata. Quoted child annotations are included in BC relationship audit. A malformed/missing child and a tampered or incomplete BC are rejected, not silently ignored.

The shared CMD anchor parser, document loader validation, sentence and linebreak readers, workspace catalogue validation, and chapter exporter are dual-format aware. The source gutter, PDF source scope, original per-PDF geometry, AG parent inventory and 224 block logical projections consume the same CMD parser. Legacy explicit child marking remains available only for old documents; 43 native child tags are already present in new output.

## Evidence

- `npm --prefix packages/minerujson-md test`: 20/20 pass; three exported APIs remain unchanged. Includes lossless 22-page 224-parent 43-child Buffett conversion and evidence tamper checks.
- `node tests/cmd-pbs-converter-integration.test.mjs`: pass; 267 original atoms and 267 singleton chains, all 224 parent source positions, 43 child source positions, 22-page PDF geometry, exact original JSON byte-for-byte, cross-page/nonadjacent BC membership and source-only sentence projection.
- `node tests/cmd-pbs-browser.test.mjs`: **Chrome PASS and iPad-WebKit PASS**, isolated new-format document; 267 PBS + 267 BC, AG BC columns and source child label p4b0s1 shown; 224 matched parent records, 21 headings; zero page errors, zero edits and no disk writes.
- `node tests/cmd-block-joins.test.mjs`, `node tests/cmd-text-blocks.test.mjs`, `node tests/cmd-subblock-annotations.test.mjs`, `node tests/workspace-portability.test.mjs`, `node tests/workspace-root-server.test.mjs`: pass for old/new format as appropriate, retaining original assertions and byte-identical evidence.
- `python3 -m unittest discover -s tests/am -p 'test_boundaries.py'`: 19/19 pass, no new static UI boundary issue.

## Remaining work (WP2+) and gates

- Existing PDF triple-click `setBlockJoin` and drag APIs still write legacy `ocr2md:block-join:v1` predecessor annotations; they must be replaced by CMD BC mutations before the new format can be promoted to production Main. In WP1, new reader/view is demonstrated but editing is not yet exposed in the AG/BD interface.
- AG full-property/child-atom views, BC display grouping, typed merge/split/reparent interactions, logical label projection and explicit old join migration still pending.
- File-tail **human-corrected** PDF coverage boxes and provenance need a separate additive CMD format, not mutation of the sealed original.
- Independent PDF-backed full AM/Git audit remains **BLOCKED** because the isolated experiment worktree does not include the fixture `.v6/workspace/buffetts-alpha.original.pdf`. No fake/copy of users' persistent workspace has been used to pass that gate. Independent Linux and real iPad Safari tests outstanding.
- No Main merge, GitHub formal push or internal/public deployment is authorized by this WP result.
