# OCR2MD Sentence Benchmark Lab — WP0–WP4 execution evidence

Date: 2026-11-08. Source baseline: main@9649cebdfd4a9e746948ed6f54f423b73937f769.
Current experiment branch: experiment/sentence-benchmark. Lab build source: 0945f8364dc1577b2392ff39bfdf4c70692c5c82.

| Gate | Status | Direct evidence |
| --- | --- | --- |
| WP0 isolated V6 worktree | PASS | Dedicated Git worktree, lab.json {}, independent .runtime, local LaunchAgent, Main clean |
| WP1 split/rebuild public API | PASS | tests/sentence-benchmark-public.test.mjs; 6/6 PASS |
| WP2 three actual engines | PASS | Intl.Segmenter, sentence-splitter 5.0.1, winkNLP 2.4.0 + English web model 1.8.1, full Buffett and corner cases |
| Main/Lab module graph same SHA | PASS | 339 modules; module hash 85218f975cd9a6acfd61df2745d552244cfbb849a4e0a59cf743f821404499a7 |
| WP3 Mac local Web entry | PASS | http://127.0.0.1:4412/labs/sentence-benchmark/sentence-benchmark.html HTTP 200, persistent dedicated user LaunchAgent |
| WP3 Chrome Web functionality | PASS | tests/sentence-benchmark-web.browser.test.mjs |
| WP3 iPad-sized WebKit emulation | PASS | same real built Lab page, not a physical iPad device test |
| WP3 public route | BLOCKED | https://ocr2md.laity.bid/labs/sentence-benchmark/sentence-benchmark.html returns HTTP 404; Agent Link changes are centralized and its shared WIP worktree has unrelated uncommitted modifications |
| WP4 reviewed Gold and scores | PASS locally | browser localStorage autosave/reload; Gold import/export with sample fingerprint; manual boundary addition; adjudicated-only Precision/Recall/F1; full-source highlighting; real browser tests |
| AM full registry build | BLOCKED pre-existing | python3 tests/am/am.py build: CHECK constraint failed: visibility IN ('export','returned','internal','raw') |
| WP05 parent block incremental/PDF | NOT STARTED | Deliberately deferred per user instruction |

Both Main and Lab were built using the same source SHA and Vite configuration.
The two supported segmentation exports are registered as S01/S02 in
tests/am/registry.sql. Node regression tests
tests/cmd-sentences.test.mjs and tests/v6-lab-parity.test.mjs PASS.
Browser review data stays per-device; to transfer Gold between Mac/iPad,
export human-gold.json and import after loading the identical Markdown
sample. There is not yet a server-side shared Gold database.

## Shared Agent Link routing request (not yet applied)

- Project: OCR2MD Sentence Benchmark Lab (additional page of existing V6 app).
- Local origin: 127.0.0.1:4412, loopback-only.
- Local health: GET http://127.0.0.1:4412/labs/sentence-benchmark/healthz -> 200.
- Local page: http://127.0.0.1:4412/labs/sentence-benchmark/sentence-benchmark.html.
- Requested existing hostname: https://ocr2md.laity.bid/.
- Desired path: ^/labs/sentence-benchmark(/.*)?$.
- Desired public reviewer: https://ocr2md.laity.bid/labs/sentence-benchmark/sentence-benchmark.html.
- Physical paths: use only existing Agent Link application tunnels.
  Do NOT create a dedicated tunnel; manage Mac and staged JP mappings
  consistently in agent-link-monitor according to docs/NEW_LINK_WORKFLOW.md.
- Public route requires reconciliation with currently dirty Agent Link
  worktree; no shared tunnel processes or config were modified here.
- After route deployment verify Mac/iPad real public page and browser Gold
  export; all other applications must retain their previous routes.

This is an operational acceptance record, not a new formal AGENTS principle.
