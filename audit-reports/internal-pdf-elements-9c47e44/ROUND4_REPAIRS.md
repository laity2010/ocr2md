# GPT-6 Internal — PDF layout audit known-issue repair / Round 4

**Source snapshot unchanged:** `9c47e44f1fc6b44b4f126030d68008854aced6ca`.
**Current independent fix SHA:** `2497a1d8ea27f7776d21cace24e69096055abfd2`, on `fix/internal-pdf-elements-9c47e44-r4`, ordinary GitHub push, remotely verified.
**Previous Round 3 fix:** `f2f2b1050071147c040912f50df334c91d654944` (see `ROUND3_REPAIRS.md`).

## New verified repair

- `tests/text-block-continuations.browser.test.mjs` previously had **Chrome PASS / WebKit FAIL** after switching AG from five continuation candidates back to the original 224-block inventory. It awaited only the existence of `.ag-row[row-id="p0b0"]`, which can be mounted before the WebKit grid cell renderer fills its text. The exact assertion then read `'' !== 'p0b0'`.
- The test now waits until the actual `.ag-cell[col-id="id"]` is visibly populated with **the exact current CMD ID `p0b0`**, and **retains the identical strict `assert.equal(...,'p0b0')`**. This tests the completed UI state instead of accepting an empty row shell.
- Real `WP3_BROWSER_PASS` in **both Chrome and iPad WebKit** confirms the original five candidates (4 column, 1 page), source `p6b6` → target `p6b7` dual PDF orange locator, all 224 original blocks on return, p0b0 identity, **no legacy `/api/pdf-map`**, no page errors, and no document or settings writes. Initial failure and successful rerun logs retained.

**Cumulative confirmed targeted regressions: 12 of the previous 26 failing suites now have new standalone PASS evidence (8 in Round 2, 3 in Round 3, 1 in Round 4).** This is **not** an extrapolation to the other 14 suites, nor a full-snapshot certification.

At this exact Round 4 SHA, `am.py build`, `am.py check` **PASS**, Python AM unit tests **43 run / 42 PASS / 1 SKIP**. The Vite production build and strict source-edit/PDF focus regressions were verified at the preceding production-identical `f2f2b10` SHA; only one browser test file changed in this commit.

**Still open / NOT DONE:** `illegal-break.browser.test.mjs` expects automatic writing of all four candidates, conflicting with current reviewed CMD workflow; several PDF structural write old tests conflict with the explicit read-only milestone; other historical test failures still require isolated reproduction and repair. Full standard **143-suite AM/Git was NOT rerun** for `2497a1d`; last recorded full run at `47205a7` remains genuine FAIL with 117 PASS / 26 FAIL (do not relabel this result). 66 runtime callsites still need independent dynamic review. Linux and physical iPad remain unverified.

**`SOURCE_MERGE=NO` and `PRODUCTION_CUTOVER=NO`** pending independent full audit and resolution of remaining issues. Frozen source, GitHub Main and user data remained untouched; no force push, rebase, reset or failing test waiver.
