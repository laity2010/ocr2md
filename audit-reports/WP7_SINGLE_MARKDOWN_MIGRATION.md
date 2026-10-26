# OCR2MD WP7/8 — lossless single-Markdown migration checkpoint

Branch: experiment/virtual-chapters-wp0-2. Isolated lab only; no formal/public deployment, GitHub push, old chapter deletion, or change to AGENTS.md.

## Verified reconciliation
- Mother SHA-256: 33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc. The legacy manifest references exactly this original snapshot; all six old chapter checksums are correct.
- Chapters 000,002,005 are unchanged original exports. Chapters 001,003,004 have respectively 24,8,6 reviewed LaTeX formulas (38 total). These historical edits include both HTML review annotations and formula syntax conversion (fenced display math -> $$, inline formula delimiters), not merely annotations.
- The original LaTeX review planner is replayed over each pre-review export using the preserved IDs read from the legacy files. Each reconstructed reviewed chapter matches the respective physical file byte for byte. Unrecognized, ambiguous, duplicate or conflicting edits fail closed.
- The same 38 planner actions applied to the original mother Markdown yield a verified candidate. Exporting this single candidate regenerates all six historical reviewed physical chapter files byte for byte, while retaining the chapter HTML comments and all MinerU source evidence in its sole mother document. Counts remain 6 virtual chapters, 19 heading, 11 media, 42 LaTeX, 38 reviewed.
- Candidate SHA-256: c8b64188ec70297c8e70e681dfd93034076bbb5c7a32c5f017d893fe883096ba. Existing source and physical chapter files remain unmodified.
- Conflicts tested: stale mother, arbitrary non-review text edit in old physical chapter (even with recomputed manifest SHA), altered review attribute, corrupted old chapter bytes, duplicate review ID. Each rejects before migration; no input mutated.
- CLI reads source/manifests explicitly and creates a candidate file only with opt-in --output NEW.md using exclusive wx: existing targets cannot be overwritten. Symlinked input paths are refused. A second creation against the existing candidate was refused with unchanged checksum.

## Browser save / reload on isolated trial copy
- Only a dedicated lab trial document seeded with candidate is writable. Separate loopback port, isolated V6 document path and save signing token; no production editor code or authorization altered.
- Chrome and iPad WebKit WP7_SINGLE_SAVE_REOPEN_PASS: load one original CM6 EditorState; detect 38 formula reviews and all persistent IDs; edit one body span; disk unchanged until Save; original global Save issues exactly one authorized document PUT; reload retains both text edit and all 38 review IDs; remove test insertion via the same CMD transaction port; Save and reload again to verify the complete restored candidate hash. No physical chapter API loads or browser errors.
- The original mother SHA, six physical chapter checksums, candidate file SHA and independent trial document restored SHA were checked. No original source or formal data was written.

## Migrated-content regression
- Chrome and iPad WebKit WP3_SHARED_AG_QUERY_PASS: all 19/11/42 elements, chapter 001 10/5/25, original three AG instances, no physical chapter loads.
- Chrome and iPad WebKit WP4_VIRTUAL_CM6_PASS: migrated source length 311282 UTF-16 code units, six virtual chapter views, edit/undo/redo exact restoration, one document load.
- Chrome and iPad WebKit WP5_FOUR_PANE_PASS with original 22-page PDF: MD absolute source lines, PDF-driven virtual chapter routing, original AG click targeting, one PDF fetch and no physical chapter loading. PDF current-page indicator may show 19 or 20 when navigating to page 20; this remains an independent viewer-display issue.

## AM boundaries and pending gates
- Migrator is an offline, deterministic read-only reconciliation and creation-only output tool. No separate persistent source of truth exists after successful migration; CM6/CMD and existing V6 global Save remain the only editor and writer. All old files are kept as an immutable legacy snapshot; their manifest points to the original source SHA, not the new mother.
- This cohort uses existing review="latex" annotations with original persisted IDs. Unsupported historical review states/closing tags or an already-modified mother fail closed rather than being guessed. Persistent IDs for unreviewed elements remain a separate design limit.
- Existing PUT is authorized and atomically replaced but lacks a disk-side optimistic concurrency guard against a different editor client overwriting a more recent version. This remains a separate production-hardening gate and is NOT claimed solved by source-level checks.
- WP8 remains necessary for Mac/Linux/Chromium/WebKit independent AM/Git audit and a user-authorized cutover before old physical chapter navigation/export and data can be retired. No deletion, merge, push or public release.
