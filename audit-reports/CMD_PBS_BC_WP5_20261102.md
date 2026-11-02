# OCR2MD WCP27 · WP5/8 — Atomic PBS move / logical BC reorder

Baseline: `9d9c77a` experimental WP4; isolated worktree branch `experiment/text-block-pbs-bc-wp0`.
Main, shared workfile, production build directory, and user PDF remain untouched.

## Feature and UI interaction contract

1. **Drag A onto B**: in AG text-block view, take the dedicated pinned handle (`拖动 <PBS ID> 调整块链成员`) and drop on B's row. Only A moves, immediately after B in B's logical BC sequence; no A/B swap, no physical Markdown move, no rewriting original zero-based PBS IDs. Its former BC retains the order and identity of all remaining members. Dragging onto a visible BC header appends A to that chain's last member. Drag to self/outside grid, pointer cancel, and insufficient movement must not edit.
2. **Cross-page / cross-chain**: the same semantic move accepts target B in a different BC, including original child PBS IDs. CMD planner validates the complete partition, conflicting typed objects, stale source snapshots and immutable MinerU JSON, refusing unsafe moves atomically.
3. **Display**: both flat and grouped AG views arrange multi-member chain members by BC `seq` without touching source PDF order. Grouped mode adds collapsible BC headers; other singletons remain independent. When an AG rescan occurs after a transaction, retain selected PBS and the user-selected target only if those identities still exist. No second persistent AG BC store.
4. **Touch**: pointer events on a handle (`touch-action:none`) are scoped to that handle and use actual hit-testing within the AG host. An `8px` gesture threshold differentiates a tap from a drag; cancelled/lost pointer capture cleans up. Simulated iPad WebKit acceptance is not evidence of physical iPad Safari hardware behavior.
5. **Fallback actions** in the existing AG Function menu: `移动至目标后` uses a previously selected destination target; `移动至链首` moves only selected PBS before the current BC first member; `独立成链` detaches exactly the selected PBS, not all later members. The previous merge/split and legacy migration actions remain unchanged. CM6 Undo/Redo and the global Save flow remain authoritative.
6. **Source and review**: original OCR tail, geometry, source text and individual member roles are byte-identical under logical moves; no direct persistence or API bypass, no auto-save. Legacy-mode drag handles are unavailable pending explicit migration. Candidate review's existing records are unaffected.

## Targeted regression plan

- Pure `node tests/cmd-block-chains-wp5.test.mjs`: 5-member BC forward move and head move; children across PDF pages; reparent a single atom; extract in middle; role preservation; incompatible type refusal; no-op/stale guards; byte-exact original OCR and untouched Markdown prose.
- Browser `node tests/cmd-block-chains-wp5.browser.test.mjs`: isolated Vite app under temporary document, real pointer mouse gestures on AG drag handle, target status from CMD (not merely AG row text), first/cross-chain/extract, CM6 Undo/Redo, no implicit server save, page error guard, Chrome and simulated iPad WebKit.
- WP4 existing UI and legacy AG compatibility browser suites, WP3 HTTP save/reload, targeted 19 AM boundary tests, Vite production build and Git diff check.
- Real PDF double-frame, independent Linux audit, native iPad Safari touch and full AM/Git remain WP7 validation gates and may not be marked PASS on headless emulators alone.

## Observed WP5 targeted results

- `CMD_PBS_BC_WP5_PURE_PASS`: 267 PBS atoms; non-swapping 5-member chain reorder, move to head, cross-page child reparent, extract exactly one member; byte-exact sealed original OCR and unaffected Markdown body.
- `CMD_PBS_BC_WP5_UI_PASS Chrome` and `CMD_PBS_BC_WP5_UI_PASS iPad-WebKit`: real browser pointer-mouse drag onto B, move-first, cross-chain move, extract, native Undo/Redo, zero auto-save, original MinerU untouched. Additionally both browser runtimes dispatch synthetic `pointerType=touch` drag events and observe the actual CMD result, not a simulated assertion.
- Legacy `CMD_BC_WP4_LEGACY_REVIEW_PASS` Chrome and iPad-WebKit: 224 old atoms, five continuation review candidates, drag handles disabled until explicit legacy migration.
- `CMD_PBS_BC_WP4_UI_PASS Chrome` after WP5: original group expansion, merge/split, unsaved invariants intact. Horizontal AG virtualized header scan sampled at smaller increments to avoid skipping columns, without weakening required columns.
- Targeted AM static boundary 19/19 PASS. WP2 and WP4 pure tests, WP3 isolated authenticated HTTP save/reload (stale 412, missing revision 428, unauthenticated 403, original JSON byte-identical) PASS. Vite production build PASS. All tests run in the isolated experiment and do not imply a Main release.
- AG handles implement WP5 logical drag only; the older PDF preview's physical page-local drag gesture is **not** reinterpreted in this WP. Changing that UX requires an explicit PDF-semantic contract and original PDF fixture. This is not accepted or claimed as native PDF drag certification.
- Complete AM/Git, Linux independent audit, actual iPad Safari touch, and authenticated original-PDF dual-frame interaction remain WP7 acceptance gates. No Main merge or production deployment.
- `CMD_PBS_BC_WP4_UI_PASS iPad-WebKit` after WP5: existing grouped BC view, collapse/expand, merge/split and no-auto-save regression PASS.
