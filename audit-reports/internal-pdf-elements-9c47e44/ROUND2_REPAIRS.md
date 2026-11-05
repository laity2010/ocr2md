# GPT-6 Internal — PDF layout audit known-issue repair / Round 2

**Scope:** independent `fix/internal-pdf-elements-9c47e44` descendants of frozen `SOURCE_SHA=9c47e44f1fc6b44b4f126030d68008854aced6ca`; **Main is untouched**. The original report and immutable full-audit FAIL remain valid historical evidence.

- First catalog gate repair SHA: `47205a753bbdf257226568415a780cbea3dc83bb`.
- First business/CMD repair SHA: `63e9aed19442b7359640241cde2c02402ff80b2e`.
- **Current isolated fix SHA:** `f3796e1633ce9e64dcf976892965c72f291f697e`.
- Github branch delivering the Round 2 SHA: `fix/internal-pdf-elements-9c47e44-r2`. The older `fix/internal-pdf-elements-9c47e44` is a preserved reference to first fix SHA because GitHub rejected its ordinary ref update twice with `fatal error in commit_refs`; a fresh new branch was pushed normally and its remote SHA verified.

## Verified actual fixes

1. `ui/cmd-pbs-locations.js` separates **read-only legacy/synthetic CMD projections** from **physical PDF origin writes**. Unsealed documents lacking a location footer can be inspected; unsealed documents with forged location metadata and any unsealed writes are still rejected. Added explicit negative proof in `tests/cmd-block-chains.test.mjs`.
2. `ui/cmd-block-labels.js` preserves current CMD tag IDs while resolving **legacy MinerU join markers** using the authoritative logical assignments rather than old physical IDs.
3. `packages/minerujson-md/src/index.ts` inverse validation counts a native child promoted out of an absorbed parent, then accepts its valid page-local reorder. It still verifies unique exact physical origin, complete native child ownership and **byte-exact original sealed MinerU JSON**. Seven parent reorder scenarios, including absorbed/promoted before/after, passed.
4. Historical tests `cmd-pbs-converter-integration.test.mjs` and `cmd-text-blocks.test.mjs` had stale evidence expectations. The current frozen `p4b0s0` is a real table-caption text scope (not an empty structure). The current physical `p3b1` contains original independent Notes text, yielding 216 readable blocks and 8 metadata-only; assertions now check actual OCR text, not just count.
5. `tests/am/run-grok-audit.sh` now installs the just-built isolated disposable `.v6/release` before the engineering-initialize test and checks its commit SHA. Never writes developer Main, real document data or production release. The engineering test has **not yet been rerun** against the new SHA.
6. `tests/am/contracts-browser.test.mjs` now passes real 267-native-block sealed CMD converter output and tests that both a rejected adapter and unsealed fake output cannot alter CM6. Real Chromium and iPad WebKit both returned `AM_MISSING_CONTRACTS_PASS`.
7. `tests/ag-function-menu.browser.test.mjs` checks the actual **one visible Shell `#status`**, the populated AG query value, and the retired **hidden** duplicate status span. Real Chromium and iPad WebKit both returned `AG_FUNCTIONS_STATUS_PASS`; no document writes or page errors.

## Observed direct regression results (not an overall audit PASS)

The following **seven originally failing suites** now have standalone actual PASS logs: `cmd-block-chains.test.mjs`, `cmd-source-block-labels.test.mjs`, `cmd-pbs-parent-group-order.test.mjs`, `cmd-pbs-converter-integration.test.mjs`, `cmd-text-blocks.test.mjs`, `am/contracts-browser.test.mjs` (Chrome + WebKit), `ag-function-menu.browser.test.mjs` (Chrome + WebKit).

Two additional, previously nonfailing CMD/PDF direct tests also passed: `cmd-pbs-promote-child.test.mjs` and `pdf-source-locations.test.mjs`. On current fix SHA, `am.py build/check` passed with **310 APIs / 102 UI files / 62 cross imports / 0 static boundary violations**. `python3 -m unittest discover -s tests/am -p 'test_*.py'`: **43 cases run, 42 passed, 1 skipped**. Real code and test execution logs are copied to `round2-f3796e1633ce9e64dcf976892965c72f291f697e/logs/`, with SHA256 inventory.

**Known remaining failure:** `tests/pdf-child-region-select.browser.test.mjs` still fails on a historical automatic-subblock-write expectation. The frozen `TEXT_BLOCKS_READ_ONLY` blocks a PDF click from auto-writing CMD tags. An independent diagnostic showed the original legacy source remained 306,869 bytes, native chip stayed `unmarked`, actual PDF status declared the CMD label absent; **this is consistent with the deliberately frozen structural write policy**. An attempted stronger test of read-only behavior and pre-reviewed isolated CM6 fixture reached additional old assumptions; the partial test changes were **reverted**, original failing assertions preserved. This requires integration owner to decide accepted milestone semantics, not an audit AI silently reopen disabled writes or force a green check.

Other failures from the historical 26 remain **UNVERIFIED / OPEN** (text-block coverage and review, PDF drag, illegal break rescan, sentence focus and other interactive suites). This patch does **not** assert they have passed.

## Mandatory full audit and release gates

The last complete standard AM/Git remains the genuine historical **FAIL at `47205a7`**: 143 suites, 117 PASS / 26 FAIL, 343/450 linked cases, direct API PASS 92/310, 66 dynamic sites requiring review. **No new standard 143-suite run was completed at `f3796e1`**, so the historical `343/450` **must not** be presented as a fresh result. A fresh full standard audit, Linux cross-platform checks and dynamic callsite review remain necessary before any integration acceptance.

- `SOURCE_MERGE = NO` (not certified).
- `PRODUCTION_CUTOVER = NO`.
- **Main has not changed**; no release, rebase, force push, or test-waiver occurred.

Historical report and its original raw logs remain in `FINAL_INDEPENDENT_REPORT.md` and `postfix/47205a7.../`, unchanged.
