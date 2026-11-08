# Sentence Benchmark · 2-API contract (Lab WP0–WP4)

This document records a stage-specific **approved design**, not a new
cross-version AGENTS principle.

## Public business API (module S)

1. S01: `split(md, engine = 'intl')` accepts an immutable UTF-16 Markdown
   string and an engine identifier. It returns `sentences` with original
   source fragments and `pieces` that cover the entire source in order.
2. S02: `rebuild(result)` checks piece continuity, content length,
   sentence-to-piece evidence, and original source fingerprint, then joins
   those pieces back to precisely the original Markdown.

**Direct test:** `node --test tests/sentence-benchmark-public.test.mjs`.
All engine adapters run through the same CMD projection, with no PDF/CM6
dependencies and no independent mutable Markdown copy. The adapters are
module internals, not additional public APIs. Current IDs: `intl`,
`sentence-splitter`, `wink-nlp`; to add an engine edit only the adapter
registry, not the two-API contract.

**Gate:** Every tested Markdown string must equal its actual reconstruction,
including whitespace, comments, LaTeX, code, HTML, OCR anchors and emoji.
The result keeps original untouched spans; rebuilding does not simply return
a cached `md` string. The test rejects missing pieces, overlapping fragments
and changed sentence mappings.

## Independent Web reviewer

The extra `sentence-benchmark.html` page is included in **both** Main and
Lab builds at an identical SHA (not a lab-only business module switch).
It can import multiple Markdown samples, select 2+ engines, show source
positions, compare disagreements or full coverage, and adjudicate individual
candidate boundaries. Review state is stored only in the current browser,
and can be imported/exported as `ocr2md-human-gold/v1` JSON validated
against sample length and fingerprint. It does not write CMD, PDF, or Main
user data. Scores use ONLY human-reviewed candidate boundaries; consensus
is never automatically assumed to be Gold. Gold may include manually added
boundaries not proposed by any engine.

WP05 incremental parent-block changes and PDF actions are out of scope for
this stage and require a later design decision.
