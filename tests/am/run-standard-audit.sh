#!/usr/bin/env bash
# One standard snapshot/test/report entry for internal AI, Grok and Muse.
# The old run-grok-audit.sh remains the isolated execution engine.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd -P)"
SHA="${1:?Usage: bash tests/am/run-standard-audit.sh FULL_40_CHAR_SHA}"
[[ "$SHA" =~ ^[0-9a-f]{40}$ ]] || { echo 'AM_STANDARD_BLOCKED: invalid SHA' >&2; exit 2; }
SHORT="${SHA:0:8}"
OUT="${OCR2MD_STANDARD_REPORT_DIR:-$ROOT/.v6/audit-reports/standard-${SHORT}-$(date -u +%Y%m%dT%H%M%SZ)}"
TARGET="${OCR2MD_AUDIT_TARGET_DIR:-$(dirname "$ROOT")/ocr2md-am-${SHORT}-isolated}"
mkdir -p "$OUT"
printf 'AM_STANDARD_START sha=%s report=%s\n' "$SHA" "$OUT"
set +e
bash "$ROOT/tests/am/run-grok-audit.sh" "$SHA" 2>&1 | tee "$OUT/run.log"
RUN_EXIT=${PIPESTATUS[0]}
# Standard reports must inspect the SAME frozen Git tree as the isolated
# runner, even if daily development advances the caller's branch meanwhile.
# Fail closed to the caller report when no matching trusted audit worktree
# exists; never silently reinterpret a different checkout as the audit SHA.
REPORT_SOURCE="$ROOT"
if [[ -f "$TARGET/tests/am/standard_audit.py" ]] &&
   [[ "$(git -C "$TARGET" rev-parse HEAD 2>/dev/null)" == "$SHA" ]] &&
   [[ "$(git -C "$TARGET" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)" == "$(git -C "$ROOT" rev-parse --path-format=absolute --git-common-dir)" ]] &&
   [[ -z "$(git -C "$TARGET" status --porcelain 2>/dev/null)" ]]; then
  REPORT_SOURCE="$TARGET"
fi
printf 'AM_STANDARD_REPORT_SOURCE=%s\n' "$REPORT_SOURCE"
python3 "$REPORT_SOURCE/tests/am/standard_audit.py" --source-sha "$SHA" --runner-exit "$RUN_EXIT" --isolated-dir "$TARGET" --output-dir "$OUT"
REPORT_EXIT=$?
set -e
printf 'AM_STANDARD_EXIT runner=%s report=%s report_dir=%s\n' "$RUN_EXIT" "$REPORT_EXIT" "$OUT"
exit "$REPORT_EXIT"
