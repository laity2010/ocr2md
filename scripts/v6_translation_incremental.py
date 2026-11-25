"""Incremental, audited AI translation of revised OCR2MD sentence tables.

Contract: old baseline + *matching* old translated table + new baseline ->
per-AI minimal retranslation task. A complete new translated table is created
ONLY after all required delta rows are returned and validated. Never modifies
historical tables, CMD, or adjudication files.
"""
import argparse
import hashlib
import json
import os
import re
import secrets
from pathlib import Path

BASE_SCHEMA = 'ocr2md-translation-units/v1'
TASK_SCHEMA = 'ocr2md-translation-delta-task/v1'
RESULT_SCHEMA = 'ocr2md-translation-delta-result/v1'
AI_ID = re.compile(r'[a-z][a-z0-9-]{0,15}\Z')
STRUCTURAL = ('id', 'blockId', 'type', 'elementType', 'original')
REVISION_FIELDS = ('id', 'blockId', 'type', 'elementType', 'decision',
                   'from', 'to', 'sourceRanges', 'original', 'blockIds')


def _canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True,
                      separators=(',', ':'))


def _checksum(value):
    return hashlib.sha256(_canonical(value).encode('utf-8')).hexdigest()


def _header(table):
    return {k: v for k, v in table.items() if k != 'rows'}


def _source(row):
    return {k: v for k, v in row.items() if k not in ('corrected', 'translation')}


def _semantic(row):
    return tuple(_canonical(row.get(k)) for k in (*STRUCTURAL, 'blockIds'))


def validate_baseline(table):
    if not isinstance(table, dict) or table.get('schema') != BASE_SCHEMA or \
       not isinstance(table.get('sourceSha256'), str) or \
       not isinstance(table.get('rows'), list) or not table['rows']:
        raise ValueError('Invalid sentence table baseline')
    ids = [r.get('id') for r in table['rows'] if isinstance(r, dict)]
    if len(ids) != len(table['rows']) or any(not isinstance(i, str) or not i for i in ids) or \
       len(ids) != len(set(ids)):
        raise ValueError('Duplicate or invalid sentence IDs')
    if any(any(k not in r for k in STRUCTURAL) or
           any(r.get(k) is not None for k in ('corrected', 'translation'))
           for r in table['rows']):
        raise ValueError('Baseline must contain source-only AI units')
    return table


def revision(table):
    validate_baseline(table)
    return _checksum({'header': _header(table),
                      'rows': [{k: r.get(k) for k in REVISION_FIELDS}
                               for r in table['rows']]})


def validate_old_translation(old_table, translated):
    validate_baseline(old_table)
    if not isinstance(translated, dict) or _header(translated) != _header(old_table):
        raise ValueError('Old AI result header does not match old sentence table')
    originals, answers = old_table['rows'], translated.get('rows')
    if not isinstance(answers, list) or len(answers) != len(originals):
        raise ValueError('Old AI translation row count differs')
    for src, answer in zip(originals, answers):
        if not isinstance(answer, dict) or _source(answer) != _source(src) or \
           set(answer) != set(src) or not all(isinstance(answer.get(k), str)
                              and answer[k].strip() for k in ('corrected', 'translation')):
            raise ValueError('Old AI result is incomplete or positionally mismatched: ' + src['id'])
    return translated


def plan(old_table, new_table, old_translated, ai_id):
    validate_old_translation(old_table, old_translated)
    validate_baseline(new_table)
    if not AI_ID.fullmatch(ai_id):
        raise ValueError('Invalid AI identity')
    old_rows = {r['id']: r for r in old_table['rows']}
    old_result = {r['id']: r for r in old_translated['rows']}
    reusable, needs = [], []
    for row in new_table['rows']:
        previous = old_rows.get(row['id'])
        if previous is not None and _semantic(previous) == _semantic(row):
            # Only the *unmodified source content + stable identity* makes a
            # translation reusable. Raw UTF16 offset drift alone is not a
            # semantic text change; new coordinates come from the NEW table.
            assert old_result[row['id']]['original'] == row['original']
            reusable.append(row['id'])
        else:
            reason = ('new' if previous is None else
                      'source_changed' if previous['original'] != row['original'] else
                      'structure_changed')
            needs.append({'id': row['id'], 'reason': reason,
                          'original': row['original'], 'type': row['type'],
                          'blockId': row['blockId'],
                          'blockIds': row.get('blockIds', [row['blockId']]),
                          'sourceRanges': row.get('sourceRanges', [])})
    removed = [row['id'] for row in old_table['rows']
               if row['id'] not in {r['id'] for r in new_table['rows']}]
    return {'schema': TASK_SCHEMA, 'aiId': ai_id,
            'previousUnitRevision': revision(old_table),
            'newUnitRevision': revision(new_table),
            'sourceSha256': new_table['sourceSha256'],
            'previousCount': len(old_table['rows']),
            'newCount': len(new_table['rows']),
            'reuseIds': reusable, 'retranslate': needs,
            'removedIds': removed,
            'responseContract': RESULT_SCHEMA}


