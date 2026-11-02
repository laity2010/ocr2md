# CMD · PBS Atomic Block / BC Block Chain · WP0 implementation evidence

Source baseline: Main `e7fd4d2f920e8f1ed7a0e5c5ebc7d5d72fc83452`
Worktree: `experiment/text-block-pbs-bc-wp0` (isolated; **not deployed**).

## Contract and boundaries

1. Every valid, explicitly anchored PBS is an atomic identity `p{page}b{block}[s{child.path}]`, with numeric zero-based `p`,`b` and optional child path; never rewrite it for reading-order changes. A parent source scope ends before the next child/parent tag.
2. All atoms are logically in exactly one chain. An untyped, one-member chain is inferred and requires no BC metadata. New `cmd:block:v1` is one HTML **line comment** with `p`, `b`, optional `s`, `bc`, `seq`, `type`, `role`, `review`, `note`. The block's markdown owns the interval after the comment until the next CMD block line.
3. Explicit BC links can contain nonadjacent and cross-page PBS members; `seq` gives their order inside the object, independent of original PDF order. Chain-level `type` is on seq=0. `role` belongs to member; UI-derived counts/previous/next are **not** independently persisted.
4. Existing MinerU original JSON plus geometry/evidence remain sealed in the document tail. This WP does not add duplicate geometry data. The source-embedded tail is immutable. Future human-adjusted overlay boxes should be stored in a separate tail subsection, keyed by PBS, without mutating the sealed MinerU SHA.
5. AG is a view, not another database. Only CMD reads/writes PBS and BC; AG presents atomic rows and BC grouping. Existing AG block inventory now includes read-only BC, position, role and object type columns, derived from CMD query. The new planner emits guarded full-document `expected/from/to/insert` edits; only an authorized CM6 transaction may apply them.
6. Old `minerujson:block/subblock` and `ocr2md:block-join:v1` remain valid and inspectable. Editing BC in legacy source is explicitly blocked pending conversion migration. No automatic annotation insertion when merely opening a document.

### Example

```
<!-- cmd:block:v1 p="4" b="0" bc="bc-0001" seq="0" type="table" role="header" -->
A table caption
<!-- cmd:block:v1 p="4" b="1" bc="bc-0001" seq="1" role="body" -->
| A | B |
<!-- cmd:block:v1 p="5" b="0" bc="bc-0001" seq="2" role="note" -->
Note continues on another PDF page
<!-- cmd:block:v1 p="5" b="1" -->
Independent text block
```

## Current engineering state

Implemented `ui/cmd-block-chains.js` pure parser, serializer, source projection, and exact guarded membership plan; added new-tag reading to shared `ui/mineru-anchors.js`; `CMDocument.queryBlockAnalysis` projects BC into existing parent AG rows; `CMDocument.queryBlockChains` exposes full source-side atom projection. Added regression `tests/cmd-block-chains.test.mjs` and AM API/ownership registrations.

Passed: direct new model regression (legacy 224 roots, 223 after a join, explicit across-page/nonadjacent membership, split, complete partition, invalid duplicate/seq and escaped metadata); legacy block join, CMD text-block and native child annotation regressions; Vite and MinerU TypeScript builds.

Blocked: Full AM `build/check` in the isolated worktree expects 16 PDF-backed test fixture entries under `.v6/workspace/buffetts-alpha.original.pdf`, not present in the isolated Lab. Do **not** copy Main's persistent workspace file or synthesize a fake matching PDF to make the gate green. Need a proper independently provisioned Lab test fixture with verified hash and evidence. Mac/Linux and Chrome/WebKit checks for the new BC actions are not yet performed.

## Unfinished gates before any Main promotion

- WP1 converter emits and round-trips the new PBS tag, including native child tags, preserving original MinerU JSON byte-for-byte and accepting legacy files.
- WP2-3 the planner is wired to the authorized CMD transaction port and enhanced with atomic split/merge/reorder operations and explicit safe migration from old join annotations; add native end-to-end CM6 Undo/Redo tests.
- WP4 complete AG full-property inspection, child PBS rows, chain groups and edit actions; WP5 drag/drop; WP6 sealed tail overlay corrections; WP7 full cross-platform AM/Git independent audit and Lab/Mac/iPad acceptance.
- No automatic Main merge, push, or public/private production publish until the appropriate gates are satisfied and user approves the promotion.
