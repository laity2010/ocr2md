# OCR2MD WCP27 · PBS/BC WP8/8 · Functional handoff and Main promotion readiness

**Date:** 2026-11-02
**Experiment:** `experiment/text-block-pbs-bc-wp0`
**Main baseline:** `e7fd4d2f920e8f1ed7a0e5c5ebc7d5d72fc83452`
**WP7 baseline:** `6a38a68910dc8c4e936723c052b908464250506d`
**Final WP8 reference:** the immutable Git commit that contains this report; see local `candidate/pbs-bc-wp8-20261102` tag and `git rev-parse HEAD`.

## Scope and contract

This waypoint **closes functional work**, prepares a source-merge candidate and records what has and has not been accepted. It does **not** independently audit the entire application, authorize a production release, push a development Main, or modify/merge the Main worktree. All work remained in an isolated experimental Git worktree; original user PDF/workspace and the formal AGENTS.md principles were not altered.

1. **WP0:** CMD-owned physical PBS atoms and logical BC chains; every atom initially a singleton chain, stable `p#b#s#` identity.
2. **WP1:** Canonical CMD inline block tags, strict source conversion and original MinerU JSON lossless round-trip; read-only legacy recognition.
3. **WP2:** Validated BC merge/split/move/migrate planners, including nonadjacent/cross-page membership; no physical OCR reorder.
4. **WP3:** Guarded optimistic CMD plans into one CM6 edit/history transaction, virtual chapter Undo/Redo and 412/428 save conflict protection.
5. **WP4:** AG full 224-parent + 43-child view, effective/original PDF bbox, ordered expandable BC groups and migration review.
6. **WP5:** Single-atom drag/drop and reparent, move-to-chain-head, extract singleton; no accidental swap or identity changes.
7. **WP6:** Source-bound human PDF bbox corrections in a versioned CMD footer before immutable OCR evidence; AG numeric and PDF pointer editing; clear restores exact original.
8. **WP7:** Real original PDF browser test for parent `p0b0`, child `p4b0s1`, zoom, correction, history and reset; stable child path selected across geometry refresh.

**WP8 cross-module smoke:** `node tests/cmd-pbs-bc-wp8-handoff.test.mjs` → `WP8_PBS_BC_HANDOFF_PASS`. In **one source document** it merges an original parent with a native child across pages, reorders chain members, overlays the child's corrected PDF bbox, verifies effective AG projection and original OCR bbox, clears only the overlay while preserving the BC arrangement **byte for byte**, extracts the child as singleton and confirms the original MinerU JSON remains byte-identical at every step.

## Latest targeted verification

| Gate | Evidence | Result |
| --- | --- | --- |
| Main ancestry / ordinary fast-forward possible | `git merge-base --is-ancestor main HEAD` | PASS at pre-check; recheck before actual merge |
| Known AM manifest consistency | fixed exactly three stale API/callsite/fixture references in `tests/am/registry.sql`; `python3 tests/am/am.py build && python3 tests/am/am.py check` | `AM_CHECK_PASS`, 270 APIs, 12 modules; **not full AM audit** |
| Production-shaped build | `npm run build` | PASS; only preexisting large JavaScript bundle warning |
| Original JSON converter | `npm --prefix packages/minerujson-md test` | 20/20 PASS |
| PBS atoms / BC planner | `tests/cmd-block-chains-wp2.test.mjs`, `tests/cmd-block-chains-wp4.test.mjs`, `tests/cmd-block-chains-wp5.test.mjs` | PASS |
| PDF footer edits and round-trip | `tests/cmd-pdf-bbox-wp6.test.mjs` | PASS |
| HTTP save/reload/CAS protection | `tests/cmd-pdf-bbox-wp6-save-reload.test.mjs` | PASS, including HTTP 412/428 |
| Combined BC / PDF integration | `tests/cmd-pbs-bc-wp8-handoff.test.mjs` | PASS |
| WP5 interactive drag/merge/extract/Undo | `tests/cmd-block-chains-wp5.browser.test.mjs` | Chrome and simulated iPad WebKit PASS |
| Original PDF.js actual page + parent/child correction, zoom and reset | `tests/cmd-pdf-bbox-wp7-real-pdf.browser.test.mjs` | Chrome native mouse PASS; matched WebKit with injected touch PASS |
| Original immutable PDF fixture | `.v6/workspace/buffetts-alpha.original.pdf` SHA256 `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` | PASS; ignored/read-only test data, never committed |
| Original test Markdown fixture | `packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md` SHA256 `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764` | PASS |

WP6 AG specific browser tests and WP4 UI regressions were last executed in their respective waypoint; WP8's focused rerun instead combined WP5 UI and WP7 real PDF in two engines plus new pure end-to-end source behavior. Do not treat this as an exhaustive whole-application browser run.

## Remaining gates and release decision

- **Physical iPad Safari — BLOCKED:** bridge reported no recent physical iPad. WebKit injected pointer events are not hardware touchscreen delivery, although they exercised the real PDF DOM/geometry and CMD source. Real device/viewport/gesture observation must be performed separately.
- **Linux complete integration — NOT VERIFIED:** prior Linux static boundary checks are not a full Node >=22.13 + Chrome/WebKit run. Report this separately for the intended production platform.
- **AM/Git independent full audit — NOT RUN in WP8:** intentionally deferred per user instruction. The earlier standard audit FAIL for three stale registrations remains historical evidence; those entries were fixed, and `AM_CHECK_PASS` demonstrates only manifest/source consistency, not independently validated runtime boundaries. Do not promote old FAIL to PASS.
- **Main source merge:** structurally **FAST-FORWARD CANDIDATE** because Main is ancestor of experiment. Requires user approval for `SOURCE_MERGE`, confirmation Main hasn't advanced, and re-run of affected checks on the resulting Main SHA. Lab source should be promoted as a version, **not feature copied**.
- **Production cutover:** **BLOCKED** until appropriate independent/cross-platform/hardware evidence and explicit user release authorization. Merge approval and deployment approval are separate actions.
- **No GitHub push / Main merge / internal or public deployment** occurred in this WP8 waypoint.

## Single next action when explicitly authorized

In the Main worktree, verify a clean state and `git merge-base --is-ancestor main candidate/pbs-bc-wp8-20261102`, then use an ordinary fast-forward merge of this candidate and rerun the relevant integration checks on the resulting Main SHA. If Main has diverged, use an ordinary merge and record conflicts; do not rebase/reset/force push. Only deploy after the release gates and separate approval.
