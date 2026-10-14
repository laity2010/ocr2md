# IR-WP7/8 · Versioned safe persistence and Obsidian projection

Date: 2026-10-09. Status: **implementation and isolated full-size/Mac browser acceptance; user review of actual book still pending**.

## Scope and trust boundary

Canonical content remains the complete `DocumentIrV1` OCR/PDF-anchored IR, with provisional blocks and unresolved OCR warnings. Do **not** overwrite original PDFs, original MinerU OCR JSON, historical MinerU MD, legacy working MD, or existing `.ocr2md/pdf-md-map.v1.json` and `.ocr2md/pdf-md-review.v1.json`.

Original WorkspaceFS is limited to one operation and 512 KiB per write. The real IR+all MD exceeds 2.5 MiB. It would be incorrect to claim that calling its generic `commit` repeatedly forms an atomic batch. IR-WP7 adds a **separate privileged, book-scoped endpoint** protected by the same origin and access-key guard:

- `GET /__v3/ir?book=/ocr2md/<book>`: load the committed IR generation, verify source, pointer, ZIP and rendered version integrity; return original serialized `Document IR` and provenance (not an edited draft).
- `POST /__v3/ir/commit`: `book`, `expectedGeneration|null`, unique `requestId`, base64 ZIP archive including IR, Markdown source index and generated chapter MD.
- All other generic workspace FS operations retain their old 512 KiB restriction and hidden directory access denial. The original PDF-MD review CAS remains unchanged. Only `ir-current.v1.json` is added to the narrowly scoped pointer read/coordination allowlist. Generic callers cannot create/replace the pointer or browse the immutable archive directory.

## Commit transaction and invariants

1. Browser builds deterministic ZIP from the **current** validated IR and generated Markdown; all blocks are `unreviewed`, and PDF/OCR originals are referenced by SHA-256.
2. Server bounds input to 16 MiB archive / 24 MiB JSON request / max 64 safe ZIP entries / max 10 MiB IR. Rejects compressed or traversing ZIP entries, symlinks, unlisted files, missing file hashes, duplicate IDs, uncovered blocks, cross-book source paths, invalid manifests. Checks original source PDF/JSON file hashes against the requested IR.
3. Read `book/.ocr2md/ir-current.v1.json` with compare-and-swap expected **generation SHA**. If another session changed the committed version, return `ESTALE`, do not replace pointer or silently merge. Duplicate last `requestId` + matching bytes returns the last successful result.
4. Create **immutable** archive `book/.ocr2md/ir-versions/<sha256>.zip` via temp file + fsync + link-if-absent and SHA readback. A known hash with different bytes fails closed.
5. Materialize the generated Markdown files and manifest under `book/ir-generated/versions/<sha256>/` with all files staged in a hidden directory, fsync'd, then single-directory renamed into their final **versioned**, immutable location. Add a README labelling them as unreviewed, generated copies. Old versions remain intact. Obsidian/iCloud can see these Markdown notes but users should edit via IR workbench, not directly edit generated projections.
6. Check PDF and OCR SHA again after materialization. Only then create/replace the small current-version pointer `book/.ocr2md/ir-current.v1.json`. First create uses no-overwrite. Replacements use native macOS `NSFileCoordinator` + inner-revision CAS, reusing the same guarded Swift helper as previous sidecars. This small pointer is the **local commit boundary**; distributed iCloud multi-file atomicity is *not* claimed.
7. Read pointer and archive again, verify archive SHA, IR SHA, each materialized MD content SHA and manifest. Return `committed:true`. Browser performs a second GET of the current IR and checks exact SHA of its staged IR; **only then** clears dirty state. If POST/GET/CAS fails or the server reports ambiguity, keep the in-memory draft and show the error, never mark saved speculatively.

### Recovery semantics

