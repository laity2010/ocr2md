# OCR2MD WCP27 · WP7/8 · PBS/BC functional acceptance

**Scope:** functional validation and targeted repair of the WP6 experiment only; not an AM/Git full audit, not an independent audit handoff, and not a Main merge or deployment.

## Source and isolation

- Base WP6 SHA: `33ca08fa2e6c83c0accb56863e259b1697d9143f`.
- Worktree/branch: `ocr2md-v6-experiments/text-block-pbs-bc`, `experiment/text-block-pbs-bc-wp0`.
- A prior sanctioned public audit package supplied *read-only* Buffett Alpha PDF to `.v6/workspace/buffetts-alpha.original.pdf` (ignored, never committed). SHA256 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` verified before/after every real-PDF test. Sealed original MinerU JSON is untouched.
- Each browser test uses its own temporary document and HTTP server; it never edits the user document, original PDF, Main worktree or production release.

## Targeted correction

`ui/pdf-preview.js` now retains the canonical native child path in `selected.partPath`. On a subsequent CMD geometry refresh the selected PDF child is resolved by this stable path, rather than a mutable index into `region.subRegions`. If a formerly missing original child acquires a valid user bbox and shifts the array, the editor cannot silently change its target to another PBS. Missing path fails closed; parent selection remains independent. No original OCR bbox/parent ID/BC membership was changed.

## Real PDF browser evidence

Execute from the experiment root after `npm run build`:

`node tests/cmd-pdf-bbox-wp7-real-pdf.browser.test.mjs`

| Behavior | Chrome | Playwright-matched WebKit |
| --- | --- | --- |
| Real PDF.js first-page canvas and original coverage, select `p0b0` | PASS | PASS |
| Move parent bbox through real PDF overlay; see new effective rect | PASS: Playwright native mouse input | PASS: injected `pointerType=touch` on **real PDF DOM** |
| Undo/Redo, resize by corner, PDF zoom reflow, reset bbox | PASS | PASS (semantic DOM buttons, injected touch) |
| Page 5 `p4b0s1` native child chip selects *child*, not parent | PASS | PASS |
| Independently correct child bbox, observe new child fragment geometry, reset | PASS | PASS |
| Temporary disk document still pristine without Save | PASS | PASS |
| Original PDF SHA unchanged | PASS | PASS |

For the WebKit integration test use Playwright's **current bundled WebKit** (`webkit.executablePath()`), or the explicit `OCR2MD_WEBKIT_PATH`/`OCR2MD_AUDIT_WEBKIT_PATH` adapter. The obsolete pinned macOS WebKit 2359 process crashed during repeated PDF edits; this was reproduced and fixed in the test environment by using compatible WebKit 2370. The browser script deliberately labels the WebKit pointer as **injected touch**; it does not claim physical iPad touch input.

### Targeted compatibility evidence

- `npm run build`: PASS; existing large bundle warning, no build error.
- `node tests/cmd-pdf-bbox-wp6.test.mjs`: PASS, original JSON byte-equality, parent/child and repaired invisible native child, footer save/remove semantics.
- `node tests/cmd-block-chains-wp4.test.mjs`: PASS (224 parents + 43 children; 267 single-member BCs).
- `node tests/cmd-block-chains-wp5.test.mjs`: PASS, move/extract/cross-chain, preservation of source identities.
- `node tests/cmd-pdf-bbox-wp6-save-reload.test.mjs`: PASS, actual isolated authenticated save/reload, stale HTTP 412 and missing If-Match 428.
- `git diff --check`: PASS.
- Browser tests for WP4/WP5 and WP6 AG were already confirmed in WP6. This round reran only the targeted changed PDF interactions and pure/save contracts, rather than claiming all old browser tests were rerun.

## Open items

- **BLOCKED — physical iPad Safari**: device bridge had no recently connected physical iPad. Mouse/DOM/injected WebKit events cannot certify real touchscreen capture and PDF zoom under Safari on the actual hardware.
- **NOT RUN — full AM/Git and Grok/Muse independent audits**: intentionally excluded from WP7 at user direction. An earlier unrequested audit attempt was stopped and its unrelated uncommitted AM registry changes were restored; those prior results are not counted as this functional acceptance.
- **No Main promotion or production deployment** without the user's next instruction and applicable gates. This checkpoint confirms the experiment's browser functional behavior, not full production readiness.
