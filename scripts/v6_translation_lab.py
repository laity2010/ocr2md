"""Translation Lab's sole SQLite owner and versioned JSON public contract.

Main and Sentence Lab own their sources. This module only accepts a published
sentence-table snapshot, manages AI responses and publishes incomplete-safe
translated JSON. Nothing here writes CMD or cross-Lab file paths.
"""
import hashlib
import json
import re
import secrets
import sqlite3
from datetime import datetime, timezone
from pathlib import Path
from v6_main_reviewed import _atomic
from v6_sentence_units import validate as validate_units

BASE='ocr2md-translation-units/v1'
TASK='ocr2md-ai-translation-task/v1'
REPLY='ocr2md-ai-translation-reply/v1'
OUTPUT='ocr2md-ai-translation-table/v1'
AI=('gpt','grok','muse')
LIMIT=6*1024*1024
DEFAULT_PROMPT=('检查每条英文原句的 OCR、拼写及明显语法问题，保留原义、数字、学术术语；'
                '返回校正英文 corrected 和简体中文译文 translation。'
                '严格按任务 JSON 中的 id/original 逐条回应，不增删原句，不返回 Markdown。')


def now():
    return datetime.now(timezone.utc).isoformat()


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))


def digest(value):
    return hashlib.sha256(canonical(value).encode('utf-8')).hexdigest()


def _source_identity(row):
    # Offsets can drift without changing meaning. PBS/chain identity must not.
    return digest({k:row.get(k) for k in ('id','blockId','blockIds','type','elementType','original')})


def checked_baseline(table):
    if not isinstance(table,dict) or table.get('schema')!=BASE or \
       not isinstance(table.get('sourceSha256'),str) or \
       not re.fullmatch('[a-f0-9]{64}',table['sourceSha256']) or \
       not isinstance(table.get('rows'),list) or not table['rows'] or len(table['rows'])>100000:
        raise ValueError('Invalid upstream sentence table')
    if 'unitVersion' in table:
        validate_units(table,table['sourceSha256'],table.get('documentVersion'),table.get('reviewRevision'))
        version=table['unitVersion']
    else:
        # Archival 402-row format can be imported explicitly for migration.
        if 'documentVersion' in table or 'reviewRevision' in table:
            raise ValueError('Partial upstream table version not permitted')
        version=digest({'sourceSha256':table['sourceSha256'],
                        'rows':[{k:v for k,v in row.items() if k not in ('corrected','translation')}
                                for row in table['rows']]})
    seen=set()
    for row in table['rows']:
        if not isinstance(row,dict) or not isinstance(row.get('id'),str) or \
           not isinstance(row.get('original'),str) or not row['original'].strip() or \
           row['id'] in seen or not isinstance(row.get('blockId'),str) or \
           not isinstance(row.get('sourceRanges'),list) or \
           row.get('corrected') is not None or row.get('translation') is not None:
            raise ValueError('Invalid, duplicated or non-source sentence row')
        seen.add(row['id'])
    return version