- Crash before pointer update: orphan immutable archive and/or materialized version may exist but are **not** canonical. Old pointer remains readable. Do not automatically clean or overwrite such staging data. They can be inspected/repaired in a dedicated future maintenance flow.
- Pointer arrives via iCloud before archive or generated Markdown: GET reports `ESTALE` (not a false success); after sync completes, load and verify again.
- Concurrent session B starts from stale generation A: B is rejected, its draft is preserved; user must reload and manually reconcile rather than silently overwrite A.
- If original OCR/PDF changed, new commit rejects `ESTALE`. Loading an older generation reports source mismatch; workbench disables persistence until resolved.
- Old versions are retained as explicit recovery evidence. Automatic rollback, global cross-device CAS and garbage collection are **not** claimed. iCloud external conflicts can still occur beyond this Mac-local coordinator boundary.

## Feature contracts

- **FC-IR7-1**: User edits IR → presses `保存 IR` → explicit confirmation → exact ZIP saved in a new version; original PDF/JSON/working MD unchanged; status shows committed generation **only after** successful readback.
- **FC-IR7-2**: Reload after save → restore persisted IR, not newly recomputed OCR default; verify source hashes and regenerated Markdown. Auto-import only if no saved generation exists; otherwise fail closed on damaged/missing data.
- **FC-IR7-3**: Two sessions concurrently edit same generation → one commits; subsequent stale save rejected, draft retained; never auto-resolve.
- **FC-IR7-4**: Generated Obsidian-readable MD and manifest occupy a new version-numbered folder, previous versions untouched; no general-purpose hidden-path access or original file modification.
- **FC-IR7-5**: Ensure bad archive, altered PDF/OCR, missing snapshot, stale pointer, symlink and insufficient file coordination are rejected prior to pointer switch.

## UI interaction contracts

- **UIC-IR7-1**: Workbench → Document IR → choose OCR source → edit a text block with reason → `保存 IR` enabled; click requires explicit confirmation, shows ongoing state, re-GET verification; only then switches from “未保存修改” to “已保存”，still `待审核`.
- **UIC-IR7-2**: Open same book in two independent browser tabs while no stored generation; edit A and B; save A, then save B; B must show conflict and **retain** uncommitted edit. Browser e2e.
- **UIC-IR7-3**: New session reopens book → loads saved A edit, 0 dirty state, generated MD matches A, old OCR hash unchanged. Browser e2e.
- **UIC-IR7-4**: 1200px desktop header/actions remain clickable without being covered by the source pane; iPad 834×1194 fit remains. Browser e2e.
- **UIC-IR7-5**: Manual external review of the actual Obsidian book's synced generated Markdown, version folder, iCloud convergence and conflicting device cases is pending. Automated local fixture tests are preconditions, **not a substitute** for this review.

## Acceptance / review

Test commands:

```bash
python3 ui-spikes/v2/tests/v3IrPersistenceSmoke.py
npm --prefix ui-spikes/v3-directory run test:ir:persistence
npm --prefix ui-spikes/v3-directory run test:ir:ui
npm --prefix ui-spikes/v3-directory run test:ir:markdown
npm --prefix ui-spikes/v3-directory run test:review
```

- Isolated full-size `Bufett’s Alpha` ZIP: 2,575,431 bytes, source PDF/JSON SHA checks, first pointer creation, Mac native coordinated **second-version CAS**, immutable old archive, generated Obsidian MD, stale/modified-source/broken-ZIP/missing-snapshot rejection. Production book **never written by these tests**.
- Browser with 3 authenticated sessions: one save, stale concurrent save refusal, source hashes unchanged, saved IR restored by third session, versioned generated `.md` visible, 1200px toolbar works.
- Data provenance remains `unreviewed`; real book title/structural candidate visual audit stays WP8. No arbitrary deletion/cleanup or Git rewrite.

## Production rollout and final acceptance (2026-10-09)

