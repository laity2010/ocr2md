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
        self.assertEqual(am.assert_references(self.db), 51)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM modules').fetchone()[0], 5)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM messages').fetchone()[0], 8)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM test_cases').fetchone()[0], 86)

    def test_focus_has_four_publishers_five_receivers(self):
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM publishers WHERE message_id='E03'").fetchone()[0], 4)
        self.assertEqual(self.db.execute("SELECT COUNT(*) FROM subscriptions WHERE message_id='E03'").fetchone()[0], 5)

    def test_all_contracts_have_test_rows(self):
        for tab,col,total in [('apis','api_id',51),('messages','message_id',8),('publishers','publisher_id',12),('subscriptions','subscription_id',15)]:
            actual=self.db.execute(f'SELECT COUNT(DISTINCT {col}) FROM test_cases WHERE {col} IS NOT NULL').fetchone()[0]
            self.assertEqual(actual,total,tab)
        self.assertEqual(self.db.execute('SELECT COUNT(*) FROM test_runs').fetchone()[0],0)

    def test_observed_boundaries_are_not_silently_approved(self):
        edges=self.db.execute('SELECT COUNT(*) FROM access_edges').fetchone()[0]
        debt=self.db.execute("SELECT COUNT(*) FROM access_edges WHERE classification='debt'").fetchone()[0]
        self.assertEqual(edges,9)
        self.assertEqual(debt,5)

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
