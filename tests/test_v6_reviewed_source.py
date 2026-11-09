"""Isolated reviewed-MD handoff never mutates the canonical CMD or sidecar."""
import hashlib
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1] / 'scripts'))
from v6_reviewed_source import save, read


class ReviewedSourceHandoffTest(unittest.TestCase):
    def test_source_sha_and_review_revision_are_locked(self):
        with tempfile.TemporaryDirectory() as folder:
            root=Path(folder)
            source=b'<!-- cmd:block:v1 id="p1b0" -->\nTest sentence.'
            sha=hashlib.sha256(source).hexdigest()
            revision='f'*64
            baseline={'schema':'ocr2md-translation-units/v1','sourceSha256':sha,
                      'coordinate':'UTF-16', 'rows':[{'id':'p1b0-s001','original':'Test sentence.'}]}
            packet={'schema':'ocr2md-reviewed-source/v1',
                    'sourceSha256':sha,'reviewRevision':revision,
                    'baseline':baseline,
                    'clean':{'source':source.decode(),'doc':'Test sentence.','patches':[]},
                    'reading':{'doc':'Test sentence.','anchors':[{'id':'p1b0-s001'}]}}
            saved=save(root,json.dumps(packet).encode(),source,revision)
            self.assertEqual(saved,read(root,source))
            self.assertEqual((root/'reviewed-source.json').is_file(),True)
            self.assertEqual(len(list(root.glob('reviewed-document-*.md'))),1)
            self.assertEqual((root/next(root.glob('reviewed-document-*.md')).name).read_text(),
                             'Test sentence.')
            with self.assertRaisesRegex(ValueError,'mismatched'):
                save(root,json.dumps(packet).encode(),source,'e'*64)
            with self.assertRaisesRegex(ValueError,'mismatched'):
                read(root,source+b'altered')
            packet['reading']['anchors'][0]['id']='wrong'
            with self.assertRaisesRegex(ValueError,'anchors'):
                save(root,json.dumps(packet).encode(),source,revision)


if __name__=='__main__': unittest.main()
