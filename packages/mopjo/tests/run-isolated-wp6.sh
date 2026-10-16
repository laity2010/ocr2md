#!/usr/bin/env bash
# WP06: never import or copy any OCR2MD sibling source or root node_modules.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
temp="$(mktemp -d "${MOPJO_WP06_TMP_ROOT:-/private/tmp}/mopjo-wp6-outside-repo.XXXXXX")"
trap 'rm -rf "$temp"' EXIT
case "$temp/" in "$here/"*) echo 'MOPJO_ISOLATION_WRONG_DIRECTORY' >&2; exit 3;; esac
cp -R "$here/src" "$here/tests" "$here/scripts" "$temp/"
cp "$here/package.json" "$here/package-lock.json" "$here/WP06_BASELINE.json" "$temp/"
# No symlink or parent-root escape is permitted in the copied source tree.
if find "$temp/src" "$temp/tests" "$temp/scripts" -type l -print | grep -q .; then
  echo 'MOPJO_ISOLATION_SYMLINK_REJECTED' >&2
  exit 3
fi
printf 'MOPJO_WP06_EXTERNAL_DIR %s\n' "$temp"
cd "$temp"
npm ci --offline --no-audit --no-fund
test -x node_modules/.bin/tsc
test -x node_modules/.bin/esbuild
npm run verify:boundary
npm test
echo 'MOPJO_WP06_ISOLATED_PASS: local npm ci + TS strict + 369 prior behavior checks, no repository siblings'
