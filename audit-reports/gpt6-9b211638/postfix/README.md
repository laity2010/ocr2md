# Post-fix execution evidence (not independent production certification)

Fixed commit SHA `86c32a055a042ad56a26b93f7a82458c897d3999` (frozen parent `9b211638b1791fc0ac4b084cc565230203507d9d`).

- `linux/python-unittest.log`: Debian 13 ARM64, 34 Python AM unit tests pass, initial installed Node 20.19.2. Full browser runner explicitly requires >= 22.13; install later step Node 23.11.0.
- `linux/vite-build.log`: Node 23.11.0 Linux ARM64, fresh `npm ci` at root and minerujson-md + TypeScript + `npm run build` successful with `LINUX_BUILD_PASS`. Large output chunk warning is nonfatal.
- `linux/browser-preflight.log`: fresh Playwright Chromium and WebKit binaries and Linux system dependencies installed in disposable isolated Debian container; **both actual headless browser processes launched and opened about:blank successfully** (`AUDIT_BROWSER_PREFLIGHT_PASS Chromium`, `... WebKit`, `LINUX_BROWSER_PREFLIGHT_PASS`). This is NOT Linux feature-regression certification.
- `mac/code-fence-standalone-repro.log`: direct repeat of the **unchanged** original `tests/code-fence-highlight.browser.test.mjs` using audit adapters, both Chrome and iPad WebKit **PASS**. The first AM-suite invocation timed out in WebKit at `page.goto` after Chrome passed, and remains marked FAIL in first full-run evidence. This is a flaky/host-condition hypothesis; the complete runner FAIL cannot be silently promoted to PASS on this basis.

The audit's 57-suite/240-contract repair run is separate; its raw log/result must be appended, with all original test failures intact.
