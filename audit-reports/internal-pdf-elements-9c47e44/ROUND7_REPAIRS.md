# OCR2MD V6 · internal audit repair · Round 7

**PARTIAL FIX, NOT FULL AM/Git CERTIFICATION.** Immutable original frozen SOURCE SHA `9c47e44f1fc6b44b4f126030d68008854aced6ca`. New independent fix **SHA `71b2c033c524abf038511005fd5385bef9a5055b`**, normal push verified on `fix/internal-pdf-elements-9c47e44-r7`. Source commits: `d0cd40fd83c8c52753b51bd4dfe2d8daa3677a05` and `71b2c033c524abf038511005fd5385bef9a5055b`. GitHub Main remained at `25f17decbb976cad8c2790ae97482bf389f6e34a`. No Main merge/deployment, user documents rewritten, force push, source reset, or original evidence overwrite.

## Two newly resolved original failed browser suites

**`illegal-break.browser.test.mjs`**: **PASS Chrome + iPad WebKit**, verified on real browsers in Round 7. The original audit test failed because the historic `markState` AG column no longer exists; current design has an in-grid native `reviewDecision` select. Test now **strictly requires** all four exact candidate strings (`about 3`, `government`, `international`, `latest 13F`), four pending review selects and **four actual unsaved CMD annotations**, one live CM6 editor, lint warnings, AG→CM6 focus, one initial dictionary Worker scan, manual Save and reload restoring all four annotations **without a repeat scan**. This is not a blanket assertion deletion.

It also exposed a real product defect: Undo of automatic linebreak markers triggered a new dictionary scan, reinserted the marks and **cleared Redo history**. New pure classifier `isIllegalBreakAutoMarkOnlyChange` accepts only whole marker insertions/removals with unchanged prose; it rejects mixed text changes and distinct review comments. The CM6 update path invalidates any pending Worker request and reprojects existing CMD marks/lint on marker-only Undo/Redo **without creating a new transaction**. A dedicated unit test checks insert/undo/rejection. An intermediate browser run reproduced the disabled Redo exactly; the final unmodified browser flow passed both engines. The test also correctly distinguishes a legitimate scan triggered by a real Undo/Redo document update from a forbidden *tab-switch-only* scan, comparing Worker counts immediately around the module switch.

**`pdf-subblock-annotation.browser.test.mjs`**: **PASS Chrome + iPad WebKit**. The old test expected a legacy PDF `mark subblocks` button to rewrite *unsealed* historical Markdown with `minerujson:subblock` comments. The current permitted baseline uses a **sealed, no-loss canonical MinerU conversion** with all native children already marked; the old writer is prohibited in PDF read-only mode. The test now checks the button does **not** exist, exactly **43 native child markers, 224 parent markers**, sealed source can roundtrip byte-identically with `toMineruJSON`, and a real PDF.js canvas click on **each of p4b0 caption/body/note** yields the corresponding distinct original child highlight and the **exact first nonempty CMD content line inside its own native child scope**. This caught an initial obsolete tag-line assumption (caption content is two source lines beyond child anchor, not at marker). The entire CM6 buffer and disk document remain **byte-identical** across navigation; no autosave, duplicate tag insertion or hidden structural mutation is allowed. Full source logs preserved separately, including the initial wrong-coordinate FAIL.

**Additional regression** `illegal-break-review.browser.test.mjs` real **Chrome + iPad WebKit PASS**, fully verifying `断行合并 / 忽略 / 待定`, native AG select and row node identity through reviews, one-step Undo/Redo, no annotation-only dictionary rescans, manual Save/Reload, and no source text joining.

## AM/Git and current exact SHA checks

- `npm run build`: **PASS** on exact current fix SHA.
- `python3 tests/am/am.py build`: **PASS**, **12 modules / 311 API entries / 14 messages / 20 publishers / 39 subscriptions / 452 test cases**.
- `python3 tests/am/am.py check`: **PASS**, 102 owned UI JS files, 62 cross-imports, zero declared static boundary violations. Newly exported L96 `isIllegalBreakAutoMarkOnlyChange` has an explicit registry API, actual Shell→Layout source callsite, direct and browser test records and **one precise static import allowlist symbol**. The initial AM failure `UNAPPROVED_CROSS_SYMBOL main.js->illegal-break-review-annotation-update.js` was reproduced and **preserved**, then fixed; no global test gate or violation suppression.
- `python3 -m unittest discover -s tests/am -p 'test_*.py'`: **43 run, 42 PASS, 1 SKIP**.
- `node tests/illegal-break-review-annotation-update.test.mjs`: **PASS**, positive and mixed-edit negative coverage.
- `git fsck --full --no-reflogs`: **PASS**; independent fix and audit worktrees clean.

## Remain explicitly open

**18/26 historic failing suites now have *targeted* PASS evidence** across R2–R7. **Eight historic failures remain unresolved/without fresh targeted PASS:**

1. `cmd-block-chains-wp4.browser.test.mjs`
2. `cmd-block-chains-wp5.browser.test.mjs`
3. `cmd-pdf-bbox-wp6.browser.test.mjs`
4. `pdf-block-drag-edge-scroll.browser.test.mjs`
5. `pdf-block-join-toggle.browser.test.mjs`
6. `pdf-block-reorder.browser.test.mjs`
7. `pdf-child-region-select.browser.test.mjs`
8. `text-block-review.browser.test.mjs`

Some require replacing obsolete unconditional structure-writing workflows with strict evidence-backed *read-only* contracts; others contain genuinely permitted before/after/reparent gestures that must be separately investigated, not dismissed as obsolete. The real edge-scroll experiment from R6 remains FAIL and its test was left unmodified.

**A complete 143-suite standard AM/Git audit on the final `71b2c03` SHA has NOT been executed.** Only historic full run `47205a7` (117 PASS / 26 FAIL, 343/450 linked cases) exists. Dynamic runtime review still has **66 candidate callsites**; Linux full-browser audit and physical iPad unverified. Therefore **SOURCE_MERGE=NO / PRODUCTION_CUTOVER=NO**. Do not use cumulative targeted PASS as a full audit certificate.

All Round 7 actual initial FAIL, diagnostic, intermediate FAIL, final Chrome/WebKit PASS, production regression, build, AM, Python and Git evidence logs are archived under `round7-71b2c033c524abf038511005fd5385bef9a5055b/logs/` with SHA256 digest manifest; earlier reports remain intact.
