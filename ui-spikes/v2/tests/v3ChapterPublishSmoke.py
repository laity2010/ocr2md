"""Isolated create-only editable chapter publication, real production code.
Never access the real user's book or replace a cleaned Markdown file.
"""
import base64,hashlib,json,os,subprocess,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault,VaultError
from v3_ir_persistence import save_snapshot,publish_chapters,load_snapshot
repo=Path(__file__).resolve().parents[3]
with tempfile.TemporaryDirectory(prefix='ocr2md-chapter-publish-test-') as d:
    tmp=Path(d);root=tmp/'ocr2md';book=root/'ocr2md/Book'
    subprocess.run(['node',str(repo/'ui-spikes/v3-directory/tests/chapterPublishFixture.cjs'),str(book)],check=True)
    vault=V3MacVault(root,tmp/'private/access-key')
    bookpath='/ocr2md/Book'
    def save(blob,key,expected=None):
        return save_snapshot(vault,{'book':bookpath,'requestId':key,
            'expectedGeneration':expected,'archiveBase64':base64.b64encode(blob).decode()})
    def fail_code(code,callback):
        try:callback()
        except VaultError as error:
            assert error.code==code,(code,error.code,str(error))
        else:raise AssertionError('Expected '+code)
    draft=save((book/'unconfirmed.zip').read_bytes(),'draft')
    fail_code('EINVAL',lambda:publish_chapters(vault,{'book':bookpath,'expectedGeneration':draft['generation']}))
    assert not (book/'chapters').exists()
    if vault.coordinated_replace_supported():
        good=save((book/'confirmed.zip').read_bytes(),'confirmed',draft['generation'])
    else:
        # Tests are run on macOS where replacing a pointer uses native CAS;
        # fail if the coordinator isn't present rather than bypassing it.
        raise AssertionError('Native coordinated file replacement required')
    expected={'book':bookpath,'expectedGeneration':good['generation']}
    fail_code('ESTALE',lambda:publish_chapters(vault,{'book':bookpath,'expectedGeneration':draft['generation']}))
    # Old V2 chapter folders can already contain valuable cleaned work.
    # Refuse even if they do not have .md files at the root.
    (book/'chapters/01 Old Cleaned Chapter').mkdir(parents=True)
    old=(book/'chapters/01 Old Cleaned Chapter'/'chapter.working.md')
    old.write_text('Human V2 chapter draft.\n')
    fail_code('EEXIST',lambda:publish_chapters(vault,expected))
    assert old.read_text()=='Human V2 chapter draft.\n'
    old.unlink();old.parent.rmdir();(book/'chapters').rmdir()
    first=publish_chapters(vault,expected)
    assert first['published'] and not first['alreadyPublished'] and first['count']==2,first
    published=book/'chapters'
    assert published.is_dir()
    assert len(list(published.glob('*.md')))==2
    assert json.loads((published/'.ocr2md-published.v1.json').read_text())['sourceGeneration']==good['generation']
    original={p.name:p.read_bytes() for p in published.glob('*.md')}
    (published/'.DS_Store').write_bytes(b'Finder metadata is preserved')
    twice=publish_chapters(vault,expected)
    assert (published/'.DS_Store').read_bytes()==b'Finder metadata is preserved' 
    assert twice['alreadyPublished'] and all((published/name).read_bytes()==data for name,data in original.items())
    target=next(published.glob('*.md'));target.write_bytes(target.read_bytes()+b'\nHuman clean edit.\n')
    edited=target.read_bytes()
    fail_code('ECONFLICT',lambda:publish_chapters(vault,expected))
    assert target.read_bytes()==edited and all((published/name).exists() for name in original)
    # Preexisting directory lacking publication marker: never adopt/overwrite.
    (published/'.ocr2md-published.v1.json').unlink()
    fail_code('EEXIST',lambda:publish_chapters(vault,expected))
    assert target.read_bytes()==edited
    assert load_snapshot(vault,bookpath)['generation']==good['generation']
    assert not list(book.glob('.ocr2md-chapters-staging-*'))
    # Separate saved snapshot: files have names while OCR title proposals are
    # NOT reviewed. Publication must NOT set their status to confirmed.
    with tempfile.TemporaryDirectory(prefix='ocr2md-file-cuts-not-ocr-review-') as d2:
        tmp2=Path(d2);root2=tmp2/'ocr2md';book2=root2/'ocr2md/Book'
        subprocess.run(['node',str(repo/'ui-spikes/v3-directory/tests/chapterPublishFixture.cjs'),str(book2)],check=True)
        vault2=V3MacVault(root2,tmp2/'private/access-key')
        staged=save_snapshot(vault2,{'book':bookpath,'requestId':'file-boundaries-only',
            'expectedGeneration':None,
            'archiveBase64':base64.b64encode((book2/'cleaning.zip').read_bytes()).decode()})
        cut=publish_chapters(vault2,{'book':bookpath,'expectedGeneration':staged['generation']})
        assert cut['count']==2 and cut['published']
        reread=load_snapshot(vault2,bookpath)
        current=__import__('zipfile').ZipFile(book2/'.ocr2md/ir-versions'/(staged['generation']+'.zip'))
        stored=json.loads(current.read('document-ir.v1.json'))
        projection=json.loads(current.read('document-ir.markdown-manifest.v1.json'))
        assert projection['projectionState']=='chapter-files-for-cleaning'
        assert all(c['status']=='needs-review' for c in stored['chapterStructure']['candidates'])
        assert reread['generation']==staged['generation']
    print('CHAPTER_PUBLISH_ISOLATED_BACKEND_PASS',json.dumps({'files':len(original),
       'firstPublish':True,'idempotent':True,'finderMetadataPreserved':True,'humanEditsProtected':True,
       'missingMarkerRefused':True,'existingV2FoldersProtected':True,
       'staleRefused':True,'unnamedDraftRefused':True,'unreviewedNamedCutsAccepted':True,'ocrAuditPreserved':True,
       'noOriginalUserBookWrites':True}))
