#!/usr/bin/env bash
# Read-only admission check; MUST run in the auditor's checkout, not the issuer's.
set -euo pipefail
blocked(){ printf 'AUDIT_ACK_BLOCKED: %s\n' "$*" >&2; exit 2; }
[[ $# == 3 ]] || blocked 'usage: <full SHA> <remote> <refs/heads/audit/name>'
SHA="$1"; REMOTE="$2"; REF="$3"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || blocked 'full 40-character SHA required'
[[ "$REF" == refs/heads/audit/* ]] || blocked 'frozen ref must use audit/*'
git check-ref-format "$REF" >/dev/null 2>&1 || blocked 'invalid ref'
for executable in git node npm python3; do
  command -v "$executable" >/dev/null 2>&1 || blocked "missing $executable"
done
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
[[ "$(git -C "$ROOT" rev-parse --show-toplevel 2>/dev/null)" == "$ROOT" ]] || blocked 'incorrect git root'
LOCAL_SHA="$(git -C "$ROOT" rev-parse HEAD)" || blocked 'no checkout HEAD'
[[ "$LOCAL_SHA" == "$SHA" ]] || blocked "checkout SHA mismatch: $LOCAL_SHA"
[[ -z "$(git -C "$ROOT" status --porcelain)" ]] || blocked 'source checkout is dirty'
git -C "$ROOT" diff --check || blocked 'diff whitespace errors'
export GIT_TERMINAL_PROMPT=0
if [[ "$REMOTE" == git@* || "$REMOTE" == ssh://* ]]; then
  : "${GIT_SSH_COMMAND:=ssh -o BatchMode=yes -o ConnectTimeout=10}"
  export GIT_SSH_COMMAND
fi
REMOTE_RESULT="$(git ls-remote --exit-code --refs "$REMOTE" "$REF" 2>/dev/null)" ||
  blocked 'remote audit ref inaccessible with auditor credentials'
REMOTE_SHA="${REMOTE_RESULT%%$'\t'*}"
[[ "$REMOTE_SHA" == "$SHA" ]] || blocked "remote SHA mismatch: $REMOTE_SHA"
printf 'AUDIT_ACK READY sha=%s ref=%s os=%s arch=%s node=%s python=%s\n' \
 "$SHA" "$REF" "$(uname -s)" "$(uname -m)" "$(node -v)" "$(python3 -V 2>&1)"
