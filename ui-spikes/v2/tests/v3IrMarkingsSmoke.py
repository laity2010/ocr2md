"""CAS small chapter marks against a fully disposable copy of a real 224-block book."""
import base64,hashlib,json,sys,tempfile,shutil,zipfile,time
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault,VaultError
from v3_ir_persistence import save_snapshot,save_markings,load_markings,load_snapshot,publish_saved_chapters
root=Path(__file__).resolve().parents[3]
book='/ocr2md/Bufett’s Alpha'
original=Path('/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha')
archive=(root/'.tmp/ir-wp6/preview/ir-chapters-provenance.zip').read_bytes()
with zipfile.ZipFile(Path(root/'.tmp/ir-wp6/preview/ir-chapters-provenance.zip')) as z:
    ir=json.loads(z.read('document-ir.v1.json'))
with tempfile.TemporaryDirectory(prefix='ocr2md-ir-markings-') as tmp:
    vaultroot=Path(tmp)/'ocr2md';physical=vaultroot/'ocr2md'/'Bufett’s Alpha';(physical/'json').mkdir(parents=True)
    for src in ['Buffett s Alpha.pdf','json/MinerU_Buffett s Alpha__20261008112941.json']:
        shutil.copy2(original/src,physical/src)
    vault=V3MacVault(vaultroot,Path(tmp)/'private/key')
    first=save_snapshot(vault,{'book':book,'requestId':'markings-base','expectedGeneration':None,'archiveBase64':base64.b64encode(archive).decode()})
    pointer=physical/'.ocr2md/ir-current.v1.json';pointer_before=pointer.read_bytes()
    snapshot=physical/'.ocr2md/ir-versions'/(first['generation']+'.zip');stat_before=snapshot.stat().st_size
    titles=sorted((x for x in ir['blocks'] if x['type']=='title'),key=lambda x:x['readingOrder'])
    blocks=sorted(ir['blocks'],key=lambda x:x['readingOrder'])
    marks={'segments':[{'startBlockId':blocks[0]['blockId'],
         'endBlockId':blocks[-1]['blockId'],'fileName':'00 - Start.md'}]}
    legacy={'layout':[{'blockId':x['blockId'],'standalone':i==0,
                    **({'fileName':'00 - Start.md'} if i==0 else {})} for i,x in enumerate(titles)],
       'chapterNames':[{'chapterId':x['chapterId'],'fileName':x.get('fileName')} for x in ir['chapters']],
       'operations':[]}
    old=physical/'.ocr2md/ir-markings.v1.json'
    old.write_text(json.dumps({'kind':'ocr2md/ir-markings','schemaVersion':1,'book':book,
       'baseGeneration':first['generation'],'requestId':'legacy-fixture','markings':legacy}),encoding='utf-8')
    old_bytes=old.read_bytes()
    assert load_markings(vault,book)['markings']==legacy
    old_revision=load_markings(vault,book)['revision']
    payload={'book':book,'requestId':'markings-first','expectedGeneration':first['generation'],
       'expectedRevision':old_revision,'markings':marks}
    start_mark=time.perf_counter()
    saved=save_markings(vault,payload)
    first_mark_ms=round(1000*(time.perf_counter()-start_mark),1)
    assert saved['committed'] and saved['generation']==first['generation'] and saved['bytesWritten']<12000
    assert load_markings(vault,book)['markings']==marks
    newfile=physical/'.ocr2md/chapters-map.v1.json'
    assert newfile.is_file() and old.read_bytes()==old_bytes, 'legacy sidecar must be retained as-is'
    assert json.loads(newfile.read_text())['markings']==marks
    assert json.loads(newfile.read_text())['kind']=='ocr2md/chapters-map'
    retry=save_markings(vault,payload)
    assert retry.get('alreadyCurrent') is True and retry['bytesWritten']==0 and retry['revision']==saved['revision']
    # Independent source hash must protect tiny edits just like full IR commits.
    ocr_file=physical/'json/MinerU_Buffett s Alpha__20261008112941.json'
    source_bytes=ocr_file.read_bytes();ocr_file.write_bytes(source_bytes+b' ')
    try:save_markings(vault,{**payload,'requestId':'markings-stale-source','expectedRevision':saved['revision']})
    except VaultError as exc:assert exc.code=='ESTALE'
    else:raise AssertionError('edited original OCR was accepted')
    finally:ocr_file.write_bytes(source_bytes)
    assert load_snapshot(vault,book)['markings']==marks
    assert pointer.read_bytes()==pointer_before and snapshot.stat().st_size==stat_before
    try:save_markings(vault,{**payload,'requestId':'markings-stale'})
    except VaultError as exc:assert exc.code=='ESTALE'
    else:raise AssertionError('stale CAS accepted')
    try:save_snapshot(vault,{'book':book,'requestId':'full-old-writer','expectedGeneration':first['generation'],'archiveBase64':base64.b64encode(archive).decode()})
    except VaultError as exc:assert exc.code=='ESTALE'
    else:raise AssertionError('full overwrite missing markings revision accepted')
    mark2_start=time.perf_counter()
    second=save_markings(vault,{**payload,'requestId':'markings-second','expectedRevision':saved['revision']})
    second_mark_ms=round(1000*(time.perf_counter()-mark2_start),1)
    assert second['revision'] and load_markings(vault,book)['revision']==second['revision']
    assert pointer.read_bytes()==pointer_before and snapshot.stat().st_size==stat_before
    # True map contract: no gaps, missing blocks, unsafe names or unknown keys.
    bad=[{'segments':[dict(marks['segments'][0],endBlockId='blk_'+('0'*24))]},
         {'segments':[dict(marks['segments'][0],fileName='../evil.md')]},
         {'segments':[dict(marks['segments'][0],unexpected=True)]}]
    for ix,malformed in enumerate(bad):
        try:save_markings(vault,{**payload,'requestId':f'malformed-map-{ix}',
            'expectedRevision':second['revision'],'markings':malformed})
        except VaultError as exc:assert exc.code in ('EINVAL','EQUOTA')
        else:raise AssertionError('malformed mapping accepted')
    pub=publish_saved_chapters(vault,{'book':book,'expectedGeneration':first['generation'],
        'expectedIrSha256':hashlib.sha256(zipfile.ZipFile(snapshot).read('document-ir.v1.json')).hexdigest(),
        'expectedMarkingsRevision':second['revision']})
    assert pub['published'] and pub['count']==1 and pub['projectionUpgraded'] is False
    assert pointer.read_bytes()==pointer_before and snapshot.stat().st_size==stat_before
    assert load_markings(vault,book)['revision']==second['revision']
    chapter=physical/'chapters/00 - Start.md'
    assert chapter.is_file() and '# ' in chapter.read_text()
    # Chapter cleaning owns editable MD. Explicit re-publish must back it up.
    chapter.write_text(chapter.read_text()+ '\nMANUAL_CLEANING_SHOULD_SURVIVE_BACKUP\n')
    newer=publish_saved_chapters(vault,{'book':book,'expectedGeneration':first['generation'],
        'expectedIrSha256':hashlib.sha256(zipfile.ZipFile(snapshot).read('document-ir.v1.json')).hexdigest(),
        'expectedMarkingsRevision':second['revision']})
    assert newer['overwritten'] and newer['backupPath']
    backup=physical/Path(newer['backupPath']).relative_to(book)
    assert (backup/'00 - Start.md').is_file() and 'MANUAL_CLEANING_SHOULD_SURVIVE_BACKUP' in (backup/'00 - Start.md').read_text()
    assert 'MANUAL_CLEANING_SHOULD_SURVIVE_BACKUP' not in chapter.read_text()
    assert pointer.read_bytes()==pointer_before
    # A separate writer changes content after our page loaded. Ordinary CAS
    # rejects; an explicit user overwrite backs up the old map first.
    incoming={'segments':[dict(marks['segments'][0],fileName='00 - Concurrent.md')]}
    concurrent=save_markings(vault,{**payload,'requestId':'concurrent-author',
        'expectedRevision':second['revision'],'markings':incoming})
    assert concurrent['revision']!=second['revision']
    try:save_markings(vault,{**payload,'requestId':'stale-without-overwrite',
        'expectedRevision':second['revision'],'markings':marks})
    except VaultError as exc:assert exc.code=='ESTALE'
    else:raise AssertionError('stale writer without explicit overwrite accepted')
    replaced=save_markings(vault,{**payload,'requestId':'explicit-user-overwrite',
        'expectedRevision':second['revision'],'markings':marks,'overwrite':True})
    assert replaced['revision']!=concurrent['revision'] and load_markings(vault,book)['markings']==marks
    backups=list((physical/'.ocr2md/chapters-map-backups').glob('*.json'))
    assert len(backups)>=1
    assert any(json.loads(b.read_bytes())['markings']==incoming for b in backups)
    assert old.read_bytes()==old_bytes and pointer.read_bytes()==pointer_before
    try:save_markings(vault,{**payload,'requestId':'overwrite-stale-generation',
        'expectedGeneration':'0'*64,'expectedRevision':'','markings':marks,'overwrite':True})
    except VaultError as exc:assert exc.code=='ESTALE'
    else:raise AssertionError('wrong DIRjson generation bypassed by overwrite')
    print('IR_MARKINGS_SMALL_CAS_PASS',json.dumps({'originalArchiveBytes':len(archive),'sidecarBytes':saved['bytesWritten'],
      'reductionRatio':round(len(archive)/saved['bytesWritten'],1),'firstCommitMs':first_mark_ms,'secondCommitMs':second_mark_ms,'titles':len(titles),'casConflictRejected':True,
      'fullWriterProtected':True,'sourceChangedRejected':True,'retryIdempotent':True,'basePointerUnchanged':True,'legacyMigratedWithoutDelete':True,'publishedWithoutIrRewrite':True,'cleanedChapterBackedUp':True,'malformedMapsDenied':True,'explicitOverwriteBackedUp':True,'wrongGenerationStillRejected':True,'originalVaultUntouched':True}))
