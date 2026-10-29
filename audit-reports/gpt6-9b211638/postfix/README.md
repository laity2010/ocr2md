# Post-fix execution evidence (not independent production certification)

Fixed commit SHA `86c32a055a042ad56a26b93f7a82458c897d3999` (frozen parent `9b211638b1791fc0ac4b084cc565230203507d9d`).

- `linux/python-unittest.log`: Debian 13 ARM64, 34 Python AM unit tests pass, initial installed Node 20.19.2. Full browser runner explicitly requires >= 22.13; install later step Node 23.11.0.
- `linux/vite-build.log`: Node 23.11.0 Linux ARM64, fresh `npm ci` at root and minerujson-md + TypeScript + `npm run build` successful with `LINUX_BUILD_PASS`. Large output chunk warning is nonfatal.
- `linux/browser-preflight.log`: fresh Playwright Chromium and WebKit binaries and Linux system dependencies installed in disposable isolated Debian container; **both actual headless browser processes launched and opened about:blank successfully** (`AUDIT_BROWSER_PREFLIGHT_PASS Chromium`, `... WebKit`, `LINUX_BROWSER_PREFLIGHT_PASS`). This is NOT Linux feature-regression certification.
- `mac/code-fence-standalone-repro.log`: direct repeat of the **unchanged** original `tests/code-fence-highlight.browser.test.mjs` using audit adapters, both Chrome and iPad WebKit **PASS**. The first AM-suite invocation timed out in WebKit at `page.goto` after Chrome passed, and remains marked FAIL in first full-run evidence. This is a flaky/host-condition hypothesis; the complete runner FAIL cannot be silently promoted to PASS on this basis.

The audit's 57-suite/240-contract repair run is separate; its raw log/result must be appended, with all original test failures intact.

### Linux real-feature matrix (fresh Debian ARM64 container)

All **five unchanged browser suites** printed real Chromium and WebKit PASS in `linux/feature-browser.log` at identical fix SHA:
1. `code-fence-highlight.browser` — syntax highlighting/unknown fenced code + KaTeX, Chrome and iPad WebKit PASS.
2. `wcp-virtual-event-contract.browser` — 21 virtual chapters, bounded WCP/AG event flow and cross-chapter navigation, no writes, Chrome and WebKit PASS.
3. `obsidian-callouts.browser` — six foldable callouts, retained fold state, no document mutation, Chrome and WebKit PASS.
4. `source-line-callout.browser` — gutter menu, fence insertion, Undo/Redo, explicit save/reload and unchanged original evidence, Chrome and WebKit PASS.
5. `note-pair-browser` — paired/unpaired/conflict colors, two-row navigation and save/reload, Chrome and WebKit PASS.

**Execution anomaly:** despite all `LINUX_TEST_PASS=...` markers (5/5, no `LINUX_TEST_FAIL`), the outer Docker orchestration process reported exit status **1**. Record this contradiction; individual tests passed, but **do not** call this a fully certified Linux runner PASS. The standard 57-suite AM/Linux run is not complete.

### Two-editor HTTP 412 + protected drafts (not part of AM registered 57)

The **unchanged** `tests/wcp-cas-two-editor-regression.test.mjs` ran on a newly built isolated `cm-html` Lab release from the fix SHA. The test uses a disposable runtime path with an isolated unlock token and dedicated PDF/MD copies; the server only bound a random loopback port. In **both** actual Chromium and WebKit:

- Editor A PUT results `[200,200]`; stale editor B PUT results `[412]`.
- Stale editor draft and undo remain intact; disk is never overwritten by B.
- Fixture returned to its exact original content and SHA256, no JS exceptions.

Evidence in `mac/cas-two-editor-test.log`, plus `mac/cas-isolated-lab-build.log` and `mac/cas-isolated-server.log` (no credential content). Do **not** extrapolate this localhost proof to internet HTTPS cutover.

### Main promoted UI baseline test: original missing fixture then real browser PASS

