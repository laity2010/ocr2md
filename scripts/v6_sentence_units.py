"""Public, immutable sentence-table handoff for the future Translation Lab."""
import hashlib
import json
from pathlib import Path
from v6_main_reviewed import _atomic

SCHEMA='ocr2md-translation-units/v1'
MAX_BYTES=5*1024*1024
SOURCE_FIELDS=('blockId','blockIds','decision','elementType','from','id',
               'original','sourceRanges','to','type')


def canonical(value):
    return json.dumps(value,ensure_ascii=False,sort_keys=True,separators=(',',':'))


def unit_version(table):
    material={'documentVersion':table['documentVersion'],
              'sourceSha256':table['sourceSha256'],
              'reviewRevision':table['reviewRevision'],
              'rows':[{k:row[k] for k in SOURCE_FIELDS if k in row}
                      for row in table['rows']]}
    return hashlib.sha256(canonical(material).encode('utf-8')).hexdigest()


def validate(table,source_sha,document_version,review_revision):
    if not isinstance(table,dict) or table.get('schema')!=SCHEMA or \
       table.get('sourceSha256')!=source_sha or \
       table.get('documentVersion')!=document_version or \
       table.get('reviewRevision')!=review_revision or \
       not isinstance(table.get('unitVersion'),str):
        raise ValueError('Sentence table header/version mismatch')
    rows=table.get('rows')
    if not isinstance(rows,list) or not 1<=len(rows)<=100000:
        raise ValueError('Invalid sentence inventory')
    ids=set();previous=-1
    for row in rows:
        if not isinstance(row,dict) or not all(k in row for k in (
            'id','blockId','type','elementType','from','to','sourceRanges','original')) or \
           not isinstance(row['id'],str) or not row['id'] or row['id'] in ids or \
           type(row['from']) is not int or type(row['to']) is not int or \
           row['from']<0 or row['from']>=row['to'] or row['from']<previous or \
           not isinstance(row['sourceRanges'],list) or not row['sourceRanges'] or \
           not isinstance(row['original'],str) or not row['original'] or \
           row.get('corrected') is not None or row.get('translation') is not None:
            raise ValueError('Invalid or repeated sentence rows')
        ids.add(row['id']);previous=row['to']
        if row['sourceRanges'][0].get('from')!=row['from'] or \
           row['sourceRanges'][-1].get('to')!=row['to']:
            raise ValueError('Sentence source ranges do not span entire row')
    if unit_version(table)!=table['unitVersion']:
        raise ValueError('Sentence unitVersion checksum mismatch')
    return table


def publish(directory,raw,source_sha,document_version,review_revision):
    if len(raw)>MAX_BYTES:
        raise ValueError('Sentence unit package too large')
    data=validate(json.loads(raw.decode('utf-8')),source_sha,document_version,review_revision)
    out=Path(directory)
    raw=json.dumps(data,ensure_ascii=False,separators=(',',':')).encode('utf-8')
    archive=out/('sentence-units-'+data['unitVersion']+'.json')
    if archive.exists():
        if archive.read_bytes()!=raw:
            raise ValueError('Versioned sentence table conflicts with existing archive')
    else:
        _atomic(archive,raw)
    _atomic(out/'sentence-units.json',raw)
    return data


def read(directory,source_sha,document_version,review_revision):
    path=Path(directory)/'sentence-units.json'
    if path.is_symlink() or not path.is_file() or path.stat().st_size>MAX_BYTES:
        raise ValueError('Standard sentence table not yet published')
    return validate(json.loads(path.read_text(encoding='utf-8')),
                    source_sha,document_version,review_revision)
