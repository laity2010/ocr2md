"""Only AM catalog/SQLite contracts. No application service or workspace writes."""
from pathlib import Path
import sqlite3
import unittest
import am


class AMCatalogTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(':memory:')
        self.db.row_factory = sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.executescript((am.HERE / 'schema.sql').read_text())
        self.db.executescript((am.HERE / 'registry.sql').read_text())

    def tearDown(self):
        self.db.close()

    def test_registry_links_and_file_references(self):
        api_count = self.db.execute('SELECT COUNT(*) FROM apis').fetchone()[0]
        self.assertGreater(api_count, 0)
        self.assertEqual(am.assert_references(self.db), api_count)
        modules = {row[0] for row in self.db.execute('SELECT id FROM modules')}
        self.assertTrue({'C','G','M','P','L','A','T'}.issubset(modules))
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0], 8)
        self.assertGreater(self.db.execute('SELECT COUNT(*) FROM test_cases').fetchone()[0], 0)

    def test_focus_includes_original_and_media_publishers_five_receivers(self):
        owners = {row[0] for row in self.db.execute("SELECT module_id FROM publishers WHERE message_id='E03'")}
        self.assertEqual(owners, {'C','G','M','P','A'})
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM subscriptions WHERE message_id='E03'").fetchone()[0], 5)

    def test_all_contracts_have_test_rows(self):
        for tab,col in [('apis','api_id'),('messages','message_id'),('publishers','publisher_id'),('subscriptions','subscription_id')]:
            total=self.db.execute(f'SELECT COUNT(*) FROM {tab}').fetchone()[0]
            actual=self.db.execute(f'SELECT COUNT(DISTINCT {col}) FROM test_cases WHERE {col} IS NOT NULL').fetchone()[0]
            self.assertEqual(actual,total,tab)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM test_runs').fetchone()[0],0)

    def test_observed_production_boundary_debts_cleared(self):
        edges=self.db.execute('SELECT COUNT(*) FROM access_edges').fetchone()[0]
        debt=self.db.execute("SELECT COUNT(*) FROM access_edges WHERE classification='debt'").fetchone()[0]
        self.assertGreaterEqual(edges,9)
        self.assertEqual(debt,0)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM access_edges WHERE classification='test_only'").fetchone()[0],1)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM access_edges WHERE classification='registered'").fetchone()[0],edges-1)

    def test_registry_change_must_invalidate_bound_test_evidence(self):
        row=self.db.execute("SELECT api_id,message_id,subscription_id,publisher_id,script,fixture,expected,evidence FROM test_cases WHERE id='TC-C05'").fetchone()
        self.assertEqual(row['api_id'],'C05')
        self.db.execute("UPDATE test_cases SET api_id='C03' WHERE id='TC-C05'")
        changed=self.db.execute("SELECT api_id,message_id,subscription_id,publisher_id,script,fixture,expected,evidence FROM test_cases WHERE id='TC-C05'").fetchone()
        self.assertNotEqual(tuple(row),tuple(changed))
        self.assertFalse(am.same_test_binding(self.db,'TC-C05',tuple(row)))
        self.assertTrue(am.same_test_binding(self.db,'TC-C05',tuple(changed)))

    def test_no_dangling_relations(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO subscriptions VALUES('bad','missing','C','ui/main.js','test','test','test')")


if __name__ == '__main__':
    unittest.main()
