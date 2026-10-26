# OCR2MD · WP3 / 8 · CMD-index AG query / migration gate

**Branch:** `experiment/virtual-chapters-wp0-2`. **Isolation:** Mac loopback lab instance, distinct worktree, isolated `.runtime` fixture and save credential. Public `/labs/cm-html/` and formal `/` were **not** overwritten. No new persistent JSON or chapter Markdown files.

## Actual implementation and boundary

- `labs/cm-html/wp0-2/document-index.js` remains the single read-only source-derived CMD query projection, with existing HTML annotation syntax unchanged. Aligns heading AG row ID with its `heading:<original MinerU heading ID>` key; formula/media use full-document UTF-16 source positions to associate AG data with `CMD.queryElements({chapter,type})` results.
- `labs/cm-html/wp0-2/ag-query.js` attaches **native external filters** to the *three original* heading/media/LaTeX AG Grid instances. One checkbox changes the chapter scope to `all`; unchecking permits selecting a logical chapter ID. All three AG grids also gain a computed read-only `所属章节` column in virtual mode. **No fourth grid, no physical chapter read during virtual scope switching, and no CM6 EditorState replacement.**
- `labs/cm-html/modules/ag-module-toolbar.js` uses the established experimental NavigationSelect/Tom Select adapter. `CMD 虚拟索引` is **explicitly opt-in**, preserving the original mother `章节定界` editing/export controls as the default until WP4/WP7. Legacy physical `.cmd.chapter.md` navigation remains operational and disables the virtual AG filters.
- `scripts/v6_lab_profile.mjs` provides the lab-only integration hook `ocr2md:wp3-ag-ready` from the existing Workspace OutlinePanel after its three AG modules are initialized. It adapts Media and LaTeX APIs to expose existing AG Grid references solely for the experiment's read-only query/filter ownership; no duplicate renderer, source scanner, filesystem writer or CMD implementation is created.
- Existing title/media/LaTeX **business scanning and review cell renderers remain** within their modules. WP3 centralizes AG *row membership and chapter provenance*, **not yet all parsing responsibilities**. CMD-owner centralized scanner delegation, stable IDs for unmarked elements, and transactional annotation edits remain separate later milestones. The AG query remains based on currently loaded mother Markdown only, so chapter-only 38 LaTeX review annotations are not asserted to exist in the mother.

## Real-browser acceptance on an isolated 6-chapter mother snapshot

- `node labs/cm-html/wp0-2/ag-query.browser.test.mjs`: **PASS in Chrome and iPad WebKit**. Native displayed AG row count equals CMD index query across ALL: headings 19/media 11/LaTeX 42; virtual chapter 000: 1/6/0; chapter 001: 10/5/25. Computed chapter values match CMD, each AG remains the original instance, 0 additional AGs, 0 physical chapter document loads, 0 business API writes, unchanged CM6 document string.
- `node labs/cm-html/modules/chapter-element-scan.browser.test.mjs`: **PASS in Chrome and iPad WebKit** using separate per-test chapter fixture files. Legacy three types continue to show source-isolated rows and retain media thumbnail DOM identity during type switch; mother legacy chapter-boundary controls are restored after file navigation.
- `WP02_MOTHER_DOCUMENT="$MOTHER_MD" node --no-warnings --experimental-loader ./labs/cm-html/wp0-2/css-loader.mjs labs/cm-html/wp0-2/document-index.test.mjs`: PASS: single mother 6 chapters/72 elements, synthetic boundary merge/identity and no source changes. `V6_LAB_ID=cm-html npm run build`: PASS.
- Static checks: `node --check` for modified JS and `git diff --check`.

## Explicitly deferred / blocked

1. **WP4:** CM6 still previews and edits the complete mother Markdown in virtual AG mode. This WP only changes AG query scope; scoped source/Markdown viewport and history state require separate verification.
2. **WP5:** Cross-pane focus events are unchanged but a new end-to-end scope-aware focus and virtual-scroll test has not been added; do not claim WP5 completed.
3. **WP6:** Some element business modules still perform their own parser scan of CM6 Markdown to form editable AG data. Unmarked formula/media IDs are derived, not universally persistent. Do not claim fully unified CMD scanning/write transaction authority yet.
4. **WP7 migration gate:** The six legacy physical files collectively contain 38 LaTeX review markers missing from the mother. Do not remove or overwrite physical chapters or declare migrated review status.
5. **Platform matrix:** macOS Chromium/WebKit verified; independent Linux toolchain/browser verification **BLOCKED, not attempted**. Full AM/Git audit and user-authorized merge to main **not performed**. Therefore no automatic GitHub push or deployment.

## AM route check

Producer: Workspace OutlinePanel in lab Vite adaptor. Event: `ocr2md:wp3-ag-ready` (one-shot after mount; publishes existing AG API references and a read-only `getMarkdown` getter). Consumer: WP3 query adapter; publication to browser only, no Node/global backend escape. State notification: `viewStore.documentRevision` triggers a CMD snapshot reindex and native AG `onFilterChanged`. Read data: existing CM6 Markdown getter; derived CMD source offsets. Write data: **none by this adapter**. Business cell actions still belong to their original modules and require existing CMD authorization; mass chapter actions are hidden in virtual query mode. This experimental AM route must be reviewed in WP8 before mainline merge.
