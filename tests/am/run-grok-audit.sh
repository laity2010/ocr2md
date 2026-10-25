#!/usr/bin/env bash
# Canonical Mac/Linux AM regression entrypoint. Never runs against live user data.
# Keeps the historical command name for existing independent AI auditors.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
EXPECTED_SHA="${1:?Pass the approved Git commit SHA as the first argument}"
PDF_SHA='be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab'
MD_SHA='d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764'
PDF='.v6/workspace/buffetts-alpha.original.pdf'
MD='packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md'
sha256_file(){
  if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}';
  else sha256sum "$1" | awk '{print $1}'; fi
}
blocked(){ echo "AM_AUDIT_BLOCKED: $*" >&2; exit 2; }
for dep in git node npm python3; do command -v "$dep" >/dev/null || blocked "missing $dep"; done
node -e 'const [M,m]=process.versions.node.split(".").map(Number); if(M<22||(M===22&&m<13))process.exit(22)' || blocked 'Node >=22.13 required for pdfjs-dist'
[[ "$(git -C "$ROOT" rev-parse HEAD)" == "$EXPECTED_SHA" ]] || blocked 'requested SHA not checked out'
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || blocked 'source worktree must be clean'
[[ -f "$ROOT/$PDF" ]] || blocked 'PDF evidence not present; supply it locally before auditing'
[[ "$(sha256_file "$ROOT/$PDF")" == "$PDF_SHA" ]] || blocked 'source PDF hash mismatch'
[[ "$(sha256_file "$ROOT/$MD")" == "$MD_SHA" ]] || blocked 'source MD fixture hash mismatch'

# Audits always run in a detached sibling worktree. This protects the real
# .v6/workspace mother document and single live release from test writes.
TARGET="${OCR2MD_AUDIT_TARGET_DIR:-$(dirname "$ROOT")/ocr2md-am-$(printf '%.8s' "$EXPECTED_SHA")-isolated}"
[[ "$TARGET" == /* && "$TARGET" != "$ROOT" && "$TARGET" != //* ]] || blocked 'invalid or live audit target path'
if [[ -e "$TARGET" ]]; then
  [[ -d "$TARGET" ]] || blocked 'audit target is not a directory'
  [[ "$(git -C "$TARGET" rev-parse HEAD 2>/dev/null)" == "$EXPECTED_SHA" ]] || blocked 'audit target SHA differs; choose a new target'
  [[ "$(git -C "$TARGET" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" == "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" ]] || blocked 'audit target is not a worktree of this repository'
  [[ -z "$(git -C "$TARGET" status --porcelain)" ]] || blocked 'audit target has tracked changes'
else
  git -C "$ROOT" worktree add --detach "$TARGET" "$EXPECTED_SHA"
fi
mkdir -p "$TARGET/.v6/workspace" "$TARGET/.v6/audit-reports"
if [[ ! -f "$TARGET/$PDF" ]]; then
  cp "$ROOT/$PDF" "$TARGET/$PDF"
  chmod a-w "$TARGET/$PDF"
fi
cd "$TARGET"
[[ "$(sha256_file "$PDF")" == "$PDF_SHA" ]] || blocked 'detached audit PDF hash mismatch'
[[ -z "$(git status --porcelain)" ]] || blocked 'audit worktree is dirty'
REPORT='.v6/audit-reports'
mkdir "$REPORT/.active-run" 2>/dev/null || blocked 'another audit run or stale lock in target'
trap 'rmdir "$REPORT/.active-run" 2>/dev/null || true' EXIT
printf 'AM_AUDIT_SOURCE=%s\nAM_AUDIT_TARGET=%s\nAM_AUDIT_OS=%s\n' "$EXPECTED_SHA" "$TARGET" "$(uname -s)"

python3 tests/am/portability/audit-port-preflight.py --self-test
python3 tests/am/portability/audit-port-preflight.py
export V6_PDF_PATH="$(pwd -P)/$PDF"
npm ci --no-audit --no-fund
npm --prefix packages/minerujson-md ci --no-audit --no-fund
npm --prefix packages/minerujson-md run build
if [[ "$(uname -s)" == Linux && "${OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS:-0}" == 1 ]]; then
  npx playwright install-deps chromium webkit
fi
if [[ "${OCR2MD_AUDIT_SKIP_BROWSER_INSTALL:-0}" != 1 ]]; then
  npx playwright install chromium webkit > "$REPORT/playwright-install.log" 2>&1 || blocked 'Playwright install failed; see log'
  if [[ "$(uname -s)" == Linux ]] && grep -q 'Host system is missing dependencies' "$REPORT/playwright-install.log"; then
    blocked 'Linux shared libraries missing; install-deps chromium webkit required'
  fi
fi
export OCR2MD_AUDIT_CHROME_PATH="$(node -p 'require("playwright").chromium.executablePath()')"
export OCR2MD_AUDIT_WEBKIT_PATH="$(node -p 'require("playwright").webkit.executablePath()')"
for browser in "$OCR2MD_AUDIT_CHROME_PATH" "$OCR2MD_AUDIT_WEBKIT_PATH"; do
  [[ -x "$browser" ]] || blocked "browser executable missing: $browser"
done
# Smoke-test actual browser binaries before confusing host failures with AM regressions.
env -u NODE_OPTIONS node tests/am/portability/audit-browser-preflight.mjs > "$REPORT/browser-preflight.log" 2>&1 || {
  tail -25 "$REPORT/browser-preflight.log" >&2
  blocked 'Chromium/WebKit runtime dependencies unavailable'
}
cat "$REPORT/browser-preflight.log"

# Browser launch path adapter preserves existing macOS-pinned test sources.
# Audit-only imports can never change production output or app authorization.
cp tests/am/portability/audit-fixture-preload.mjs "$REPORT/audit-fixture-preload.mjs"
cp tests/am/portability/audit-loopback-cookie.mjs "$REPORT/audit-loopback-cookie.mjs"
NODE_OPTIONS="--import=$(pwd)/tests/am/audit-browser-preload.mjs --import=$(pwd)/$REPORT/audit-fixture-preload.mjs"
if [[ "$(uname -s)" == Linux ]]; then
  ulimit -c 0 || blocked 'cannot disable Linux browser core dumps'
  cp tests/am/portability/audit-linux-diagnostics.mjs "$REPORT/audit-linux-diagnostics.mjs"
  NODE_OPTIONS="$NODE_OPTIONS --import=$(pwd)/$REPORT/audit-linux-diagnostics.mjs"
fi
NODE_OPTIONS="$NODE_OPTIONS --import=$(pwd)/$REPORT/audit-loopback-cookie.mjs"
export NODE_OPTIONS

printf 'AM_AUDIT_ENV node=%s python=%s playwright=%s\n' "$(node -v)" "$(python3 -V 2>&1)" "$(node -p 'require("playwright/package.json").version')"
mkdir -p .v6/workspace .v6/tests .v6/evidence
# ONLY isolated disposable mother is initialized; never the source worktree's.
cp "$MD" .v6/workspace/buffetts-alpha.minerujson.md
npm run build
python3 tests/am/am.py build
python3 -m unittest discover -s tests/am -p 'test_*.py'
python3 tests/am/am.py check
python3 tests/am/am.py coverage
python3 tests/am/am.py edges debt
python3 tests/am/am.py run-all
python3 tests/am/am.py certify
git fsck --full --no-reflogs
[[ -z "$(git status --porcelain)" ]] || blocked 'detached test worktree dirty after tests'
echo "AM_AUDIT_CERTIFIED sha=$EXPECTED_SHA runtime=$(uname -s)"