class TranslationStore:
    def __init__(self,path):
        self.path=Path(path)
        self.path.parent.mkdir(parents=True,exist_ok=True)
        self.db=sqlite3.connect(self.path,timeout=8)
        self.db.row_factory=sqlite3.Row
        self.db.execute('PRAGMA foreign_keys=ON')
        self.db.execute('PRAGMA busy_timeout=8000')
        self.db.executescript('''
            PRAGMA journal_mode=WAL;
            CREATE TABLE IF NOT EXISTS versions(
              version TEXT PRIMARY KEY, source_sha TEXT NOT NULL,
              document_version TEXT, review_revision TEXT, coordinate TEXT NOT NULL,
              imported TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS units(
              version TEXT NOT NULL REFERENCES versions(version),id TEXT NOT NULL,
              seq INTEGER NOT NULL, identity TEXT NOT NULL,row_json TEXT NOT NULL,
              change_type TEXT NOT NULL DEFAULT 'initial',
              PRIMARY KEY(version,id),UNIQUE(version,seq));
            CREATE TABLE IF NOT EXISTS preferences(key TEXT PRIMARY KEY,value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS prompts(
              ai TEXT NOT NULL,version TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,
              PRIMARY KEY(ai,version));
            CREATE TABLE IF NOT EXISTS results(
              id INTEGER PRIMARY KEY AUTOINCREMENT,ai TEXT NOT NULL,
              version TEXT NOT NULL,unit_id TEXT NOT NULL,
              corrected TEXT NOT NULL,translation TEXT NOT NULL,
              prompt_version TEXT,origin TEXT NOT NULL,created TEXT NOT NULL,
              FOREIGN KEY(version,unit_id) REFERENCES units(version,id));
            CREATE TABLE IF NOT EXISTS effective(
              ai TEXT NOT NULL,version TEXT NOT NULL,unit_id TEXT NOT NULL,
              result_id INTEGER NOT NULL REFERENCES results(id),
              PRIMARY KEY(ai,version,unit_id));
            CREATE TABLE IF NOT EXISTS jobs(
              task_id TEXT PRIMARY KEY,ai TEXT NOT NULL,version TEXT NOT NULL,
              prompt_version TEXT NOT NULL,request_json TEXT NOT NULL,created TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS completed(
              task_id TEXT NOT NULL REFERENCES jobs(task_id),unit_id TEXT NOT NULL,
              result_id INTEGER NOT NULL REFERENCES results(id),PRIMARY KEY(task_id,unit_id));
            CREATE TABLE IF NOT EXISTS receipts(
              id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL,
              json_hash TEXT NOT NULL UNIQUE,raw_json TEXT NOT NULL,created TEXT NOT NULL);
        ''')
        # Older WP2 databases retain all records and receive one additive field.
        if 'change_type' not in {r['name'] for r in self.db.execute('PRAGMA table_info(units)')}:
            self.db.execute("ALTER TABLE units ADD COLUMN change_type TEXT NOT NULL DEFAULT 'initial'")
        with self.db:
            for ai in AI:
                row=self.db.execute('SELECT value FROM preferences WHERE key=?',(f'prompt:{ai}',)).fetchone()
                if not row:
                    version=digest({'ai':ai,'text':DEFAULT_PROMPT})
                    self.db.execute('INSERT OR IGNORE INTO prompts VALUES(?,?,?,?)',
                                    (ai,version,DEFAULT_PROMPT,now()))
                    self.db.execute('INSERT INTO preferences VALUES(?,?)',(f'prompt:{ai}',version))

    def __enter__(self):return self
    def __exit__(self,exc_type,exc,trace):self.close()
    def close(self):self.db.close()

    def _current(self):
        r=self.db.execute("SELECT value FROM preferences WHERE key='current'").fetchone()
        if not r:raise ValueError('未导入上游句表')
        return r['value']

    def _units(self,version):
        return [(r['id'],json.loads(r['row_json']),r['identity']) for r in self.db.execute(
            'SELECT id,row_json,identity FROM units WHERE version=? ORDER BY seq',(version,))]

    def _prompt(self,ai):
        if ai not in AI:raise ValueError('Unknown AI identity')
        version=self.db.execute('SELECT value FROM preferences WHERE key=?',(f'prompt:{ai}',)).fetchone()['value']
        body=self.db.execute('SELECT body FROM prompts WHERE ai=? AND version=?',(ai,version)).fetchone()['body']
        return {'aiId':ai,'promptVersion':version,'body':body}

    def import_units(self,table):
        version=checked_baseline(table)
        old=self.db.execute("SELECT value FROM preferences WHERE key='current'").fetchone()
        previous=old['value'] if old else None
        if previous==version:
            return {'unitVersion':version,'rows':len(table['rows']),'changed':False,
                    'inherited':{ai:0 for ai in AI}}
        # Compare the exact old source identity, not sentence ID alone or offsets.
        reused={ai:0 for ai in AI}
        prior_ids={i:identity for i,_,identity in self._units(previous)} if previous else {}
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO versions VALUES(?,?,?,?,?,?)',(
                version,table['sourceSha256'],table.get('documentVersion'),
                table.get('reviewRevision'),table.get('coordinate','UTF-16'),now()))
            for position,row in enumerate(table['rows']):
                identity=_source_identity(row)
                if previous is None:change='initial'
                elif row['id'] not in prior_ids:change='new'
                elif prior_ids[row['id']]==identity:change='unchanged'
                else:
                    older=self.db.execute('SELECT row_json FROM units WHERE version=? AND id=?',
                                          (previous,row['id'])).fetchone()
                    change='source_changed' if older and json.loads(older['row_json'])['original']!=row['original'] else 'structure_changed'
                self.db.execute('INSERT OR IGNORE INTO units(version,id,seq,identity,row_json,change_type) VALUES(?,?,?,?,?,?)',(
                    version,row['id'],position,identity,canonical(row),change))
                if previous and prior_ids.get(row['id'])==identity:
                    for ai in AI:
                        old_effective=self.db.execute(
                            'SELECT r.* FROM effective e JOIN results r ON r.id=e.result_id '
                            'WHERE e.version=? AND e.unit_id=? AND e.ai=?',
                            (previous,row['id'],ai)).fetchone()
                        if old_effective:
                            # New version gets its own immutable provenance row.
                            cursor=self.db.execute(
                                'INSERT INTO results(ai,version,unit_id,corrected,translation,prompt_version,origin,created) '
                                'VALUES(?,?,?,?,?,?,?,?)',(
                                ai,version,row['id'],old_effective['corrected'],
                                old_effective['translation'],old_effective['prompt_version'],
                                'inherited:'+str(old_effective['id']),now()))
                            self.db.execute('INSERT OR REPLACE INTO effective VALUES(?,?,?,?)',
                                            (ai,version,row['id'],cursor.lastrowid))
                            reused[ai]+=1
            self.db.execute("INSERT OR REPLACE INTO preferences VALUES('current',?)",(version,))
        return {'unitVersion':version,'rows':len(table['rows']),
                'changed':True,'inherited':reused}

    def import_historical(self,ai,translated):
        if ai not in AI:raise ValueError('Unknown AI identity')
        version=self._current()
        current=self._units(version)
        by_id={id:(row,identity) for id,row,identity in current}
        if not isinstance(translated,dict) or translated.get('schema')!=BASE or \
           translated.get('sourceSha256')!=self.db.execute(
             'SELECT source_sha FROM versions WHERE version=?',(version,)).fetchone()['source_sha'] or \
           not isinstance(translated.get('rows'),list):
            raise ValueError('Historical table does not match the active sentence source')
        seen=set();ready=[]
        for item in translated['rows']:
            if not isinstance(item,dict) or item.get('id') not in by_id or item['id'] in seen:
                raise ValueError('Invalid duplicate or unknown historical ID')
            seen.add(item['id'])
            base=by_id[item['id']][0]
            if _source_identity(item)!=by_id[item['id']][1] or \
               any(item.get(k)!=base.get(k) for k in ('sourceRanges','from','to')):
                raise ValueError('Historical AI source mismatched at '+item['id'])
            english,chinese=item.get('corrected'),item.get('translation')
            if english is None and chinese is None:continue
            if not isinstance(english,str) or not english.strip() or \
               not isinstance(chinese,str) or not chinese.strip():
                raise ValueError('Incomplete historical answer row')
            ready.append((item['id'],english,chinese))
        prompt=self._prompt(ai)['promptVersion']
        with self.db:
            for id,english,chinese in ready:
                row=self.db.execute('SELECT 1 FROM effective WHERE ai=? AND version=? AND unit_id=?',
                                    (ai,version,id)).fetchone()
                if row:continue
                cursor=self.db.execute('INSERT INTO results(ai,version,unit_id,corrected,translation,prompt_version,origin,created) '
                    'VALUES(?,?,?,?,?,?,?,?)',
                    (ai,version,id,english,chinese,prompt,'historical-import',now()))
                self.db.execute('INSERT INTO effective VALUES(?,?,?,?)',(ai,version,id,cursor.lastrowid))
        return {'aiId':ai,'received':len(ready),'currentCovered':self._coverage(ai,version)}

    def _coverage(self,ai,version):
        return self.db.execute('SELECT COUNT(*) n FROM effective WHERE ai=? AND version=?',(ai,version)).fetchone()['n']

    def state(self,ai='gpt',filter_mode='all'):
        if ai not in AI:raise ValueError('Unknown AI identity')
        current=self.db.execute("SELECT value FROM preferences WHERE key='current'").fetchone()
        if not current:
            return {'schema':'ocr2md-translation-state/v1','ready':False,'aiId':ai,
                    'providers':[{'aiId':a,'covered':0,'total':0,'missing':0} for a in AI],
                    'rows':[],'prompts':{a:self._prompt(a) for a in AI}}
        version=current['value'];v=self.db.execute('SELECT * FROM versions WHERE version=?',(version,)).fetchone()
        total=self.db.execute('SELECT COUNT(*) n FROM units WHERE version=?',(version,)).fetchone()['n']
        covered={a:self._coverage(a,version) for a in AI}
        rows=[]
        for id,row,identity in self._units(version):
            e={r['ai']:r for r in self.db.execute('SELECT e.ai,r.origin,r.corrected,r.translation '
              'FROM effective e JOIN results r ON r.id=e.result_id WHERE e.version=? AND e.unit_id=?',(version,id))}
            states={a:'completed' if a in e else 'missing' for a in AI}
            if filter_mode=='missing' and states[ai]!='missing':continue
            if filter_mode=='completed' and states[ai]!='completed':continue
            if filter_mode not in ('all','missing','completed'):
                raise ValueError('Unknown filter mode')
            classification=self.db.execute('SELECT change_type FROM units WHERE version=? AND id=?',(version,id)).fetchone()
            rows.append({'id':id,'blockId':row['blockId'],'original':row['original'],
                         'changeType':classification['change_type'],
                         'type':row['type'],'state':states,'provenance':{a:e[a]['origin'] for a in e}})
        return {'schema':'ocr2md-translation-state/v1','ready':True,'aiId':ai,
                'unitVersion':version,'documentVersion':v['document_version'],
                'sourceSha256':v['source_sha'],'total':total,
                'providers':[{'aiId':a,'covered':covered[a],'total':total,
                              'missing':total-covered[a]} for a in AI],
                'rows':rows,'prompts':{a:self._prompt(a) for a in AI}}

    def save_prompt(self,ai,body):
        if ai not in AI or not isinstance(body,str) or not body.strip() or len(body)>20000:
            raise ValueError('Invalid AI Prompt')
        version=digest({'ai':ai,'text':body})
        with self.db:
            self.db.execute('INSERT OR IGNORE INTO prompts VALUES(?,?,?,?)',(ai,version,body,now()))
            self.db.execute('INSERT OR REPLACE INTO preferences VALUES(?,?)',(f'prompt:{ai}',version))
        return self._prompt(ai)

    def create_task(self,ai,ids=None,force=False):
        if ai not in AI:raise ValueError('Unknown AI identity')
        version=self._current();rows=self._units(version)
        if ids is not None and (not isinstance(ids,list) or len(ids)>len(rows) or
                                any(not isinstance(i,str) for i in ids) or len(set(ids))!=len(ids)):
            raise ValueError('Invalid selected sentence IDs')
        selected=set(ids) if ids is not None else None
        targets=[];known=set()
        for id,row,_ in rows:
            known.add(id)
            if selected is not None and id not in selected:continue
            covered=self.db.execute('SELECT 1 FROM effective WHERE ai=? AND version=? AND unit_id=?',
                                    (ai,version,id)).fetchone()
            if not covered or force:
                targets.append({'id':id,'original':row['original'],'blockId':row['blockId'],
                                'type':row['type']})
        if selected is not None and selected-known:raise ValueError('Unknown selected unit')
        prompt=self._prompt(ai)
        task_id=secrets.token_hex(16)
        output={'schema':TASK,'taskId':task_id,'aiId':ai,'unitVersion':version,
                'promptVersion':prompt['promptVersion'],'prompt':prompt['body'],
                'rows':targets,'responseSchema':REPLY}
        with self.db:
            self.db.execute('INSERT INTO jobs VALUES(?,?,?,?,?,?)',(
                task_id,ai,version,prompt['promptVersion'],canonical(output),now()))
        return output

    def receive(self,reply):
        if not isinstance(reply,dict) or reply.get('schema')!=REPLY or \
           not isinstance(reply.get('taskId'),str):
            raise ValueError('Invalid translation reply schema')
        job=self.db.execute('SELECT * FROM jobs WHERE task_id=?',(reply['taskId'],)).fetchone()
        if not job or reply.get('unitVersion')!=job['version'] or \
           reply.get('promptVersion')!=job['prompt_version'] or \
           reply.get('aiId')!=job['ai'] or self._current()!=job['version']:
            raise ValueError('AI identity, Prompt or unitVersion changed')
        task=json.loads(job['request_json']);want={r['id']:r for r in task['rows']}
        received=reply.get('rows')
        if not isinstance(received,list) or len(received)>len(want):
            raise ValueError('Invalid partial AI response rows')
        fingerprint=digest(reply)
        if self.db.execute('SELECT id FROM receipts WHERE json_hash=?',(fingerprint,)).fetchone():
            return {'aiId':job['ai'],'accepted':0,'duplicate':True,
                    'covered':self._coverage(job['ai'],job['version'])}
        seen=set()
        for row in received:
            if not isinstance(row,dict) or set(row)!=set(('id','original','corrected','translation')) or \
               row['id'] in seen or row['id'] not in want or row['original']!=want[row['id']]['original'] or \
               not all(isinstance(row[k],str) and row[k].strip() for k in ('corrected','translation')):
                raise ValueError('Duplicated, wrong-source or malformed AI response row')
            seen.add(row['id'])
            if self.db.execute('SELECT 1 FROM completed WHERE task_id=? AND unit_id=?',
                               (job['task_id'],row['id'])).fetchone():
                raise ValueError('Already received an answer for this task unit')
        with self.db:
            for row in received:
                cursor=self.db.execute('INSERT INTO results(ai,version,unit_id,corrected,translation,prompt_version,origin,created) '
                    'VALUES(?,?,?,?,?,?,?,?)',(
                      job['ai'],job['version'],row['id'],row['corrected'],row['translation'],
                      job['prompt_version'],'task:'+job['task_id'],now()))
                self.db.execute('INSERT OR REPLACE INTO effective VALUES(?,?,?,?)',(
                    job['ai'],job['version'],row['id'],cursor.lastrowid))
                self.db.execute('INSERT INTO completed VALUES(?,?,?)',(
                    job['task_id'],row['id'],cursor.lastrowid))
            self.db.execute('INSERT INTO receipts(task_id,json_hash,raw_json,created) VALUES(?,?,?,?)',(
                job['task_id'],fingerprint,canonical(reply),now()))
        return {'aiId':job['ai'],'accepted':len(received),'duplicate':False,
                'covered':self._coverage(job['ai'],job['version'])}

    def table(self,ai):
        if ai not in AI:raise ValueError('Unknown AI identity')
        version=self._current();meta=self.db.execute('SELECT * FROM versions WHERE version=?',(version,)).fetchone()
        rows=[];covered=0
        for id,source,_ in self._units(version):
            effect=self.db.execute('SELECT r.* FROM effective e JOIN results r ON r.id=e.result_id '
               'WHERE e.ai=? AND e.version=? AND e.unit_id=?',(ai,version,id)).fetchone()
            row={**source,'corrected':effect['corrected'] if effect else None,
                 'translation':effect['translation'] if effect else None,
                 'status':'completed' if effect else 'missing',
                 'promptVersion':effect['prompt_version'] if effect else None,
                 'origin':effect['origin'] if effect else None}
            if effect:covered+=1
            rows.append(row)
        return {'schema':OUTPUT,'aiId':ai,'unitVersion':version,
                'sourceSha256':meta['source_sha'],
                'documentVersion':meta['document_version'],
                'reviewRevision':meta['review_revision'],
                'total':len(rows),'covered':covered,'missing':len(rows)-covered,
                'rows':rows}

    def publish(self,ai,export_dir):
        output=self.table(ai)
        path=Path(export_dir)
        encoded=(json.dumps(output,ensure_ascii=False,indent=2)+'\n').encode('utf-8')
        # Replace only current published snapshot; source state stays in DB.
        _atomic(path/f'translated-{ai}.json',encoded)
        return {k:output[k] for k in ('aiId','unitVersion','total','covered','missing')}
