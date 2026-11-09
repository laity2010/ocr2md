"""Real two-process Main→Lab HTTP delivery; never starts the live Mac services."""
import json
import os
import shutil
import socket
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path
from urllib.error import HTTPError,URLError
from urllib.request import Request,urlopen

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from v6_sentence_units import unit_version
from v6_sentence_review import etag,read


def port():
    with socket.socket() as s:
        s.bind(('127.0.0.1',0))
        return s.getsockname()[1]


class HTTPImportTest(unittest.TestCase):
    def test_main_lab_versioned_handoff_and_stale_rejection(self):
        original=ROOT/'labs/sentence-benchmark/.runtime/document.md'
        oldtable=ROOT/'labs/sentence-benchmark/.runtime/exports/translation-units-c94b0e8c0d8a-reviewed-seams.json'
        if not original.is_file() or not oldtable.is_file():self.skipTest('Full Lab fixture unavailable')
        temp=tempfile.TemporaryDirectory();self.addCleanup(temp.cleanup)
        base=Path(temp.name)
        main_doc=base/'main-saved.md';shutil.copyfile(original,main_doc)
        lab=base/'labs/sentence-benchmark/.runtime';lab.mkdir(parents=True)
        shutil.copyfile(original,lab/'document.md')
        shutil.copyfile(ROOT/'labs/sentence-benchmark/.runtime/document.sentences.review.json',
                        lab/'document.sentences.review.json')
        (lab/'private').mkdir();(lab/'private/unlock').write_text('123456789012-unlock')
        pm,pl=port(),port()
        mainurl=f'http://127.0.0.1:{pm}/';laburl=f'http://127.0.0.1:{pl}/labs/sentence-benchmark/'
        mainenv={**os.environ,'V6_PORT':str(pm),'V6_BIND':'127.0.0.1',
          'V6_DOCUMENT_PATH':str(main_doc),'V6_SETTINGS_PATH':str(base/'main-settings.json'),
          'V6_TOKEN_PATH':str(base/'main-token'),'V6_LAN_TLS_HOST':'',
          'V6_LAN_LAB_ROUTES':''}
        labenv={**os.environ,'V6_PORT':str(pl),'V6_BIND':'127.0.0.1',
          'V6_LAB_RUNTIME':str(lab),'V6_LAB_UNLOCK_TOKEN_PATH':str(lab/'private/unlock'),
          'V6_MAIN_REVIEWED_URL':mainurl+'api/main-reviewed','V6_LAN_TLS_HOST':''}
        processes=[]
        def start(args,env):
            proc=subprocess.Popen([sys.executable,*args],cwd=ROOT,env=env,
                                  stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            processes.append(proc)
        start(['scripts/v6_serve.py'],mainenv)
        start(['labs/sentence-benchmark/server.py'],labenv)
        def request(url,method='GET',obj=None,headers=None):
            data=json.dumps(obj).encode('utf-8') if obj is not None else None
            with urlopen(Request(url,data=data,method=method,headers=headers or {}),timeout=20) as h:
                return json.loads(h.read())
        try:
            for url in (mainurl+'healthz',laburl+'healthz'):
                for trial in range(100):
                    try:
                        with urlopen(url,timeout=1) as h:
                            if h.status==200:break
                    except (OSError,URLError):time.sleep(.15)
                else:self.fail('Isolated test server not ready: '+url)
            packet=request(mainurl+'api/main-reviewed')
            self.assertEqual(packet['stats']['reviewedJoins'],8)
            self.assertIn('about 3 percentage points below',packet['reviewedMd'])
            self.assertEqual(packet['sourceCmdSha256'],json.loads(oldtable.read_text())['sourceSha256'])
            with self.assertRaises(HTTPError) as missing:
                request(laburl+'api/imported-main-reviewed')
            self.assertEqual(missing.exception.code,503)
            headers={'Origin':f'http://127.0.0.1:{pl}',
                     'X-OCR2MD-Main-Import':'1','If-Match':packet['sourceCmdSha256']}
            receipt=request(laburl+'api/import-main-reviewed','POST',headers=headers)
            self.assertFalse(receipt['changedSource'])
            self.assertEqual(receipt['documentVersion'],packet['documentVersion'])
            self.assertEqual(request(laburl+'api/imported-main-reviewed')['documentVersion'],
                             packet['documentVersion'])
            self.assertEqual((lab/'document.md').read_bytes(),original.read_bytes())
            review=read(lab/'document.sentences.review.json',original.read_bytes())
            source=json.loads(oldtable.read_text())
            source['documentVersion']=packet['documentVersion']
            source['reviewRevision']=etag(review)
            source['unitVersion']=unit_version(source)
            sent_headers={'Origin':f'http://127.0.0.1:{pl}',
                 'X-OCR2MD-Sentence-Units':'1', 'Content-Type':'application/json',
                 'If-Match':etag(review)}
            result=request(laburl+'api/sentence-units','PUT',source,sent_headers)
            self.assertEqual(result['rows'],394)
            self.assertEqual(result['unitVersion'],source['unitVersion'])
            self.assertEqual(request(laburl+'api/sentence-units')['rows'],source['rows'])
            with self.assertRaises(HTTPError) as old:
                request(laburl+'api/import-main-reviewed','POST',headers={**headers,'If-Match':'0'*64})
            self.assertEqual(old.exception.code,409)
            bad={**source,'unitVersion':'0'*64}
            with self.assertRaises(HTTPError) as mismatch:
                request(laburl+'api/sentence-units','PUT',bad,sent_headers)
            self.assertEqual(mismatch.exception.code,422)
            with self.assertRaises(HTTPError) as stale:
                request(laburl+'api/sentence-units','PUT',source,{**sent_headers,'If-Match':'1'*64})
            self.assertEqual(stale.exception.code,412)
            print('TWO_PROCESS_HTTP_PASS: 8 joins, 394 rows, Main owned, Lab isolated, version/CAS enforced')
        finally:
            for process in processes:process.terminate()
            for process in processes:
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)

if __name__=='__main__':unittest.main()
