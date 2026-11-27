import copy,hashlib,importlib.util,io,json,sqlite3,sys,tempfile,types,unittest
from contextlib import closing
from pathlib import Path
from unittest.mock import patch
from urllib.parse import urlsplit

ROOT=Path(__file__).resolve().parents[1]
# Load this state's package under its own namespace; upstream helpers are test
# fixtures only, never imported by the runtime.
spec=importlib.util.spec_from_file_location('translation_test_backend',ROOT/'scripts/lab_backend/__init__.py',submodule_search_locations=[str(ROOT/'scripts/lab_backend')])
runtime=importlib.util.module_from_spec(spec);sys.modules[spec.name]=runtime;spec.loader.exec_module(runtime)
from translation_test_backend.protection import build_rows,canonical,sha,u16,scan
from translation_test_backend.refill import template,refill,check_row
sys.path.insert(0,str(ROOT.parent/'lab-sentence/tests'))
from test_sentence_store import prepare_owned_book,whole_plans,plan,base,upstream_evidence
import lab_backend as sentence
from lab_backend.sentence_store import SentenceStore,build_sentence_rows

def snapshot(md,types=None,plans=None):
    rows=build_sentence_rows(md,plans or whole_plans(md),types)
    return dict(schema='ocr2md-sentence-snapshot/v1',source_document_hash=sha(md),sentence_sha256=sha(canonical(rows)),rows=rows)

def projection(row):
    raw=row['raw'].encode('utf-16-le');cursor=0;remaining=[]
    for p in row['protected']:
        assert cursor<=p['from']<p['to']
        assert raw[2*p['from']:2*p['to']].decode('utf-16-le')==p['text']
        remaining.append(raw[2*cursor:2*p['from']].decode('utf-16-le'));cursor=p['to']
    remaining.append(raw[2*cursor:].decode('utf-16-le'))
    return ''.join(remaining)

