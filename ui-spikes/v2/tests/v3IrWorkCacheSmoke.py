"""Isolation smoke: genuine book facts, disposable Vault, cache-only writes."""
import hashlib
import json
import os
import shutil
import sys
import tempfile
import zipfile
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault, VaultError
from v3_ir_work_cache import prepare_work_cache, load_work_cache

BOOK='/ocr2md/Bufett’s Alpha'
ORIGINAL=Path('/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha')
with tempfile.TemporaryDirectory(prefix='ocr2md-v4-fast-cache-') as work:
    top=Path(work)/'ocr2md'
    physical=top/'ocr2md'/'Bufett’s Alpha'
    (physical/'.ocr2md/ir-versions').mkdir(parents=True)
    pointer_src=ORIGINAL/'.ocr2md/ir-current.v1.json'
    pointer=json.loads(pointer_src.read_text())
    generation=pointer['archiveSha256']
    archive=ORIGINAL/'.ocr2md/ir-versions'/(generation+'.zip')
    with zipfile.ZipFile(archive) as z:
        ir=json.loads(z.read('document-ir.v1.json'))
    for src in (ir['pdf'],ir['ocr']):
        rel=src['path'][len(BOOK)+1:]
        target=physical/rel
        target.parent.mkdir(parents=True,exist_ok=True)
        shutil.copy2(ORIGINAL/rel,target)
    shutil.copy2(pointer_src,physical/'.ocr2md/ir-current.v1.json')
    shutil.copy2(archive,physical/'.ocr2md/ir-versions'/archive.name)
    vault=V3MacVault(top,Path(work)/'key')
    before={str(p.relative_to(physical)):hashlib.sha256(p.read_bytes()).hexdigest()
      for p in [physical/'.ocr2md/ir-current.v1.json',
                physical/'.ocr2md/ir-versions'/archive.name]}
    assert load_work_cache(vault,BOOK)['exists'] is False
    first=prepare_work_cache(vault,{'book':BOOK,'expectedGeneration':generation})
    assert first['prepared'] and not first['alreadyCurrent']
    status=load_work_cache(vault,BOOK)
    assert status['exists'] and status['generation']==generation
    index=load_work_cache(vault,BOOK,'index')
    md=load_work_cache(vault,BOOK,'md')
    import base64
    derived=json.loads(base64.b64decode(index['base64']))
    content=base64.b64decode(md['base64']).decode('utf8')
    assert derived['book']==BOOK and len(derived['ranges'])==len(ir['blocks'])
    assert len(derived['headings'])==len((ir.get('chapterStructure') or {}).get('candidates',[]))
    assert len(set(r['blockId'] for r in derived['ranges']))==len(ir['blocks'])
    assert '<!-- ocr2md-ir:block=' in content
    assert prepare_work_cache(vault,{'book':BOOK,'expectedGeneration':generation})['alreadyCurrent']
    # GET paths must never alter source files or the saved DIRjson pointer.
    after={str(p.relative_to(physical)):hashlib.sha256(p.read_bytes()).hexdigest()
      for p in [physical/'.ocr2md/ir-current.v1.json',
                physical/'.ocr2md/ir-versions'/archive.name]}
    assert before==after
    wrong='0'*64 if generation!='0'*64 else '1'*64
    try:prepare_work_cache(vault,{'book':BOOK,'expectedGeneration':wrong})
    except VaultError as error:assert error.code=='ESTALE'
    else:raise AssertionError('Wrong DIRjson generation accepted')
    source=physical/ir['pdf']['path'][len(BOOK)+1:]
    original_stamp=source.stat()
    os.utime(source,ns=(original_stamp.st_atime_ns,original_stamp.st_mtime_ns+2_000_000_000))
    assert not load_work_cache(vault,BOOK)['exists'], 'Changed source metadata reused stale cache'
    os.utime(source,ns=(original_stamp.st_atime_ns,original_stamp.st_mtime_ns))
    assert load_work_cache(vault,BOOK)['exists']
    target=physical/'.ocr2md/chapter-work-cache'/generation/'v1/whole-book.md'
    target.write_bytes(target.read_bytes()+b'corrupted')
    assert not load_work_cache(vault,BOOK)['exists']
    try:prepare_work_cache(vault,{'book':BOOK,'expectedGeneration':generation})
    except VaultError as error:assert error.code=='ECONFLICT'
    else:raise AssertionError('Damaged cache was overwritten without audit')
    assert before=={str(p.relative_to(physical)):hashlib.sha256(p.read_bytes()).hexdigest()
      for p in [physical/'.ocr2md/ir-current.v1.json',
                physical/'.ocr2md/ir-versions'/archive.name]}
    print('V4_CHAPTER_WORK_CACHE_PASS',json.dumps({
        'originalArchiveBytes':archive.stat().st_size,
        'indexBytes':len(base64.b64decode(index['base64'])),
        'wholeBookMdBytes':len(content.encode('utf8')),
        'blocks':len(derived['ranges']),'headings':len(derived['headings']),
        'readonlyCacheStatus':True,'staleGenerationRejected':True,
        'changedSourceInvalidated':True,'corruptCacheRejected':True,
        'originalVaultUntouched':True},ensure_ascii=False))
