"""Direct isolated SQLite public contract + real 402→394 GPT/Grok/Muse."""
import copy
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_translation_lab import TranslationStore,BASE,TASK,REPLY,OUTPUT
from v6_main_reviewed import project
from v6_sentence_units import unit_version

ROOT=Path(__file__).resolve().parents[1]
FIXTURE=Path(os.environ.get('OCR2MD_SENTENCE_LAB_FIXTURE',str(ROOT/'labs/sentence-benchmark/.runtime')))


def unit(id,txt,offset):
    return {'id':id,'blockId':'p1b0','type':'sentence','elementType':'paragraph',
       'decision':'auto','from':offset,'to':offset+len(txt),
       'sourceRanges':[{'from':offset,'to':offset+len(txt)}],
       'original':txt,'corrected':None,'translation':None}


def baseline(rows):
    return {'schema':BASE,'sourceSha256':'a'*64,'coordinate':'UTF-16','rows':rows}


class TranslationLabTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.store=TranslationStore(self.root/'translation.db')
        self.addCleanup(self.store.close)
        self.old=baseline([unit('s1','Hello.',0),unit('s2','Bye.',8)])

    def test_independent_prompt_and_deterministic_resume(self):
        saved=self.store.import_units(self.old)
        self.assertTrue(saved['changed'])
        self.assertEqual(self.store.state()['total'],2)
        task=self.store.create_task('gpt')
        self.assertEqual(len(task['rows']),2)
        response={'schema':REPLY,'taskId':task['taskId'],'aiId':'gpt',
            'unitVersion':task['unitVersion'],'promptVersion':task['promptVersion'],
            'rows':[{'id':'s1','original':'Hello.','corrected':'Hello.',
                     'translation':'你好。'}]}
        receipt=self.store.receive(response)
        self.assertEqual(receipt['covered'],1)
        self.assertTrue(self.store.receive(response)['duplicate'])
        self.assertEqual(self.store.state()['providers'][0]['missing'],1)
        with self.assertRaises(ValueError):
            self.store.receive({**response,'rows':[{'id':'s2','original':'Wrong.',
              'corrected':'Wrong.','translation':'错误。'}]})
        self.assertEqual(self.store.table('gpt')['missing'],1)
        self.assertEqual(self.store.table('grok')['covered'],0)
        self.assertEqual(self.store.publish('gpt',self.root/'exports')['missing'],1)
        exported=json.loads((self.root/'exports/translated-gpt.json').read_text())
        self.assertEqual(exported['schema'],OUTPUT)
        self.assertIsNone(exported['rows'][1]['translation'])
        next_task=self.store.create_task('gpt')
        self.assertEqual([r['id'] for r in next_task['rows']],['s2'])
        self.store.receive({**response,'taskId':next_task['taskId'],
            'rows':[{'id':'s2','original':'Bye.','corrected':'Bye.','translation':'再见。'}]})
        self.assertEqual(self.store.table('gpt')['covered'],2)
        edited=self.store.save_prompt('gpt','只纠错并翻译；保持数字不变。')
        self.assertNotEqual(edited['promptVersion'],task['promptVersion'])
        self.assertEqual(self.store.create_task('gpt')['rows'],[])
        forced=self.store.create_task('gpt',['s1'],force=True)
        self.assertEqual([r['id'] for r in forced['rows']],['s1'])
        self.store.receive({'schema':REPLY,'taskId':forced['taskId'],
            'unitVersion':forced['unitVersion'],'promptVersion':forced['promptVersion'],
            'aiId':'gpt','rows':[{'id':'s1','original':'Hello.',
                 'corrected':'Hello,','translation':'您好。'}]})
        self.assertEqual(self.store.table('gpt')['rows'][0]['translation'],'您好。')
        self.assertGreater(self.store.db.execute('SELECT COUNT(*) n FROM results').fetchone()['n'],2)

    def test_change_position_reuses_but_text_change_retranslates(self):
        self.store.import_units(self.old)
        translated={**self.old,'rows':[{**r,'corrected':r['original'],
                                       'translation':'译'+r['id']} for r in self.old['rows']]}
        self.store.import_historical('grok',translated)
        moved=baseline([unit('s1','Hello.',200),unit('s2','Bye!',300)])
        receipt=self.store.import_units(moved)
        self.assertEqual(receipt['inherited']['grok'],1)
        self.assertEqual(self.store.table('grok')['missing'],1)
        self.assertEqual(self.store.table('grok')['rows'][0]['from'],200)
        self.assertEqual([r['id'] for r in self.store.create_task('grok')['rows']],['s2'])

    def test_bad_ai_reply_transaction_rolls_back(self):
        self.store.import_units(self.old)
        task=self.store.create_task('gpt')
        good={'id':'s1','original':'Hello.','corrected':'Hello.','translation':'你好。'}
        bad={'id':'s2','original':'Wrong','corrected':'Bye.','translation':'再见。'}
        response={'schema':REPLY,'taskId':task['taskId'],'aiId':'gpt',
          'unitVersion':task['unitVersion'],'promptVersion':task['promptVersion'],
          'rows':[good,bad]}
        with self.assertRaises(ValueError):self.store.receive(response)
        self.assertEqual(self.store.table('gpt')['covered'],0)
        with self.assertRaises(ValueError):self.store.receive({**response,'unitVersion':'b'*64,'rows':[good]})
        self.assertEqual(self.store.table('gpt')['covered'],0)

    def test_real_402_to_394_all_ai(self):
        if not (FIXTURE/'translation-review/input/translation-units.json').is_file():
            self.skipTest('Real 402/394 fixtures unavailable')
        old=json.loads((FIXTURE/'translation-review/input/translation-units.json').read_text())
        new=json.loads((FIXTURE/'exports/translation-units-c94b0e8c0d8a-reviewed-seams.json').read_text())
        self.store.import_units(old)
        for ai in ('gpt','grok','muse'):
            path=(FIXTURE/f'translation-review/input/translated-{ai}.json' if ai!='muse' else
                  FIXTURE/f'exports/translation-units-c94b0e8c0d8a.translated-{ai}.json')
            self.store.import_historical(ai,json.loads(path.read_text()))
        self.assertEqual([(x['covered'],x['missing']) for x in self.store.state()['providers']],[(402,0)]*3)
        new_packet=copy.deepcopy(new)
        # Exercise WP1 versioned handoff, not the legacy source-only fixture.
        original=project((FIXTURE/'document.md').read_bytes())
        new_packet['documentVersion']=original['documentVersion']
        new_packet['reviewRevision']='f'*64
        new_packet['unitVersion']=unit_version(new_packet)
        result=self.store.import_units(new_packet)
        self.assertEqual(result['inherited'],{'gpt':386,'grok':386,'muse':386})
        self.assertEqual(len(self.store.state()['rows']),394)
        for ai in ('gpt','grok','muse'):
            task=self.store.create_task(ai)
            self.assertEqual(len(task['rows']),8)
            self.assertEqual(self.store.table(ai)['missing'],8)
            self.assertEqual(self.store.table(ai)['covered'],386)
            self.assertEqual(task['rows'][0]['id'],'p6b6s0-s003')
            # Even 0 returned lines is valid: no full-coverage gate.
            self.store.receive({'schema':REPLY,'aiId':ai,'taskId':task['taskId'],
                'unitVersion':task['unitVersion'],'promptVersion':task['promptVersion'],'rows':[]})
            self.assertEqual(self.store.publish(ai,self.root/'exports')['missing'],8)

if __name__=='__main__':unittest.main()
