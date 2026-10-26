# OCR2MD WP8/8 — final AM/Git and cross-platform cutover gate

**Audit outcome: NOT APPROVED FOR MAINLINE CUTOVER.**
Date: 2026-10-26. Worktree/branch: experiment/virtual-chapters-wp0-2.
Evaluated application build: v6-lab-cm-html-20261026-174406 (source commit 53b361d).
Scope: WP0–WP7 virtual chapter single-document architecture on six-chapter Buffett fixture. The worktree's source and tests were audited; no formal or public deployment was performed.

## 1. Git / data / change-scope audit
- The experiment derives from c7ff5cc, and the current change set adds lab-only WP0–WP8 modules and six previous WP reports, modifies the lab-specific AG toolbar, and extends the existing shared Vite lab build profile. The mainline worktree, production web release, original MinerU PDF, original mother and six legacy chapter files remain untouched.
- The Vite profile modifies shared module implementations at build time using guarded exact-string replacements. It avoids forking the core today, but it is **integration debt** and must be converted to explicit WCP extension/event contracts before stable mainline integration. A successful experimental Vite build is not a substitute for that interface audit.
- Last verified source hash: 33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc.
- Losslessly migrated, creation-only WP7 candidate / restored trial hash: c8b64188ec70297c8e70e681dfd93034076bbb5c7a32c5f017d893fe883096ba.
- Legacy chapter 001 hash in both original fixture and trial copy: 4ac185442c57b0313211c8b4c7715f766d2cd93c770e2194c3ea806a47c94c77.
- Public experimental cm-html remains v6-lab-cm-html-20261026-145357 and public main remains v6-20261026-102651. No overwrite, merge, force push, rebase or file deletion.

## 2. AM ownership matrix
| Capability | Sole authority | Read-only consumers / contracts | Audit |
| --- | --- | --- | --- |
| Markdown editing / history | Existing CMDocument, one CM6 EditorState | WP4 StateField scope decoration; global Undo/Redo | PASS within tested boundary |
| Persistent element/chapter annotation | Existing CMD HTML comments and CMD transaction planner | WP2 index, WP6 guarded transaction port | PASS for tested heading/media/LaTeX operations |
| Element indexing and chapter membership | WP6 CMD index of live CM6 Markdown | WP3 three original business-owned AG Grid instances | PASS after WP8 initialization race fix |
| AG rendering and business rules | Original Heading, Media and LaTeX modules | WP3 external chapter/type filter | PASS |
| Markdown preview | Original Markdown-it/KaTeX/DOMPurify renderer | WP5 virtual scope and absolute-line rebasing | PASS |
| PDF evidence and locating | Original pdf.js continuous document and MinerU block map | Existing publishFocus; WP5 owning-chapter routing | PASS for navigation, viewer page indicator remains separate |
| Legacy review migration | Offline WP7 deterministic planner and manifest SHA proofs | Creates one candidate exclusively; no input mutation | PASS for fixture |
| Disk persistence | Existing V6 server /api/document PUT and CM6 Save | One trial in isolation; duplicate client writers must be protected | **FAIL** |

The WP8 race fix ensures AG index access resolves the **current** CMD port instead of capturing the CMDocument pre-port object during the Workspace initialization event. Linux Chromium exposed the old race; after fix one live CMD index serves the AG scope.

## 3. Verified platform matrix
| Platform | Evidence | Outcome |
| --- | --- | --- |
| Mac Chromium | WP3 native AG, WP4 edit/Undo/Redo, WP5 real 22-page PDF/MD alignment, WP6 review/media/chapter single transactions, legacy toolbar | PASS |
| Mac iPad-profile WebKit | Same five suites, including PDF and legacy toolbar; actual WebKit browser engine | PASS |
| Linux arm64 Node 20.19.2 | WP1/WP2 synthetic index, WP4 scoped transaction guards, WP7 real six-chapter lossless migration + five conflict cases, read-only mounted source | PASS |
| Linux arm64 Chromium | Real isolated web app on internal loopback lab server, Linux Chromium executable, Linux-only tmpfs, network disabled; 311282-char candidate; 6 chapters, 19 headings, 11 media, 42 formulae, 38 reviewed; native scoped AG/CM6/MD and real PDF chapter navigation | PASS |
| Linux WebKit | Browser runtime absent from available Linux audit image | BLOCKED (not misrepresented as PASS) |
| Independent AI audit / CI Linux build | An independent Grok/Muse cross-platform review or Linux-native Vite build was not executed. Browser ran the recorded Mac-built static assets in Linux. | BLOCKED |

