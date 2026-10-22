#!/usr/bin/env python3
"""Read/search audited V6 API & message contracts. Git SQL is authoritative.

No application imports and no project workspace writes. SQLite output defaults
under ignored .v6/tests/. No runtime monkeypatching or event-bus replacement.
"""
import argparse
import os
from pathlib import Path
import sqlite3
import sys
import subprocess
from datetime import datetime, timezone
import json
import hashlib

ROOT = Path(__file__).resolve().parents[2]
HERE = Path(__file__).resolve().parent
DB = ROOT / '.v6/tests/am.sqlite'


# Only tested code, fixtures, runtime configuration and test scripts invalidate
# a previous PASS. A documentation-only Git commit must not erase evidence.
TEST_SURFACE = ('ui','packages','scripts','tests','vite.config.mjs',
                'package.json','package-lock.json',
                ':(exclude)tests/audits/**',
                ':(exclude)tests/am/README.md',
                ':(exclude)tests/k/K.md')


def git(*args):
    return subprocess.run(['git',*args],cwd=ROOT,text=True,
                          stdout=subprocess.PIPE,stderr=subprocess.PIPE)


def current_commit():
    r=git('rev-parse','HEAD')
    if r.returncode: raise ValueError('cannot read Git HEAD: '+r.stderr)
    return r.stdout.strip()


def require_same_test_surface(old, head):
    r=git('diff','--quiet',old,head,'--',*TEST_SURFACE)
    return r.returncode==0


def require_clean_fixtures_and_sources():
    r=git('status','--porcelain','--untracked-files=all','--',*TEST_SURFACE)
    if r.returncode or r.stdout.strip():
        raise ValueError('AM cannot certify modified/untracked production or test files: '
                         + (r.stdout or r.stderr).strip()[:500])
    manifest=json.loads((ROOT/'tests/k/data.json').read_text())
    for name in ('mineruJson','sourceMarkdownFixture','pdf'):
        fixture=manifest['inputs'][name]
        file=ROOT/fixture['path']
        if not file.is_file() or hashlib.sha256(file.read_bytes()).hexdigest()!=fixture['sha256']:
            raise ValueError('AM evidence fixture absent or changed: '+fixture['path'])


def connection(path):
    con = sqlite3.connect(path)
    con.row_factory = sqlite3.Row
    con.execute('PRAGMA foreign_keys=ON')
    return con


def print_rows(rows):
    rows = list(rows)
    if not rows:
        print('(no results)')
    for row in rows:
        print(' | '.join(f'{k}={row[k]}' for k in row.keys()))


def assert_references(con):
    invalid = con.execute('PRAGMA foreign_key_check').fetchall()
    if invalid:
        raise ValueError(f'broken AM foreign keys: {invalid}')
    missing = []
    for table, field in [('modules', 'source_file'), ('apis', 'source_file'),
                         ('publishers', 'source_file'), ('subscriptions', 'source_file')]:
        for row in con.execute(f'SELECT id,{field} FROM {table}'):
            if not (ROOT / row[field]).is_file():
                missing.append(f'{table}.{row["id"]}: {row[field]}')
    for row in con.execute('SELECT id, symbol, source_file FROM apis'):
        tail = row['symbol'].split('.')[-1]
        if tail not in (ROOT / row['source_file']).read_text():
            missing.append(f'apis.{row["id"]}.symbol: {tail} missing from {row["source_file"]}')
    for table, field in [('publishers','symbol'), ('subscriptions','handler')]:
        for row in con.execute(f'SELECT id,source_file,{field} FROM {table}'):
            # Audited handler labels use 'owner -> function' and occasionally
            # compound 'first/second' internal handlers.
            targets = row[field].split('->')[-1].strip().split('/')
            source = (ROOT / row['source_file']).read_text()
            for target in targets:
                name = target.strip().split('(')[0].strip().split('.')[-1]
                if name and name not in source:
                    missing.append(f'{table}.{row["id"]}.{field}: {name} missing in {row["source_file"]}')
    for row in con.execute('SELECT id,source_file,source_needle,api_id,target_module FROM access_edges'):
        path = ROOT / row['source_file']
        if not path.is_file() or row['source_needle'] not in path.read_text():
            missing.append(f'access_edges.{row["id"]}: source expression not found in {row["source_file"]}')
        if row['api_id'] and con.execute('SELECT module_id FROM apis WHERE id=?',(row['api_id'],)).fetchone()[0] != row['target_module']:
            missing.append(f'access_edges.{row["id"]}: API owner mismatch')
    for row in con.execute('SELECT id,script,fixture FROM test_cases'):
        if not (ROOT / row['script']).is_file():
            missing.append(f'test_cases.{row["id"]}.script: {row["script"]}')
        if not (ROOT / row['fixture']).is_file():
            missing.append(f'test_cases.{row["id"]}.fixture: {row["fixture"]}')
    if missing:
        raise ValueError('missing AM references:\n' + '\n'.join(missing))
    return con.execute('SELECT COUNT(*) FROM apis').fetchone()[0]


