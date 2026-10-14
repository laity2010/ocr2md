"""Isolated no-network test of V3/V2-safe media download and CAS adoption."""
import hashlib,json,sys,tempfile
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault,VaultError
from v3_ir_persistence import download_cleaning_image,PUBLISH_MARKER

url='https://cdn.example.org/scan.png'
image_bytes=b'\x89PNG\r\n\x1a\n'+b'FAKE_FOR_MOCK_TEST_ONLY'
with tempfile.TemporaryDirectory(prefix='ocr3-media-download-') as d:
    root=Path(d)/'ocr2md'
    chapter=root/'ocr2md'/'Book'/'chapters'
    chapter.mkdir(parents=True)
    key=Path(d)/'private'/'access-key'
    original=f'<!-- ocr2md-ir:block=blk_{"1"*24} -->\n[图片来源 1（仅链接，不自动载入）]({url})\n![photo]({url})\n'
    (chapter/'01.md').write_text(original,encoding='utf-8')
    marker={'kind':'ocr2md/editable-chapters-publication','schemaVersion':1,
        'book':'/ocr2md/Book','sourceGeneration':'0'*64,
        'files':{'01.md':hashlib.sha256(original.encode()).hexdigest()}}
    (chapter/PUBLISH_MARKER).write_text(json.dumps(marker),encoding='utf-8')
    vault=V3MacVault(root,key,test_origin='http://127.0.0.1:7777')
    get=lambda:vault.metadata('/ocr2md/Book/chapters/01.md')
    before=get()
    args={'book':'/ocr2md/Book','filename':'01.md','sourceUrl':url,
          'nodeId':before['nodeId'],'expectedRevision':before['revision']}
    calls=[]
    def mock_downloader(target):
        calls.append(target)
        assert target==url
        return image_bytes,'image/png'
    result=download_cleaning_image(vault,args,mock_downloader)
    target=chapter/result['localPath']
    assert result['saved'] and target.is_file() and target.read_bytes()==image_bytes
    assert result['localPath'].startswith('imgs/')
    expected=result['workingText']
    assert expected.count('![')==2 and expected.count(url)==0
    assert expected.count(result['localPath'])==2
    assert (chapter/'01.md').read_text()==expected
    assert result['file']['revision']==get()['revision']
    assert calls==[url]
    try:
        download_cleaning_image(vault,args,mock_downloader)
    except VaultError as err:
        assert err.code in ('ESTALE','ECONFLICT'),err.code
    else:raise AssertionError('stale CAS unexpectedly overwritten chapter')
    assert len(calls)==1
    # No arbitrary download even with a correctly matched revision.
    updated=get()
    wrong={**args,'nodeId':updated['nodeId'],'expectedRevision':updated['revision'],
           'sourceUrl':'https://cdn.example.org/not-in-current-md.png'}
    try:
        download_cleaning_image(vault,wrong,mock_downloader)
    except VaultError as err: assert err.code=='EINVAL',err.code
    else:raise AssertionError('unreferenced url should fail closed')
    assert (chapter/'01.md').read_text()==expected
    assert len(calls)==1
    print('V3_MEDIA_DOWNLOAD_CAS_SECURITY_PASS',json.dumps({
        'mockNetworkCalls':len(calls),'imagesInLocal':1,'referencesRewritten':2,
        'staleDenied':True,'unreferencedDenied':True,'preservedPublishedMarker':True}))
