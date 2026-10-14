"""Isolated real published-book MD CAS + corrupt/stale/foreign-path protection."""
import base64, json, hashlib, shutil, sys, tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault, VaultError
from v3_ir_persistence import save_cleaned_chapter
source=Path.home()/"Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha"
with tempfile.TemporaryDirectory(prefix='ocr2md-chapter-clean-') as x:
    t=Path(x);root=t/'ocr2md';dest=root/'ocr2md'/'Bufett’s Alpha'
    (dest/'chapters').mkdir(parents=True)
    one=next((source/'chapters').glob('02 *.md'))
    for file in (one,source/'chapters/.ocr2md-published.v1.json'):
        shutil.copy2(file,dest/'chapters'/file.name)
    (dest/'chapters bk').mkdir()
    (dest/'chapters bk'/'SAFE').write_text('protected')
    vault=V3MacVault(root,t/'private/access-key')
    name=one.name;path='/ocr2md/Bufett’s Alpha/chapters/'+name
    original=one.read_bytes()
    before=vault.metadata(path)
    data=original+b'\nEdited chapter body in isolated test.\n'
    req={'book':'/ocr2md/Bufett’s Alpha','filename':name,'nodeId':before['nodeId'],
         'expectedRevision':before['revision'],'base64':base64.b64encode(data).decode()}
    result=save_cleaned_chapter(vault,req)
    assert result['saved'] and result['sha256']==hashlib.sha256(data).hexdigest()
    assert (dest/'chapters'/name).read_bytes()==data
    assert one.read_bytes()==original,'never write source book'
    assert (dest/'chapters bk'/'SAFE').read_text()=='protected'
    try:save_cleaned_chapter(vault,req)
    except VaultError as e:assert e.code=='ESTALE'
    else:raise AssertionError('stale save must reject')
    try:save_cleaned_chapter(vault,{**req,'filename':'../'+name})
    except VaultError as e:assert e.code=='EINVAL'
    else:raise AssertionError('path traversal must reject')
    try:save_cleaned_chapter(vault,{**req,'filename':'not-published.md'})
    except VaultError as e:assert e.code=='EACCES'
    else:raise AssertionError('foreign file must reject')
    print('REAL_PUBLISHED_CHAPTER_CAS_SAVE_PASS',json.dumps({
        'file':name,'bytes':len(data),'oldBackupProtected':True,
        'staleRejected':True,'pathTraversalRejected':True,'foreignRejected':True,
        'originalBookUntouched':True}))
