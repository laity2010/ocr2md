"""Derived chapter-boundary read cache. Never a document authority.

Explicit prepare only; read paths have no write side effects. All files are
bound to the immutable IR generation and content-hashed before serving.
"""
import base64
import copy
import json
import os
from pathlib import Path
import shutil
import tempfile
import zipfile
import io

from v3_ir_persistence import (canonical_json, digest, ensure_book, read_pointer,
    validate_archive, MAX_IR, HEX, _read_markings)
from v3_mac_vault import fail

CACHE_SCHEMA=1
CACHE_DIR='chapter-work-cache'
MAX_VIEW=12*1024*1024


def _location(physical,generation):
    return physical/'.ocr2md'/CACHE_DIR/generation/'v1'


def _range(text,start,end):
    # JavaScript's IR range contract is UTF-16, not Python code points.
    encoded=text.encode('utf-16-le')
    if not isinstance(start,int) or not isinstance(end,int) or start<0 or end<start or end*2>len(encoded):
        fail('ECONFLICT','Chapter source range exceeds stored Markdown',409)
    try:return encoded[2*start:2*end].decode('utf-16-le')
    except UnicodeDecodeError:fail('ECONFLICT','Chapter range cuts a surrogate pair',409)


def _units(value):return len(value.encode('utf-16-le'))//2


def _source_stamp(physical,source,book):
    if not source['path'].startswith(book+'/'):
        fail('EACCES','Chapter cache source does not belong to this book',403)
    path=physical/source['path'][len(book)+1:]
    if not path.is_file() or path.is_symlink():fail('ESTALE','OCR/PDF source changed or is unavailable',409)
    s=path.stat()
    return {'size':s.st_size,'mtimeNs':s.st_mtime_ns}


def _assemble(ir,manifest,archive,book):
    blocks=sorted(ir['blocks'],key=lambda b:b['readingOrder'])
    all_ranges={}
    for entry in manifest['files']:
        name='chapters/'+entry['path'].split('/')[-1]
        raw=archive.read(name).decode('utf-8')
        for r in entry['ranges']:
            block=r['blockId']
            if block in all_ranges:fail('ECONFLICT','Duplicate source map range',409)
            all_ranges[block]=(_range(raw,r['from'],r['to']),r)
    pieces=[];ranges=[];cursor=0
    for block in blocks:
        ident=block['blockId']
        if ident not in all_ranges:fail('ECONFLICT','Missing MD source range',409)
        chunk,old=all_ranges[ident]
        from_offset=cursor
        marker='<!-- ocr2md-ir:block='+ident+' -->\n'
        if not chunk.startswith(marker):fail('ECONFLICT','Invalid chapter provenance marker',409)
        content_from=cursor+_units(marker)
        source_content=_range(chunk,old['contentFrom']-old['from'],old['contentTo']-old['from'])
        if _range(chunk,0,_units(marker))!=marker:fail('ECONFLICT','Wrong marker range',409)
        content_to=content_from+_units(source_content)
        cursor+=_units(chunk)
        ranges.append({**old,'from':from_offset,'to':cursor,'contentFrom':content_from,'contentTo':content_to})
        pieces.append(chunk)
    if len(ranges)!=len(blocks):fail('ECONFLICT','MD did not cover all blocks',409)
    return ''.join(pieces),ranges


def _compact(ir):
    doc=copy.deepcopy(ir)
    doc['sourceMetadata']={}
    for page in doc['pages']:
        page['pageMetadata']={};page['preprocBlocks']=[]
    for source in doc['sourceElements']:
        raw=source['rawBlock']
        source['rawBlock']={k:raw[k] for k in ('type','bbox','level') if k in raw}
    return doc


def build_cache_bytes(book,generation,source_zip,physical,workspace):
    ir,original_manifest=validate_archive(source_zip,workspace,book)
    with zipfile.ZipFile(io.BytesIO(source_zip)) as archive:
        md,ranges=_assemble(ir,original_manifest,archive,book)
    compact=_compact(ir)
    headings=[];source_map={s['id']:s for s in ir['sourceElements']}
    for candidate in (ir.get('chapterStructure') or {}).get('candidates',[]):
        ident=candidate['headingBlockId']
        block=next((b for b in ir['blocks'] if b['blockId']==ident),None)
        if not block:fail('ECONFLICT','Heading without stable block ID',409)
        source=source_map.get((candidate.get('sourceElementIds') or [None])[0])
        headings.append({'blockId':ident,'text':block['text'],'order':block['readingOrder'],
                         'pdfPage':source['pdfPageNumber'] if source else candidate['pageNumber']})
    md_bytes=md.encode('utf-8')
    index={'kind':'ocr2md/chapter-work-index','schemaVersion':CACHE_SCHEMA,
           'baseGeneration':generation,'book':book,'irSha256':digest(canonical_json(ir)),
           'projectionProfile':'archive-ob-compatible','document':compact,'headings':headings,
           'ranges':ranges}
    # IR SHA uses exact serialized bytes rather than Python key sorting.
    with zipfile.ZipFile(io.BytesIO(source_zip)) as archive:
        index['irSha256']=digest(archive.read('document-ir.v1.json'))
    index_bytes=canonical_json(index)+b'\n'
    stamps={k:_source_stamp(physical,v,book) for k,v in [('pdf',ir['pdf']),('ocr',ir['ocr'])]}
    # Explicit preparation is the trust boundary: full SHA once, never on a cache-hit GET.
    for src in (ir['pdf'],ir['ocr']):
        raw_source=physical/src['path'][len(book)+1:]
        if digest(raw_source.read_bytes())!=src['sha256']:
            fail('ESTALE','OCR/PDF source content differs from immutable DIRjson',409)
    manifest={'kind':'ocr2md/chapter-work-cache','schemaVersion':CACHE_SCHEMA,
              'baseGeneration':generation,'book':book,'indexSha256':digest(index_bytes),
              'mdSha256':digest(md_bytes),'blockCount':len(ranges),
              'sourceStamps':stamps,'profile':'archive-ob-compatible'}
    if len(md_bytes)>MAX_VIEW or len(index_bytes)>MAX_VIEW:fail('EQUOTA','Chapter cache too large',413)
    return {'chapter-index.v1.json':index_bytes,'whole-book.md':md_bytes,
            'manifest.v1.json':canonical_json(manifest)+b'\n'}


