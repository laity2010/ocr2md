#!/usr/bin/env bash
# Run independently from the audit-fixture branch; never alter the V6 source branch.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SHA='5c7497cdf94ea35217e83effd9496a045625fef0'
EXPECTED_PDF='be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab'
# Bash preserves // at filesystem root, which Node interprets as a file://host
# URL on Linux. Normalize the default before any worktree or --import path.
PARENT="$(dirname "$BUNDLE_DIR")"
if [[ "$PARENT" == / ]]; then
  TARGET_DEFAULT='/ocr2md-v6-audit-target'
else
  TARGET_DEFAULT="$PARENT/ocr2md-v6-audit-target"
fi
TARGET="${OCR2MD_AUDIT_TARGET_DIR:-$TARGET_DEFAULT}"
[[ "$TARGET" == /* && "$TARGET" != //* ]] || { echo "AUDIT_TARGET_PATH_INVALID: $TARGET" >&2; exit 2; }

fail(){ printf 'AUDIT_BLOCKED: %s\n' "$*" >&2; exit 2; }
for command in git node npm python3; do
  command -v "$command" >/dev/null 2>&1 || fail "missing dependency: $command"
done
# Chromium/WebKit/PDF.js stack requires Node >=22.13; npm may otherwise only
# warn during install and fail much later in unrelated UI assertions.
node -e 'const [major,minor]=process.versions.node.split(".").map(Number);if(major<22||(major===22&&minor<13)){console.error("AUDIT_NODE_UNSUPPORTED: need >=22.13 (pdfjs-dist); found "+process.versions.node);process.exit(22)}'
cd "$BUNDLE_DIR"
[[ "$(git branch --show-current)" == 'audit-fixture-5c7497c' ]] || fail 'checkout audit-fixture-5c7497c first'
[[ -z "$(git status --porcelain)" ]] || fail 'audit bundle must have a clean Git worktree'
git merge-base --is-ancestor "$SOURCE_SHA" HEAD || fail 'fixed source SHA is not an ancestor of the audit bundle'
# The audit branch may add evidence and amend *one reviewed test contract*.
# All business implementation, API registries, and other tests remain byte-
# identical to the frozen source; fail closed if future commits violate this.
python3 - "$SOURCE_SHA" <<'PYVERIFY'
import subprocess,sys
base=sys.argv[1]
paths=subprocess.check_output(['git','diff','--name-only',base,'HEAD'],text=True).splitlines()
allowed_exact={'README.md','AUDIT.md','tests/am/GROK_AUDIT.md',
               'tests/scroll-sync-browser.test.mjs'}
allowed_prefix=('audit-', 'audit.', 'audit-reports/', '.v6/grok-handoff/',
                '.v6/workspace/buffetts-alpha.original.pdf')
violations=[p for p in paths if p not in allowed_exact and
            not p.startswith(allowed_prefix)]
if violations:
  print('AUDIT_FROZEN_BUSINESS_SOURCE_CHANGED: '+', '.join(violations),file=sys.stderr)
  sys.exit(2)
print('AUDIT_FROZEN_BUSINESS_SOURCE_VERIFIED changed_paths='+str(len(paths)))
PYVERIFY
BUNDLE_SHA="$(git rev-parse HEAD)"

if [[ -e "$TARGET" ]]; then
  [[ -d "$TARGET" ]] || fail "target exists and is not a directory: $TARGET"
  [[ "$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)" == "$(cd "$TARGET" && pwd)" ]] || fail 'existing target not a Git checkout'
  [[ "$(git -C "$TARGET" rev-parse HEAD)" == "$BUNDLE_SHA" ]] || fail 'existing target has a different Git SHA (rerun in a new target directory after updating audit branch)'
  [[ "$(git -C "$TARGET" rev-parse --path-format=absolute --git-common-dir)" == "$(git rev-parse --path-format=absolute --git-common-dir)" ]] || fail 'existing target belongs to a different Git repository'
  [[ -z "$(git -C "$TARGET" status --porcelain)" ]] || fail 'existing target has changes'
else
  git worktree add --detach "$TARGET" "$BUNDLE_SHA"
fi

PDF="$TARGET/.v6/workspace/buffetts-alpha.original.pdf"
mkdir -p "$(dirname "$PDF")" "$TARGET/.v6/audit-reports"
if [[ ! -e "$PDF" ]]; then
  git show "$BUNDLE_SHA:.v6/workspace/buffetts-alpha.original.pdf" > "$PDF"
  chmod a-w "$PDF"
fi
PDF_SHA="$(python3 - "$PDF" <<'PY'
from hashlib import sha256
from pathlib import Path
import sys
print(sha256(Path(sys.argv[1]).read_bytes()).hexdigest())
PY
)"
[[ "$PDF_SHA" == "$EXPECTED_PDF" ]] || fail "PDF SHA-256 mismatch: $PDF_SHA"
[[ -z "$(git -C "$TARGET" status --porcelain)" ]] || fail 'target must remain clean'

cd "$TARGET"
# Some Linux browser subprocesses dump multi-gigabyte ELF cores even after
# their controlling browser test reports PASS. Capture test errors/logs normally
# but disable unbounded core dumps so Git-clean audit worktrees stay reproducible.
if [[ "$(uname -s)" == Linux ]]; then
  ulimit -c 0 || fail 'unable to disable unbounded browser core dumps'
  printf 'AUDIT_LINUX_CORE_DUMPS_DISABLED=1\n'
fi
# Isolated browser suites use fixed HTTP ports. A stale previous Python/Vite
# test server can silently serve an old document and fabricate a PASS or FAIL.
# Refuse rather than kill someone else's process or trust a stale /healthz.
python3 "$BUNDLE_DIR/audit-port-preflight.py" --self-test
python3 "$BUNDLE_DIR/audit-port-preflight.py"
# Frozen vite.config.mjs otherwise points at a developer-specific macOS
# iCloud PDF; without this Linux /api/pdf always returns HTTP 404.
export V6_PDF_PATH="$(pwd -P)/.v6/workspace/buffetts-alpha.original.pdf"
REPORT_DIR='.v6/audit-reports'
# Prevent overlapping npm installs, browser sessions and writes to the same AM SQLite.
LOCK="$REPORT_DIR/.active-run"
mkdir "$LOCK" 2>/dev/null || fail "another audit is running or a stale lock exists: $LOCK"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
printf 'AUDIT_BUNDLE_SHA=%s\nAUDIT_SOURCE_SHA=%s\nAUDIT_PDF_SHA=%s\nAUDIT_TARGET=%s\n' \
  "$BUNDLE_SHA" "$SOURCE_SHA" "$PDF_SHA" "$TARGET"

# Install versions from package-lock before determining browser executable paths.
npm ci --no-audit --no-fund
# Some registered AM tests import the separately built MinerU JSON converter.
# This package is not a root dependency and its dist/ is intentionally ignored.
npm --prefix packages/minerujson-md ci --no-audit --no-fund
npm --prefix packages/minerujson-md run build
if [[ "$(uname -s)" == "Linux" && "${OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS:-0}" == '1' ]]; then
  npx playwright install-deps chromium webkit
fi
if [[ "${OCR2MD_AUDIT_SKIP_BROWSER_INSTALL:-0}" != '1' ]]; then
  # Playwright may only WARN (exit 0) when Linux system libs are missing.
  # Treat that as an actionable BLOCKED environment, never test FAIL.
  INSTALL_LOG="$REPORT_DIR/playwright-install.log"
  if ! npx playwright install chromium webkit 2>&1 | tee "$INSTALL_LOG"; then
    fail 'Playwright browser install failed; see playwright-install.log'
  fi
  if [[ "$(uname -s)" == "Linux" ]] && grep -q 'Host system is missing dependencies' "$INSTALL_LOG"; then
    fail 'Linux browser libraries missing: run npx playwright install-deps chromium webkit with sudo, or set OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1 as root'
  fi
fi
export OCR2MD_AUDIT_CHROME_PATH="$(node -p 'require("playwright").chromium.executablePath()')"
export OCR2MD_AUDIT_WEBKIT_PATH="$(node -p 'require("playwright").webkit.executablePath()')"
# Historical start-only UI test requires the tracked reviewed fixture; stage
# it solely while that test runs, without changing frozen source or assertions.
cp "$BUNDLE_DIR/audit-fixture-preload.mjs" "$REPORT_DIR/audit-fixture-preload.mjs"
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=$(pwd)/$REPORT_DIR/audit-fixture-preload.mjs"
# Only Linux needs a replacement for frozen test-only macOS sips calls.
# Uses genuine PNG→JPEG conversion via Playwright Chromium; no test is skipped.
if [[ "$(uname -s)" == "Linux" ]]; then
  cp "$BUNDLE_DIR/audit-sips-compat.mjs" "$REPORT_DIR/audit-sips-compat.mjs"
  cp "$BUNDLE_DIR/audit-png-to-jpeg.mjs" "$REPORT_DIR/audit-png-to-jpeg.mjs"
  cp "$BUNDLE_DIR/audit-linux-diagnostics.mjs" "$REPORT_DIR/audit-linux-diagnostics.mjs"
  cp "$BUNDLE_DIR/audit-loopback-cookie.mjs" "$REPORT_DIR/audit-loopback-cookie.mjs"
  export NODE_OPTIONS="$NODE_OPTIONS --import=$(pwd)/$REPORT_DIR/audit-sips-compat.mjs --import=$(pwd)/$REPORT_DIR/audit-linux-diagnostics.mjs --import=$(pwd)/$REPORT_DIR/audit-loopback-cookie.mjs"
fi
[[ -x "$OCR2MD_AUDIT_CHROME_PATH" ]] || fail 'Chromium browser binary not installed'
[[ -x "$OCR2MD_AUDIT_WEBKIT_PATH" ]] || fail 'WebKit browser binary not installed'
# Playwright binaries can be cached while Linux shared libraries are missing.
# Check actual browser launches before claiming application test failures.
cp "$BUNDLE_DIR/audit-browser-preflight.mjs" "$REPORT_DIR/audit-browser-preflight.mjs"
# Clear NODE_OPTIONS only for this host-runtime check: the audited tests keep
# all their adapters and original assertions, but this probe must not use them.
if ! env -u NODE_OPTIONS node "$REPORT_DIR/audit-browser-preflight.mjs" 2>&1 | tee "$REPORT_DIR/browser-preflight.log"; then
  fail 'browser runtime unavailable; see browser-preflight.log (environment BLOCKED, not application FAIL)'
fi

printf 'AUDIT_OS=%s\nAUDIT_NODE=%s\nAUDIT_PYTHON=%s\nAUDIT_PLAYWRIGHT=%s\n' \
  "$(uname -s)" "$(node -v)" "$(python3 -V 2>&1)" "$(node -p 'require("playwright/package.json").version')"
printf 'AUDIT_BROWSER_BINARIES=installed_and_executable\n'
if [[ "$(uname -s)" == "Linux" ]]; then
  cp "$BUNDLE_DIR/audit-sips-smoke.test.mjs" "$REPORT_DIR/audit-sips-smoke.test.mjs"
  node "$REPORT_DIR/audit-sips-smoke.test.mjs"
fi

set +e
bash tests/am/run-grok-audit.sh "$BUNDLE_SHA" 2>&1 | tee "$REPORT_DIR/run.log"
EXIT_CODE=${PIPESTATUS[0]}
set -e

python3 - "$BUNDLE_SHA" "$SOURCE_SHA" "$PDF_SHA" "$EXIT_CODE" "$REPORT_DIR/RUN_EVIDENCE.json" <<'PY'
from datetime import datetime,timezone
import json,platform,sqlite3,subprocess,sys
from pathlib import Path
bundle,source,pdf,rc,dest=sys.argv[1:]
db=Path('.v6/tests/am.sqlite')
rows=[]
if db.is_file():
    with sqlite3.connect(db) as conn:
        conn.row_factory=sqlite3.Row
        for row in conn.execute('''
          SELECT c.id,c.script,
            (SELECT status FROM test_runs t WHERE t.case_id=c.id AND t.git_commit=?
              ORDER BY t.id DESC LIMIT 1) AS status,
            (SELECT output_file FROM test_runs t WHERE t.case_id=c.id AND t.git_commit=?
              ORDER BY t.id DESC LIMIT 1) AS log
          FROM test_cases c ORDER BY c.script,c.id
        ''',(bundle,bundle)):
            rows.append(dict(row))
result={
 'audit_bundle_git_sha':bundle,'frozen_business_source_git_sha':source,
 'audited_test_contract_git_sha':bundle,'runner_git_sha':bundle,'pdf_sha256':pdf,
 'date_utc':datetime.now(timezone.utc).isoformat(),
 'host':{'os':platform.system(),'architecture':platform.machine(),
         'python':platform.python_version(),
         'node':subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(),
         'playwright':subprocess.run(['node','-p','require("playwright/package.json").version'],capture_output=True,text=True).stdout.strip()},
 'runner_exit_code':int(rc),
 'am_cases':[{**r,'status':r['status'] or 'NOT VERIFIED'} for r in rows],
 'fixture_overrides':{'tests/mineru-start-only-ui-browser.test.mjs':{'source':'tests/fixtures/buffetts-alpha-four-view-reviewed.md.gz','sha256_uncompressed':'c998da7aeea5410f1d7be10975c05e59efb5cdf6bfcf750595b27a048c5e3e19','scope':'one test only; restored after test'}, 'tests/promoted-chapters-browser.test.mjs':{'source':'dist/','target':'.v6/release/','scope':'isolated release snapshot; unchanged test assertions'}},
 'linux_compat':{'sips':'Playwright Chromium PNG to actual JPEG only for frozen browser tests; log marker AUDIT_LINUX_SIPS_SHIM','webkit_cookie':'HTTP 127.0.0.1 test only: strip Secure on successful unlock response; original credentials and same-origin checks unchanged; log AUDIT_LINUX_WEBKIT_LOOPBACK_COOKIE_ADAPTER'},
 'audited_test_revision':{'file':'tests/scroll-sync-browser.test.mjs',
 'reason':'replace renderer-dependent previous anchor +30 with requested source line 600 +30',
 'review_file':'audit-reports/scroll-sync-semantic-assertion-proposal.diff'},
 'runner_log':'run.log',
 'note':'These are AM test associations, not an independent source-code architecture review.'
}
Path(dest).write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n')
print('AUDIT_EVIDENCE_WRITTEN',dest,'cases=',len(rows),'runner_exit=',rc)
PY

if [[ "$EXIT_CODE" -ne 0 ]]; then
  printf 'AUDIT_FAILED exit=%s evidence=%s\n' "$EXIT_CODE" "$REPORT_DIR/RUN_EVIDENCE.json" >&2
  exit "$EXIT_CODE"
fi
printf '\nAUDIT_AUTOMATED_PASS FrozenBusinessSource=%s AuditedTestContract=%s\n' "$SOURCE_SHA" "$BUNDLE_SHA"
printf 'Independent AI review and report still required: %s\n' "$REPORT_DIR/INDEPENDENT_AM_GIT_REPORT.md"