- ✅ `IR_WP7_ISOLATED_BACKEND_PASS`: **2,575,431-byte** real-size 8-entry archive; source SHA checks; first/no-replace commit; native Mac NSFileCoordinator second-generation pointer CAS; both archive versions retained; visible Obsidian Markdown materialization; generic hidden-path and IR-pointer mutations rejected; missing archive, corrupt ZIP, stale generation and modified OCR rejected.
- ✅ `IR_WP7_BROWSER_PERSISTENCE_PASS`: authenticated, isolated HTTP/browser path, 3 sessions; save A; stale B rejected while B draft remains in UI; fresh C restores A; generated MD/version folder exists, origin OCR unchanged; 1200px toolbar accessible.
- ✅ Prior `IR_WP5_BROWSER_FIXTURE_PASS` (no persistent writes unless Save clicked), `IR_WP6_MARKDOWN_UNIT_PASS`, old review CAS (`WP7_REVIEW_CAS_UNIT_OK`), `WP6_BIDIRECTIONAL_INDEX_UNIT_OK` and previous Mac Vault Python unit suite (8 tests).
- ✅ V3 static UI published and live `com.daisor.ocr2md` service reloaded to import new authenticated `/__v3/ir` GET and POST paths. Local 4176 status returned healthy, V3 page includes Save IR, service worker cache bumped to `ocr2md-v3-ir-wp7-20261009a`.
- ✅ **Production book is read-only verified** after rollout: `Bufett’s Alpha` live `GET /__v3/ir?book=...` returned `{exists:false,generation:null}`; `IR_WP5_REAL_BROWSER_PASS` on live service confirmed 224 blocks, 19 chapters, 11 Appendix-A filter rows, official PDF locator, iPad layout and unchanged source hashes.
- ⚠️ No real-book Save action was triggered by automation. WP7 safe persistence capability is deployed but real Obsidian/iCloud multi-device propagation and a user-facing actual save remain **manual acceptance pending**. Browser button **requires explicit user confirmation**; saved results are still `unreviewed`, never automatically marked correct.
- ⚠️ iCloud is eventually consistent; independent machines may see a pointer before all blobs and Markdown arrive. Readers fail closed (`ESTALE`); this does not claim global CAS, distributed transactionality, automatic merges, automatic backup garbage collection or automatic rollback. Those would require a stronger sync coordinator and a separate verified reconciliation design.
- All intentional Git WIP preserved; no commit or destructive Git operation.

## Final verification and deployment record (2026-10-09)

- `IR_WP7_ISOLATED_BACKEND_PASS`: 2,575,431-byte book-sized archive; verified first and second CAS generations using native macOS coordination; old immutable version retained; generated Markdown materialized under `ir-generated/versions/<sha256>`; bad ZIP, stale request, changed OCR, missing snapshot, generic hidden-path and all generic pointer mutation attempts rejected.
- `IR_WP7_BROWSER_PERSISTENCE_PASS`: authenticated two-tab stale-write conflict rejected with second user's draft intact; third session restored the committed IR; versioned Obsidian Markdown exists; 1200px toolbar remains actionable.
- `IR_WP5_REAL_BROWSER_PASS`: live authentic `Bufett’s Alpha`, 224 IR blocks, 19 chapter nodes, PDF source navigation, iPad fit, read-only Vault activity.
- `IR_WP7_REAL_ORIGINALS_UNCHANGED`: baseline SHA-256 for original PDF, MinerU OCR JSON and legacy mapping sidecar match unchanged; no real book `ir-current.v1.json` and no `ir-generated` directory created by tests.
- Original WP5/WP6 browser, Markdown, legacy PDF-MD review CAS, bidirectional navigation and 8 previous Mac Vault tests all passed; `git diff --check` passed. WIP was not cleaned or force-modified.
- Web preview deployed under existing `/v3-directory/`, service worker cache `ocr2md-v3-ir-wp7-20261009a`. Existing launchd `com.daisor.ocr2md` service was reloaded *without* restarting Mac, tunnels, Agent Link, DNS, or synchronization. The live `/__v3/ir` API returned `{exists:false,generation:null}` for the real book.
- **Manual gate:** actual iCloud/Obsidian replica convergence and the WP3/4 proposed OCR structure/headings remain unreviewed. User must explicitly edit and save the real book; no synthetic green test claims the source book was reviewed.
