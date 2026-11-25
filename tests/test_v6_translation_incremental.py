"""Incremental translation cannot reuse stale sentences or accept wrong AI rows."""
import copy
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'scripts'))
from v6_translation_incremental import plan, merge, revision, validate_old_translation


def unit(identifier, text, start, block='p1b0'):
    return {'id': identifier, 'blockId': block, 'type':'sentence',
            'elementType':'paragraph', 'decision':'auto',
            'from':start, 'to':start+len(text),
            'sourceRanges':[{'from':start, 'to':start+len(text)}],
            'original':text, 'corrected':None, 'translation':None}


def table(rows):
    return {'schema':'ocr2md-translation-units/v1',
            'sourceSha256':'a'*64, 'coordinate':'UTF-16', 'rows':rows}


def translated(rows):
    d=copy.deepcopy(table(rows))
    for row in d['rows']:
        row['corrected']=row['original']+' edited'
        row['translation']='译文 '+row['id']
    return d


class IncrementalTest(unittest.TestCase):
    def setUp(self):
        self.old=table([unit('a','Hello.',0),unit('b','Rate about',8),
                        unit('c','3 points.',20)])
        self.next=table([unit('a','Hello.',50),unit('b','Rate about 3 points.',60)])
        self.next['rows'][1]['blockIds']=['p1b0','p1b1']
        self.next['rows'][1]['sourceRanges']=[{'from':60,'to':70},
                                               {'from':90,'to':99}]
        self.previous=translated(self.old['rows'])
        self.task=plan(self.old,self.next,self.previous,'gpt')

    def good_reply(self):
        return {'schema':'ocr2md-translation-delta-result/v1',
                'aiId':'gpt','sourceSha256':self.next['sourceSha256'],
                'newUnitRevision':revision(self.next),
                'rows':[{'id':'b','original':'Rate about 3 points.',
                         'corrected':'Rate is about 3 points.',
                         'translation':'大约三个点。'}]}

    def test_one_revision_inherits_one_and_retranslates_one(self):
        self.assertEqual(self.task['reuseIds'],['a'])
        self.assertEqual([x['id'] for x in self.task['retranslate']],['b'])
        self.assertEqual(self.task['removedIds'],['c'])
        full=merge(self.old,self.next,self.previous,self.task,self.good_reply())
        self.assertEqual(len(full['rows']),2)
        self.assertEqual(full['rows'][0]['translation'],'译文 a')
        self.assertEqual(full['rows'][0]['from'],50)
        self.assertEqual(full['rows'][1]['translation'],'大约三个点。')
        self.assertEqual(full['rows'][1]['blockIds'],['p1b0','p1b1'])
        validate_old_translation(self.next,full)
        self.assertIsNone(self.old['rows'][0]['translation'])

    def test_reject_missing_duplicate_wrong_ai_wrong_revision_or_source(self):
        for tweak in ['missing','duplicate','ai','revision','source','id']:
            response=self.good_reply()
            if tweak=='missing':response['rows']=[]
            if tweak=='duplicate':response['rows']*=2
            if tweak=='ai':response['aiId']='grok'
            if tweak=='revision':response['newUnitRevision']='0'*64
            if tweak=='source':response['rows'][0]['original']='Wrong sentence.'
            if tweak=='id':response['rows'][0]['id']='c'
            with self.subTest(tweak=tweak):
                with self.assertRaises(ValueError):
                    merge(self.old,self.next,self.previous,self.task,response)

    def test_reject_historic_ai_mismatch_and_unapproved_task_modification(self):
        bad=copy.deepcopy(self.previous)
        bad['rows'][1]['original']='Different source'
        with self.assertRaises(ValueError):
            plan(self.old,self.next,bad,'gpt')
        badtask=copy.deepcopy(self.task)
        badtask['reuseIds'].append('b')
        with self.assertRaises(ValueError):
            merge(self.old,self.next,self.previous,badtask,self.good_reply())
        new=copy.deepcopy(self.next)
        new['rows'][0]['original']='Edited.'
        with self.assertRaises(ValueError):
            merge(self.old,new,self.previous,self.task,self.good_reply())

    def test_same_text_different_offset_reuses_translation(self):
        new=table([unit('a','Hello.',500)])
        old=table([unit('a','Hello.',0)])
        task=plan(old,new,translated(old['rows']),'muse')
        self.assertEqual(task['reuseIds'],['a'])
        self.assertEqual(task['retranslate'],[])

    def test_real_402_to_394_all_three_ai(self):
        root=Path(__file__).resolve().parents[1]/'labs/sentence-benchmark/.runtime'
        if not (root/'translation-review/input/translation-units.json').exists():
            self.skipTest('Real Lab runtime not mounted')
        legacy=json.loads((root/'translation-review/input/translation-units.json').read_text())
        revised=json.loads((root/'exports/translation-units-c94b0e8c0d8a-reviewed-seams.json').read_text())
        for ai in ['gpt','grok','muse']:
            source=(root/f'translation-review/input/translated-{ai}.json' if ai!='muse' else
                    root/f'exports/translation-units-c94b0e8c0d8a.translated-{ai}.json')
            result=json.loads(source.read_text())
            task=plan(legacy,revised,result,ai)
            self.assertEqual((len(task['reuseIds']),len(task['retranslate']),
                              len(task['removedIds'])),(386,8,8))
            self.assertEqual(task['retranslate'][0]['id'],'p6b6s0-s003')


if __name__=='__main__':unittest.main()
