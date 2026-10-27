#!/usr/bin/env bash
# Private, local bare-repository fixture; no network, no production or user data.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
TMP="$(mktemp -d "${TMPDIR:-/tmp}/ocr2md-audit-ack-test.XXXXXX")"
[[ "$TMP" == *ocr2md-audit-ack-test.* ]] || exit 3
trap 'rm -rf "$TMP"' EXIT
git init -q "$TMP/source"
git -C "$TMP/source" config user.name 'Audit Fixture'
git -C "$TMP/source" config user.email 'audit-fixture@example.invalid'
mkdir -p "$TMP/source/scripts"
cp "$ROOT/scripts/audit-ack.sh" "$TMP/source/scripts/audit-ack.sh"
echo fixture > "$TMP/source/README.md"
git -C "$TMP/source" add scripts/audit-ack.sh README.md
git -C "$TMP/source" commit -qm 'fixture commit'
SHA="$(git -C "$TMP/source" rev-parse HEAD)"
REF=refs/heads/audit/frozen-fixture
git init --bare -q "$TMP/private.git"
git -C "$TMP/source" push -q "$TMP/private.git" "$SHA:$REF"
OUT="$(bash "$TMP/source/scripts/audit-ack.sh" "$SHA" "$TMP/private.git" "$REF")"
[[ "$OUT" == "AUDIT_ACK READY sha=$SHA ref=$REF "* ]] || exit 1
printf '%s\n' "$OUT"
if bash "$TMP/source/scripts/audit-ack.sh" '0000000000000000000000000000000000000000' "$TMP/private.git" "$REF" 2>"$TMP/error"; then echo 'incorrect SHA accepted'; exit 1; fi
grep -q 'checkout SHA mismatch' "$TMP/error"
if bash "$TMP/source/scripts/audit-ack.sh" "$SHA" "$TMP/private.git" refs/heads/audit/absent 2>"$TMP/error"; then echo 'missing ref accepted'; exit 1; fi
grep -q 'ref inaccessible' "$TMP/error"
echo dirty >> "$TMP/source/README.md"
if bash "$TMP/source/scripts/audit-ack.sh" "$SHA" "$TMP/private.git" "$REF" 2>"$TMP/error"; then echo 'dirty source accepted'; exit 1; fi
grep -q 'source checkout is dirty' "$TMP/error"
git -C "$TMP/source" restore README.md
echo ahead >> "$TMP/source/README.md"
git -C "$TMP/source" add README.md
git -C "$TMP/source" commit -qm 'local advance while remote frozen'
NEXT_SHA="$(git -C "$TMP/source" rev-parse HEAD)"
if bash "$TMP/source/scripts/audit-ack.sh" "$NEXT_SHA" "$TMP/private.git" "$REF" 2>"$TMP/error"; then echo 'remote drift accepted'; exit 1; fi
grep -q 'remote SHA mismatch' "$TMP/error"
echo 'AUDIT_ACK_TEST_PASS ready / sha-mismatch / inaccessible-ref / dirty-checkout / frozen-ref-drift'
