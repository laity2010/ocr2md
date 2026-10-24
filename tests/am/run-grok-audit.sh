#!/usr/bin/env bash
# Read-only source audit; writes only ignored local .v6/ evidence and build files.
set -euo pipefail
cd "$(dirname "$0")/../.."
EXPECTED_SHA="${1:?Pass the complete approved Git commit SHA as the first argument}"
PDF_SHA="be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab"
PDF=".v6/workspace/buffetts-alpha.original.pdf"
MD="packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md"
MD_SHA="d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764"
sha256_file(){
  if command -v shasum >/dev/null 2>&1; then
    shasum -a 256 "$1" | awk '{print $1}'
  else
    sha256sum "$1" | awk '{print $1}'
  fi
}

[[ "$(git rev-parse HEAD)" == "$EXPECTED_SHA" ]] || { echo "AUDIT_SHA_MISMATCH"; exit 10; }
[[ -z "$(git status --porcelain)" ]] || { echo "AUDIT_REPO_DIRTY"; exit 11; }
[[ -f "$PDF" ]] || { echo "AUDIT_PDF_FIXTURE_MISSING: $PDF"; exit 12; }
[[ "$(sha256_file "$PDF")" == "$PDF_SHA" ]] || { echo "AUDIT_PDF_SHA_MISMATCH"; exit 13; }
[[ "$(sha256_file "$MD")" == "$MD_SHA" ]] || { echo "AUDIT_MD_SHA_MISMATCH"; exit 14; }

echo "GROK_AUDIT_ENV os=$(uname -s) node=$(node --version) python=$(python3 --version 2>&1)"
mkdir -p .v6/workspace .v6/tests .v6/evidence
# The editable workspace is a disposable copy; the fixture remains immutable.
cp "$MD" .v6/workspace/buffetts-alpha.minerujson.md
npm ci --no-audit --no-fund
npm run build
python3 tests/am/am.py build
python3 -m unittest discover -s tests/am -p 'test_*.py'
python3 tests/am/am.py check
python3 tests/am/am.py coverage
python3 tests/am/am.py edges debt

# Existing macOS-path literals are translated only at browser-launch time.
# On non-macOS hosts, first install the lockfile's Playwright browser builds
# and their system dependencies; environment differences must be in the report.
export NODE_OPTIONS="${NODE_OPTIONS:+$NODE_OPTIONS }--import=$(pwd)/tests/am/audit-browser-preload.mjs"
python3 tests/am/am.py run-all
python3 tests/am/am.py certify
git fsck --full --no-reflogs
[[ -z "$(git status --porcelain)" ]] || { echo "AUDIT_DIRTY_AFTER_RUN"; exit 15; }
echo "GROK_AUDIT_COMPLETE sha=$EXPECTED_SHA"