Full `run-all` suite 23 originally FAILed with `ENOENT .v6/settings.json`, because frozen test assumes a local settings fixture the audit cold clone does not supply. This is test-environment fixture incompleteness, not evidence of a failing business API. Without changing frozen/test source, a minimal `{ "settings": {} }` was provisioned ONLY under the ignored isolated test tree; the exact test then PASSed for real Chrome + iPad WebKit, preserving read-only mother chapter selection and settings navigation. See `mac/main-ui-standalone-fixture-repro.log`. The registered full-run FAIL remains unchanged and must not be automatically waived.

### Media adopted-file WebKit deviation in first full run; unchanged test recheck

The original full audit suite 27 returned **FAIL**: Chromium correctly found/adopted 11 local images, while WebKit displayed 12 media records, one unreferenced and one undownloaded, with a 25s wait timeout. Captured `mac/media-preexisting-first-full-fail.log` including original WebKit `PREEXISTING_DIAG`. This failure is NOT dismissed by static success.

The exact source test `tests/media-preexisting-adoption.browser.test.mjs` was rerun unchanged in the same detached fix SHA, and **both browsers PASS** 11/11 adopted and persisted without downloading. `mac/media-preexisting-standalone-repro.log` includes `AUDIT_TEST_FIXTURE_RESTORED_FROM_CRASH` from the existing test fixture preloader; this may indicate a test-isolation/environment race but is not conclusive cause. Until the suite is reproducibly clean in a complete fresh run, consider WebKit media adoption an unresolved intermittent regression risk.

### Mac PDF visibility positive check vs test precondition: persistent FAIL

Suite 39 `tests/pdf-anchor-viewport-browser.test.mjs` proceeded past actual PDF load, AG selection and **anchor visibility checks**, then failed `assert(located.scrollerBottom > located.windowBottom)`. That assertion demands the old screen-cropped scrollport geometry as a test precondition. In this environment, the geometry was not cropped. An **unchanged** standalone re-run failed on the **same** assertion; this is NOT a one-off timeout and cannot be marked PASS. Evidence `mac/pdf-anchor-first-full-fail.log`, `mac/pdf-anchor-standalone-repro.log`. The failure does not on its own prove the PDF anchor is invisible; the test did not complete its scroll independence assertions/screenshot. The correct remedy is a fixture/setup that deliberately reproduces a cropped case (retaining strong geometry/visibility checks), plus a separate normal-layout case. We did **not** delete, skip, or relax the assertion. Remains `REVIEW_REQUIRED / GATE_FAIL` until reproducible whole-test validation.

### Linux isolated workspace root, WCP ports and settings server

`linux/service-contracts.log` contains **four real PASS suites** with the exact same Node23/ARM64 fix SHA, all driven by disposable `/tmp` catalog/MD/JSON data. Key behavior: `V6_NODE_BIN` portable conversion even with empty PATH; rejection of missing Node; book root selection/one-child conversion; switching PDF; original MinerU JSON unmodified; stale document HTTP 412 and stale settings HTTP 409; WCP API bounded ports and forbid Lab module-graph overrides; CMD settings HTTP contract. No production-root write.

### P1 WebKit source gutter **confirmed reproducible FAIL** (not repaired)

Unchanged `tests/quote-indent-browser.test.mjs`: Chromium passes all quote semantics (source metadata, stable anchors/outline/PDF, Undo), but **iPad WebKit fails** the strict gutter position assertion: selected lines 659–661, before marker top `212.140625px`, after `189.75px`, displacement `-22.390625px` (threshold `<=5px`), with same scrollTop `35397`. This was first captured in `mac/quote-indent-first-full-fail.log`, then **reproduced exactly** in unchanged standalone `mac/quote-indent-standalone-repro.log`. This is a confirmed browser-specific UI regression, not a transient timeout. Do not weaken the test. Requires safe source gutter viewport anchoring correction and full double-browser regression before Main acceptance.
