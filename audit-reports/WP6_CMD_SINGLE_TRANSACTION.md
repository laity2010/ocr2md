# OCR2MD WP6/8 — unified CMD transaction gate

Branch: experiment/virtual-chapters-wp0-2, isolated lab only; no public deployment or production file mutation.

## Reused architecture and local additions
CMDocument already owns HTML comment read/write, optimistic source edits, a single CM6 transaction per business operation and native Undo/Redo. Existing Heading, Media and LaTeX modules still own their business planning and AG Grid renderers. The persistent syntax remains current CMD HTML comments, not JSON or any other file.

The new independent module labs/cm-html/wp0-2/cmd-element-transactions.js creates a single transactional CMD port wrapping the actual CMDocument. It checks the live CM6 source snapshot, current WP4 virtual chapter boundaries, MinerU original evidence archive boundary, and verifies CM6 actually changed after an accepted edit. Multi-element operations with any invalid range are rejected atomically before dispatch. Media URL replacement additionally requires a currently indexed Media element at every position (never trusts stale AG rows after network I/O).

The lab-specific Vite profile injects the port via existing Workspace getCMD. Three original AG/business modules reuse their existing review/marker functions. The WP3 AG projection calls this same port's cached getIndex, removing its independent derived-index cache. No source editor rewrite, new persistent state, fourth AG Grid or second Markdown parser was added.

## Test evidence
Chrome and iPad WebKit real isolated 6-chapter / 72-element mother test: WP6_SINGLE_CMD_TRANSACTION_PASS for both. Original LaTeX AG review dropdown writes one transaction and a persistent formula review marker ID, Undo returns exact original CM6 source, Redo restores reviewed state and the same stable ID. Current-chapter media URL replacement works in one transaction, Undo restores the original and original media counts. Existing chapter comment marking independent 0 to 1 increases six virtual chapters to seven, Undo returns to six without modifying each element marker. Stale source edits, hidden-chapter writes, mixed cross-chapter edits and source archive mutations are rejected without partial effects. No network business writes, no physical-chapter file reads; isolated mother source is never saved.

## Unfinished gates
Unreviewed media/formula IDs remain block-anchored and order-derived, not persistently stable after within-block reorder; Reviewed LaTeX IDs already are persistent HTML marker IDs. A durable non-breaking source marker for arbitrary inline media is a separate design gate and must not be claimed solved.
WP7 still needs a lossless migration of 38 historically reviewed LaTeX annotations existing only in physical chapters, and save/reopen verification. Whole CMD index rebuild remains 700ms idle-debounced rather than fully incremental. Linux independent cross-platform audit and full WP8 AM/Git audit are pending. No automatic push/merge/deploy is authorized.

## Final integration regression (Mac lab)
- First parallel run revealed missing requestMeasure pass-through in WP6 CMD facade, which generated a Dockview layout exception. Added requestMeasure delegation. The existing mother/physical chapter toolbar Chrome/WebKit regression passed after rebuilding.
- An initial concurrent WP4 browser Undo wait exceeded its timeout, but a subsequent isolated Chrome/iPad WebKit WP4 run passed the original typed edit, Undo/Redo and exact-source assertions.
- WP3 native AG query regression PASS in Chrome and iPad WebKit: 6 logical chapters, 19/11/42 all-element counts, chapter 001 10/5/25, 3 original AG instances, zero physical loads.
- WP5 real-PDF chapter-follow regression PASS in both engines: original 22-page PDF opened from isolated runtime, one PDF fetch, no source modification and global line mapping intact.
- LAB_AG_FILE_MODE_TOOLBAR_PASS Chrome and iPad WebKit after missing API correction.
- WP6_SINGLE_CMD_TRANSACTION_PASS Chrome and iPad WebKit after adding heading marker reclassification. All three original business write paths use the same transactional CMD source.

## Final AM ownership
Writer: original CMDocument / existing CM6 state. WP6 port only validates and delegates to it; no second editor or database. Module owners: Heading plan via chapter-markers, LaTeX review plan via latex-review-markers, Media URL replacement via media-module. WCP Workspace getCMD publishes the restricted transaction capability. Subscriber: WP3 AG uses read-only getIndex on the same port; CM6 updateListener publishes existing documentRevision. All module write methods must be confirmed by actual CM6 text change to report success. Read-only evidence and out-of-scope writes are refused before dispatch.

WP6 is **locally accepted for its single-CM6 transactional core**, not a claim that all unreviewed element IDs are permanently stable or that historic chapter-only reviews have been migrated.
