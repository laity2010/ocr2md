# WCP Workspace · contract v1

This is an engineering API and portable test contract, **not** another source
of formal project principles. See `AGENTS.md` and the authoritative
`tests/am/registry.sql` API/message/edge rows `B01`–`B09`.

## Ownership

- `ui/wcp-workspace-directory-module.js` owns catalogue/root and first-level
  book choice controls. Settings only creates the pane and injects its public
  `get(key)` / `set(key,value)` facade. Neither component edits the other's DOM
  or accesses the other's persistent store. All changes are performed through
  CMD's settings record transaction. The existing `settings.changed` WCP
  message (`E09`, registered string values) carries unsaved selections.
- `ui/wcp-workspace-directory-port.js` owns the authorized read-only HTTP
  capability `roots/browse/books`. Shell injects the port; no direct import of
  Shell/Settings, WCP internals or Node filesystem into Workspace widgets.
- `scripts/v6_workspace_component.py` is the only server-facing Workspace
  facade: `roots()`, `browse(path)`, `books(path)`, `active()` (immutable
  `ActiveBook`), `validate(settings_bytes)`, `prepare(settings_bytes)`, and
  `convert(json_bytes)`. Its `v6_workspace_roots.py` backing library is
  internal. Server handles authorization, CSRF, identical write locks, and
  CAS. Workspace must not commit `settings.json`, edit Markdown, or change
  document readers in other modules. It only resolves validated paths.
- `MinerU JSON -> .minerujson.md` is prepared using the existing single
  converter, never an alternative markdown dialect. A missing document may
  be hard-linked into place only after a validated temporary conversion;
  an existing document is *never* replaced, even concurrently.

## Server HTTP (authenticated read-only)

| Route | Input | Output |
|---|---|---|
| `/api/workspace/roots` | authenticated cookie | allowed roots, active root/book, current document name |
| `/api/workspace/browse?path=` | authorized absolute path | child folders + candidate book readiness |
| `/api/workspace/books?path=` | authorized catalogue | first-level book list with ready/needs-conversion/invalid states |

`PUT /api/settings` is the **only** commit and book-switch entry, with
`If-Match` CAS and the document write lock; converted Markdown is prepared
only after checking the settings fingerprint. `GET /api/document`, `/api/pdf`,
`/api/pdf-map`, Media and chapter APIs all use the active book snapshot from
Workspace. The existing `412` stale-document guard is preserved.

Root ≠ book: `rootPath` is the parent of individual first-level book folders;
`bookName` selects exactly one of them. A book contains `mineru json/` with
one JSON and `pdf/` with one PDF, plus `<bookName>.minerujson.md` after
conversion. If no book has been selected, the default Main/Lab document
continues to load. CMD human chapter-boundary markings are not forged by
conversion; valid source/block anchors and Markdown headings are the
required initial compatible format.

## Linux portability and audit

- Node runtime is resolved from `V6_NODE_BIN` (executable path or command),
  otherwise `PATH` via `shutil.which('node')`. No `/opt/homebrew` path is
  embedded in Workspace/convert logic. Install Python ≥3.9, Node and npm.
- Same platform-neutral `tests/workspace-root-server.test.mjs`,
  `tests/workspace-portability.test.mjs`, and
  `tests/workspace-root-browser.test.mjs` run on macOS and Linux.
  They use fresh temporary book fixtures; no real iCloud, Lab or Main data.
- Run `python3 tests/am/am.py build && python3 tests/am/am.py check`, then
  the three scripts above on both operating systems, with Chromium/WebKit
  installed for browser coverage. A Linux auditor can inspect the frozen
  SHA, registry API/edges, outputs, `412`/`409`, and malicious paths without
  possessing access to the Mac's vault.
- macOS iCloud TCC/Finder user consent and LaunchAgent plist configuration
  are explicitly **Mac-only** acceptance evidence; Linux must report these
  `BLOCKED: MAC_OS_PERMISSION` rather than claiming a simulated PASS.
- Main/Lab share the exact module implementation; Lab only gets its isolated
  runtime, document, cookie and URL, and cannot select a Main parent root.

Do not claim independent Linux certification until an actual Linux audit
runs against a fixed published Git SHA and its fixture hashes.
