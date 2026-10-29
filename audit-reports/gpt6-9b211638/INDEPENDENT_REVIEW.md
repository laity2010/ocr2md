# GPT-6 independent AM/Git audit — frozen OCR2MD V6 9b211638

> **FINAL:** The interim gate status below is superseded by [FINAL_DECISION.md](FINAL_DECISION.md). Completed 57/57-suite Mac audit was **FAIL 235/240**; SOURCE_MERGE=NO, PRODUCTION_CUTOVER=NO.


## Immutable source, delivery and data isolation

- GitHub: `https://github.com/laity2010/ocr2md`; public delivery `audit-public-9b211638` @ `f755ac947904c361d8148d6231b2fa778824a182`.
- Fixed source: `9b211638b1791fc0ac4b084cc565230203507d9d`; not the delivery HEAD.
- SHA256 PDF: `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`.
- SHA256 MinerU MD: `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764`.
- Original source and test trees were isolated Git worktrees. No Main/production branch, release directory, or user mother document was edited.

## Original result — NEVER overwrite

- `original-blocked/run.log`: first `bash audit.sh` returned **BLOCKED** because its default detached test target belonged to a *different* Git common directory already present on the host. We preserved it and used `OCR2MD_AUDIT_TARGET_DIR` pointing to a new directory; existing target was untouched. This safeguard behaved correctly; this is not a production defect.
- `original-fail/run.log`, `report.json`, `report.md`: second run obtained the exact source, passed both real-browser startup preflights, and built Vite, then failed in `tests/am/test_boundaries.py::GateTests.test_baseline`.
- Strict source inventory **observed** `(ui_js,modules,cross_imports)=(63,12,38)`, but assertion **expected** `(48,9,31)`. The original runner stopped before AM `run-all`; **0/240 contract links executed**, so no claims of initial browser/contract success.

## Independent findings and Git provenance

### F-01 P1: WCP navigation reads foreign module DOM instead of contractual message/port

At source `ui/wcp-source-file-navigation.js:150–156`, global `change/input` listeners checked `.ocr-outline-checkbox` (AG implementation detail) and `#chapter-start-number` (Shell-owned element). That is a cross-module DOM dependency not captured by the static import/topic registry. `git blame` attributes the original code to `4adc7b3e` (2026-10-27). An unregistered direct read cannot be legitimized by an unrelated AM static PASS.

**Repair:** The navigation module subscribes to existing `viewStore` document revision for CMD marker changes; Shell invokes its explicit `refreshChapters()` port when Shell numbering changes. Removed the global foreign-DOM listeners, preserved AG ownership, and added a negative regression asserting this dependency does not return. No AG module internal API was exposed.

### F-02 P1: stale exact AM gate makes genuine fixed-SHA full audit FAIL

`tests/am/test_boundaries.py:24` asserted the historical 48/9/31 inventory despite actual frozen 63/12/38. The test had not been updated with module growth; it failed before any AM contract execution. The fix updates the **exact** triple and keeps the equality assertion, plus the new anti-DOM regression. No test was deleted, skipped, or weakened.

### F-03 P2: recorded portability / evidence limits

Original browser preflight covers macOS Chromium + WebKit startup, **not** the behavior of each feature. The baseline report lists 53 dynamic runtime sites for manual review. AM links comprise both direct and integration evidence: a PASS for a linked integration test does not mean that every one of 167 API functions was called in isolation. The present DOM topic inventory includes 6 DOM topics with declared publishers and subscriptions; string-literal inventory alone does not prove dynamic dispatch and invocation correctness. Independent per-site dynamic event and state injection is not yet exhaustive.

## Fix provenance and initial cross-platform verification

- Fix branch: `fix/gpt6-9b211638`, commit `86c32a055a042ad56a26b93f7a82458c897d3999`, parent frozen source SHA.
- Modified: `tests/am/test_boundaries.py`, `ui/main.js`, `ui/wcp-source-file-navigation.js`.
- Mac Darwin arm64 / Node 23.11.0 / Python 3.13.3: 34 AM Python tests, `OK (skipped=1)`; `node --check` of changed JS PASS; static ownership/import check PASS.
- Linux Debian 13 arm64 / Node 20.19.2 / Python 3.13.5: verified same fix SHA by independent `git clone` from Git bundle; portability preflight PASS (64 ports), 34 AM Python tests `OK`, static ownership/import check PASS. Linux Node 20 is below the audited browser runner's Node >=22.13 requirement; Linux browser/production build require further verification.

## Required independent review beyond AM static PASS

- Verify each runtime cross-module interaction of AG / CMD / WCP / Layout / Settings / Media / LaTeX / HTML / Notes / PDF: an allowed import edge is not proof of compliant use of its returned objects. The original standard report's 53 listed runtime sites provide a finite follow-up inventory, not a blanket PASS.
- Verify save-conflict HTTP 412, write-once persistence boundaries, virtual chapter cursor/focus state, lab/Main identity, origin cookies and HTTPS deployment independently. Local HTTP and start-up browser tests do **not** prove production authorization semantics.
- Verify Linux Chromium/WebKit behavior before production cutover. Never infer Linux PASS from Darwin evidence.

## Gate conclusions (interim; update after actual suites)

- `SOURCE_MERGE = PENDING` — targeted static/unit fixes PASS, browser and AM 57-suite / 240-link run in progress; Main must independently review the diff.
- `PRODUCTION_CUTOVER = NO` — cross-platform browser + independent production HTTPS authorization and data-isolation evidence incomplete; production is not authorized by this audit.
