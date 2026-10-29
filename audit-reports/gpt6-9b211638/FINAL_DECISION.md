# OCR2MD V6 — GPT-6 independent AM/Git FULL audit, final decision

**Auditor:** GPT-6 independent auditor, using AgentDock remote execution on macOS Apple Silicon and isolated Debian ARM64 Docker. This is a real execution report, not a claim of Grok/Muse signatures or production deployment.

## 1. Exact source, immutability and independent branches

| Subject | Exact observed value |
| --- | --- |
| Repository | `https://github.com/laity2010/ocr2md` |
| Public audit delivery | `audit-public-9b211638` @ `f755ac947904c361d8148d6231b2fa778824a182` |
| **Frozen original SOURCE** | `9b211638b1791fc0ac4b084cc565230203507d9d` |
| **Auditor FIX tested** | `86c32a055a042ad56a26b93f7a82458c897d3999` (direct child of frozen SOURCE) |
| Fix branch | `fix/gpt6-9b211638` |
| Report branch | `audit/gpt6-9b211638-report` |
| Original PDF SHA256 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |
| Original MinerU MD SHA256 | `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764` |
| Final fix tree | `git fsck` clean, `git diff --check` clean, frozen source clean, Main untouched |

**Do not confuse package HEAD, frozen SOURCE, and fix HEAD.** Every `postfix/mac/full/` report audits the **FIX SHA**, not the original SHA. Original full audit of the exact frozen SHA was interrupted by a genuine strict AM test failure; its own original FAIL is retained separately in `original-fail/`.

## 2. Original immutable findings

**Attempt 1: BLOCKED, expected isolation guard.** `bash audit.sh` correctly refused its default target because an existing sibling directory was attached to another Git common directory. Preserved `original-blocked/run.log`; never removed or reused that other directory.

**Attempt 2: FAIL.** A fresh `OCR2MD_AUDIT_TARGET_DIR` allowed clean exact-SHA checkout, verified PDF/MD hashes, Mac Chromium/WebKit startup and build; then `tests/am/test_boundaries.py::GateTests.test_baseline` failed **expected 48/9/31, actual 63/12/38**. The runner exited *before* registered AM 240-link execution (0/240). Evidence `original-fail/{run.log,report.json,report.md}`. Never rename this original FAIL to PASS.

**Additional independent source finding, F-01 P1:** `ui/wcp-source-file-navigation.js` subscribed to AG-owned `.ocr-outline-checkbox` and Shell-owned `#chapter-start-number` via global `event.target.matches` on `change/input`. Static import PASS did not detect this foreign DOM coupling. Evidence original source and `git blame` origin `4adc7b3e`.

## 3. Fix implementation, with tests retained

At `fix/gpt6-9b211638` commit `86c32a055a042ad56a26b93f7a82458c897d3999`:

1. Update **strict equality** in `tests/am/test_boundaries.py` to the actual frozen source AM inventory `(63,12,38)`; keep all original asserts, without deletion or skips. Add an explicit **negative** anti-foreign-DOM regression assertion.
2. Remove the foreign AG/Shell DOM selector listeners from `ui/wcp-source-file-navigation.js`. CMD `viewStore.documentRevision` remains authoritative for chapter marker mutations, while Shell explicitly calls the bounded `sourceNavigation.refreshChapters()` port after accepted chapter-number input in `ui/main.js`.

Exactly three committed files changed. No production settings, document, browser fixture, PDF, MD, frozen source, Main or Lab release was modified.

## 4. Actual fix SHA full standard audit: **FAIL, 235/240**

**Mac Darwin ARM64, Node 23.11.0, Python 3.13.3, real Playwright Chromium and WebKit.** A fresh detached fix tree executed the entire 57-suite AM list with unchanged test assertions:

| Metric | Final observed result |
| --- | --- |
| Browser/contract suites executed | **57/57** |
| Suite results | **52 PASS / 5 FAIL** |
| AM case/link associations | **235/240 PASS**, 5 failed |
| APIs registered | **167** |
| APIs with an independently direct passing test | **51/167** |
| APIs **without** a direct passing test | **116/167** (integration evidence cannot substitute) |
| Test links, registration classification | 61 direct / 179 integration |
| AM messages | 13 (including 6 DOM topics) |
| Registered publishers/subscriptions | 19 / 28 |
| Static ownership/import violations | **0** |
| Unregistered literal DOM event sites | **0** |
| Dynamic runtime callsite review inventory | 53 lexical sites; scanner is not exhaustive |
| Runner / standard report | `exit 1` / `status=FAIL`, `AM_RESULTS_INCOMPLETE` |
| Git SHA / tracked status | requested fix SHA and clean |

