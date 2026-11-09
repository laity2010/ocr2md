"""Real isolated Translation Lab HTTP API, local SQLite and JSON handoff."""
import json
import os
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


def free_port():
    with socket.socket() as s:
        s.bind(('127.0.0.1',0));return s.getsockname()[1]


def unit(id,original,index):
    return {'id':id,'blockId':'p1b0','type':'sentence','elementType':'paragraph',
           'decision':'auto','from':index,'to':index+len(original),
           'sourceRanges':[{'from':index,'to':index+len(original)}],
           'original':original,'corrected':None,'translation':None}

class TranslationHTTPTest(unittest.TestCase):
    def test_isolated_versioned_json_and_partial_publication(self):
        with tempfile.TemporaryDirectory() as folder:
            runtime=Path(folder)/'labs/translation-lab/.runtime';runtime.mkdir(parents=True)
            token=runtime/'unlock-token';token.write_text('isolated-translator-token-123456')
            port=free_port();base=f'http://127.0.0.1:{port}/labs/translation-lab/'
            env={**os.environ,'V6_PORT':str(port),'V6_LAB_RUNTIME':str(runtime),
               'V6_LAB_UNLOCK_TOKEN_PATH':str(token),'V6_LAN_TLS_HOST':''}
            process=subprocess.Popen([sys.executable,'labs/translation-lab/server.py'],
                 cwd=ROOT,env=env,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
            self.addCleanup(lambda:process.poll() is None and process.kill())
            def get(route):
                with urlopen(base+'api/translation-lab/'+route,timeout=10) as h:return json.loads(h.read())
            def post(route,body):
                req=Request(base+'api/translation-lab/'+route,
                     method='POST',data=json.dumps(body).encode('utf8'),
                     headers={'Origin':f'http://127.0.0.1:{port}',
                              'Content-Type':'application/json','X-OCR2MD-Translation-Lab':'1'})
                with urlopen(req,timeout=10) as h:return json.loads(h.read())
            try:
                for _ in range(100):
                    try:
                        if get('state')['ready'] is False:break
                    except (URLError,HTTPError,OSError):time.sleep(.1)
                else:self.fail('Translation Lab service did not start')
                self.assertTrue((runtime/'translation.db').is_file())
                self.assertFalse((runtime/'document.md').exists(),
                                 'Translator must not make or edit source CMD')
                baseline={'schema':'ocr2md-translation-units/v1','sourceSha256':'a'*64,
                    'coordinate':'UTF-16','rows':[unit('s1','Alpha.',0),unit('s2','Beta.',12)]}
                created=post('units',baseline)
                self.assertEqual(created['rows'],2)
                self.assertEqual(get('state')['providers'][0]['missing'],2)
                task=post('task',{'aiId':'gpt'})
                self.assertEqual(task['schema'],'ocr2md-ai-translation-task/v1')
                self.assertEqual(len(task['rows']),2)
                reply={'schema':'ocr2md-ai-translation-reply/v1','aiId':'gpt',
                       'taskId':task['taskId'],'promptVersion':task['promptVersion'],
                       'unitVersion':task['unitVersion'],
                       'rows':[{'id':'s1','original':'Alpha.','corrected':'Alpha.',
                                'translation':'阿尔法。'}]}
                self.assertEqual(post('reply',reply)['accepted'],1)
                self.assertTrue(post('reply',reply)['duplicate'])
                self.assertEqual(post('publish',{'aiId':'gpt'})['missing'],1)
                output=get('published?ai=gpt')
                self.assertEqual(output['rows'][1]['status'],'missing')
                self.assertIsNone(output['rows'][1]['translation'])
                self.assertEqual(output['unitVersion'],created['unitVersion'])
                wrong={**reply,'unitVersion':'0'*64}
                with self.assertRaises(HTTPError) as err:post('reply',wrong)
                self.assertEqual(err.exception.code,422)
                self.assertEqual(get('state?ai=gpt&filter=missing')['rows'][0]['id'],'s2')
                with self.assertRaises(HTTPError) as cross:
                    with urlopen(f'http://127.0.0.1:{port}/api/translation-lab/state',timeout=6):pass
                self.assertEqual(cross.exception.code,404)
                print('TRANSLATION_HTTP_PASS: SQLite isolated, 2 units, partial reply, missing publish, wrong version blocked')
            finally:
                process.terminate()
                try:process.wait(timeout=5)
                except subprocess.TimeoutExpired:process.kill();process.wait(timeout=5)

if __name__=='__main__':unittest.main()
