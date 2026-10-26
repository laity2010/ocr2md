# OCR2MD Lab AG element toolbar (2026-10-26)

Branch: experiment/virtual-chapters-wp0-2. Base implementation commit 74381ae, lab build v6-lab-cm-html-20261026-193332.

- AG toolbar first two visible controls: checkbox labelled "全部", immediately followed by the existing Tom Select element navigation with exactly 标题 / 媒体 / LaTeX. No All option in the dropdown, no combined "元素" AG column, and no fourth Grid.
- Original outline, Media and LaTeX business modules retain their separate AG column schemas, row renderers, sorting/review actions and their WCP/CMD APIs. The mother "章节定界" defaults to 标题 with independent-chapter checkboxes unchanged; Media and LaTeX may also be opened directly from the mother.
- "全部" only changes AG membership for the selected element type. In a virtual chapter, unchecked scopes AG to that chapter and checked shows this element type from the whole mother. It does not emit CM6 virtual-scope changes: the currently selected source/Markdown/PDF chapter remains unchanged. On the mother (already all chapters) the checkbox is checked and disabled. Physical legacy chapter mode does not offer cross-chapter checkbox.
- Virtual chapter changes keep the selected business element module. Returning to mother navigation explicitly restores the original chapter-boundary title module. Settings remains available. No export button, no chapter file API loads or writes.
- Real Mac Chromium + iPad WebKit test ag-element-toolbar.browser.test.mjs: PASS, verifies controls order and options, three AG instances, mother Media 11 / LaTeX 42, chapter 001 LaTeX 25 / Media 5, 全部 restores Media 11 without changing CM6 source/viewport or MD preview source-line mapping, chapter switch preserves module, return to mother preserves independent-chapter editor, source SHA unchanged.
- Existing virtual-chapter navigation regression PASS Chrome and iPad WebKit: 6->5->6 merge/split, numbering and module retained. WP1/WP2 full mother index PASS (19/11/42), WP4 isolated scope guard PASS.
- Formal root mainline is untouched. Independent Grok/Muse WP8 audit remains a distinct, unfinished gate; this Lab increment does not authorize formal merge.

## Public Lab deployment verification
- Published build v6-lab-cm-html-20261026-193332 to the existing isolated /labs/cm-html/ static dist, preserving previous hashed assets so already-open browser sessions remain intact; no Lab server restart.
- HTTPS release-version.json returns build commit 74381ae; published JS index-B45R23VN.js HTTP 200, CSS index-CRLSNY8H.css referenced by HTML.
- Direct HTTPS browser regression AG_SEPARATE_ELEMENT_TOOLBAR_PASS: Chrome PASS, iPad WebKit PASS, including 3 original AG grids, 5/25 current-chapter and 11/42 whole-source element counts, checkbox does not change CM6/MD source scope, no file API writes, and original mother SHA unchanged.
- Formal main version v6-20261026-102651 remains unchanged, Lab document SHA-256 33a61ac0428f8102d195f47f541a84ee7698c77fa24d79d5b06c584fbad601dc unchanged.
- The current accepted experiment is NOT approved for formal mainline merge; independent WP8 AI audit remains outstanding.
