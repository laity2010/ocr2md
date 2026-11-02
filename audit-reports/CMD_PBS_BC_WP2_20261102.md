# OCR2MD · CMD PBS/BC WP2/8 · Block-chain semantic operations

Main baseline: `e7fd4d2`; experiment branch: `experiment/text-block-pbs-bc-wp0`, WP1 baseline `73c8d08`. Work isolated from Main and user mother Markdown. Status: **WP2 engine implemented, not promoted / not published**.

## Implementation

- CMD L-owner `ui/cmd-block-chains.js` provides source-only planners `planCMDMergeBlockChains`, `planCMDSplitBlockChain`, `planCMDMoveBlockChainMember`, `planCMDMigrateLegacyBlockChains`. All require unique validated PBS IDs and a complete one-chain-per-atom partition. Source edits are exact expected/from/to/insert deltas; original body bytes and sealed MinerU JSON remain untouched.
- Merge appends the other BC to destination while preserving an explicit destination ID; inherits an existing source ID where possible; allocates a currently unused `bc-NNNN` for a new multi-member BC. Incompatible typed objects are rejected.
- Split before member C yields `[A,B]` and `[C,D]`, retaining existing head identity and allocating a new identity for the new tail when materialized. Singleton BCs are implicit unless they carry type metadata. Moving one PBS can reorder within a chain or reparent across page boundaries; no physical OCR/source block reorder is performed.
- Explicit legacy migration reads old parent/child annotations and validated `ocr2md:block-join` predecessor markers, emits new canonical inline `cmd:block:v1` with `bc` and `seq`, removes old join comment lines and preserves every other source byte. Never auto-migrates on document open. Missing/malformed/orphaned legacy joins are rejected. Unmarked original MinerU child paths are not invented by this migration. If a migrated document later requests explicit child annotation, it writes canonical `cmd:block:v1` child anchors, never creates a mixed legacy child-tag format.
- CMD transaction port exposes explicit migration/merge/split/move operations, commits through guarded `CMDocument.replaceRanges` with one Undo/Redo step and all-chapter annotation. The old `setBlockJoin` PDF toggle is bridged to BC for new-format documents (new format NEVER acquires legacy block-join tags); legacy docs retain the old path. Old physical block drag is blocked on new PBS documents pending WP5 logical drag/drop.
- `CMDocument.queryBlockAnalysis` projects actual BC predecessor onto existing PDF parent checkbox. The PDF's original box/ID and legacy data remain unchanged. AG's existing BC columns still use the read-only CMD source projection; grouped child-inclusive full AG view is WP4.

## Tests and status

- `tests/cmd-block-chains-wp2.test.mjs`: direct tests for merge→merge→split→move→sort→cross-page→split, preservation of member roles/type, conflicting-type refusal, 224 legacy tags/2 joins migration to canonical BC, idempotence and damaged-marker refusal, exact byte-level original MinerU JSON reverse conversion.
- `tests/cmd-block-chains-wp2.browser.test.mjs`: isolated Chrome + iPad-WebKit CM6 one-transaction actions, 3 Undo restores exact input, Redo restores merge, PDF old toggle writes only new BC and row predecessor matches CMD, explicit migration undo, no disk writes.
- AM `tests/am/audit_boundaries.py` / `test_boundaries.py`: targeted static review; complete AM reference/certification remains **BLOCKED** by missing sanctioned isolated Lab PDF fixture `.v6/workspace/buffetts-alpha.original.pdf`. This must not be silently replaced with an invented PDF, nor treated as a pass. Further independent Linux and real iPad Safari acceptance pending.

## Next WP3 and later

- WP3: transaction API hardening and edge-case tests around virtual chapters, explicit migration/rewrites, idempotent edits, nested child roles, PDF consistency and Undo/Redo across save/load.
- WP4/5: AG full information table including child atoms, BC grouped expansion, explicit drag/drop UI and context actions. Existing physical sort is intentionally disabled for new format until coherent logical sort UI exists.
- WP6: additive per-PBS correction geometry in CMD file tail; do not duplicate or modify sealed original OCR JSON.
- No Main merge, GitHub production push, internal or public deployment in this WP.
