#!/usr/bin/env bash
# Mandatory MOPJO WP2 real-world test. Physical Buffett sources are strictly read-only.
set -euo pipefail
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
book="${MOPJO_BUFFETT_BOOK:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha}"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/mopjo-buffett-wp2.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
MOPJO_TEST_BOOK="$book" MOPJO_TEST_TMP="$tmp" python3 - <<'PY'
from pathlib import Path
import os,json,zipfile,hashlib,sys
book=Path(os.environ['MOPJO_TEST_BOOK'])
ptr=json.loads((book/'.ocr2md'/'ir-current.v1.json').read_bytes())
zip_path=book/'.ocr2md'/'ir-versions'/(ptr['archiveSha256']+'.zip')
with zipfile.ZipFile(zip_path) as z: raw=z.read('document-ir.v1.json')
if hashlib.sha256(raw).hexdigest()!=ptr['irSha256']:raise SystemExit('MOPJO saved original IR SHA mismatch')
doc=json.loads(raw)
pdf=book/Path(doc['pdf']['path']).name
if not pdf.is_file() or pdf.is_symlink():raise SystemExit('MOPJO bound PDF missing or unsafe')
if hashlib.sha256(pdf.read_bytes()).hexdigest()!=doc['pdf']['sha256']:raise SystemExit('MOPJO bound PDF SHA mismatch')
target=Path(os.environ['MOPJO_TEST_TMP'])
(target/'original.dir.json').write_bytes(raw)
(target/'bound-pdf-path.txt').write_text(str(pdf))
print('MOPJO_BUFFETT_SOURCE_READONLY_OK',len(raw),'bytes',len(doc['blocks']),'blocks',len(doc['pages']),'pages')
PY
pdf_path="$(cat "$tmp/bound-pdf-path.txt")"
node "$here/../dist/buffettWp2.test.mjs" "$tmp/original.dir.json" "$pdf_path"