Offline Linux Chromium attempts to fetch remote MinerU thumbnail URLs fail without network (expected for externally hosted images). In-app source, PDF and virtual chapter navigation passed. A canceled partial PDF request was observed during viewer navigation; no loss of local source.

## 4. Blocking finding: concurrent Save loses work
- Reproduced with two independent authorized HTTP client sessions targeting a **dedicated trial document only**, seeded with the exact WP7 candidate.
- Both clients read the same initial bytes/sha; editor A sends version A with old If-Match and gets HTTP 200; editor B sends another version B with the *same stale If-Match* and also gets HTTP 200.
- Final bytes contained B and **lost A**. Thus the current /api/document PUT does not honor a source-revision precondition, regardless of atomic rename and single-process lock.
- Audit marker: WP8_MULTI_EDITOR_OVERWRITE_CONFIRMED_BLOCKER. The test's finally block restored the trial file via authorized Save; SHA was rechecked to equal c8b64188ec70297c8e70e681dfd93034076bbb5c7a32c5f017d893fe883096ba. Production and other experimental files were not modified.
- **Required gate:** GET /api/document must advertise a strong source revision (SHA-256 ETag). Save MUST require If-Match and check under the same server write lock before atomic replacement; no header -> HTTP 428, mismatch -> HTTP 412, no write. The browser must send the revision read, advance it only after accepted Save, preserve unsaved edits and display a conflict action if 412 is received. Two-client A succeeds/B stale rejects and round-trip reopen must be independently tested on Mac and Linux. Existing saved chapter artifact APIs need explicit retirement or separate concurrency policy; do not silently leave an unguarded alternate writable path.

## 5. Additional migration gates / debt
1. **Business identity:** Unreviewed media/formula element IDs are block-and-ordinal derived; in-block reordering can shift identity. Reviewed LaTeX IDs are persistent. Do not claim stable IDs across all edits or switch to a long-lived index without a tested stable-ID strategy.
2. **Module integration:** Build-time string replacements in scripts/v6_lab_profile.mjs must become declared, audited WCP module adapter/event APIs before mainline merge; no table-external bypass or duplicate scanner.
3. **Cross-platform review:** Independent Grok/Linux and Muse/Chrome+WebKit auditors must inspect the final code/AM routes. A Linux-native build and WebKit-on-Linux run are marked BLOCKED, not run.
4. **Performance:** The ~650 ms whole-book CMD parse is coalesced after 700 ms idle; stress-test large edited documents before production latency signoff.
5. **Viewer indicator:** PDF page request 20 sometimes displays current page 19; chapter mapping remains correct, but the page-label mismatch is not fixed by WP5.
6. **Historical evidence:** The original six exported chapters and their manifest remain untouched as read-only audit evidence. Do not delete or point the legacy manifest at the newly migrated mother hash.

## 6. Next acceptance criteria / user authorization
- Fix and retest server-side Save compare-and-swap using two real independent editor clients; restore/reopen with identical source hash.
- Convert experimental build-profile coupling to explicit WCP-owned event APIs, and run AM/Git audit again.
- Run independent Linux reviewer + platform build/audit and WebKit reviewer tests, respecting unsupported checks.
- Only after all blocking audits PASS, Git push the fully accepted branch via ordinary push as required by AGENTS principle 1. **No push while the concurrency audit FAILS.**
- Mainline merge/public deployment and permanent removal of physical chapter writing/navigation require explicit user approval after a clean audit. No automatic cutover is approved by this report.

## Checkpoint evidence
- Final Mac 5-suite log prefix: /tmp/wp8-mac-*.log; result WP8_MAC_FULL_MODULE_REGRESSION_PASS.
- Linux Node unit results: WP1_WP2_SYNTHETIC_PASS, WP4_VIRTUAL_STATE_PASS, WP7_LOSSLESS_RECONCILIATION_PASS.
- Linux real Chromium result: WP8_LINUX_ARM64_CHROMIUM_PASS.
- Trial concurrency result: WP8_MULTI_EDITOR_OVERWRITE_CONFIRMED_BLOCKER.
- WP7 prior save/reopen: WP7_SINGLE_SAVE_REOPEN_PASS in Chrome and iPad WebKit.