def same_test_binding(con, case_id, original):
    """Reject historical PASS when a case is rebound to a different target."""
    current = con.execute('''SELECT api_id,message_id,subscription_id,publisher_id,
        script,fixture,expected,evidence FROM test_cases WHERE id=?''',
        (case_id,)).fetchone()
    return current is not None and tuple(current) == tuple(original)


def build():
    DB.parent.mkdir(parents=True, exist_ok=True)
    # Always construct a fresh database, replace on successful FK/file checks.
    temporary = DB.with_name(f'am.{os.getpid()}.tmp.sqlite')
    if temporary.exists():
        raise RuntimeError(f'refusing to overwrite: {temporary}')
    history = []
    if DB.exists():
        old = connection(f'file:{DB}?mode=ro')
        try:
            history = [tuple(row) for row in old.execute('''
                SELECT r.case_id,r.git_commit,r.ran_at,r.status,r.output_file,r.detail,
                       t.api_id,t.message_id,t.subscription_id,t.publisher_id,
                       t.script,t.fixture,t.expected,t.evidence
                FROM test_runs r JOIN test_cases t ON t.id=r.case_id''')]
        finally:
            old.close()
    try:
        with connection(temporary) as con:
            con.executescript((HERE / 'schema.sql').read_text())
            con.executescript((HERE / 'registry.sql').read_text())
            api_count = assert_references(con)
            restored = 0
            for row in history:
                if same_test_binding(con,row[0],row[6:]):
                    con.execute('INSERT INTO test_runs(case_id,git_commit,ran_at,status,output_file,detail) VALUES(?,?,?,?,?,?)',row[:6])
                    restored += 1
            summary = [con.execute(f'SELECT COUNT(*) FROM {t}').fetchone()[0]
                       for t in ('modules','apis','messages','publishers','subscriptions','test_cases')]
            con.commit()
        temporary.replace(DB)
        print(f'AM_BUILD_PASS modules/apis/messages/publishers/subscriptions/tests={summary} database={DB.relative_to(ROOT)}')
        print(f'AM_REFERENCES_PASS checked {api_count} API registry rows and all source/test paths; previous-run records kept={restored}/{len(history)}')
    finally:
        temporary.unlink(missing_ok=True)