class PreparationTests(unittest.TestCase):
    def test_structural_inline_and_nontext(self):
        md=('# Heading\n\n'
            '> A 😀 **return** of $r_t$ [site](https://example.org/a(b)) [^7].\n'
            '![alt text](image.png)\n'
            '<table><tr><td colspan="2">Cost of funds<eq>^{a}</eq></td><td>12.5%</td></tr></table>\n'
            '[^7]: A note with `code()` and https://example.org/a.\n'
            '$$x=1$$\n'
            '```python\nprint("not prose")\n```\n'
            '<!-- hidden comment\nsecond line -->\n'
            '123.45%\n'
            'A new caption.\n')
        kinds=['title','title','text','image_body','table_body','text','interline_equation','text','text','text','text','text','text','table_caption']
        source=snapshot(md,kinds);rows=build_rows(source)
        self.assertEqual(''.join(r['raw'] for r in rows),md)
        self.assertEqual(len(rows),len(source['rows']))
        for r,s in zip(rows,source['rows']):
            self.assertEqual(r['raw'],s['raw']);self.assertEqual(r['type'],s['type']);self.assertEqual(r['level'],s['level'])
            text=projection(r);self.assertEqual(any(c.isalpha() for c in text),r['translatable'])
            if not r['translatable']:self.assertEqual(text,'')
        by_line={r['source_line']:r for r in rows}
        self.assertEqual(projection(by_line[1]),'Heading')
        self.assertIn('return',projection(by_line[3]));self.assertIn('site',projection(by_line[3]));self.assertNotIn('r_t',projection(by_line[3]))
        self.assertIn('Cost of funds',projection(by_line[5]));self.assertNotIn('colspan',projection(by_line[5]));self.assertNotIn('^{a}',projection(by_line[5]))
        self.assertIn('A note',projection(by_line[6]));self.assertNotIn('code()',projection(by_line[6]))
        for i in (4,7,8,9,10,11,12,13):self.assertFalse(by_line[i]['translatable'],i)
        self.assertTrue(by_line[14]['translatable'])
        self.assertTrue(any(p['text']=='$r_t$' and p['from']>by_line[3]['raw'].index('$r_t$') for p in by_line[3]['protected']))
    def test_cross_sentence_and_multiline(self):
        md='A $x. y$ and words.\n\n<!--comment\nmore --> End.\n'
        plans=whole_plans(md);plans[0]=plan([5],'agreed')
        rows=build_rows(snapshot(md,plans=plans))
        self.assertEqual([r['raw'] for r in rows][:2],['A $x.',' y$ and words.\n\n'])
        self.assertEqual([p['text'] for p in rows[0]['protected'] if p['kind']=='latex'],['$x.'])
        self.assertEqual([p['text'] for p in rows[1]['protected'] if p['kind']=='latex'],[' y$'])
        self.assertEqual(projection(rows[-1]),' End.')
        self.assertEqual(''.join(r['raw'] for r in rows),md)
        for r in rows:projection(r)
    def test_lexical_precedence_and_utf16(self):
        md=('😀 Let $x<y>z$ be measured. <td title="$r$">Return</td>\n'
            '<!--\n```python\n--> A comment ended.\n'
            '> [^2]: Note body.\n'
            'Cost $5 to $10; https://example.org/a(b).\n')
        rows=build_rows(snapshot(md))
        self.assertIn('Let ',projection(rows[0]))
        self.assertNotIn('x<y>z',projection(rows[0]))
        self.assertIn('Return',projection(rows[0]))
        self.assertIn('A comment ended.',projection(rows[3]))
        self.assertIn('Note body.',projection(rows[4]))
        self.assertIn('Cost $5 to $10',projection(rows[5]))
        self.assertTrue(any(p['text']=='https://example.org/a(b)' for p in rows[5]['protected']))
        for r in rows:projection(r)
    def test_drift_before_creation_never_writes(self):
        s=snapshot('Hello.\n')
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);path=folder/runtime.DB_NAME
            with closing(sqlite3.connect(path)) as db:
                db.executescript("CREATE TABLE sentence(id,raw);INSERT INTO sentence VALUES(1,'keep');")
            before=path.read_bytes()
            readings=iter([s,snapshot('Changed.\n')])
            with self.assertRaises(runtime.TranslationError):
                runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:next(readings))
            self.assertEqual(path.read_bytes(),before)
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall(),[('sentence',)])
    def test_malformed_snapshot_and_stale_existing(self):
        s=snapshot('A.\n')
        bad=copy.deepcopy(s);bad['rows'][0]['raw']='changed'
        with self.assertRaises(ValueError):build_rows(bad)
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);path=folder/runtime.DB_NAME
            with self.assertRaises(runtime.TranslationError):runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)
            self.assertFalse(path.exists())
            with closing(sqlite3.connect(path)) as db:
                db.executescript("CREATE TABLE translation(id,body);INSERT INTO translation VALUES(1,'keep');")
            before=path.read_bytes()
            with self.assertRaises(runtime.TranslationError):runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)
            self.assertEqual(path.read_bytes(),before)
    def test_real_book_owned_table_and_idempotence(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);v2=prepare_owned_book(folder);path=folder/base.DB_NAME;md=v2['markdown']
            source_rows=build_sentence_rows(md,whole_plans(md),sentence.public_line_types(v2))
            with closing(sqlite3.connect(path)) as db:
                SentenceStore(db).initialize(md,source_rows)
            def read():return sentence.read_saved_sentences(folder,lambda:base.existing_markdown(folder))
            s=read()
            def evidence():
                with closing(sqlite3.connect(path)) as db:
                    return upstream_evidence(db),db.execute('SELECT * FROM sentence ORDER BY source_line,sentence_index').fetchall()
            before=evidence()
            result=runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],read)
            self.assertEqual(result['state'],'created');self.assertEqual(evidence(),before)
            self.assertEqual(''.join(r['raw'] for r in result['rows']),md)
            print('REAL_BOOK_PREPARATION',len(result['rows']),sum(r['translatable'] for r in result['rows']),sum(len(r['protected']) for r in result['rows']))
            for r in result['rows']:projection(r);self.assertEqual(check_row(r),r['raw'])
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual({x[0] for x in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")},{'mineru_base','logical_block','sentence','translation'})
            digest=hashlib.sha256(path.read_bytes()).hexdigest()
            self.assertEqual(runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],read)['state'],'ready')
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),digest)
            stale=snapshot('Different text.\n')
            with self.assertRaises(runtime.TranslationError):runtime.initialize(folder,stale['source_document_hash'],stale['sentence_sha256'],lambda:stale)
            self.assertEqual(hashlib.sha256(path.read_bytes()).hexdigest(),digest)
            self.assertEqual(evidence(),before)
    def test_refill_collision_and_invalid_tokens(self):
        raw='😀 Original ⟦P0⟧ with $x$ and $x$.\n\n'
        r=build_rows(snapshot(raw))[0]
        self.assertEqual(refill(r['text'],raw,r['protected']),raw)
        self.assertIn('⟦P_0⟧',r['text'])
        for bad in (r['text'].replace('⟦P_0⟧','',1),r['text']+'⟦P_0⟧',r['text'].replace('⟦P_0⟧','⟦P_999⟧',1),r['text'].replace('⟦P_0⟧','⟦P_x⟧',1)):
            with self.assertRaises(ValueError):refill(bad,raw,r['protected'])
        self.assertEqual(template('',[]),'')
        self.assertEqual(refill('','',[]),'')
    def test_legacy_migration_and_reject_tamper(self):
        s=snapshot('One $x$.\n\nTwo.\n')
        rows=build_rows(s)
        for tamper in (False,True):
            with tempfile.TemporaryDirectory() as tmp:
                folder=Path(tmp);path=folder/runtime.DB_NAME
                with closing(sqlite3.connect(path)) as db:
                    db.executescript("CREATE TABLE sentence(id,raw);INSERT INTO sentence VALUES(1,'keep');")
                    db.execute(runtime.LEGACY_DDL)
                    db.executemany('INSERT INTO translation VALUES ('+','.join('?' for _ in runtime.LEGACY_FIELDS)+')',[r[:-1] for r in runtime.sql_rows(rows)])
                    if tamper:db.execute("UPDATE translation SET raw='changed' WHERE source_line=1")
                    db.commit()
                    old=db.execute('SELECT * FROM translation ORDER BY source_line,sentence_index').fetchall()
                digest=path.read_bytes()
                if tamper:
                    with self.assertRaises(runtime.TranslationError):runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)
                    self.assertEqual(path.read_bytes(),digest);continue
                result=runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)
                self.assertEqual(result['state'],'migrated')
                with closing(sqlite3.connect(path)) as db:
                    self.assertEqual(db.execute('SELECT '+','.join(runtime.LEGACY_FIELDS)+' FROM translation ORDER BY source_line,sentence_index').fetchall(),old)
                    self.assertEqual(db.execute('SELECT * FROM sentence').fetchall(),[(1,'keep')])
                    self.assertEqual(db.execute('SELECT sql FROM sqlite_master WHERE name="translation"').fetchone()[0],runtime.DDL)
                digest=path.read_bytes()
                self.assertEqual(runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)['state'],'ready')
                self.assertEqual(path.read_bytes(),digest)

    def test_read_saved_without_scanning_writing_or_migrating(self):
        s=snapshot('One $x$.\n\nTwo.\n')
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);path=folder/runtime.DB_NAME
            with self.assertRaises(runtime.TranslationError):runtime.read_saved(folder,lambda:s)
            self.assertFalse(path.exists())
            with closing(sqlite3.connect(path)) as db:
                db.executescript("CREATE TABLE sentence(id,raw);INSERT INTO sentence VALUES(1,'keep');")
            before=path.read_bytes()
            with patch.object(runtime,'build_rows',side_effect=AssertionError('scanner forbidden')):
                self.assertEqual(runtime.read_saved(folder,lambda:s)['state'],'missing')
            self.assertEqual(path.read_bytes(),before)
            expected=runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)
            before=path.read_bytes()
            with patch.object(runtime,'build_rows',side_effect=AssertionError('scanner forbidden')), closing(sqlite3.connect(path)) as writer:
                # A concurrent RESERVED writer would reject BEGIN IMMEDIATE.
                writer.execute('BEGIN IMMEDIATE')
                ready=runtime.read_saved(folder,lambda:s)
                self.assertEqual(ready,{**expected,'state':'ready'})
                writer.rollback()
                stale=snapshot('Different.\n')
                with self.assertRaises(runtime.TranslationError):runtime.read_saved(folder,lambda:stale)
            self.assertEqual(path.read_bytes(),before)
            with closing(sqlite3.connect(path)) as db:
                self.assertEqual(db.execute('SELECT * FROM sentence').fetchall(),[(1,'keep')])
                db.execute("UPDATE translation SET text='tampered' WHERE source_line=1");db.commit()
            before=path.read_bytes()
            with self.assertRaises(ValueError):runtime.read_saved(folder,lambda:s)
            self.assertEqual(path.read_bytes(),before)
    def test_read_legacy_requires_explicit_migration_and_empty_is_not_missing(self):
        s=snapshot('One $x$.\n')
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);path=folder/runtime.DB_NAME
            with closing(sqlite3.connect(path)) as db:
                db.execute(runtime.LEGACY_DDL)
                db.executemany('INSERT INTO translation VALUES ('+','.join('?' for _ in runtime.LEGACY_FIELDS)+')',[r[:-1] for r in runtime.sql_rows(build_rows(s))])
                db.commit()
            before=path.read_bytes()
            with patch.object(runtime,'build_rows',side_effect=AssertionError('scanner forbidden')):
                self.assertEqual(runtime.read_saved(folder,lambda:s)['state'],'legacy')
            self.assertEqual(path.read_bytes(),before)
            with closing(sqlite3.connect(path)) as db:
                db.execute('DELETE FROM translation');db.commit()
            before=path.read_bytes()
            with self.assertRaises(runtime.TranslationError):runtime.read_saved(folder,lambda:s)
            self.assertEqual(path.read_bytes(),before)
    def test_read_http_contract(self):
        def call(method='GET',cookie='valid',query='workspace=%2Ffixture'):
            out=[]
            h=types.SimpleNamespace(command=method,headers={'Cookie':cookie},respond=lambda code,body,*_:out.append((code,json.loads(body))))
            def roots(value):
                if value!='valid':raise runtime.TranslationError(403,'denied')
                return []
            common=types.SimpleNamespace(authorized_roots=roots,checked_workspace=lambda p,r:Path(p))
            with patch.object(runtime,'read_saved',return_value={'state':'missing'}) as read,patch.object(runtime,'initialize',side_effect=AssertionError('write forbidden')):
                runtime.handle(h,'translation/load',urlsplit('/?'+query),common)
                return out[0][0],read.call_count
        self.assertEqual(call(),(200,1))
        self.assertEqual(call(method='POST'),(405,0))
        self.assertEqual(call(cookie='bad'),(403,0))
        self.assertEqual(call(query='workspace=a&workspace=b'),(422,0))
        self.assertEqual(call(query='workspace=a&other=b'),(422,0))
    def test_export_input_fixed_path_and_conflict(self):
        sys.path.insert(0,str(ROOT.parent/'lab-frame/scripts'))
        import frame_workspace_io as common
        s=snapshot('Hello 😀 $x$.\n')
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);dbpath=folder/runtime.DB_NAME
            with closing(sqlite3.connect(dbpath)) as db:
                db.execute('CREATE TABLE sentence(id)');db.commit()
            table=runtime.initialize(folder,s['source_document_hash'],s['sentence_sha256'],lambda:s)
            expected=runtime.input_bytes({**table,'state':'ready'})
            digest=common.sha(expected);before=dbpath.read_bytes()
            with self.assertRaises(runtime.TranslationError):runtime.export_input(folder,'0'*64,lambda:s,common)
            self.assertFalse((folder/'trans').exists())
            result=runtime.export_input(folder,digest,lambda:s,common)
            dest=folder/'trans/sentences.json'
            self.assertEqual(result,{'path':str(dest),'sha256':digest,'size':len(expected),'state':'created'})
            self.assertEqual(dest.read_bytes(),expected)
            other=folder/'trans/gpt.json';other.write_text('keep')
            self.assertEqual(runtime.export_input(folder,digest,lambda:s,common)['state'],'unchanged')
            dest.write_bytes(b'old task')
            with self.assertRaises(runtime.TranslationError):runtime.export_input(folder,digest,lambda:s,common)
            self.assertEqual(dest.read_bytes(),b'old task');self.assertEqual(other.read_text(),'keep')
            self.assertEqual(dbpath.read_bytes(),before)
            dest.unlink();dest.symlink_to(other)
            with self.assertRaises(OSError):runtime.export_input(folder,digest,lambda:s,common)
            self.assertEqual(other.read_text(),'keep')
            dest.unlink();other.unlink();(folder/'trans').rmdir()
            outside=folder/'outside';outside.mkdir();(folder/'trans').symlink_to(outside,target_is_directory=True)
            with self.assertRaises(OSError):runtime.export_input(folder,digest,lambda:s,common)
            self.assertEqual(list(outside.iterdir()),[])
    def test_export_http_contract(self):
        def call(method='POST',origin='https://ok',cookie='valid',payload=None):
            p=payload if payload is not None else {'workspace':'/fixture','sha256':'a'*64}
            body=json.dumps(p).encode();out=[]
            h=types.SimpleNamespace(command=method,headers={'Origin':origin,'Cookie':cookie,'Content-Length':str(len(body))},rfile=io.BytesIO(body),respond=lambda code,body,*_:out.append((code,json.loads(body))))
            def roots(value):
                if value!='valid':raise runtime.TranslationError(403,'denied')
                return []
            common=types.SimpleNamespace(ALLOWED_ORIGINS={'https://ok'},authorized_roots=roots,checked_workspace=lambda p,r:Path(p))
            with patch.object(runtime,'export_input',return_value={'state':'created'}) as export:
                runtime.handle(h,'translation/export',urlsplit('/'),common)
                return out[0][0],export.call_count
        self.assertEqual(call(),(200,1))
        self.assertEqual(call(method='GET'),(405,0))
        self.assertEqual(call(origin='bad'),(403,0))
        self.assertEqual(call(cookie='bad'),(403,0))
        self.assertEqual(call(payload={'workspace':'/fixture','sha256':'a'*64,'path':'../../x'}),(422,0))
    def test_http_contract(self):
        s=snapshot('Hello.\n')
        p={'workspace':'/fixture','source_document_hash':s['source_document_hash'],'sentence_sha256':s['sentence_sha256']}
        def call(method='POST',origin='https://ok',cookie='valid',payload=p):
            body=json.dumps(payload).encode();out=[]
            h=types.SimpleNamespace(command=method,headers={'Origin':origin,'Cookie':cookie,'Content-Length':str(len(body))},rfile=io.BytesIO(body),respond=lambda code,body,*_:out.append((code,json.loads(body))))
            def roots(value):
                if value!='valid':raise runtime.TranslationError(403,'denied')
                return []
            common=types.SimpleNamespace(ALLOWED_ORIGINS={'https://ok'},authorized_roots=roots,checked_workspace=lambda p,r:Path(p))
            with patch.object(runtime,'initialize',return_value={'state':'ready'}) as init:
                runtime.handle(h,'translation/initialize',urlsplit('/'),common)
                return out[0][0],init.call_count
        self.assertEqual(call(),(200,1))
        for args,status in [({'method':'GET'},405),({'origin':'https://evil'},403),({'cookie':'bad'},403),({'payload':{**p,'rows':[]}},422)]:
            self.assertEqual(call(**args),(status,0))