def merge(old_table, new_table, old_translated, task, response):
    if not isinstance(task, dict) or task.get('schema') != TASK_SCHEMA or \
       task.get('previousUnitRevision') != revision(old_table) or \
       task.get('newUnitRevision') != revision(new_table):
        raise ValueError('Incremental task is stale or mismatches current tables')
    expected = plan(old_table, new_table, old_translated, task.get('aiId', ''))
    if task != expected:
        raise ValueError('Incremental task was modified or no longer matches old AI result')
    if not isinstance(response, dict) or response.get('schema') != RESULT_SCHEMA or \
       response.get('aiId') != task['aiId'] or \
       response.get('newUnitRevision') != task['newUnitRevision'] or \
       response.get('sourceSha256') != task['sourceSha256']:
        raise ValueError('AI incremental response version or identity mismatch')
    rows = response.get('rows')
    if not isinstance(rows, list) or len(rows) != len(task['retranslate']):
        raise ValueError('AI incremental response is incomplete')
    by_id = {}
    wanted = {r['id']: r for r in task['retranslate']}
    for row in rows:
        if not isinstance(row, dict) or set(row) != {'id', 'original', 'corrected', 'translation'} or \
           not isinstance(row['id'], str) or row['id'] not in wanted or \
           row['id'] in by_id or row['original'] != wanted[row['id']]['original'] or \
           not all(isinstance(row.get(k), str) and row[k].strip()
                   for k in ('corrected', 'translation')):
            raise ValueError('AI incremental response has duplicate, unexpected or wrong source rows')
        by_id[row['id']] = row
    if set(by_id) != set(wanted):
        raise ValueError('AI incremental response lacks requested IDs')
    historical = {r['id']: r for r in old_translated['rows']}
    keep = set(task['reuseIds'])
    complete = []
    for new in new_table['rows']:
        record = dict(new)
        original = historical[new['id']] if new['id'] in keep else by_id[new['id']]
        record['corrected'] = original['corrected']
        record['translation'] = original['translation']
        complete.append(record)
    full = {**_header(new_table), 'rows': complete}
    validate_old_translation(new_table, full)
    return full


def _read(path):
    return json.loads(Path(path).read_text(encoding='utf-8'))


def _write_once(path, value):
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)
    content = (json.dumps(value, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    if path.exists():
        if path.read_bytes() != content:
            raise ValueError('Refusing to overwrite an existing versioned result: ' + str(path))
        return
    tmp = path.with_name('.' + path.name + '.' + secrets.token_hex(5) + '.tmp')
    try:
        with tmp.open('xb') as fd:
            os.fchmod(fd.fileno(), 0o600)
            fd.write(content)
            fd.flush()
            os.fsync(fd.fileno())
        if path.exists():
            raise ValueError('Destination was created concurrently: ' + str(path))
        os.link(tmp, path)
    finally:
        tmp.unlink(missing_ok=True)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest='command', required=True)
    prepare = sub.add_parser('prepare')
    prepare.add_argument('--old-base', required=True)
    prepare.add_argument('--new-base', required=True)
    prepare.add_argument('--translated', action='append', required=True,
                         help='AI_ID=path/to/old/translations.json; repeat for each AI')
    prepare.add_argument('--out-dir', required=True)
    receive = sub.add_parser('merge')
    receive.add_argument('--old-base', required=True)
    receive.add_argument('--new-base', required=True)
    receive.add_argument('--old-translated', required=True)
    receive.add_argument('--task', required=True)
    receive.add_argument('--response', required=True)
    receive.add_argument('--out', required=True)
    args = parser.parse_args(argv)
    old_table = _read(args.old_base)
    new_table = _read(args.new_base)
    if args.command == 'prepare':
        out = Path(args.out_dir)
        summary = {}
        for entry in args.translated:
            if '=' not in entry:
                parser.error('--translated requires AI_ID=path')
            ai, path = entry.split('=', 1)
            task = plan(old_table, new_table, _read(path), ai)
            _write_once(out / ('retranslate-' + ai + '.json'), task)
            summary[ai] = {'reuse': len(task['reuseIds']),
                           'retranslate': len(task['retranslate']),
                           'obsolete': len(task['removedIds'])}
        _write_once(out / 'summary.json',
                    {'previousUnitRevision': revision(old_table),
                     'newUnitRevision': revision(new_table), 'counts': summary})
        print(json.dumps({'output': str(out), 'results': summary}, ensure_ascii=False))
    else:
        task = _read(args.task)
        result = merge(old_table, new_table, _read(args.old_translated), task,
                       _read(args.response))
        _write_once(args.out, result)
        print(json.dumps({'fullOutput': args.out, 'ai': task['aiId'],
                          'rows': len(result['rows']),
                          'inherited': len(task['reuseIds']),
                          'retranslated': len(task['retranslate'])}, ensure_ascii=False))


if __name__ == '__main__':
    main()