def run_case(case_id):
    require_clean_fixtures_and_sources()
    with connection(f'file:{DB}?mode=ro') as con:
        entry = con.execute('SELECT id,script FROM test_cases WHERE id=?',(case_id,)).fetchone()
        if not entry:
            raise ValueError(f'unknown test case {case_id}; query cases <API-ID> first')
        script = (ROOT / entry['script']).resolve()
        if not script.is_relative_to((ROOT / 'tests').resolve()) or script.suffix != '.mjs':
            raise ValueError('refusing non-test script')
        script_rel = entry['script']
    git_commit = subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    stamp = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    log = ROOT / f'.v6/tests/am-{case_id}-{stamp}-{git_commit[:8]}-{os.getpid()}.log'
    log.parent.mkdir(parents=True, exist_ok=True)
    print(f'AM_RUN_START case={case_id} git={git_commit[:8]} script={script_rel}',flush=True)
    try:
        result = subprocess.run(['node',script_rel],cwd=ROOT,text=True,
                                stdout=subprocess.PIPE,stderr=subprocess.STDOUT,timeout=240)
        status = 'PASS' if result.returncode == 0 else 'FAIL'
        output = result.stdout
    except subprocess.TimeoutExpired as exc:
        status = 'ERROR'
        output = (exc.stdout or b'').decode(errors='replace') if isinstance(exc.stdout,bytes) else (exc.stdout or '')
        output += '\nAM_TIMEOUT_AFTER_240_SECONDS\n'
    log.write_text(output)
    with connection(DB) as con:
        con.execute('INSERT INTO test_runs(case_id,git_commit,ran_at,status,output_file,detail) VALUES(?,?,?,?,?,?)',
                    (case_id,git_commit,datetime.now(timezone.utc).isoformat(),status,str(log.relative_to(ROOT)),output[-1800:]))
        con.commit()
    print(f'AM_RUN_{status} case={case_id} evidence={log.relative_to(ROOT)}')
    print('\n'.join(output.splitlines()[-8:]))
    if status != 'PASS': raise ValueError(f'{case_id}: {status}')


def full_coverage_check(con):
    fields=[('apis','api_id'),('messages','message_id'),('publishers','publisher_id'),('subscriptions','subscription_id')]
    issues=[]
    for table,field in fields:
        missing=con.execute(f'SELECT a.id FROM {table} a WHERE NOT EXISTS (SELECT 1 FROM test_cases t WHERE t.{field}=a.id)').fetchall()
        if missing: issues.append(f'{table}: {",".join(row[0] for row in missing)}')
    if issues: raise ValueError('AM coverage gaps: '+'; '.join(issues))
    return con.execute('SELECT COUNT(*) FROM test_cases').fetchone()[0]


def run_all():
    require_clean_fixtures_and_sources()
    with connection(f'file:{DB}?mode=ro') as con:
        assert_references(con)
        case_count=full_coverage_check(con)
        suites={}
        for row in con.execute('SELECT id,script FROM test_cases ORDER BY script,id'):
            suites.setdefault(row['script'],[]).append(row['id'])
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    git_commit=subprocess.check_output(['git','rev-parse','HEAD'],cwd=ROOT,text=True).strip()
    print(f'AM_FULL_START git={git_commit[:8]} suites={len(suites)} contracts={case_count}',flush=True)
    failures=[]
    for i,(script,case_ids) in enumerate(suites.items(),start=1):
        log=ROOT/f'.v6/tests/am-full-{stamp}-{git_commit[:8]}-{i:02d}-{Path(script).stem}.log'
        log.parent.mkdir(parents=True,exist_ok=True)
        print(f'AM_SUITE_START {i}/{len(suites)} {script} cases={len(case_ids)}',flush=True)
        try:
            completed=subprocess.run(['node',script],cwd=ROOT,stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,text=True,timeout=240)
            status='PASS' if completed.returncode==0 else 'FAIL'
            output=completed.stdout
        except subprocess.TimeoutExpired as ex:
            status='ERROR'
            output=(ex.stdout or b'').decode(errors='replace') if isinstance(ex.stdout,bytes) else (ex.stdout or '')
            output+='\nAM_TIMEOUT_240_SECONDS\n'
        log.write_text(output)
        with connection(DB) as con:
            con.executemany('INSERT INTO test_runs(case_id,git_commit,ran_at,status,output_file,detail) VALUES(?,?,?,?,?,?)',
                [(case_id,git_commit,datetime.now(timezone.utc).isoformat(),status,str(log.relative_to(ROOT)),output[-1800:]) for case_id in case_ids])
            con.commit()
        print(f'AM_SUITE_{status} {i}/{len(suites)} cases={len(case_ids)} log={log.relative_to(ROOT)}',flush=True)
        if status!='PASS':
            failures.append((script,status))
            print('\n'.join(output.splitlines()[-10:]),flush=True)
    require_clean_fixtures_and_sources()
    if current_commit()!=git_commit:
        raise ValueError('Git HEAD moved during AM suite; results not certifiable')
    with connection(f'file:{DB}?mode=ro') as con:
        passed=con.execute('SELECT COUNT(DISTINCT case_id) FROM test_runs WHERE git_commit=? AND status="PASS"',(git_commit,)).fetchone()[0]
    print(f'AM_FULL_RESULT passed_cases={passed}/{case_count} failed_suites={len(failures)} git={git_commit[:8]}',flush=True)
    if failures: raise ValueError('AM full suite failed: '+str(failures))
    if passed!=case_count: raise ValueError('AM full suite: some cases have no PASS results')
    print('AM_FULL_TABLE_PASS',flush=True)