**Five original suite FAILs — preserve BOTH original and targeted repeat:**

| Suite | Full run FAIL | Exact unchanged standalone repeat | Classification |
| --- | --- | --- | --- |
| `08 code-fence-highlight.browser` | WebKit page navigation timeout after Chromium PASS | Chrome+WebKit **PASS** | Intermittent browser/host regression risk; not full-suite certification |
| `23 main-promoted-lab-ui.browser` | Missing `.v6/settings.json` in cold isolated checkout (ENOENT) | After creating minimal settings **only in ignored isolated test target**, Chrome+WebKit **PASS** | Runner fixture provisioning deficiency; run originally FAIL, initial environment not reproducible by default |
| `27 media-preexisting-adoption.browser` | Chromium PASS, WebKit 12 records vs required 11 (`待采用/未下载/未引用`), timeout | Chrome+WebKit 11/11 adopted & reloaded **PASS** | Intermittent WebKit/fixture state race **suspected, not proven**; needs new clean full runner |
| `39 pdf-anchor-viewport-browser` | Assertion requires old *screen-cropped* scrollport (`scrollerBottom > windowBottom`) | **FAIL again** on exact same precondition | **Persistent P2 gate/fixture geometry gap**, current anchor visibility prefix checks passed; scroll-isolation assertion not reached. Cannot certify this case. Do not relax test. |
| `43 quote-indent-browser` | Chromium PASS, WebKit caret gutter moved **-22.390625px**, allowed <=5px | **FAIL again** on exact same offset/selection with unchanged `scrollTop` | **Persistent P1 WebKit UI regression**, no weakening or deletion. Requires safe viewport-anchor correction and dual-browser test before closure. |

**Important limitation:** The isolated settings file was supplied mid-way through the first repair run to diagnose test 23, so the first completed 57-suite run is **not a pristine beginning-to-end run with identical cold-fixture provisioning**. It nonetheless ran all original test cases and returned FAIL, with exact logs preserved. A fully green cold full rerun on a consistent runner fixture is still required.

Unedited raw standard runner artifacts: `postfix/mac/full/{run.log,report.json,report.md}`. The report JSON retains the 116 direct-API coverage gaps and separate direct-vs-integration evidence. Individual failed plus rerun logs are in `postfix/mac/`. No manual retest was added to the official 235/240 count.

## 5. Independent Mac/Linux additional real tests

**Mac repaired SHA:** `node --check` touched files PASS; AM Python tests **34 executed, 33 PASS + 1 skip**; ownership/import static PASS. Real isolated Chromium/WebKit A/B save conflict (unchanged `wcp-cas-two-editor-regression.test.mjs`) each **A=[200,200], B=[412]**, old client draft and Undo retained, no overwrites, zero JS errors, original fixture restored to exact SHA. Read-only source PDF and authorisation remained isolated to disposable fixture. Separate default Main UI Chrome/WebKit test PASS after isolated settings provisioning. This proves localhost regression, **not** external HTTPS cutover.

**Linux Debian 13 ARM64, Node 23.11.0, Python 3.13.5, exact fix SHA via independent Git bundle:** Python AM 34/34 PASS; portability 64-port preflight PASS; fresh `npm ci` and production build PASS; real Chromium & WebKit executable preflights PASS. Five real dual-browser feature suites all printed PASS: fenced syntax highlighting, virtual chapter semantic events, Obsidian callouts, source line menu/fence operations, and note pairs. Four more service contract suites PASS with outer process `exit 0`: portable Node invocation, root/book document/PDF switch + stale HTTP 412/409, bounded WCP API/module graph, settings server.

**Linux exception:** Five browser suites each emitted PASS but their external container wrapper returned exit status **1**. This is a **harness exit discrepancy** requiring investigation; it cannot be silently labeled complete 57-suite Linux PASS. Linux never ran the entire registered 57-suite AM list, and real iPad hardware was not used (WebKit emulates iPad settings).

## 6. Independent call chain/ownership analysis

