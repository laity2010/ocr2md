import hashlib,json,sqlite3,tempfile,unittest,types
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit,urlencode
from test_sentence_store import prepare_owned_book,whole_plans,plan,base
import lab_backend as runtime
from lab_backend.sentence_store import SentenceStore,build_sentence_rows,RAW_V1_DDL,INSERT,COLUMNS

class ReadOnlyTests(unittest.TestCase):
    def test_real_book_missing_ready_legacy_stale_no_writes(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp); snap=prepare_owned_book(folder); path=folder/base.DB_NAME
            md=snap['markdown']; reader=lambda:base.existing_markdown(folder)
            def read():return runtime.read_saved_sentences(folder,reader)
            def evidence():return hashlib.sha256(path.read_bytes()).hexdigest(),sorted(p.name for p in folder.iterdir())
            before=evidence()
            with self.assertRaises(runtime.SentenceError):read()
            self.assertEqual(evidence(),before)
            plans=whole_plans(md); kinds=runtime.public_line_types(snap)
            idx=next(i for i,t in enumerate(md.split('\n')) if len(t)>5 and t.isascii() and t.strip());plans[idx]=plan([2],'adopted',[[2],[],[2]],'intl')
            rows=build_sentence_rows(md,plans,kinds)
            with closing(sqlite3.connect(path)) as db:
                db.executescript("CREATE TABLE translation(id,body);INSERT INTO translation VALUES(1,'keep');")
                SentenceStore(db).initialize(md,rows)
            before=evidence();result=read();self.assertEqual(result['rows'],rows)
            self.assertEqual(result['source_document_hash'],snap['sha256'])
            self.assertEqual(result['sentence_sha256'],hashlib.sha256(json.dumps(rows,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest())
            self.assertEqual(read(),result);self.assertEqual(evidence(),before)
            bad={**snap,'mdLines':[dict(m) for m in snap['mdLines']]};bad['mdLines'][0]['type']='bad'
            with self.assertRaises(runtime.SentenceError):runtime.read_saved_sentences(folder,lambda:bad)
            self.assertEqual(evidence(),before)
            with closing(sqlite3.connect(path)) as db:
                db.execute('UPDATE sentence SET type=? WHERE source_line=?',('other',rows[0]['source_line']));db.commit()
            before=evidence()
            with self.assertRaises(runtime.SentenceError):read()
            self.assertEqual(evidence(),before)
            with closing(sqlite3.connect(path)) as db:
                db.execute('DROP TABLE sentence');db.execute(RAW_V1_DDL)
                old=build_sentence_rows(md,plans)
                db.executemany(INSERT,(tuple(r[k] for k in COLUMNS) for r in old));db.commit()
            before=evidence()
            with self.assertRaises(runtime.SentenceError):read()
            self.assertEqual(evidence(),before)
    def test_http_only_authorized_get_no_probe(self):
        def call(method='GET',cookie='valid',origin=None,query='workspace=%2Ffixture'):
            out=[];h=types.SimpleNamespace(command=method,headers={'Cookie':cookie,**({'Origin':origin} if origin else {})},respond=lambda status,body,*_:out.append((status,json.loads(body))))
            def roots(value):
                if value!='valid':raise runtime.SentenceError(403,'denied')
                return []
            def no_probe(*_):raise AssertionError('read cannot probe')
            common=types.SimpleNamespace(ALLOWED_ORIGINS={'https://ok'},authorized_roots=roots,checked_workspace=lambda p,r:Path(p),probe=no_probe)
            with patch.object(runtime,'read_saved_sentences',return_value={'rows':[]}) as read:
                runtime.handle(h,'sentence/snapshot',urlsplit('/?'+query),common)
                return out[0][0],read.call_count
        self.assertEqual(call(),(200,1))
        for args,expected in [({'method':'POST'},405),({'cookie':'bad'},403),({'origin':'https://evil'},403),({'query':'workspace=/a&workspace=/b'},422),({'query':'workspace=/a&other=1'},422)]:self.assertEqual(call(**args),(expected,0))
