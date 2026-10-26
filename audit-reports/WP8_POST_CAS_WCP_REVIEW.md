# OCR2MD WP8 post-CAS/WCP independent review gate

Date 2026-10-26. Branch experiment/virtual-chapters-wp0-2.

**Result: P0 CAS CLOSED; WCP virtual-chapter integration PASS; Mac/Linux local tests PASS; INDEPENDENT AI SIGN-OFF BLOCKED. This is NOT a full WP8 production approval.**

## P0: concurrent Save CLOSED

- scripts/v6_serve.py GET/HEAD sends strong SHA-256 ETag for exact source bytes; PUT requires If-Match, compares inside DOC_WRITE_LOCK before atomic replacement. Missing version: HTTP 428; stale version: HTTP 412; matching: HTTP 200 plus new ETag.
- Existing same-origin and session-cookie authorization unchanged. Lab chapter GET/PUT likewise has ETag under write lock, preventing an alternate stale writer.
- ui/main.js records GET revision per opened source, sends it on Save, advances it only on confirmed success. HTTP 412 preserves the entire CM6 unsaved draft and Undo history and raises an explicit status warning; no reload or hidden overwrite. Experiment file-session revision follows current file identity.
- WP8_TWO_CLIENT_CAS_PASS: two independent authorized HTTP cookie sessions on dedicated candidate trial copy; first 200, second stale 412, missing If-Match 428, no lost update, original candidate restored.
- WP8_REAL_TWO_BROWSER_CONFLICT_PASS: separate authenticated Chromium and WebKit contexts each edit same mother; first Save 200, second Save 412; B retains draft and Undo, disk retains A. A restores through normal Undo and Save. Trial returns to SHA-256 c8b64188ec70297c8e70e681dfd93034076bbb5c7a32c5f017d893fe883096ba.
- Linux aarch64 repeats the real isolated two-HTTP-client CAS test in container tmpfs. No user source is written.

## AM / WCP stable contract

- Formal ui/wcp-runtime.js exports an inert default runtime. Lab JSON explicitly selects the experimental wcpRuntime module at labs/cm-html/modules/wcp-virtual-chapters.js. Vite named module alias, not source-string injection.
- The declared runtime methods are editorExtensions, wrapCMD, onCMReady, onAGReady, onPreviewInit, renderPreview and optional dispose. Original CM6 holds the one EditorState and all history; CMD holds the one source index/transaction port; original three business AGs retain their own layouts and policies; original markdown-it/KaTeX renderer and pdf.js are reused.
- Preview exposes only semantic setScope, repaint and isDisposed callbacks, never the raw Dockview panel. Live CMD is resolved on use, avoiding early workspace readiness race.
- WP3–WP6 virtual module source-string transformations were removed from scripts/v6_lab_profile.mjs. Prior separate media UI, lab file-session navigation and Dockview layout adapters remain guarded build transformations: this unrelated legacy integration debt is NOT falsely counted as eliminated.

## Platform evidence

- Mac Chromium / iPad WebKit: WP3 19/11/42 index, WP4 scoped editing/Undo/Redo, WP5 real PDF/MD full-line mapping, WP6 3 business transaction paths and existing toolbar, WP7 save/reopen preservation of 38 reviews, two-browser 412 conflict: PASS.
- Linux arm64 Node 20.19.2: WP4 state guard and WP7 38-review reconciliation and five historical conflict gates: PASS.
- Linux arm64 Chromium: full migrated 311282-character single doc, six chapters, 19 headings, 11 media, 42 LaTeX, 38 reviewed, original three AG views, real PDF chapter navigation and unchanged source: PASS.
- Linux arm64 native Vite build: PASS. Temporary platform-matched rollup-linux-arm64-gnu@4.64.10 and esbuild-linux-arm64@0.28.2 provided outside repo; source and Git mounts read-only, dist temporary tmpfs; configLoader runner avoids node_modules cache write. No changes to project lockfile or dependencies. Linux release identifies Git 1cfb11b.
- Linux WebKit not installed: BLOCKED, while actual Mac WebKit was tested.
- Mac build: v6-lab-cm-html-20261026-181024, Git 1cfb11b. Linux build: v6-lab-cm-html-20261026-181536, same Git.

## Independent AI audit attempts and remaining gate

- Grok CLI HEADLESS audit attempt responded Not signed in; CLI requested device-code login. No credentials altered.
- Gemini CLI read-only attempt responded UNSUPPORTED_CLIENT / IneligibleTierError. No model review took place.
- Independent Grok/Muse post-CAS and post-WCP AM/code/platform signature is BLOCKED. Older Grok/Muse audit results do NOT cover this commit and are not substituted.
- No automatic push, merge, public deployment, formal data migration or legacy-file deletion while independent sign-off is missing. User approval is still required to merge/cut over later.
- Unreviewed Media/LaTeX IDs under in-block reorder, whole-book reindex performance, PDF current page indicator, and older non-virtual Vite adapter debt remain separate follow-up items.
- Process-local lock covers the current single-process server. Any multi-process/multi-machine writer deployment requires external locking.

**Conditional conclusion: Close P0 and approve technical experiment verification; withhold full WP8 sign-off until independent reviewer confirms final branch and remaining interface concerns.**