def certify():
    require_clean_fixtures_and_sources()
    head=current_commit()
    with connection(f'file:{DB}?mode=ro') as con:
        assert_references(con)
        count=full_coverage_check(con)
        candidates=[r['git_commit'] for r in con.execute(
            'SELECT git_commit,MAX(id) as recent FROM test_runs GROUP BY git_commit ORDER BY recent DESC')]
        good=None
        for old in candidates:
            if not require_same_test_surface(old,head): continue
            rows=con.execute('SELECT t.id,(SELECT r.status FROM test_runs r WHERE '
                'r.case_id=t.id AND r.git_commit=? ORDER BY r.id DESC LIMIT 1) result '
                'FROM test_cases t',(old,)).fetchall()
            if len(rows)==count and all(r['result']=='PASS' for r in rows):
                good=old
                break
    if good is None:
        raise ValueError('AM_CERTIFY_FAIL: no complete PASS with unchanged source/test Git tree; run-all required')
    print(f'AM_FULL_TABLE_CERTIFIED {count}/{count} cases; tested_git={good[:8]} '
          f'current_git={head[:8]} source_tests_unchanged=True '
          '(integrated tests are not separate per-API oracles)')


def main():
    p = argparse.ArgumentParser(description='OCR2MD V6 AM SQLite queries')
    p.add_argument('action', choices=['build','check','modules','apis','route','untested','impact','coverage','cases','run','run-all','certify','edges'])
    p.add_argument('key', nargs='?', help='API module ID, message topic, or impacted module ID')
    args = p.parse_args()
    if args.action == 'build':
        build()
        return
    if not DB.is_file():
        p.error('AM SQLite missing; first run: python3 tests/am/am.py build')
    if args.action == 'run-all':
        run_all()
        return
    if args.action == 'certify':
        certify()
        return
    if args.action == 'run':
        if not args.key: p.error('run requires a test-case ID such as TC-C05')
        run_case(args.key)
        return
    with connection(f'file:{DB}?mode=ro') as con:
        if args.action == 'cases':
            if not args.key: p.error('cases requires API/message/subscription ID, e.g. C05 or E03')
            print_rows(con.execute('SELECT id,script,fixture,expected,evidence FROM test_cases WHERE api_id=? OR message_id=? OR subscription_id=? OR publisher_id=? ORDER BY id',(args.key,args.key,args.key,args.key)))
        elif args.action == 'check':
            count = assert_references(con)
            print(f'AM_CHECK_PASS apis={count} FK=OK source-and-test-files=OK')
        elif args.action == 'edges':
            print_rows(con.execute('SELECT id,caller_module,target_module,source_file,source_needle,api_id,classification,rationale FROM access_edges WHERE (? IS NULL OR target_module=? OR caller_module=? OR classification=?) ORDER BY classification DESC,id', (args.key,args.key,args.key,args.key)))
        elif args.action == 'modules':
            print_rows(con.execute('SELECT * FROM modules ORDER BY id'))
        elif args.action == 'apis':
            print_rows(con.execute('SELECT id,symbol,visibility,core,source_file FROM apis WHERE (? IS NULL OR module_id=?) ORDER BY module_id,id',(args.key,args.key)))
        elif args.action == 'route':
            if not args.key: p.error('route needs a message topic e.g. focusTarget')
            print_rows(con.execute('SELECT m.id,m.topic,m.payload,p.id AS publisher,p.module_id AS from_module,p.source_file AS from_file,p.symbol AS from_symbol,p.cause FROM messages m LEFT JOIN publishers p ON p.message_id=m.id WHERE m.topic=? ORDER BY p.id',(args.key,)))
            print_rows(con.execute('SELECT s.id AS subscription,s.module_id AS to_module,s.source_file,s.handler,s.condition,s.effects FROM messages m JOIN subscriptions s ON s.message_id=m.id WHERE m.topic=? ORDER BY s.id',(args.key,)))
        elif args.action == 'untested':
            print_rows(con.execute('SELECT a.id,a.symbol,a.module_id FROM apis a WHERE NOT EXISTS(SELECT 1 FROM test_cases t WHERE t.api_id=a.id) ORDER BY a.module_id,a.id'))
            print('--- messages lacking test coverage ---')
            print_rows(con.execute('SELECT m.id,m.topic FROM messages m WHERE NOT EXISTS(SELECT 1 FROM test_cases t WHERE t.message_id=m.id) AND NOT EXISTS (SELECT 1 FROM subscriptions s JOIN test_cases t ON t.subscription_id=s.id WHERE s.message_id=m.id) ORDER BY m.id'))
            print('--- publisher entries lacking test coverage ---')
            print_rows(con.execute('SELECT p.id,m.topic,p.symbol FROM publishers p JOIN messages m ON m.id=p.message_id WHERE NOT EXISTS(SELECT 1 FROM test_cases t WHERE t.publisher_id=p.id) ORDER BY p.id'))
            print('--- subscriptions lacking test coverage ---')
            print_rows(con.execute('SELECT s.id,m.topic,s.handler FROM subscriptions s JOIN messages m ON m.id=s.message_id WHERE NOT EXISTS (SELECT 1 FROM test_cases t WHERE t.subscription_id=s.id) ORDER BY s.id'))
        elif args.action == 'coverage':
            for query in [
                'SELECT (SELECT COUNT(*) FROM apis) total,(SELECT COUNT(DISTINCT api_id) FROM test_cases WHERE api_id IS NOT NULL) linked,(SELECT COUNT(*) FROM apis WHERE core=1) core_total,(SELECT COUNT(DISTINCT t.api_id) FROM test_cases t JOIN apis a ON a.id=t.api_id WHERE a.core=1) core_linked',
                'SELECT (SELECT COUNT(*) FROM messages) total_messages,(SELECT COUNT(DISTINCT message_id) FROM publishers) with_publishers,(SELECT COUNT(DISTINCT message_id) FROM subscriptions) with_subscribers,(SELECT COUNT(*) FROM test_cases) test_links,(SELECT COUNT(*) FROM test_runs) actual_runs',
                'SELECT (SELECT COUNT(*) FROM publishers) publishers,(SELECT COUNT(DISTINCT publisher_id) FROM test_cases WHERE publisher_id IS NOT NULL) publishers_linked,(SELECT COUNT(*) FROM subscriptions) subscriptions,(SELECT COUNT(DISTINCT subscription_id) FROM test_cases WHERE subscription_id IS NOT NULL) subscriptions_linked,(SELECT COUNT(DISTINCT message_id) FROM test_cases WHERE message_id IS NOT NULL) messages_linked'
            ]:
                print_rows(con.execute(query))
            print('NOTE: script links are references, NOT certified PASS results or isolated API tests')
        elif args.action == 'impact':
            if not args.key: p.error('impact needs module ID: C G M P L')
            print_rows(con.execute('SELECT id,symbol,visibility FROM apis WHERE module_id=? ORDER BY id',(args.key,)))
            print('--- published/received messages ---')
            print_rows(con.execute('SELECT "publish" role,m.topic,p.source_file,p.symbol handler FROM publishers p JOIN messages m ON m.id=p.message_id WHERE p.module_id=? UNION ALL SELECT "subscribe",m.topic,s.source_file,s.handler FROM subscriptions s JOIN messages m ON m.id=s.message_id WHERE s.module_id=?',(args.key,args.key)))


if __name__ == '__main__':
    try: main()
    except (ValueError,sqlite3.Error) as error:
        print(f'AM_ERROR: {error}',file=sys.stderr)
        sys.exit(1)
