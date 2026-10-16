#!/usr/bin/env bash
set -euo pipefail
book="${MOPJO_BUFFETT_BOOK:-$HOME/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha}"
tmp="$(mktemp -d "${TMPDIR:-/tmp}/mopjo-buffett-wp5.XXXXXX")"
trap 'rm -rf "$tmp"' EXIT
MOPJO_BOOK="$book" MOPJO_TEMP="$tmp" python3 - <<'PY'
from pathlib import Path
import zipfile,json,hashlib,os
book=Path(os.environ['MOPJO_BOOK']);out=Path(os.environ['MOPJO_TEMP']);meta=book/'.ocr2md'
pointer=json.loads((meta/'ir-current.v1.json').read_bytes())
map_raw=(meta/'chapters-map.v1.json').read_bytes(); m=json.loads(map_raw)
assert pointer['archiveSha256']==m['baseGeneration'],'Map belongs to different generation'
with zipfile.ZipFile(meta/'ir-versions'/(pointer['archiveSha256']+'.zip')) as z:
    ir=z.read('document-ir.v1.json')
assert hashlib.sha256(ir).hexdigest()==pointer['irSha256'],'Snapshot mismatch'
doc=json.loads(ir); pdf=book/Path(doc['pdf']['path']).name
assert pdf.is_file() and not pdf.is_symlink(),'Invalid PDF'
assert hashlib.sha256(pdf.read_bytes()).hexdigest()==doc['pdf']['sha256'],'Original PDF mismatch'
(out/'original.dir.json').write_bytes(ir)
(out/'chapters-map.json').write_bytes(map_raw)
(out/'params.json').write_text(json.dumps({'pdf':str(pdf),'generation':pointer['archiveSha256']}))
print('MOPJO_WP5_BUFFETT_SOURCE_OK',len(doc['blocks']),'blocks',len(doc['sourceElements']),'elements')
PY
pdf="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["pdf"])' "$tmp/params.json")"
gen="$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["generation"])' "$tmp/params.json")"
node "$(dirname "$0")/../dist/buffettWp5.test.mjs" "$tmp/original.dir.json" "$tmp/chapters-map.json" "$pdf" "$gen"
