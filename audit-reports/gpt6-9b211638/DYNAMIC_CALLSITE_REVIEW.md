# Independent runtime boundary triage (frozen source -> repaired SHA)

Source: the actual 53-entry `boundary.runtime_callsite_review_inventory` produced by the *first frozen-SHA* `standard_audit.py` report, compared manually against `ui/` in fix commit `86c32a055a042ad56a26b93f7a82458c897d3999`. These are lexical callsites, **not** proof of runtime edge execution.

| Categorization | Sites | Triage |
| --- | ---: | --- |
| `viewStore.getState()` / read-only usage | 29 | Read of bounded ephemeral navigation / revision state; no Markdown duplication. Source owner must still be checked for indirect side effects. |
| `viewStore.subscribe()` subscribers | 13 | Cross-pane notifications with public shared-store facade; callback destinations have independent browser regressions, but not every state permutation is tested. |
| Direct `viewStore.setState()` | 7 | **All 7 are in `ui/view-store.js` itself**, the declared store owner. None of the 53 flagged callsites writes the store from another module. |
| Shell/debug `document`/`window` surfaces | 4 | `ui/main.js` element lookup/modal + dev-only debug facade, and `ui/fontcheck.js` `.cm-content` read under explicit `?fontcheck=1`; the latter is registered as Shell diagnostic, not a business module subscribing to another module's DOM. |
| **Total** | **53** | Accounted for by expression/category; no unresolved external `viewStore.setState` in this 53-site inventory. |

**What the original scanner missed, discovered independently:** `ui/wcp-source-file-navigation.js` registered *generic* `change` and `input` event listeners, then tested `event.target.matches('.ocr-outline-checkbox, #chapter-start-number')`. The parser enumerated neither `matches(...)` nor this CSS selector dependency as an indirect WCP -> AG/Shell boundary edge. See finding F-01 in `INDEPENDENT_REVIEW.md`, repaired by Shell port and CMD revision; regression asserts its absence.

Other explicit DOM message sites were cross-checked against the frozen AM publisher/subscription registry: `ocr2md:chapter-error`, `ocr2md:lab-virtual-open`, `ocr2md:lab-virtual-select`, `ocr2md:wp3-ag-ready`, `ocr2md:wp4-virtual-scope`, `settings.changed`. Registered literal topics matched observed publisher calls; subscribers routed through `document.addEventListener` or `settings.subscribe` as appropriate. Dynamic strings, DOM event delegation and indirect object graph dispatch remain non-exhaustively audited.

**Boundary conclusion:** direct owner writes and explicitly enumerated DOM topics show no additional confirmed unregistered bypass after F-01 fix. This is *not* a blanket runtime PASS and not evidence of production cutover safety. Every newly introduced dynamic callsite needs interface/owner validation and regression coverage.
