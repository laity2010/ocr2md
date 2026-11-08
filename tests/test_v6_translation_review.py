"""Lab校译 uses independent input files, never reads sentence outputs live."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
from v6_translation_review import load_dataset


class TranslationReviewDatasetTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.directory = Path(self.tmp.name)
        source='<!-- cmd:block:v1 id="p0b0" -->\nHello world.'
        sha=hashlib.sha256(source.encode()).hexdigest()
        baseline={'schema':'ocr2md-translation-units/v1','sourceSha256':sha,
                  'coordinate':'UTF-16','rows':[{'id':'p0b0-b001',
                  'original':'Hello world.','corrected':None,'translation':None,
                  'sourceRanges':[{'from':32,'to':44}]}]}
        translated=json.loads(json.dumps(baseline))
        translated['rows'][0]['corrected']='Hello world.'
        translated['rows'][0]['translation']='你好，世界。'
        (self.directory/'document.md').write_text(source)
        (self.directory/'translation-units.json').write_text(json.dumps(baseline))
        (self.directory/'translated-gpt.json').write_text(json.dumps(translated))

    def tearDown(self):
        self.tmp.cleanup()

    def test_loaded_from_independent_directory(self):
        result=load_dataset(self.directory)
        self.assertEqual(result['baseline']['rows'][0]['id'],'p0b0-b001')
        self.assertEqual(list(result['translations']),['gpt'])

    def test_rejects_stale_original_and_changed_structural_fields(self):
        source=self.directory/'document.md'
        source.write_text(source.read_text()+'!')
        with self.assertRaisesRegex(ValueError,'checksum'):
            load_dataset(self.directory)
        source.write_text(source.read_text()[:-1])
        path=self.directory/'translated-gpt.json'
        data=json.loads(path.read_text());data['rows'][0]['original']='Not source'
        path.write_text(json.dumps(data))
        with self.assertRaisesRegex(ValueError,'differs'):
            load_dataset(self.directory)


if __name__=='__main__': unittest.main()
