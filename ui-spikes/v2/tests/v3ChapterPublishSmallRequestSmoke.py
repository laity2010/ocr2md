"""Actual saved book (read-only source) copied to isolated Mac Vault; test small
server-side chapter projection + CAS + create-only publication, zero real writes.
"""
import hashlib,io,json,shutil,sys,tempfile,zipfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault,VaultError
from v3_ir_persistence import publish_saved_chapters,read_pointer
source=Path.home()/"Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha"
with tempfile.TemporaryDirectory(prefix='ocr2md-real-pub-small-') as x:
    t=Path(x);root=t/'ocr2md';dest=root/'ocr2md'/'Bufett’s Alpha';dest.mkdir(parents=True)
    saved=json.loads((source/'.ocr2md/ir-current.v1.json').read_bytes())
    original_sha=saved['archiveSha256'];ir_sha=saved['irSha256']
    with zipfile.ZipFile(source/'.ocr2md/ir-versions'/(original_sha+'.zip')) as zin:
        ir=json.loads(zin.read('document-ir.v1.json'))
        manifest=json.loads(zin.read('document-ir.markdown-manifest.v1.json'))
    assert manifest['projectionState']=='whole-book-unreviewed'
    for src in (ir['pdf'],ir['ocr']):
        relative=src['path'][len('/ocr2md/Bufett’s Alpha/'):]
        filename=dest/relative;filename.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(source/relative,filename)
        assert hashlib.sha256(filename.read_bytes()).hexdigest()==src['sha256']
    meta=dest/'.ocr2md';meta.mkdir()
    shutil.copy2(source/'.ocr2md/ir-current.v1.json',meta/'ir-current.v1.json')
    (meta/'ir-versions').mkdir()
    shutil.copy2(source/'.ocr2md/ir-versions'/(original_sha+'.zip'),meta/'ir-versions'/(original_sha+'.zip'))
    generated=dest/'ir-generated'/'versions'/original_sha
    generated.mkdir(parents=True)
    for item in (source/'ir-generated/versions'/original_sha).iterdir():
        if item.is_file():shutil.copy2(item,generated/item.name)
    # Mirror old V2 backup but not its large contents; must never touch it.
    backup=dest/'chapters bk';backup.mkdir();(backup/'KEEP.txt').write_text('old chapters protected')
    vault=V3MacVault(root,t/'private/access-key')
    request={'book':'/ocr2md/Bufett’s Alpha','expectedGeneration':original_sha,'expectedIrSha256':ir_sha}
    try: publish_saved_chapters(vault,{**request,'expectedIrSha256':'0'*64})
    except VaultError as ex:assert ex.code=='ESTALE'
    else:raise AssertionError('mismatched saved DIRjson unexpectedly accepted')
    assert not (dest/'chapters').exists()
    out=publish_saved_chapters(vault,request)
    files=sorted(p.name for p in (dest/'chapters').glob('*.md'))
    assert out['projectionUpgraded'] and out['count']==6 and len(files)==6,out
    pointer,_=read_pointer(vault,'/ocr2md/Bufett’s Alpha')
    assert pointer['archiveSha256']!=original_sha and pointer['irSha256']==ir_sha
    with zipfile.ZipFile(dest/'.ocr2md/ir-versions'/(pointer['archiveSha256']+'.zip')) as z:
        next_ir=json.loads(z.read('document-ir.v1.json'))
        next_manifest=json.loads(z.read('document-ir.markdown-manifest.v1.json'))
    assert next_ir==ir
    assert next_manifest['projectionState']=='chapter-files-for-cleaning'
    assert sum(c['status']=='needs-review' for c in next_ir['chapterStructure']['candidates'])==21
    assert (backup/'KEEP.txt').read_text()=='old chapters protected'
    again=publish_saved_chapters(vault,{**request,'expectedGeneration':pointer['archiveSha256']})
    assert again['alreadyPublished'] and again['count']==6
    target=next((dest/'chapters').glob('*.md'));target.write_bytes(target.read_bytes()+b'\nHuman draft\n')
    try:publish_saved_chapters(vault,{**request,'expectedGeneration':pointer['archiveSha256']})
    except VaultError as ex:assert ex.code=='ECONFLICT'
    else:raise AssertionError('cleaned text overwritten')
    assert target.read_bytes().endswith(b'Human draft\n')
    assert json.loads((source/'.ocr2md/ir-current.v1.json').read_text())['archiveSha256']==original_sha
    assert not (source/'chapters').exists()
    print('REAL_SAVED_CHAPTERS_SMALL_REQUEST_PASS',json.dumps({
      'files':files,'count':len(files),'postBytes':len(json.dumps(request)),
      'savedSnapshotUpgraded':True,'pendingOcrReviews':21,
      'oldBackupPreserved':True,'humanEditsProtected':True,'realUserBookUntouched':True},ensure_ascii=False))
