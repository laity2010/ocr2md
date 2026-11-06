# OCR2MD PDF Elements — Internal Round 9 (Independent PDF native-child scope)

**Outcome: ONE original FAIL suite now has strict targeted Chrome+iPad-WebKit PASS evidence. This is NOT a full audit certificate.** Frozen audit baseline SHA `9c47e44f1fc6b44b4f126030d68008854aced6ca`. New isolated fix source SHA **`29e68eef72125888ff7bbdbeec34f1439082ceb0`**, branch `fix/internal-pdf-elements-9c47e44-r9-child-region` (ordinary push/remote SHA verified). Base prior fix `bc469b9892b7afc6f14692e8e992e317c81a1fab`; new one-commit change `29e68ee`. Exact GitHub Main remains `25f17decbb976cad8c2790ae97482bf389f6e34a`. No Main merge/deployment or user document edits.

## Why this round has its own fix/report branches

At the beginning of Round 9, the earlier fix worktree already held **four uncommitted modifications** in the WP5, PDF join-toggle, text-block review and AG-module files. Other R9 worktrees and browser tests were also active. **Those changes are untouched, neither overwritten nor accidentally committed.** To make one audit result attributable and reproducible, created a separate Git worktree from the last verified R8 SHA, then a separate independent evidence branch `audit/internal-pdf-elements-9c47e44-r9-child-region` rooted at the R8 independent report. No force push, rebase or hard reset.

## Original failure and causal repair

Original `tests/pdf-child-region-select.browser.test.mjs` **FAIL** in real Chrome: it expected legacy `p4b0` chip title string `源码作用域为空`; current CMD label correctly says the parent has no **independent** prose but native child scope text can still make the union parent solid. The old test also assumed loading unsealed legacy Markdown with no subblock anchors and clicking a PDF child **automatically injected** structural comments. Current frozen design loads canonical sealed CMD containing all native paths from MinerU; such automatic PDF writes are prohibited. Old test was asserting a different document model and obsolete source location semantics.

The suite is now a genuine, independently isolated **read-only two-way navigation and geometry test**, not an auto-write acceptance test. It uses `toMarkdown(rawOriginalMineruJson)`, checks original `toMineruJSON` byte identity, **224 original parent CMD markers**, **43 native child markers**, 224 actual PDF coverage regions, retired child-writing control absent, and only a disposable temporary CMD file. Real PDF.js and CM6 actions run on both engines.

For each of five original PDF native child rectangles, the suite executes **all three routes**: (1) click native child label → exact CM6 content line; (2) click canvas at original child bbox center → matching native overlay and exact source content line; (3) publish real CM6 source focus on that content line → correct original PDF child overlay. Verified exact positive cases:

| Original PDF | Child | Source line | Role |
|---|---|---:|---|
| p4 | `p3b0s0` | 551 | table caption |
| p4 | `p3b0s1` | 555 | table body |
| p5 | `p4b0s0` | 650 | continued caption |
| p5 | `p4b0s1` | 654 | table body |
| p5 | `p4b0s2` | 658 | table note |

Additional checked visual and provenance constraints: original PDF parent bboxes `p3b0=[68,89,538,458]` and `p4b0=[50,89,521,339]` in original 594×783 page coordinates, within ±3 pixels; **one** original parent checkbox per original parent, no fake child parent controls; native parent and all of its child gutter labels simultaneously visible, each inside its own physical bbox's Y interval and **no parent/child label collision**. Canonical sealed `p3b0`, `p4b0`, `p13b0` union/ordinary parents show real content **solid**, while genuinely structure-only `p2b8` stays **dashed**. Clicking a native child never inserts, saves, or corrupts CMD; exact original buffer and disk file are checked at the end; zero `/api/pdf-map` legacy requests and no page errors.

**Important test isolation fix:** concurrent audits had reused fixed Vite port 5971, causing a browser to connect to the wrong test's server and leaving PDF disabled as `PDF 原文（预热中）`. Replaced fixed port with `createServer().listen(0)` dynamically allocated localhost port, strict Vite binding and explicit PDF.js ready gate. The first collision log was preserved separately; actual Chrome and WebKit passes happened on independent local ports.

The initial strengthened visual test also caught **two obsolete dashed/solid expectations** (p3b0, p4b0) before PASS. Raw fail logs and final PASS logs are all archived; the expected values were corrected to the observable canonical child-aware CMD union behavior, not erased.

**Final real browsers:** `PDF_CHILD_REGION_SELECT_PASS Chrome` and `PDF_CHILD_REGION_SELECT_PASS iPad-WebKit` both PASS with the 5 exact IDs/lines, 224/43 evidence, real reverse navigation and unchanged source. `iPad-WebKit` is an actual Playwright WebKit engine in iPad emulation, **not** a physical iPad hardware test.

## Honest AM registry alignment

Updated exactly four existing integration test records `TC-PDF-TEXT-PARTS`, `TC-PDF-LEGACY-CHILD-FOCUS`, `TC-PDF-FULL-GUTTER-LABELS`, `TC-PDF-EMPTY-LABELS`: fixture pointers now refer to exact sealed original MinerU JSON. Expectations identify the real five bidirectional child regions and physical label Y/collision checks. Explicitly disclose that this test **does not run native PDF text extraction** and **does not prove global all-page chip noncollision**. No registered API or static ownership allowance was disabled or suppressed. Adjacent outdated comments about automatic child labeling and triple-tap were made consistent with the read-only milestone; other historic triple-tap suite remains OPEN.

## Exact final SHA gates

- `npm --prefix packages/minerujson-md run build`: **PASS**; sealed converter built without source changes.
- `npm run build`: **PASS** (only tests and AM registry changed in this round).
- `python3 tests/am/am.py build`: **PASS**: 12 modules, **311 APIs, 14 messages, 20 publishers, 39 subscriptions, 452 test cases**.
- `python3 tests/am/am.py check`: **PASS**, 102 UI owned files, 62 cross-module imports, **0 static boundary violations**.
- Python AM tests: **43 run, 42 PASS, 1 SKIP**.
- `git fsck --full --no-reflogs`: **PASS**. Isolated source clean.

**Cumulative previously failing suites with targeted new PASS evidence: 21 of original 26 across R2–R9. Five original failures remain without verified targeted PASS on this branch:** `cmd-block-chains-wp5.browser.test.mjs`, `pdf-block-drag-edge-scroll.browser.test.mjs`, `pdf-block-join-toggle.browser.test.mjs`, `pdf-block-reorder.browser.test.mjs`, `text-block-review.browser.test.mjs`. Other worktrees may be independently addressing them, but their uncommitted results are **not** counted in this report.

**The 143-suite standard isolated AM/Git audit was NOT rerun on the final R9 SHA**, so there is no latest full test result or certification. Historical full run at prior `47205a7` stays **FAIL (117 PASS / 26 FAIL)**; no extrapolation from targeted PASS is allowed. **66 dynamic runtime callsites**, Linux full-browser certification and physical iPad remain pending. Consequently **`SOURCE_MERGE=NO`, `PRODUCTION_CUTOVER=NO`**.

This directory contains 14 independently preserved original, intermediate and final raw logs with a SHA256 manifest. Source data was never rewritten; GitHub Main remains unchanged.
