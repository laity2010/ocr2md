"""Reverse audit: every live shared Zustand subscriber must be in the AM table.

Forward reference checks alone used to pass while four AG review modules
actively subscribed to E01/E03 without appearing in subscriptions. The
message table is authoritative; this test forbids silent subscriber drift.
It does NOT assert exhaustive runtime boundary proof for indirect calls.
"""
from pathlib import Path
import re
import sqlite3
import unittest

ROOT = Path(__file__).resolve().parents[2]
SUBSCRIBE = re.compile(r'\bviewStore\s*\.\s*subscribe\s*\(')
WRITE = re.compile(r'\bviewStore\s*\.\s*setState\s*\(')


class LiveViewStoreSubscriptionInventory(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.db = sqlite3.connect(':memory:')
        cls.db.executescript((ROOT / 'tests/am/schema.sql').read_text())
        cls.db.executescript((ROOT / 'tests/am/registry.sql').read_text())
        cls.source = {
            p.relative_to(ROOT).as_posix(): p.read_text()
            for p in (ROOT / 'ui').glob('*.js')
        }

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_every_live_view_store_subscriber_is_registered(self):
        observed = {file for file, body in self.source.items()
                    if SUBSCRIBE.search(body)}
        registered = {file for (file,) in self.db.execute('''
            SELECT DISTINCT s.source_file FROM subscriptions AS s
            JOIN messages AS m ON m.id=s.message_id
            WHERE m.transport='zustand' AND m.topic IN
              ('documentRevision','sourceOffset','focusTarget',
               'scrollTarget','outlineCount','scrollSyncEnabled','activePanel')
        ''')}
        self.assertEqual(observed, registered,
                         f'viewStore subscription table drift: missing={sorted(observed-registered)}, stale={sorted(registered-observed)}')

    def test_all_shared_state_writes_use_the_message_publisher_owner(self):
        writers = {file for file, body in self.source.items()
                   if WRITE.search(body)}
        self.assertEqual(writers, {'ui/view-store.js'},
                         'Non-owner writes to viewStore must be reviewed as a new cross-module edge')

    def test_subscriptions_have_real_integration_evidence_links(self):
        missing = list(self.db.execute('''
            SELECT s.id,s.source_file FROM subscriptions AS s
            JOIN messages AS m ON m.id=s.message_id
            LEFT JOIN test_cases AS t ON t.subscription_id=s.id
            WHERE m.transport='zustand' AND t.id IS NULL
        '''))
        self.assertEqual(missing, [], 'Zustand subscriber lacks a real test-link reference')


if __name__ == '__main__':
    unittest.main()
