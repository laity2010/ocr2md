#!/usr/bin/env bash
# WP0 externally copied package: no V4/WCP project sources or original Vault.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
sample="$(mktemp -d "${V5_WP0_TMP_ROOT:-/private/tmp}/ocr2md-v5-wp0-isolated.XXXXXX")"
trap 'rm -rf "$sample"' EXIT
for p in baseline components vendor plugins scripts tests app.js index.html package.json package-lock.json README.md INHERITANCE_CONTRACT.md;do
 cp -R "$here/$p" "$sample/"
done
if find "$sample" -type l -print | grep -q .;then echo 'V5_WP0_SYMLINK_FORBIDDEN' >&2; exit 3;fi
cd "$sample"
npm ci --offline --ignore-scripts --no-audit --no-fund
node scripts/verify-wp0.mjs
node scripts/check-plugin-boundaries.mjs
# Tooling is reused for tests only; WCP itself is loaded from pinned V5 vendor bytes.
V5_PLAYWRIGHT_PACKAGE="$here/../../../web-component-platform/node_modules/playwright" node tests/wp0-browser.mjs
echo 'V5_WP0_EXTERNAL_RUNTIME_PASS: no V4 source, no WCP source, no Vault, no public deployment'
