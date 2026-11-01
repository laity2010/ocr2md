"""Grok 75e05598 guard: every approved cross-module symbol binding must be a
registered API (same symbol tail, file = import target) reached by a
registered access edge from the importing module. Whitelisting a symbol in
ownership.json without a registry API + edge is therefore rejected."""
import json, re, sqlite3, unittest
from pathlib import Path
ROOT = Path(__file__).resolve().parents[2]

def violations(ownership, db):
    files = ownership['files']; out = []
    apis = db.execute('SELECT id,module_id,symbol,source_file FROM apis').fetchall()
    edges = {(c, a) for c, a in db.execute('SELECT caller_module,api_id FROM access_edges')}
    for key, symbols in ownership.get('crossModuleBindings', {}).items():
        src, dst = key.split('->'); caller = files.get(src)
        for sym in symbols:
            ok = [i for i, m, s, f in apis if f == 'ui/' + dst and s.split('.')[-1] == sym
                  and (caller, i) in edges]
            if not ok: out.append(f'{key}:{sym}')
    return out

class BindingRegistryTest(unittest.TestCase):
    def load(self):
        db = sqlite3.connect(':memory:')
        db.executescript((ROOT/'tests/am/schema.sql').read_text())
        db.executescript((ROOT/'tests/am/registry.sql').read_text())
        return json.loads((ROOT/'tests/am/ownership.json').read_text()), db
    def test_new_pdf_cmd_bindings_are_registered(self):
        own, db = self.load()
        new = [k for k in own['crossModuleBindings'] if re.search(r'->(cmd-text-blocks|cmd-block-|text-block-module)', k)]
        self.assertTrue(new)
        bad = [v for v in violations(own, db) if v.split(':')[0] in new]
        self.assertEqual(bad, [])
    def test_ag_review_is_not_a_phantom_external_api(self):
        own, db = self.load()
        ids = {row[0] for row in db.execute('SELECT id FROM apis')}
        self.assertNotIn('G28', ids, 'setReview is an AG-local closure, not a callable module API')
        self.assertTrue({'G25', 'G26'}.issubset(ids))
        for case in ('TC-WP4-G28','TC-TEXTBLOCK-AG-FUNCTIONS-G28',
                     'TC-TEXTBLOCK-COVERAGE-OVERLAY-G28'):
            row = db.execute('SELECT api_id FROM test_cases WHERE id=?',(case,)).fetchone()
            self.assertIsNotNone(row)
            self.assertIn(row[0], {'G25','G26'})

    def test_unregistered_symbol_is_rejected(self):
        own, db = self.load()
        own['crossModuleBindings']['cm-document.js->cmd-block-joins.js'].append('precedingPageBlock')
        self.assertIn('cm-document.js->cmd-block-joins.js:precedingPageBlock', violations(own, db))

if __name__ == '__main__': unittest.main()
