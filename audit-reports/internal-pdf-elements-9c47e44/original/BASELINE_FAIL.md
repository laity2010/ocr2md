# Fixed-SHA original audit — immutable baseline evidence

AI_ID: internal (GPT-6); independently obtained anonymous HTTPS package.

| Item | Actual finding |
| --- | --- |
| Original source SHA | `9c47e44f1fc6b44b4f126030d68008854aced6ca` |
| Package HEAD | `a1c9c57f887523084b8eafe5b2f5568902826bc2` (direct parent = source) |
| Unified task HEAD | `60cbb0825f09663ccc526c49b98a95a672ad02c2` |
| Original entry | `bash audit.sh` from fresh anonymous HTTPS clone |
| Original exit | `1` (FAIL) |
| OS | macOS 27.2 ARM64, Node v23.11.0, Python 3.13.3 |
| Original PDF SHA256 | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |
| Original MD SHA256 | `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764` |

The actual original runner executed detached-source checkout, PDF/MD hash checks, **80-port** preflight, fresh `npm ci` and `npm run build`; at `python3 tests/am/am.py build`, it stopped with `AM_ERROR: CHECK constraint failed: visibility IN ('export','returned','internal','raw')`. Its `standard_audit.py` generator then stopped with the same SQLite constraint error in `audit_boundaries.load_registry`, so original standard `report.json` and `report.md` **were never produced**. The files here are auditor-owned notes and byte-for-byte copies of original runner logs, not substitutes misrepresented as standard artifacts. Zero AM-registered cases reached; Chrome/WebKit initial smoke preflight had been run, not six-module end-to-end tests. Original result remains **FAIL / REPORT_GENERATOR_FAIL**.

Independent *read-only* in-memory SQL diagnostics of the frozen Git registry (not a modified schema or run) found illegal visibility values `callback`, `constructor-callback`, `module-port`, `re-export` and duplicate `apis.id` C63/C64/C65. The latter collide with earlier legitimate entries. Disabling CHECK in ephemeral RAM only allowed diagnosis; it was **not** used to obtain a gate PASS.

All original file hashes and logs are retained; Main, frozen source and user data were not edited. Remediations and post-fix runs belong to a separate `fix/internal-pdf-elements-9c47e44` SHA and are never retroactively credited to this source.
