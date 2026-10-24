"""CMD global-settings JSON transport: atomicity, CAS, byte preservation."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('cmd_settings',ROOT/'scripts/v6_cmd_settings.py')
backend = importlib.util.module_from_spec(spec)
spec.loader.exec_module(backend)


class CMDSettingsTransportTest(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='cmd-settings-')
        self.path = Path(self.temp.name)/'settings.json'

    def tearDown(self):
        self.temp.cleanup()

    def test_default_read_does_not_create_file(self):
        raw = backend.read(self.path)
        self.assertFalse(self.path.exists())
        self.assertEqual(json.loads(raw)['globalUi']['cmSource']['defaultFontSize'],12)
        self.assertEqual(json.loads(raw)['$comments']['globalUi.cmSource.defaultFontSize'],
                         '所有 CM6 源码窗的默认字号（8–32 pt）')

    def test_save_exact_bytes_and_cas(self):
        old = backend.read(self.path)
        edited = b'{\n "globalUi": {"cmSource": {"defaultFontSize": 32}}, "custom":true\n}\n'
        ok,digest = backend.save(self.path,edited,backend.fingerprint(old))
        self.assertTrue(ok)
        self.assertEqual(self.path.read_bytes(),edited)
        self.assertEqual(digest,backend.fingerprint(edited))
        stale,_ = backend.save(self.path,b'{}',backend.fingerprint(old))
        self.assertFalse(stale)
        self.assertEqual(self.path.read_bytes(),edited)

    def test_reject_invalid_without_overwriting_previous(self):
        expected=backend.fingerprint(backend.read(self.path))
        for invalid in [b'{bad',b'[]',b'1',b'\xff',b' '*65537]:
            with self.assertRaises(ValueError):
                backend.save(self.path,invalid,expected)
            self.assertFalse(self.path.exists())
        with self.assertRaises(ValueError):
            backend.save(self.path,b'{}','bogus')

    def test_optimistic_conflict_is_fail_closed(self):
        before=backend.fingerprint(backend.read(self.path))
        self.assertTrue(backend.save(self.path,b'{"x":1}',before)[0])
        self.assertFalse(backend.save(self.path,b'{"x":2}',before)[0])
        self.assertEqual(json.loads(backend.read(self.path)),{'x':1})