The original standard audit listed 53 lexical runtime sites: **29** `viewStore.getState()` reads, **13** `viewStore.subscribe()` observers, **7** `viewStore.setState()` writes **all within owner `ui/view-store.js`**, and **4** Shell/debug DOM/window accesses. Details/locations and DOM topic review in `DYNAMIC_CALLSITE_REVIEW.md`. Registered literal publishers and subscriptions match the declared messages; however the original cross-module AG DOM listeners were *not* in this lexical inventory, demonstrating the scanner's incompleteness. No blanket PASS of API semantics, dynamic DOM delegation or shared-object access is justified by zero static findings. Integration-only API coverage **116/167** remains REVIEW_REQUIRED.

Original static inventory: 63 JS, 12 modules, 38 registered cross imports. The fixed source inherited this unchanged inventory. Build-time boundary behavior also checked through Main/Lab module-parity contract and Linux build; these do not certify public authorization behavior.

## 7. Priority and remaining risks

- **P1, OPEN**: WebKit source gutter caret jumps by 22.390625px when multi-line quote indentation modifies CM6; stable reproducible; do not disable strict 5px assertion.
- **P2, OPEN**: PDF viewport regression fixture cannot exercise required historic screen-cropped scrollport geometry; retains FAIL; verify both actual cropped geometry and normal viewport with strong asserts rather than weakening it.
- **P2, OPEN**: HTML settings fixture is not created by default cold standard runner; retain failure and add isolated fixture provision in a subsequent controlled change, then rerun complete gate.
- **P2, OPEN**: Code fence WebKit intermittent startup timeout and media preexisting-adoption WebKit transient 12/11 state discrepancy; standalone repeats PASS, but no conclusive root-cause or full green run.
- **P2, OPEN**: Linux five-suite wrapper exit mismatch; full Linux registered suite not executed.
- **REVIEW_REQUIRED**: 116 of 167 API entries lack a direct successful test; dynamic runtime delegation beyond 53 lexical sites and public HTTPS session/CAS/prod data separation not completely certified.

No failed test was deleted, skipped to pass, or weakened. Targeted repeats are additional evidence and **never** overwrite the five official FAILs. A partially successful run does not become a certification.

## 8. Explicit independent conclusions

**`SOURCE_MERGE = NO` (full automated source merge not authorized).** The fix branch consists of two narrow, source-backed repair candidates and **may be reviewed / selectively cherry-picked by Main** after checking its own current HEAD, WCP owned-interface semantics, and affected regression gates; however the completed 57-suite FIX standard audit is `FAIL 235/240` with two persistent repros. Do not auto-merge the entire fix as a certified next audit baseline without remediating/blocking issues and rerunning the complete standard gate. Report commit does not grant a Grok/Muse ACK or merge approval.

**`PRODUCTION_CUTOVER = NO`**. The production release, cloud tunnel/external HTTPS, login authorization semantics and user document were deliberately untouched; the Mac full gate fails, Linux full gate is missing, and no safe independent production cutover is certified. No production release was performed.

**Next required independent actions:** repair WebKit gutter anchor without changing assertions; reproduce the PDF cropped-viewport scenario via correct test fixture (and separately test normal geometry); make cold settings fixture provision deterministic; investigate intermittent media and Linux wrapper exit; rerun fresh Mac + Linux 57-suite/240-link tests, complete dynamic call-path review, then let the **Main maintainer**, not this auditor, decide source merge and later cutover.

## 9. Evidence index

- `original-blocked/run.log` — untouched first BLOCKED.
- `original-fail/{run.log,report.json,report.md}` — untouched true frozen SHA FAIL.
- `git-provenance.txt` — fixed and original Git refs, SHA parents, `git fsck`, fixture hashes, remote fix ref.
- `INDEPENDENT_REVIEW.md` — source findings and causal repairs; interim verdict superseded by **this file**.
- `DYNAMIC_CALLSITE_REVIEW.md` — manual 53-site classification + scanner blind spot.
- `postfix/mac/full/{run.log,report.json,report.md}` — **FULL 57/57 run, FAIL 235/240**.
- `postfix/mac/` — reproducible P1/P2, intermittent FAIL+repeat, A/B 412 conflict test and isolated Main UI.
- `postfix/linux/` — installed dependencies, build, real browser startup, feature suites, service regressions and wrapper anomaly.

**Safety:** Tests used immutable/original fixture hashes and disposable copies. No force push, rebase/reset-hard/git clean, frozen source edits, production user document edits, production release deployment or loosened test assertions.