def _read_valid(vault,book,physical,pointer):
    sha=pointer['archiveSha256']
    folder=_location(physical,sha)
    if folder.is_symlink() or not folder.is_dir():return None
    paths={name:folder/name for name in ('chapter-index.v1.json','whole-book.md','manifest.v1.json')}
    if any(p.is_symlink() or not p.is_file() for p in paths.values()):return None
    try:
        raw={name:p.read_bytes() for name,p in paths.items()}
        meta=json.loads(raw['manifest.v1.json'])
        index=json.loads(raw['chapter-index.v1.json'])
    except (ValueError,UnicodeError,OSError):return None
    if (meta.get('kind')!='ocr2md/chapter-work-cache' or meta.get('schemaVersion')!=CACHE_SCHEMA or
        meta.get('book')!=book or meta.get('baseGeneration')!=sha or
        meta.get('indexSha256')!=digest(raw['chapter-index.v1.json']) or
        meta.get('mdSha256')!=digest(raw['whole-book.md']) or
        index.get('baseGeneration')!=sha or index.get('book')!=book or
        index.get('irSha256')!=pointer['irSha256'] or
        len(index.get('ranges',[]))!=meta.get('blockCount') or
        len(index.get('document',{}).get('blocks',[]))!=meta.get('blockCount')):return None
    try:
        if any(_source_stamp(physical,{'path':path},book)!=meta['sourceStamps'][name]
               for name,path in [('pdf',index['document']['pdf']['path']),('ocr',index['document']['ocr']['path'])]):return None
    except (KeyError,ValueError,OSError):return None
    return raw


def load_work_cache(vault,book,part='status'):
    if part not in ('status','index','md'):fail('EINVAL','Unsupported chapter cache view')
    with vault.lock:
        book,physical=ensure_book(vault,book)
        pointer,_=read_pointer(vault,book)
        if not pointer:return {'exists':False,'generation':None}
        raw=_read_valid(vault,book,physical,pointer)
        if not raw:return {'exists':False,'generation':pointer['archiveSha256']}
        marks,revision,_=_read_markings(vault,book,pointer)
        result={'exists':True,'generation':pointer['archiveSha256'],
                'irSha256':pointer['irSha256'],'markings':marks,'markingsRevision':revision}
        if part!='status':
            name='chapter-index.v1.json' if part=='index' else 'whole-book.md'
            result['base64']=base64.b64encode(raw[name]).decode('ascii')
            result['sha256']=digest(raw[name])
        return result


def prepare_work_cache(vault,payload):
    with vault.lock:
        book,physical=ensure_book(vault,payload.get('book'))
        expected=payload.get('expectedGeneration')
        if not isinstance(expected,str) or not HEX.fullmatch(expected):fail('EINVAL','Missing DIRjson generation')
        pointer,_=read_pointer(vault,book)
        if not pointer or pointer['archiveSha256']!=expected:fail('ESTALE','DIRjson generation changed',409)
        parent=physical/'.ocr2md'/CACHE_DIR
        dest=_location(physical,expected)
        existing=_read_valid(vault,book,physical,pointer)
        if existing:return {'prepared':True,'alreadyCurrent':True,'generation':expected}
        if dest.exists():fail('ECONFLICT','Existing damaged chapter cache must be inspected before rebuilding',409)
        source=physical/'.ocr2md'/'ir-versions'/(expected+'.zip')
        if source.is_symlink() or not source.is_file():fail('ESTALE','Immutable snapshot unavailable',409)
        data=source.read_bytes()
        if digest(data)!=expected:fail('ECONFLICT','Immutable snapshot failed SHA check',409)
        payloads=build_cache_bytes(book,expected,data,physical,vault.workspace_id)
        if parent.is_symlink() or dest.parent.is_symlink():fail('EACCES','Unsafe cache path',403)
        parent.mkdir(mode=0o700,exist_ok=True)
        dest.parent.mkdir(mode=0o700,exist_ok=True)
        staging=Path(tempfile.mkdtemp(prefix='.chapter-work-stage-',dir=dest.parent))
        try:
            for name,body in payloads.items():
                with open(staging/name,'xb') as f:f.write(body);f.flush();os.fsync(f.fileno())
            if pointer!=read_pointer(vault,book)[0]:fail('ESTALE','DIRjson generation changed during prepare',409)
            os.rename(staging,dest)
            if not _read_valid(vault,book,physical,pointer):fail('ECONFLICT','Chapter cache failed after readback',409)
        finally:
            if staging.exists():shutil.rmtree(staging)
        return {'prepared':True,'alreadyCurrent':False,'generation':expected,
                'bytesWritten':sum(map(len,payloads.values()))}
