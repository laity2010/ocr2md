#!/usr/bin/env bash
# Auditable public package. Same source SHA, same AM/Git entry as internal.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd -P)"
SOURCE_SHA='9c47e44f1fc6b44b4f126030d68008854aced6ca'
PACKAGE_BRANCH='audit-public-pdf-elements-9c47e44'
PDF_SHA='be12aa259e6c6c43f05c41436c4938b7ed115b54e87cadc6770912dece2e41ab'
MD_SHA='d86508f69b941a5ee2e00446ed5ac852458b354f2593618454f5dddf84e3b764'
fail(){ echo "AUDIT_DELIVERY_BLOCKED: $*" >&2; exit 2; }
hash_file(){ if command -v shasum >/dev/null 2>&1; then shasum -a 256 "$1" | awk '{print $1}'; else sha256sum "$1" | awk '{print $1}'; fi; }
for tool in git node npm python3; do command -v "$tool" >/dev/null || fail "Missing $tool"; done
[[ "$(git -C "$ROOT" rev-parse --abbrev-ref HEAD)" == "$PACKAGE_BRANCH" ]] || fail 'wrong audit package branch'
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || fail 'package checkout dirty'
[[ "$(git -C "$ROOT" rev-parse HEAD^)" == "$SOURCE_SHA" ]] || fail 'source SHA not direct package parent'
[[ "$(hash_file "$ROOT/.v6/workspace/buffetts-alpha.original.pdf")" == "$PDF_SHA" ]] || fail 'PDF evidence hash mismatch'
[[ "$(hash_file "$ROOT/packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md")" == "$MD_SHA" ]] || fail 'MD evidence hash mismatch'
SOURCE_DIR="$(dirname "$ROOT")/ocr2md-audit-source-9c47e44"
if [[ -e "$SOURCE_DIR" ]]; then
  [[ "$(git -C "$SOURCE_DIR" rev-parse HEAD 2>/dev/null)" == "$SOURCE_SHA" ]] || fail 'existing source SHA differs'
  [[ -z "$(git -C "$SOURCE_DIR" status --porcelain 2>/dev/null)" ]] || fail 'existing source dirty'
else
  git -C "$ROOT" worktree add --detach "$SOURCE_DIR" "$SOURCE_SHA"
fi
mkdir -p "$SOURCE_DIR/.v6/workspace"
TARGET="$SOURCE_DIR/.v6/workspace/buffetts-alpha.original.pdf"
[[ -f "$TARGET" ]] || cp "$ROOT/.v6/workspace/buffetts-alpha.original.pdf" "$TARGET"
[[ "$(hash_file "$TARGET")" == "$PDF_SHA" ]] || fail 'isolated source PDF mismatch'
[[ -z "$(git -C "$SOURCE_DIR" status --porcelain)" ]] || fail 'source worktree dirty'
echo "AUDIT_SOURCE_SHA=$SOURCE_SHA"
echo "AUDIT_DELIVERY_SHA=$(git -C "$ROOT" rev-parse HEAD)"
echo "AUDIT_PDF_SHA=$PDF_SHA"
echo "AUDIT_MD_SHA=$MD_SHA"
cd "$SOURCE_DIR"
bash tests/am/run-standard-audit.sh "$SOURCE_SHA"
