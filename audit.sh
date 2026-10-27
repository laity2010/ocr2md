#!/usr/bin/env bash
# Public audit delivery; fixed source SHA is checked in a separate worktree.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
SOURCE_SHA='06bf498daab22ad175f5ae4727a2c1e66b38402c'
BRANCH='audit-public-06bf498'
PDF_SHA='be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab'
MD_SHA='d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764'
SOURCE_DIR="$(dirname "$ROOT")/ocr2md-public-audit-source-06bf498"
fail(){ echo "AUDIT_BLOCKED: $*" >&2; exit 2; }
hash_file(){
 if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'
 else sha256sum "$1" | awk '{print $1}'; fi
}
for app in git node npm python3; do command -v "$app" >/dev/null 2>&1 || fail "Missing dependency $app"; done
test "$(git -C "$ROOT" branch --show-current)" = "$BRANCH" || fail "Checkout $BRANCH"
test -z "$(git -C "$ROOT" status --porcelain)" || fail 'Audit package worktree must be clean'
git -C "$ROOT" merge-base --is-ancestor "$SOURCE_SHA" HEAD || fail 'Source SHA not in bundle history'
test "$(git -C "$ROOT" rev-parse HEAD^)" = "$SOURCE_SHA" || fail 'Unexpected audit package parent SHA'
test "$(hash_file "$ROOT/.v6/workspace/buffetts-alpha.original.pdf")" = "$PDF_SHA" || fail 'PDF fixture mismatch'
test "$(hash_file "$ROOT/packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md")" = "$MD_SHA" || fail 'MD fixture mismatch'
if test -e "$SOURCE_DIR"; then
 test -d "$SOURCE_DIR" || fail 'Source path occupied by a file'
 test "$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null)" = "$SOURCE_SHA" || fail 'Existing source has wrong SHA'
 test "$(git -C "$SOURCE_DIR" rev-parse --path-format=absolute --git-common-dir)" = "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" || fail 'Existing source belongs to a different repo'
 test -z "$(git -C "$SOURCE_DIR" status --porcelain)" || fail 'Existing source has uncommitted changes'
else
 git -C "$ROOT" worktree add --detach "$SOURCE_DIR" "$SOURCE_SHA"
fi
mkdir -p "$SOURCE_DIR/.v6/workspace"
TARGET_PDF="$SOURCE_DIR/.v6/workspace/buffetts-alpha.original.pdf"
if test ! -e "$TARGET_PDF"; then
 cp "$ROOT/.v6/workspace/buffetts-alpha.original.pdf" "$TARGET_PDF"
 chmod a-w "$TARGET_PDF"
fi
test "$(hash_file "$TARGET_PDF")" = "$PDF_SHA" || fail 'Source PDF fixture mismatch; no overwrite'
test -z "$(git -C "$SOURCE_DIR" status --porcelain)" || fail 'Source worktree dirty'
echo "AUDIT_PACKAGE_SHA=$(git -C "$ROOT" rev-parse HEAD)"
echo "AUDIT_SOURCE_SHA=$SOURCE_SHA"
echo "AUDIT_PDF_SHA256=$PDF_SHA"
echo "AUDIT_SOURCE_DIR=$SOURCE_DIR"
cd "$SOURCE_DIR"
bash tests/am/run-grok-audit.sh "$SOURCE_SHA"
