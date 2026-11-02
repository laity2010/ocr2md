# OCR2MD · CMD PBS/BC WP3/8 · consistency, history, reloading and failure guards

Main baseline `e7fd4d2` unchanged; experimental worktree `experiment/text-block-pbs-bc-wp0`, WP2 baseline `bcbcfda`. All tests below isolate their source under a fresh temporary directory, never Main user documents.

## WP3 changes

- `createCMDTransactionPort.commitChainPlan` now validates **the entire prospective BC partition before dispatch**. Every planned edit must be an exact CMD atomic identity annotation replacement, or a complete removal of a validated legacy join comment. It refuses stale source snapshots, overlapping or forged ranges, edits touching Markdown prose, missing/duplicate/reordered PBS identities, invalid BC sequence/relationship, and mutations of the sealed original MinerU JSON evidence tail. It then uses the one existing guarded CM6 `replaceRanges` transaction with standard history and original document revisions. Public CMD BC mutation operations optionally accept `{expectedSource}` to reject edits against a previously scanned source.
- Fixed `wcp-cm-virtual-view.js`: native CM6 Undo and Redo transactions now carry the same virtual-chapter editing exemption as a previously authorized registered whole-document CMD operation. Normal out-of-chapter edits still fail; this addresses history restoration of a cross-chapter BC merge while the current virtual chapter remains selected. No new storage or WCP state was added.
- Existing PDF parent checkbox `joinPrev` reads the same BC order that drives CMD/AG: after merging p0b0→p8b0 (nonadjacent across original pages), source model, PDF parent state and AG `chainId` agree. Original PBS tags and PDF bbox are unchanged.

## WP3 tests

- `tests/cmd-block-chains-wp3.browser.test.mjs`: Chrome + simulated iPad WebKit, live CM6 virtual chapter, rejected ordinary out-of-chapter edit, accepted authorized cross-chapter BC change, stale `{expectedSource}` refusal, malformed BC source refusal, shared CMD/PDF membership, undo outside chapter restoring exact original bytes, redo restoring exact BC annotation, no disk modifications or page errors.
- `tests/cmd-bc-save-reload.test.mjs`: isolated loopback Python HTTP server + fresh temp mother Markdown and unlock token. Real `GET /api/document`, authenticated compare-and-swap `PUT`, reload of a cross-page merged BC, split and reload, explicit legacy migration and reload; HTTP 412 stale, 428 missing If-Match, 403 unauthenticated, all preserving existing saved bytes. Exact original MinerU JSON `toMineruJSON` equality verified after all accepted writes. This is an HTTP+data-path integration test, distinct from live browser clicking the production Save button.
- WP0–WP2 atomic and legacy tests remain unchanged; targeted AM static boundary suite, Vite build and Chrome/WebKit browser regressions run separately. No Main merge or public/private deploy.

## Outstanding gates

- Full AM/Git remains BLOCKED by missing sanctioned isolated PDF fixture `.v6/workspace/buffetts-alpha.original.pdf` (not silently substituted, no assertions relaxed); Linux independently audited build and actual iPad Safari human acceptance remain outstanding.
- WP4: AG full child-inclusive PBS/BC table and grouping. WP5: interactive drag/drop and logical sort. WP6: additive human PDF geometry correction stored in CMD tail, separately from the sealed original. Production publication after full branch acceptance, not in WP3.
