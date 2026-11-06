# GPT-6 Internal — PDF layout audit known-issue repair / Round 3

**Frozen SOURCE SHA** `9c47e44f1fc6b44b4f126030d68008854aced6ca` is unchanged. **Current fix SHA** `f2f2b1050071147c040912f50df334c91d654944` is a descendant of Round 2 `f3796e1633ce9e64dcf976892965c72f291f697e`.

**GitHub fix branch:** `fix/internal-pdf-elements-9c47e44-r3` (normal push, remote SHA independently verified). **Main was neither merged nor deployed**. This is independent repair evidence, not an independent third-party approval.

## Three additional, formerly failing suites with real targeted PASS

1. `tests/preview-split-browser.test.mjs` **PASS Chrome / iPad WebKit**. Historical test still accessed retired `.ocr-pdf-mark-subblocks`, throwing a null `getBoundingClientRect`. Actual milestone has no auto-annotation action and hides `.ocr-pdf-promote-child` while text-block structural changes remain read-only. Updated the test to assert **all five available PDF controls are geometrically inside their toolbar** and **neither forbidden structural control is visible**. The original uninterrupted split→merge→split flows, single PDF.js instance, zoom preservation, AG→PDF location, unchanged source, and absence of page errors all PASS. Test contract was made more specific, not globally waived.
2. `tests/illegal-break-rescan-real.browser.test.mjs` **PASS Chrome / iPad WebKit**. Independently reproduced two unsolicited Vite `full-reload *` events in the middle of the **real nspell Worker scan**, resetting the AG module to chapter-boundary. `vite.config.mjs` now explicitly prebundles `nspell` at startup with `optimizeDeps.include`. This eliminates late lazy-Worker optimizer reload and does not change the production scanner. Real browser tests verify old mark restoration, explicit rescan adds exactly one new result, save yields two deduplicated CMD annotations, and reload recovers both without rescanning. One failing and one passing live browser log kept.
3. `tests/illegal-break-source-edit.browser.test.mjs` **PASS Chrome / iPad WebKit, original strict test unchanged**. A real intra-child `portfolio` illegal-break candidate had `beforeBlockId===afterBlockId==='p8b3s0'`. `ui/pdf-preview.js:focusCMDPair()` called physical-parent `focusBlock`, discarding subblock `s0` identity, yielding an overlay with empty `data-pbs-id`. The fixed same-ID branch calls `focusLine` against the CMD source scope to reconstruct the exact child path and original bbox; all other cross-block A/B paths still use `compareBlocks`. The real tests now show `pdfId=p8b3s0` after source edits, AG refocus, and returning through another AG module, with visible CM6 text, no auto-save, and no extra editor instance. Initial failing diagnostic logs and new PASS log both preserved; temporary debugging modifications to the test were removed.

**Cumulative targeted results:** the previous Round 2 verified **8 of the original 26 failed suites**, and this Round 3 verifies **3 more**, for **11 of the original 26 with standalone PASS evidence** (not a claim that only 15 currently fail, or that full audit is green). Remaining 15 have no new full-SHA PASS claim.

## Gates and open issues

- `npm run build` **PASS** (fresh build at Round 3 SHA).
- AM build/check **PASS** (310 registered APIs, 102 UI files, 62 cross imports; static boundary zero recorded violations).
- Python AM unit test run: **43 run / 42 PASS / 1 SKIP**.
- Model-level `tests/illegal-break-pair.test.mjs`, `tests/cmd-block-chains.test.mjs`, and `tests/cmd-pbs-parent-group-order.test.mjs` **PASS**.
- `tests/illegal-break.browser.test.mjs` **still FAILS** at `0 !== 4` after eliminating HMR. It expects scan to **automatically write all four candidate CMD marks**. Current product is an explicit AG-review workflow with status values “断行合并 / 忽略 / 待定”. No unapproved automatic writing was restored and the old strict test is untouched.
- `tests/pdf-child-region-select.browser.test.mjs`, WP4/WP5/PDF bbox, PDF drag/join, sentence, text-block and other historical suites require further review. They cannot be certified by Round 3 targeted test results. Read-only milestone contracts vs historic test assumptions remain an explicit risk.
- Standard **143-suite full AM/Git has NOT been rerun** for `f2f2b10`. The last actual full run was at old SHA `47205a7`: 117 PASS / 26 FAIL, 343/450 linked tests; this older number **must not** be re-labelled as Round 3.
- **66 runtime callsites need manual boundary review** even though static AM check passed.
- Linux and physical iPad: **NOT VERIFIED**.
- `SOURCE_MERGE=NO`, `PRODUCTION_CUTOVER=NO`; Main/remote main, frozen source, and production data unchanged. No force push, rebase, reset, or changes to original failure evidence.

This round's executable logs (including original failures, all three real browser successes, build, Python and AM) are in `round3-f2f2b1050071147c040912f50df334c91d654944/logs/`, with SHA256 manifest `evidence-sha256.txt`.
