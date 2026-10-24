#!/usr/bin/env bash
# Run independently from the audit-fixture branch; never alter the V6 source branch.
set -euo pipefail

BUNDLE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SOURCE_SHA='5c7497cdf94ea35217e83effd9496a045625fef0'
EXPECTED_PDF='be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab'
TARGET="${OCR2MD_AUDIT_TARGET_DIR:-$(dirname "$BUNDLE_DIR")/ocr2md-v6-audit-target}"

fail(){ printf 'AUDIT_BLOCKED: %s\n' "$*" >&2; exit 2; }
for command in git node npm python3; do
  command -v "$command" >/dev/null 2>&1 || fail "missing dependency: $command"
done
cd "$BUNDLE_DIR"
[[ "$(git branch --show-current)" == 'audit-fixture-5c7497c' ]] || fail 'checkout audit-fixture-5c7497c first'
[[ -z "$(git status --porcelain)" ]] || fail 'audit bundle must have a clean Git worktree'
git merge-base --is-ancestor "$SOURCE_SHA" HEAD || fail 'fixed source SHA is not an ancestor of the audit bundle'
BUNDLE_SHA="$(git rev-parse HEAD)"

if [[ -e "$TARGET" ]]; then
  [[ -d "$TARGET" ]] || fail "target exists and is not a directory: $TARGET"
  [[ "$(git -C "$TARGET" rev-parse --show-toplevel 2>/dev/null)" == "$(cd "$TARGET" && pwd)" ]] || fail 'existing target not a Git checkout'
  [[ "$(git -C "$TARGET" rev-parse HEAD)" == "$SOURCE_SHA" ]] || fail 'existing target has a different Git SHA'
  [[ "$(git -C "$TARGET" rev-parse --path-format=absolute --git-common-dir)" == "$(git rev-parse --path-format=absolute --git-common-dir)" ]] || fail 'existing target belongs to a different Git repository'
  [[ -z "$(git -C "$TARGET" status --porcelain)" ]] || fail 'existing target has changes'
else
  git worktree add --detach "$TARGET" "$SOURCE_SHA"
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
REPORT_DIR='.v6/audit-reports'
# Prevent overlapping npm installs, browser sessions and writes to the same AM SQLite.
LOCK="$REPORT_DIR/.active-run"
mkdir "$LOCK" 2>/dev/null || fail "another audit is running or a stale lock exists: $LOCK"
trap 'rmdir "$LOCK" 2>/dev/null || true' EXIT
printf 'AUDIT_BUNDLE_SHA=%s\nAUDIT_SOURCE_SHA=%s\nAUDIT_PDF_SHA=%s\nAUDIT_TARGET=%s\n' \
  "$BUNDLE_SHA" "$SOURCE_SHA" "$PDF_SHA" "$TARGET"

# Install versions from package-lock before determining browser executable paths.
npm ci --no-audit --no-fund
if [[ "${OCR2MD_AUDIT_SKIP_BROWSER_INSTALL:-0}" != '1' ]]; then
  npx playwright install chromium webkit
fi
export OCR2MD_AUDIT_CHROME_PATH="$(node -p 'require("playwright").chromium.executablePath()')"
export OCR2MD_AUDIT_WEBKIT_PATH="$(node -p 'require("playwright").webkit.executablePath()')"
[[ -x "$OCR2MD_AUDIT_CHROME_PATH" ]] || fail 'Chromium browser binary not installed'
[[ -x "$OCR2MD_AUDIT_WEBKIT_PATH" ]] || fail 'WebKit browser binary not installed'

printf 'AUDIT_OS=%s\nAUDIT_NODE=%s\nAUDIT_PYTHON=%s\nAUDIT_PLAYWRIGHT=%s\n' \
  "$(uname -s)" "$(node -v)" "$(python3 -V 2>&1)" "$(node -p 'require("playwright/package.json").version')"
printf 'AUDIT_BROWSER_BINARIES=installed_and_executable\n'

set +e
bash tests/am/run-grok-audit.sh "$SOURCE_SHA" 2>&1 | tee "$REPORT_DIR/run.log"
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
        ''',(source,source)):
            rows.append(dict(row))
result={
 'audit_bundle_git_sha':bundle,'target_source_git_sha':source,'pdf_sha256':pdf,
 'date_utc':datetime.now(timezone.utc).isoformat(),
 'host':{'os':platform.system(),'architecture':platform.machine(),
         'python':platform.python_version(),
         'node':subprocess.run(['node','--version'],capture_output=True,text=True).stdout.strip(),
         'playwright':subprocess.run(['node','-p','require("playwright/package.json").version'],capture_output=True,text=True).stdout.strip()},
 'runner_exit_code':int(rc),
 'am_cases':[{**r,'status':r['status'] or 'NOT VERIFIED'} for r in rows],
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
printf '\nAUDIT_AUTOMATED_PASS Source=%s Bundle=%s\n' "$SOURCE_SHA" "$BUNDLE_SHA"
printf 'Independent AI review and report still required: %s\n' "$REPORT_DIR/INDEPENDENT_AM_GIT_REPORT.md"
