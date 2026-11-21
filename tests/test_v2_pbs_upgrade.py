"""V2 PBS upgrade contract: 2 SQL tables, in-place 6->9, local PBS edits, no grandchildren."""
from contextlib import closing
from pathlib import Path
import json
import shutil
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_mineru_base as v
from v2_pbs import initial_pbs

FIXTURE=Path(__file__).parents[1]/'packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'


class Probe:
    def __init__(self):self.calls=0
    def probe(self,folder):self.calls+=1


class Upgrade(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory(prefix='v2-pbs-upgrade-')
        self.folder=Path(self.temp.name)
        (self.folder/'minerujson').mkdir()
        self.source=self.folder/'minerujson'/FIXTURE.name
        shutil.copyfile(FIXTURE,self.source)
        self.original=self.source.read_bytes()
        v.new_book(self.folder)
        self.path=self.folder/v.DB_NAME
    def tearDown(self):self.temp.cleanup()

    def test_s0_two_tables_real_mineru_and_all_columns(self):
        logical=v.existing_state(self.folder,table='logical_block')
        self.assertEqual(logical['columns'],list(v.LOGICAL_COLS))
        self.assertEqual(len(logical['columns']),9)
        self.assertEqual(logical['rowCount'],224)
        with closing(sqlite3.connect(self.path)) as db:
            coords=db.execute('SELECT p,b,s FROM logical_block ORDER BY logical_order').fetchall()
            self.assertEqual(coords[0],(0,0,0))
            self.assertEqual(coords[-1],(21,20,0))
            self.assertTrue(all(s==0 for _,_,s in coords))
            self.assertEqual(len(coords),len(set(coords)))
            self.assertEqual({r[0] for r in db.execute(
                "SELECT name FROM sqlite_master WHERE type='table'")},{'mineru_base','logical_block'})
        self.assertEqual(self.source.read_bytes(),self.original)

    def test_s0_to_s1_only_local_edit_no_renumber_and_bbox_unchanged(self):
        before=v.existing_pdf_map(self.folder)
        first,second,third=before['covers'][:3]
        assert second['pbs']=='p0b1s0' and third['pbs']=='p0b2s0'
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('UPDATE logical_block SET p=?,b=?,s=? WHERE logical_id=?',
                       (0,0,1,second['logicalId']))
            db.commit()
        after=v.existing_pdf_map(self.folder)
        rows={row['logicalId']:row for row in after['covers']}
        self.assertEqual(rows[first['logicalId']]['pbs'],'p0b0s0')
        self.assertEqual(rows[second['logicalId']]['pbs'],'p0b0s1')
        self.assertEqual(rows[third['logicalId']]['pbs'],'p0b2s0')
        self.assertEqual(rows[second['logicalId']]['bbox'],second['bbox'])
        self.assertEqual(rows[second['logicalId']]['physicalPageIndex'],second['physicalPageIndex'])
        self.assertEqual(rows[second['logicalId']]['rootLogicalId'],first['logicalId'])
        self.assertEqual(rows[second['logicalId']]['parentId'],first['logicalId'])
        self.assertEqual(len({r['pbs'] for r in after['covers']}),224)
        self.assertEqual(self.source.read_bytes(),self.original)

    def test_invalid_duplicate_rejected_and_grandchild_assignment_rejected(self):
        with closing(sqlite3.connect(self.path)) as db:
            with self.assertRaises(sqlite3.IntegrityError):
                db.execute('UPDATE logical_block SET p=0,b=0,s=0 WHERE logical_order=2')
            db.rollback()
        rows=[
            {'logical_id':1,'base_blockid':101,'parent_id':None,'logical_order':1},
            {'logical_id':2,'base_blockid':102,'parent_id':1,'logical_order':2},
            {'logical_id':3,'base_blockid':103,'parent_id':2,'logical_order':3},
        ]
        with self.assertRaisesRegex(ValueError,'禁止孙块'):
            initial_pbs(rows,{101:0,102:0,103:0})

    def make_six_column(self):
        with closing(sqlite3.connect(self.path)) as db:
            # Simulate V2's previously released six-column table in this temp book.
            previous=list(db.execute('SELECT logical_id,base_blockid,parent_id,logical_order,markdown_text,block_type '
                                     'FROM logical_block ORDER BY logical_order'))
            original_base=list(db.execute('SELECT * FROM mineru_base ORDER BY blockid'))
            db.execute('DROP TABLE logical_block')
            db.execute('CREATE TABLE logical_block(logical_id INTEGER PRIMARY KEY,base_blockid INTEGER,'
                       'parent_id INTEGER,logical_order INTEGER,markdown_text TEXT,'
                       "block_type TEXT NOT NULL DEFAULT '',"
                       'FOREIGN KEY(base_blockid) REFERENCES mineru_base(blockid))')
            db.executemany('INSERT INTO logical_block VALUES (?,?,?,?,?,?)',previous)
            first=previous[0][0]
            db.execute("UPDATE logical_block SET markdown_text='MANUAL_EDIT_SENTINEL',block_type='title' "
                       'WHERE logical_id=?',(first,))
            db.commit()
        return first,original_base

    def test_six_column_migrates_in_place_with_content_and_base_unchanged(self):
        first,before_base=self.make_six_column()
        before_inode=self.path.stat().st_ino
        probe=Probe()
        result=v.dispatch('import','POST',self.folder,{'confirm':'import-mineru-base'},{},probe)
        self.assertTrue(result['migrated']);self.assertFalse(result['replaced'])
        self.assertEqual(self.path.stat().st_ino,before_inode)
        self.assertEqual(probe.calls,1)
        with closing(sqlite3.connect(self.path)) as db:
            self.assertEqual(tuple(row[1] for row in db.execute('PRAGMA table_info(logical_block)')),v.LOGICAL_COLS)
            self.assertEqual(db.execute('SELECT markdown_text FROM logical_block WHERE logical_id=?',
                (first,)).fetchone()[0],'MANUAL_EDIT_SENTINEL')
            self.assertEqual(db.execute('SELECT block_type FROM logical_block WHERE logical_id=?',
                (first,)).fetchone()[0],'title')
            self.assertEqual(db.execute('SELECT p,b,s FROM logical_block WHERE logical_id=?',
                (first,)).fetchone(),(0,0,0))
            self.assertEqual(list(db.execute('SELECT * FROM mineru_base ORDER BY blockid')),before_base)
            self.assertEqual(db.execute('SELECT count(*) FROM logical_block').fetchone()[0],224)
        self.assertEqual(self.source.read_bytes(),self.original)
        self.assertFalse(v.dispatch('import','POST',self.folder,
            {'confirm':'import-mineru-base'},{},probe)['replaced'])

    def test_nonempty_unknown_schema_never_rebuilt(self):
        with closing(sqlite3.connect(self.path)) as db:
            db.execute('DROP TABLE logical_block')
            db.execute('CREATE TABLE logical_block(logical_id INTEGER PRIMARY KEY, archived_text TEXT)')
            db.execute("INSERT INTO logical_block VALUES(1,'KEEP_ME')")
            db.commit()
        before=self.path.read_bytes()
        with self.assertRaisesRegex(v.BaseError,'拒绝自动覆盖'):
            v.dispatch('import','POST',self.folder,{'confirm':'import-mineru-base'},{},Probe())
        self.assertEqual(self.path.read_bytes(),before)
        self.assertEqual(self.source.read_bytes(),self.original)


if __name__=='__main__':unittest.main()
