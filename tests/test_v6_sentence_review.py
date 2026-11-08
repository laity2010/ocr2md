"""Unit contract for lab-only sidecar; no running server or Main files."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from v6_sentence_review import digest, empty, etag, read, save, SCHEMA


class SidecarTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "document.sentences.review.json"
        self.source = ('<!-- cmd:block:v1 id="p7b0s2" -->\n'
                       '>>Notes: This is a sentence. Another sentence.\n').encode()

    def test_atomic_persistence_and_cas(self):
        initial = read(self.path, self.source)
        self.assertEqual(initial, empty(digest(self.source)))
        record = {**initial, "blocks": {
            "p7b0s2": {"status": "arbitrated", "engine": "intl", "boundaries": [12, 25]}}}
        saved = save(self.path, json.dumps(record).encode(), self.source, etag(initial))
        self.assertEqual(saved, record)
        self.assertEqual(read(self.path, self.source), record)
        self.assertIsNone(save(self.path, json.dumps(record).encode(),
                               self.source, etag(initial)))
        self.assertFalse(list(self.path.parent.glob('*.tmp')))

    def test_gold_and_source_hash_validation(self):
        initial = read(self.path, self.source)
        initial["manualGold"] = {"24": {"break": False, "manual": True}}
        save(self.path, json.dumps(initial).encode(), self.source, etag(empty(digest(self.source))))
        self.assertEqual(read(self.path, self.source)["manualGold"]["24"]["break"], False)
        with self.assertRaises(ValueError):
            read(self.path, self.source + b'\nchanged')
        self.assertEqual(self.path.read_bytes().count(b'manualGold'), 1)

    def test_invalid_block_and_revision_rejected(self):
        initial = read(self.path, self.source)
        bad = {**initial, "blocks": {
            "p44b0": {"status": "auto", "boundaries": [2]}}}
        with self.assertRaises(ValueError):
            save(self.path, json.dumps(bad).encode(), self.source, etag(initial))
        self.assertFalse(self.path.exists())
        bad["blocks"] = {"p7b0s2":{"status":"arbitrated","engine":"bogus","boundaries":[1]}}
        with self.assertRaises(ValueError):
            save(self.path, json.dumps(bad).encode(), self.source, etag(initial))
        self.assertFalse(self.path.exists())


if __name__ == "__main__":
    unittest.main()
