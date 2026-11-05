# OCR2MD PDF layout annotation milestone — independent audit delivery

**Audited source SHA:** `9c47e44f1fc6b44b4f126030d68008854aced6ca` (read-only milestone `audit/pdf-layout-elements-20261105`).

**Delivery branch:** `audit-public-pdf-elements-9c47e44` (HEAD is a *packaging commit*, not the audited source). The delivery HEAD must have exactly the source SHA as its first parent. Only the delivery package supplies the audited PDF fixture and launcher; business files come from the fixed source commit.

Scope: six PDF layout modules — headings, CMD PBS/BC text blocks, illegal line breaks, LaTeX, media and note-reference/body pairs; CMD/CM6/AG/MD/PDF cross-window contracts, portability Mac/Linux and Chrome/WebKit, authorization/CAS and immutable PDF/MinerU evidence.

| Evidence | SHA-256 |
| --- | --- |
| `.v6/workspace/buffetts-alpha.original.pdf` | `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab` |
| `packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md` | `d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764` |

From a **new anonymous HTTPS clone** of this package branch: `bash audit.sh`. It verifies the exact source+evidence, checks out an isolated same-repo detached source and invokes the unmodified `tests/am/run-standard-audit.sh` at that SHA. Preserve original failures; no mutating the frozen source, package or user files. See `AUDIT.md` for the exact independent report/fix workflow. Initial Main-local AM database build has known registry `visibility` and duplicated API ID integrity failures; auditors must record them as real baseline failures and investigate; **do not** loosen SQL constraints or erase evidence to obtain a PASS. Any repairs belong on independent `fix/*` branches with separate reports and reruns.

This delivery is a **development audit**, not a certified release; no assumption of Grok/Muse ACK or pass before their own checks.
