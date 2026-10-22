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

    def test_no_dangling_relations(self):
        with self.assertRaises(sqlite3.IntegrityError):
            self.db.execute("INSERT INTO subscriptions VALUES('bad','missing','C','ui/main.js','test','test','test')")


if __name__ == '__main__':
    unittest.main()
