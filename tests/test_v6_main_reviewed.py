"""Main producer and isolated Lab importer, no actual user workspace writes."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_main_reviewed import project,validate,publish
from v6_reviewed_import import import_snapshot,current_snapshot
from v6_sentence_review import empty,etag,save,read

class MainReviewedTest(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root=Path(self.temp.name)
        self.source=('<!-- minerujson:hello -->\n\n'
            '<!-- cmd:block:v1 id="p1b0s0" -->\n\n'
            'Table 3 has a rate of 1.72%, about\n\n'
            '<!-- cmd:block:v1 id="p1b0s1" lb="m" -->\n\n'
            '3 percent below. Unicode 😀 and a ![picture](img.png).\n\n'
            '<!-- cmd:block:v1 id="p1b1" lb="i" -->\n\n'
            '$x+y$ stays separate.\n').encode('utf-8')

    def test_main_owns_reviewed_and_restorable_metadata(self):
        data=project(self.source,'doc.mineru.md')
        self.assertEqual(data['stats']['reviewedJoins'],1)
        self.assertIn('about 3 percent below.',data['reviewedMd'])
        self.assertIn('!\\'[0]+'[picture](img.png)',data['reviewedMd'])
        self.assertIn('$x+y$',data['reviewedMd'])
        self.assertNotIn('<!-- cmd:block:',data['reviewedMd'])
        self.assertEqual(data['sourceMap']['coordinate'],'UTF-16')
        self.assertTrue(all('reviewedFrom' in item for item in data['sourceMap']['blockAnchors']))
        self.assertEqual(validate(data),data)
        with self.assertRaises(ValueError):
            validate({**data,'reviewedMd':data['reviewedMd']+'tamper'})
        dest=self.root/'main-exports'
        self.assertEqual(publish(dest,data).read_text(),data['reviewedMd'])
        self.assertTrue((dest/'reviewed.manifest.json').is_file())

    def test_unsafe_seam_rejected(self):
        unsafe=self.source.replace(b'3 percent below.',b'<!-- cmd:block:v1 id="p8b0" -->\n3 percent below.')
        with self.assertRaises(ValueError):
            project(unsafe)

    def test_lab_import_same_version_preserves_review(self):
        doc=self.root/'document.md';doc.write_bytes(self.source)
        side=self.root/'document.sentences.review.json'
        before=empty(project(self.source)['sourceCmdSha256']); before['blocks']={
            'p1b0s0':{'status':'arbitrated','engine':'intl','boundaries':[47]}}
        self.assertIsNotNone(save(side,json.dumps(before).encode(),self.source,
                                  etag(empty(before['sourceSha256']))))
        original=side.read_bytes()
        info=import_snapshot(self.root,doc,project(self.source,'doc'),before['sourceSha256'])
        self.assertFalse(info['changedSource'])
        self.assertEqual(side.read_bytes(),original)
        self.assertEqual(doc.read_bytes(),self.source)
        self.assertEqual(current_snapshot(self.root,doc)['documentVersion'],info['documentVersion'])
        with self.assertRaises(ValueError):
            import_snapshot(self.root,doc,project(self.source),'0'*64)

    def test_new_main_version_archives_prior_review(self):
        doc=self.root/'document.md';doc.write_bytes(self.source)
        old=project(self.source)
        side=self.root/'document.sentences.review.json'
        before=empty(old['sourceCmdSha256'])
        save(side,json.dumps(before).encode(),self.source,etag(before))
        updated=self.source.replace(b'3 percent below.',b'4 percent below.')
        result=import_snapshot(self.root,doc,project(updated),old['sourceCmdSha256'])
        self.assertTrue(result['changedSource'])
        self.assertEqual(doc.read_bytes(),updated)
        self.assertEqual(read(side,updated),empty(result['sourceSha256']))
        previous=self.root/'imports'/old['sourceCmdSha256']
        self.assertEqual((previous/'document.md').read_bytes(),self.source)
        self.assertEqual((previous/'document.sentences.review.json').read_bytes(),
                         json.dumps(before,ensure_ascii=False,separators=(',',':')).encode('utf-8'))

    def test_real_8_reviewed_seams(self):
        path=Path(__file__).resolve().parents[1]/'labs/sentence-benchmark/.runtime/document.md'
        if not path.is_file():self.skipTest('Lab runtime unavailable')
        data=project(path.read_bytes())
        self.assertEqual(data['stats']['reviewedJoins'],8)
        self.assertGreater(len(data['sourceMap']['blockAnchors']),250)
        self.assertIn('about 3 percentage points below the average T-bill rate.',data['reviewedMd'])
        self.assertNotIn('<!-- minerujson:',data['reviewedMd'])
        self.assertEqual(validate(data),data)

if __name__=='__main__':unittest.main()
