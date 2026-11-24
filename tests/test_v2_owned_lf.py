"""WP23D: disposable real SQLite fixture only, no user workspace."""
import copy
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path
from dataclasses import replace
from contextlib import closing
from hashlib import sha256

sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as base
from v2_logical_contract import LogicalRow
from v2_markdown_roundtrip import (
    from_sql_rows, to_markdown, from_markdown, preview_owned_migration,
    OWNED_FORMAT, length_utf16,
)
FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'

class Stub:
    def probe(self,path): pass

def load(folder):
    with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
        db.row_factory=sqlite3.Row
        return from_sql_rows(db.execute('SELECT * FROM logical_block ORDER BY logical_order'))

def evidence(folder):
    with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
        return (
            db.execute('SELECT * FROM mineru_base ORDER BY blockid').fetchall(),
            db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,block_type,p,b,s,raw_path FROM logical_block ORDER BY logical_order').fetchall(),
            db.execute("SELECT name,sql FROM sqlite_master WHERE type='table' ORDER BY name").fetchall(),
        )

def commit(folder,changes):
    return base.commit_md(folder,dict(workspace=str(folder),confirm='commit-v2-md',changes=changes),Stub())

def make_book(folder):
    (folder/'minerujson').mkdir()
    shutil.copyfile(FIXTURE,folder/'minerujson'/FIXTURE.name)
    base.new_book(folder)
    with closing(sqlite3.connect(folder/base.DB_NAME)) as db:
        # Simulate user-authored multiline content, Unicode and extra blank lines.
        db.execute("UPDATE logical_block SET md_block=? WHERE logical_order=1",
                   ('# 标题🧪\n\n手工修改\n\n\n',))
        db.execute("UPDATE logical_block SET md_block=? WHERE logical_order=2",
                   ('正文😀\n\n# 新标题\n末尾',))
        db.commit()

class OwnedLFTest(unittest.TestCase):
    def test_real_267_preview_cas_reload_and_idempotence(self):
        with tempfile.TemporaryDirectory(prefix='wp23d-') as temp:
            folder=Path(temp);make_book(folder)
            path=folder/base.DB_NAME
            original=load(folder);before=evidence(folder)
            digest=sha256(path.read_bytes()).hexdigest()
            plan=preview_owned_migration(original)
            self.assertEqual(sha256(path.read_bytes()).hexdigest(),digest)
            self.assertEqual(len(original),267)
            rows=from_markdown(plan['snapshot'])
            self.assertEqual(len(rows),267)
            cursor=0;cursor16=0
            for i,(old,new,span) in enumerate(zip(original,rows,plan['snapshot']['segments'])):
                self.assertEqual(replace(new,markdown_text=old.markdown_text),old)
                self.assertTrue(new.markdown_text.startswith(old.markdown_text))
                self.assertFalse(set(new.markdown_text[len(old.markdown_text):])-{'\n'})
                self.assertEqual(span['startChar'],cursor)
                self.assertEqual(span['startUtf16'],cursor16)
                cursor+=len(new.markdown_text);cursor16+=length_utf16(new.markdown_text)
                self.assertEqual(span['endChar'],cursor)
                self.assertEqual(span['endUtf16'],cursor16)
            self.assertEqual(plan['snapshot']['markdown'],''.join(r.markdown_text for r in rows))
            self.assertEqual(plan['snapshot']['schema'],OWNED_FORMAT)
            self.assertGreater(len(plan['changes']),0)
            self.assertEqual(rows[0],original[0],'extra authored LF preserved')
            # Simulate stale text after preview; actual existing CAS rejects
            # entire batch (including unchanged prior rows).
            stale=plan['changes'][-1]
            with closing(sqlite3.connect(path)) as db:
                db.execute('UPDATE logical_block SET md_block=? WHERE logical_id=?',('concurrent edit',stale['logicalId']))
                db.commit()
            conflicted=load(folder)
            with self.assertRaises(base.BaseError):commit(folder,plan['changes'])
            self.assertEqual(load(folder),conflicted)
            with closing(sqlite3.connect(path)) as db:
                db.execute('UPDATE logical_block SET md_block=? WHERE logical_id=?',(stale['before'],stale['logicalId']))
                db.commit()
            receipt=commit(folder,plan['changes'])
            self.assertEqual(receipt['changedRows'],len(plan['changes']))
            self.assertEqual(load(folder),rows)
            self.assertEqual(evidence(folder),before)
            again=preview_owned_migration(load(folder))
            self.assertEqual(again['changes'],[])
            self.assertEqual(again['snapshot'],plan['snapshot'])
            self.assertEqual(to_markdown(load(folder),format=OWNED_FORMAT),plan['snapshot'])
            print('WP23D_SQL_FIXTURE',len(rows),'blocks',len(plan['changes']),'LF-only changed rows',cursor16,'UTF16 units')
    def test_empty_blocks_multiline_ownership_and_strict_rejection(self):
        rows=[
            LogicalRow(1,1,None,1,'','table',0,0,0),
            LogicalRow(2,1,1,2,'正文\n\n# 标题😀\n\n\n','text',0,0,1),
            LogicalRow(3,3,None,3,'','text',0,1,0),
        ]
        plan=preview_owned_migration(rows);new=from_markdown(plan['snapshot'])
        self.assertEqual([r.markdown_text for r in new],['\n',rows[1].markdown_text,'\n\n'])
        self.assertEqual(preview_owned_migration(new)['changes'],[])
        with self.assertRaisesRegex(ValueError,'Missing owned LF'):to_markdown(rows,format=OWNED_FORMAT)
        with self.assertRaisesRegex(ValueError,'CR/CRLF'):
            preview_owned_migration([replace(rows[2],logical_order=1,markdown_text='A\r\nB')])
        bad=copy.deepcopy(plan['snapshot']);bad['segments'][1]['startUtf16']+=1
        with self.assertRaises(ValueError):from_markdown(bad)
        bad=copy.deepcopy(plan['snapshot']);bad['segments'][1]['startChar']+=1
        with self.assertRaises(ValueError):from_markdown(bad)
        with self.assertRaises(ValueError):preview_owned_migration([rows[0],replace(rows[1],parent_id=None),rows[2]])

if __name__=='__main__':unittest.main()
