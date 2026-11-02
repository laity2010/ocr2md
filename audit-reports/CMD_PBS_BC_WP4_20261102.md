# OCR2MD WCP27 · CMD PBS/BC · WP4/8 — AG full information and chain groups

Baseline: Main `e7fd4d2`; isolated experiment `experiment/text-block-pbs-bc-wp0` based on WP3 `929e873`.
Status: implementation under WP4 experiment, **NOT merged to Main, NOT published**.

## Feature contract / UI interaction contract

- Open the existing **文本块** element in AG: source remains unchanged; one AG row is returned for every valid CMD PBS parent and annotated native child. Missing parent anchors remain separately flagged, never silently fabricated. The existing source-only 224-parent PDF coverage API remains unchanged.
- Columns expose each atom's stable identity, parent, child depth, source line, live Markdown scope, original OCR summary, OCR type/role, valid PDF coverage bbox, raw OCR bbox, BC ID, BC size, logical sequence, predecessor, object type, member role, review state and note, label format, anchor and preview status. The same CMD read model backs the PDF parent state and source labels.
- **按块链分组** changes only AG presentation. Singleton blocks stay individual rows; multi-member BC receives a collapsible group header and members in BC `seq` order (not physical page order). Cross-page BC members remain in the one logical group. Group rows have no PBS identity and cannot be edited or located as source blocks. A chapter filter shows only members within that scope; chain metadata remains whole-document.
- Select PBS A then **设为合并目标**. Select another PBS B, click **并入目标链**: AG sends `{destinationId,sourceId}` to Shell/Workspace's registered semantic callback, which checks the source revision and uses the existing CMD port `mergeBlockChains`. No AG SQL/localStorage source, no direct DOM editing, no direct PDF state change, no hidden save. A single Undo restores the exact prior source, and edit rejection leaves it unchanged.
- Select a non-head PBS then **从此拆链**: delegates to the CMD port `splitBlockChainAt`, no physical reordering or content rewrite. **迁移旧标签** is explicit, only enabled with legacy anchors; simply reading old Markdown never migrates it.
- Candidate mode and its prior per-document review data remain separate, keeping its existing original-parent view and dual-PDF comparison. No new toolbar or persistent BC shadow data was added.
- Invalid CMD chain annotations are shown as a warning, disable AG chain edit buttons and are rejected by CMD. Parent original OCR bbox and child native bbox are kept distinct from validated PDF coverage: an invalid native rectangle never inherits the parent's overlay.

## Automation / acceptance

1. `node tests/cmd-block-chains-wp4.test.mjs`: 267 unique PBS (224 parents + 43 children), parent-child links, source-only text, raw native OCR provenance, no fabricated child overlay, merge chain order, byte-exact original JSON.
2. `node tests/cmd-block-chains-wp4.browser.test.mjs`: both headless Chrome and iPad-WebKit. Source loaded from temporary test directory. Verify full AG columns, 267/43 rows, select two independent blocks, click merge, verify CMD chain count 267→266, display BC group, collapse/expand, click split, verify 267 again, assert no implicit save or page errors.
3. `node tests/cmd-block-chains-wp4-legacy.browser.test.mjs`: legacy 224-atom source remains visible, explicit migration is offered but never automatic, original 5 continuation candidates still appear; requires no synthetic PDF.
4. `python3 -m unittest discover -s tests/am -p test_boundaries.py`, Vite production bundle, WP0–WP3 pure regressions, `git diff --check`.
5. Full original-PDF interaction suite remains BLOCKED until isolated test worktree is supplied with a sanctioned verified PDF fixture; never substitute private Main workspace data or forge expected PDF bytes.

## Ownership and later routes

- L-owned `ui/cmd-block-chains.js` projects complete CMD atoms from actual source and verified original data. CMD `queryBlockAnalysis` joins them. G-owned `ui/text-block-module.js` handles AG view and event intents. Layout relays intents, Shell delegates to C-owned CMD port; transaction remains a CM6 write with standard Undo/Redo.
- WP5 owns **drag/drop reordering**, which is deliberately not activated in WP4; WP6 owns separate file-tail human PDF geometry corrections; WP7 owns full AM/Git, Linux and actual iPad Safari gates and decision to promote Main.

## Observed targeted results on the isolated experiment

- Pure `CMD_PBS_BC_WP4_PROJECTION_PASS`: 267 PBS, 224 original parents, 43 native children; one native child has no usable verified overlay, kept separately from raw OCR bbox. 267 singleton chains become 266 after cross-page merge; original JSON byte-exact.
- Chrome `CMD_PBS_BC_WP4_UI_PASS` and iPad-WebKit `CMD_PBS_BC_WP4_UI_PASS`: interactive AG full columns, merge, BC group expand/collapse, split, native Undo/Redo and no auto-save. Browser WebKit here is headless simulated iPad **not** user-device Safari.
- Legacy review `CMD_BC_WP4_LEGACY_REVIEW_PASS` for Chrome and iPad-WebKit: old 224-root document opens without migration; 5 existing continuation candidates retained.
- Existing `tests/text-block-review.browser.test.mjs` still cannot perform its PDF double-frame stage in this isolated worktree because the PDF selector reports `PDF 原文（加载失败）`; this is **BLOCKED**, not a pass. The standalone legacy AG path above covers only the data/list/mode part.
- `python3 -m unittest discover -s tests/am -p test_boundaries.py`: 19/19 pass; previous WP0–WP3 pure regressions and isolated WP3 HTTP save/reload pass. The complete AM/Git + independent Linux + actual iPad Safari gate remains pending WP7.
