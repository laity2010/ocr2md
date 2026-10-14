"""Real-sized IR snapshot, isolated Vault root; never touch the real book."""
import base64,hashlib,json,os,sys,pathlib,tempfile,shutil,subprocess
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault,VaultError
from v3_ir_persistence import save_snapshot,load_snapshot,validate_archive
root=Path(__file__).resolve().parents[3]
book='/ocr2md/Bufett’s Alpha'
original=Path('/Users/daisor/Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha')
archive=(root/'.tmp/ir-wp6/preview/ir-chapters-provenance.zip').read_bytes()
assert len(archive)>512*1024
with tempfile.TemporaryDirectory(prefix='ocr2md-ir7-') as tmp:
    sandbox=Path(tmp);vaultroot=sandbox/'ocr2md';bookpath=vaultroot/'ocr2md'/'Bufett’s Alpha'
    (bookpath/'json').mkdir(parents=True)
    for src in ['Buffett s Alpha.pdf','json/MinerU_Buffett s Alpha__20261008112941.json']:
        shutil.copy2(original/src,bookpath/src)
    vault=V3MacVault(vaultroot,sandbox/'private/key')
    ir,manifest=validate_archive(archive,vault.workspace_id,book)
    assert len(ir['blocks'])==224 and len(manifest['files'])==6
    req=lambda archive,revision,key:{'book':book,'expectedGeneration':revision,'requestId':key,'archiveBase64':base64.b64encode(archive).decode('ascii')}
    assert load_snapshot(vault,book)['exists'] is False
    initial=req(archive,None,'wp7-first');first=save_snapshot(vault,initial)
    assert first['committed'] and first['alreadyCurrent'] is False
    assert save_snapshot(vault,initial)['alreadyCurrent'] is True
    loaded=load_snapshot(vault,book)
    assert loaded['exists'] and loaded['sourcesCurrent'] and loaded['generation']==first['generation']
    assert json.loads(base64.b64decode(loaded['irBase64']))==ir
    pointer=bookpath/'.ocr2md/ir-current.v1.json'
    old=pointer.read_bytes()
    # stale create must reject *even when archive bytes match*
    try:save_snapshot(vault,req(archive,None,'wp7-stale'))
    except VaultError as e:assert e.code=='ESTALE'
    else:raise AssertionError('concurrent stale writer accepted')
    # Unexpected file mutation never authorized by specialized persistence path.
    changed=bookpath/'json/MinerU_Buffett s Alpha__20261008112941.json'
    changed.write_bytes(changed.read_bytes()+b' ')
    try:save_snapshot(vault,req(archive,first['generation'],'wp7-changed-source'))
    except VaultError as e:assert e.code=='ESTALE'
    else:raise AssertionError('OCR changed while saving was not caught')
    assert not load_snapshot(vault,book)['sourcesCurrent']
    changed.write_bytes(changed.read_bytes()[:-1])
    # Bogus ZIP/data must not mutate pointer.
    try:save_snapshot(vault,req(archive[:-50],first['generation'],'wp7-broken-zip'))
    except VaultError as e:assert e.code in ('EINVAL','ECONFLICT')
    else:raise AssertionError('bad archive accepted')
    assert pointer.read_bytes()==old
    generated=bookpath/'ir-generated/versions'/first['generation']
    assert generated.is_dir() and len(list(generated.glob('*.md')))==7
    assert (generated/'document-ir.markdown-manifest.v1.json').is_file()
    # A second snapshot from the SAME source but valid IR edit; serialize
    # producer-generated changed bundle independently using the TS helper.
    # No filesystem coordinator on Linux => existing-pointer writes must fail closed.
    if not vault.coordinated_replace_supported():
        try:save_snapshot(vault,req(archive,first['generation'],'wp7-unsupported'))
        except VaultError as e:assert e.code=='EUNSUPPORTED'
        else:raise AssertionError('unsupported replace accepted')
    # Second complete, valid snapshot must CAS replace the pointer on macOS while
    # keeping the old blob immutable for rollback/recovery.
    if vault.coordinated_replace_supported():
        edited=(root/'.tmp/ir-wp7/fixture-edited.zip').read_bytes()
        amended=save_snapshot(vault,req(edited,first['generation'],'wp7-second'))
        assert amended['committed'] and amended['generation'] != first['generation']
        assert len(list((bookpath/'.ocr2md/ir-versions').glob('*.zip')))==2
        assert (bookpath/'ir-generated/versions'/amended['generation']).is_dir()
        recovered=load_snapshot(vault,book)
        assert recovered['generation']==amended['generation']
        assert recovered['parentGeneration']==first['generation']
        assert json.loads(base64.b64decode(recovered['irBase64']))['blocks'] != ir['blocks']
        try:save_snapshot(vault,req(archive,first['generation'],'wp7-stale-after-second'))
        except VaultError as e:assert e.code=='ESTALE'
        else:raise AssertionError('stale replay overwrote second snapshot')
        active=amended['generation']
    else:
        active=first['generation']
    # Loss of immutable snapshot after pointer exists must fail closed, never silently regenerate.
    blob=bookpath/'.ocr2md/ir-versions'/ (active+'.zip')
    blob.rename(blob.with_suffix('.offline'))
    try:load_snapshot(vault,book)
    except VaultError as e:assert e.code=='ESTALE'
    else:raise AssertionError('pointer without bytes was accepted')
    blob.with_suffix('.offline').rename(blob)
    assert load_snapshot(vault,book)['exists']
    # Every generic WorkspaceFS mutation route must be unable to touch the
    # IR pointer, even though authenticated GET/stat must be able to read it.
    pointer_path=book+'/.ocr2md/ir-current.v1.json'
    ref=vault.metadata(pointer_path)
    base={'workspaceId':vault.workspace_id}
    mutations=[
      {'type':'create-file','at':{'workspaceId':vault.workspace_id,'path':pointer_path},
       'base64':base64.b64encode(b'evil').decode(),'ifAbsent':True},
      {'type':'remove','target':ref,'expectedRevision':ref['revision']},
      {'type':'move','target':ref,'expectedRevision':ref['revision'],
       'to':{'workspaceId':vault.workspace_id,'path':book+'/hijack.json'},'ifAbsent':True},
      {'type':'copy','target':ref,'expectedRevision':ref['revision'],
       'to':{'workspaceId':vault.workspace_id,'path':book+'/copy.json'},'ifAbsent':True},
    ]
    for idx,operation in enumerate(mutations):
        try:vault.commit({**base,'requestId':f'wp7-forbidden-{idx}','operations':[operation]})
        except VaultError as error:assert error.code=='EACCES'
        else:raise AssertionError('generic mutation bypassed IR pointer protection')
    assert pointer.is_file()
    # Generic FS commit still cannot create hidden IR snapshots/pointers.
    from v3_mac_vault import logical
    for forbidden in [book+'/.ocr2md/ir-versions',book+'/.obsidian/secret.json']:
        try:logical(forbidden)
        except VaultError as e:assert e.code=='EACCES'
        else:raise AssertionError('hidden path exposed '+forbidden)
    print('IR_WP7_ISOLATED_BACKEND_PASS',json.dumps({'archiveBytes':len(archive),'blocks':224,
      'snapshotReadback':True,'staleConflict':True,'sourceConflict':True,'corruptZipDenied':True,
      'orphanProtection':True,'genericHiddenPathsDenied':True,'genericPointerMutationsDenied':True,'obsidianMarkdownPublished':True,'casReplacement':vault.coordinated_replace_supported(),'vaultRoot':str(sandbox),'realBookUntouched':True}))
