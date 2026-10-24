# OCR2MD V6 — Independent AM/Git Audit (Muse)

## Mission

Perform an independent audit of OCR2MD V6 at the pinned source commit below. Use only this public GitHub repository and your own isolated execution environment. Do not read or access the user's Mac, local folders, credentials, or unrelated workspaces.

## GitHub inputs

- Repository: `https://github.com/laity2010/ocr2md.git` (anonymous HTTPS clone is sufficient)
- Source branch context: `build/2026-10-20`
- Required source commit: `5c7497cdf94ea35217e83effd9496a045625fef0`
- Audit bundle branch: `audit-fixture-5c7497c`
- PDF fixture in the bundle branch: `.v6/workspace/buffetts-alpha.original.pdf`
- Required PDF SHA-256: `be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab`
- Fixture checksum manifest: `.v6/grok-handoff/fixtures.SHA256SUMS`

The bundle branch includes the source tree at the pinned commit, the PDF fixture, and this handoff. The audit target is still the pinned source commit, not the bundle branch's tip. Do not merge, cherry-pick, or commit the bundle branch into the target checkout.

## Prepare an isolated target checkout

First read this handoff and the repository's `AGENTS.md`, `README.md`, `tests/am/README.md`, `tests/am/GROK_AUDIT.md`, and `.v6/grok-handoff/GROK_BOT_START_HERE.md` from the bundle checkout. Then create a detached worktree at the required commit and restore only the fixture into its ignored workspace path:

```bash
git worktree add --detach ../ocr2md-muse-target 5c7497cdf94ea35217e83effd9496a045625fef0
mkdir -p ../ocr2md-muse-target/.v6/workspace
git show audit-fixture-5c7497c:.v6/workspace/buffetts-alpha.original.pdf > ../ocr2md-muse-target/.v6/workspace/buffetts-alpha.original.pdf
cd ../ocr2md-muse-target
git rev-parse HEAD
shasum -a 256 .v6/workspace/buffetts-alpha.original.pdf
```

Keep the checked-out source at the exact required SHA. Do not change tracked source files. Check for an existing audit process before starting tests; do not start a duplicate run.

## Required execution and review

If the SHA and fixture checks pass and no audit run is already active, execute exactly once:

```bash
bash tests/am/run-grok-audit.sh 5c7497cdf94ea35217e83effd9496a045625fef0
```

Install/build only what the repository audit guide requires in your isolated environment. Record actual outcomes for all 139 registered AM contracts, including failures, skips, and blocked cases. A passing AM run alone is not enough: independently inspect source-level module calls, unregistered dependencies, boundary violations, Git integrity, test coverage, and environment reproducibility.

## Evidence and report

Save your report to:

`.v6/grok-handoff/reports/AM_GIT_AUDIT_5c7497c_MUSE.md`

Save this run's logs and any screenshots under:

`.v6/grok-handoff/logs/muse-5c7497c/`

The report must separate `PASS`, `FAIL`, `BLOCKED`, and `NOT VERIFIED`; give the pinned HEAD and fixture hash; list actual results for all 139 contracts; include evidence, findings with file/line/reproduction/interface/fix suggestion, remaining risks, and environment details. Attach the final report to the chat when done.

Do not push, merge, or commit anything. Do not modify the GPT mainline or this public audit bundle. If a step cannot run, report the concrete blocker and preserve evidence rather than inferring a result.
