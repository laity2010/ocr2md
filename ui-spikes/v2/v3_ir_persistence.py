"""Isolated, versioned IR snapshot store. No generic Vault hidden writes.

Commit model: validate ZIP -> immutable content-addressed generation ->
CAS the small current pointer. Local pointer is the commit boundary.
Remote iCloud replica atomicity is not claimed; readers fail closed if a
pointer arrives before its snapshot. Orphan snapshots are safe.
"""
import base64
import datetime
import hashlib
import io
import json
import os
from pathlib import Path
import re
import stat
import tempfile
import zipfile

from v3_mac_vault import VaultError, fail, logical

MAX_ARCHIVE = 16 * 1024 * 1024
MAX_IR = 10 * 1024 * 1024
MAX_ENTRIES = 64
POINTER = 'ir-current.v1.json'
HEX = re.compile(r'^[a-f0-9]{64}$')

def canonical_json(data):
    return json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')

def digest(data):
    return hashlib.sha256(data).hexdigest()

def ensure_book(vault, book):
    book = logical(book)
    parts = book.strip('/').split('/')
    if len(parts) != 2 or parts[0] != 'ocr2md' or not parts[1] or parts[1].startswith('.'):
        fail('EACCES', 'IR persistence is limited to one authorized book directory', 403)
    path = vault.path(book, existing=True)
    if not path.is_dir():
        fail('ENOTDIR', 'IR parent must be a book directory')
    return book, path

def safe_chapter_member(name):
    if not isinstance(name,str) or not name.startswith('chapters/'):
        return False
    leaf=name[len('chapters/'):]
    return (4<=len(leaf)<=120 and leaf.endswith('.md') and
            not leaf.startswith('.') and not leaf.endswith(' ') and '..' not in leaf and
            not any(c in leaf for c in '/\\:*?"<>|') and
            not any(ord(c)<32 for c in leaf) and bool(leaf[:-3].strip()))

def validate_archive(data, workspace, book):
    if not isinstance(data, bytes) or not 0 < len(data) <= MAX_ARCHIVE:
        fail('EQUOTA', 'IR snapshot exceeds safe size limit', 413)
    try:
        archive = zipfile.ZipFile(io.BytesIO(data))
        members = archive.infolist()
        if len(members) < 3 or len(members) > MAX_ENTRIES:
            fail('EINVAL', 'Invalid number of IR archive members')
        seen = set()
        for member in members:
            name = member.filename
            if (name in seen or name.startswith('/') or '\\' in name or '..' in name or '\x00' in name or
                    not (name in ('document-ir.v1.json', 'document-ir.markdown-manifest.v1.json') or
                         safe_chapter_member(name)) or
                    member.is_dir() or member.compress_type != zipfile.ZIP_STORED or
                    member.file_size > MAX_IR or member.compress_size != member.file_size or
                    ((member.external_attr >> 16) & 0o170000) == stat.S_IFLNK):
                fail('EINVAL', 'Unsafe archive member: '+name[:70])
            seen.add(name)
        if 'document-ir.v1.json' not in seen or 'document-ir.markdown-manifest.v1.json' not in seen:
            fail('EINVAL', 'Missing core IR or manifest')
        parsed_ir = archive.read('document-ir.v1.json')
        if len(parsed_ir) > MAX_IR:fail('EQUOTA', 'IR file too large', 413)
        ir = json.loads(parsed_ir)
        manifest = json.loads(archive.read('document-ir.markdown-manifest.v1.json'))
    except (zipfile.BadZipFile, UnicodeDecodeError, json.JSONDecodeError, KeyError, ValueError) as exc:
        fail('EINVAL', 'Corrupt or invalid IR snapshot: '+str(exc)[:80])
    if (not isinstance(ir, dict) or ir.get('kind') != 'ocr2md/document-ir' or ir.get('schemaVersion') != 1 or
            ir.get('workspaceId') != workspace or
            not isinstance(ir.get('pdf'), dict) or not isinstance(ir.get('ocr'), dict) or
            not isinstance(ir.get('sourceElements'), list) or not isinstance(ir.get('blocks'), list) or
            not isinstance(ir.get('chapters'), list) or
            not isinstance(ir.get('outputMarkdown'), list) or ir['outputMarkdown'] or
            not isinstance(manifest, dict) or manifest.get('kind') != 'ocr2md/ir-markdown-bundle' or
            manifest.get('audit') != 'unreviewed' or manifest.get('generatedFrom') != 'document-ir' or
            manifest.get('sourcePdf') != ir['pdf'] or manifest.get('sourceOcr') != ir['ocr'] or
            manifest.get('irSha256') != digest(parsed_ir) or
            not isinstance(manifest.get('files'), list) or
            not isinstance(manifest.get('warnings'), list)):
        fail('EINVAL', 'Snapshot lacks canonical IR binding')
    pdf = ir['pdf'];ocr = ir['ocr']
    for src in (pdf, ocr):
        if (not isinstance(src.get('path'), str) or not src['path'].startswith(book+'/') or
                not HEX.fullmatch(str(src.get('sha256', '')))):
            fail('EACCES', 'Snapshot contains source outside authorized book', 403)
    if pdf['path'] == ocr['path'] or not pdf['path'].lower().endswith('.pdf') or not ocr['path'].lower().endswith('.json'):
        fail('EINVAL', 'Invalid IR source extension')
    files=manifest['files'];expected={'document-ir.v1.json','document-ir.markdown-manifest.v1.json'}
    if not files or len(files) > MAX_ENTRIES-2:fail('EINVAL','Invalid generated chapter manifest')
    block_ids={b.get('blockId') for b in ir['blocks'] if isinstance(b,dict)}
    if len(block_ids)!=len(ir['blocks']) or any(not isinstance(x,str) for x in block_ids):
        fail('EINVAL','Repeated logical block IDs')
    # New snapshots explicitly distinguish an unconfirmed whole-book OCR draft
    # from human-reviewed chapter outputs. Old snapshots (without this field)
    # remain readable for backwards compatibility with WP7.
    projection=manifest.get('projectionState')
    if projection not in (None,'whole-book-unreviewed','chapter-files-for-cleaning','confirmed-chapters'):
        fail('EINVAL','Unknown chapter approval state')
    # A file boundary is independent from an IR heading hierarchy level.
    # This metadata cannot silently rewrite chapter parents/depth or OCR evidence.
    layout=ir.get('chapterFileLayout',[])
    if not isinstance(layout,list):fail('EINVAL','Invalid chapter file layout')
    seen_cuts=set()
    for cut in layout:
        if (not isinstance(cut,dict) or not isinstance(cut.get('blockId'),str) or
            cut['blockId'] in seen_cuts or not isinstance(cut.get('standalone'),bool) or
            (cut.get('fileName') is not None and (not isinstance(cut['fileName'],str) or
              not safe_chapter_member('chapters/'+cut['fileName'])))):
            fail('EINVAL','Invalid independent file cut')
        seen_cuts.add(cut['blockId'])
    if any(not any(b.get('blockId')==cut['blockId'] and b.get('type')=='title'
                   for b in ir['blocks']) for cut in layout):
        fail('EINVAL','Independent file cut does not reference a real title')
    if projection=='whole-book-unreviewed':
        if len(files)!=1 or files[0].get('path')!=book+'/ir-generated/whole-book-draft.md':
            fail('EINVAL','Unconfirmed chapter state must contain one unsplit book')
        indexed=[r.get('blockId') for r in files[0].get('ranges',[]) if isinstance(r,dict)]
        ordered=[b.get('blockId') for b in sorted(ir['blocks'],key=lambda b:b.get('readingOrder',0))]
        if indexed!=ordered:fail('EINVAL','Whole-book draft must preserve reading order')
    elif projection in ('chapter-files-for-cleaning','confirmed-chapters'):
        review=ir.get('chapterStructure') or {}
        if projection=='confirmed-chapters' and (not review.get('candidates') or
            any(c.get('status')!='confirmed' for c in review['candidates'])):
            fail('EINVAL','Confirmed chapter publication still has unreviewed OCR headings')
        # File cuts are a separate workflow: every output root is named, but
        # OCR title candidates may remain needs-review for subsequent cleaning.
        if (any(not c.get('fileName') and not any(cut['blockId']==c.get('anchorBlockId') and not cut['standalone']
            for cut in layout) for c in ir['chapters'] if c.get('parentChapterId') is None) or
            any(not cut.get('fileName') for cut in layout if cut['standalone'])):
            fail('EINVAL','Independent chapter file boundary lacks a filename')
    manual={}
    for m in ir.get('manualHeadings',[]):
        if (not isinstance(m,dict) or not isinstance(m.get('blockId'),str) or
            m.get('blockId') in manual or m.get('method')!='manual-pdf-page' or
            not isinstance(m.get('pdfPageNumber'),int) or
            not 1<=m['pdfPageNumber']<=len(ir.get('pages',[])) or
            not isinstance(m.get('detail'),str) or not m['detail'].strip() or
            not isinstance(m.get('afterBlockId'),str)):
            fail('EINVAL','Invalid manual heading provenance')
        manual[m['blockId']]=m
    transcribed={}
    for m in ir.get('manualTexts',[]):
        if (not isinstance(m,dict) or not isinstance(m.get('blockId'),str) or
            m.get('blockId') in transcribed or m.get('blockId') in manual or
            m.get('method')!='manual-pdf-page' or
            not isinstance(m.get('pdfPageNumber'),int) or
            not 1<=m['pdfPageNumber']<=len(ir.get('pages',[])) or
            not isinstance(m.get('detail'),str) or not m['detail'].strip() or
            not isinstance(m.get('afterBlockId'),str)):
            fail('EINVAL','Invalid manual PDF body provenance')
        transcribed[m['blockId']]=m
    blocks={b.get('blockId'):b for b in ir['blocks']}
    for id,m in manual.items():
        if (id not in blocks or m['afterBlockId'] not in blocks or
            blocks[id].get('type')!='title' or blocks[id].get('sources')!=[] or
            blocks[id].get('readingOrder',-1)<=blocks[m['afterBlockId']].get('readingOrder',-1)):
            fail('EINVAL','Manual title lacks an honest in-book anchor')
    for id,m in transcribed.items():
        if (id not in blocks or m['afterBlockId'] not in blocks or
            blocks[id].get('type')!='text' or blocks[id].get('sources')!=[] or
            blocks[id].get('readingOrder',-1)<=blocks[m['afterBlockId']].get('readingOrder',-1)):
            fail('EINVAL','Manual body lacks an honest PDF page anchor')
    if any(b.get('sources')==[] and id not in manual and id not in transcribed for id,b in blocks.items()):
        fail('EINVAL','Source-less OCR block is not an explicit manual heading')
    manual_all={**manual,**transcribed}
    covered=set()
    for f in files:
        if not isinstance(f,dict) or not isinstance(f.get('path'),str) or not f['path'].startswith(book+'/ir-generated/'):
            fail('EINVAL','Incorrect generated Markdown path')
        name='chapters/'+Path(f['path']).name
        expected.add(name)
        if name not in seen:fail('EINVAL','Missing referenced Markdown file')
        body=archive.read(name)
        if digest(body)!=f.get('sha256'):fail('EINVAL','Markdown SHA mismatch')
        if f.get('status')!='provisional' or not isinstance(f.get('ranges'),list):
            fail('EINVAL','Invalid Markdown index')
        content=body.decode('utf-8')
        for r in f['ranges']:
            if not isinstance(r,dict):fail('EINVAL','Bad index range')
            b=r.get('blockId');start=r.get('from');end=r.get('to');middle=r.get('contentFrom');finish=r.get('contentTo')
            if (b in covered or b not in block_ids or r.get('audit')!='unreviewed' or
                    any(not isinstance(x,int) or isinstance(x,bool) for x in (start,end,middle,finish)) or
                    not 0<=start<middle<finish<=end<=len(content.encode('utf-16-le'))//2 or
                    not isinstance(r.get('evidence'), list) or
                    (not r['evidence'] and not (b in manual_all and
                        r.get('manualPdfPage')==manual_all[b]['pdfPageNumber'] and
                        r.get('pdfPages')==[manual_all[b]['pdfPageNumber']])) or
                    (r['evidence'] and b in manual_all) or
                    (b not in manual_all and 'manualPdfPage' in r)):
                fail('EINVAL','Markdown source index invalid')
            covered.add(b)
    if expected!=seen or covered!=block_ids:
        fail('EINVAL','Snapshot has extra members or missing/duplicated logical blocks')
    if not HEX.fullmatch(manifest['irSha256']):fail('EINVAL','IR SHA invalid')
    return ir,manifest

def read_pointer(vault,book):
    dest=vault.path(book+'/.ocr2md/'+POINTER)
    if not dest.exists():return None,None
    if not dest.is_file():fail('EACCES','IR pointer is not regular file',403)
    node=vault.metadata(book+'/.ocr2md/'+POINTER)
    try:p=json.loads(dest.read_text('utf-8'))
    except (ValueError, UnicodeDecodeError):fail('ECONFLICT','Corrupt IR pointer',409)
    after=vault.metadata(book+'/.ocr2md/'+POINTER)
    if after['revision']!=node['revision'] or after['nodeId']!=node['nodeId']:
        fail('ESTALE','IR pointer changed during read',409)
    if (not isinstance(p,dict) or p.get('kind')!='ocr2md/ir-pointer' or p.get('schemaVersion')!=1 or
            p.get('book')!=book or not HEX.fullmatch(str(p.get('archiveSha256',''))) or
            not HEX.fullmatch(str(p.get('irSha256','')))):
        fail('ECONFLICT','IR pointer integrity invalid',409)
    return p,node

def immutable_snapshot(vault,book,sha,data):
    parent=vault.path(book+'/.ocr2md')
    if not parent.exists():parent.mkdir(mode=0o700)
    if parent.is_symlink() or not parent.is_dir():fail('EACCES','Metadata path invalid',403)
    store=parent/'ir-versions'
    if not store.exists():store.mkdir(mode=0o700)
    if store.is_symlink() or not store.is_dir():fail('EACCES','IR snapshot directory invalid',403)
    file=store/(sha+'.zip')
    if file.exists():
        if not file.is_file() or digest(file.read_bytes())!=sha:
            fail('ECONFLICT','Existing immutable snapshot mismatch',409)
        return
    with tempfile.NamedTemporaryFile(prefix='.ocr2md-ir-',dir=store,delete=False) as f:
        temp=Path(f.name);f.write(data);f.flush();os.fsync(f.fileno())
    try:
        try:os.link(temp,file,follow_symlinks=False)
        except FileExistsError:
            if digest(file.read_bytes())!=sha:fail('ECONFLICT','Snapshot collision',409)
    finally:temp.unlink(missing_ok=True)
    assert digest(file.read_bytes())==sha
    # Best-effort directory sync; iCloud cannot provide distributed transactions.
    fd=os.open(store,os.O_RDONLY)
    try:os.fsync(fd)
    except OSError:pass
    finally:os.close(fd)

def generated_version_dir(vault,book,sha):
    book_dir=vault.path(book,existing=True)
    return book_dir/'ir-generated'/'versions'/sha

def verify_materialized(vault,book,sha,archive):
    directory=generated_version_dir(vault,book,sha)
    if directory.is_symlink() or not directory.is_dir():return False
    expected={info.filename.split('/',1)[-1]:archive.read(info.filename)
              for info in archive.infolist() if info.filename.startswith('chapters/')}
    expected['document-ir.markdown-manifest.v1.json']=archive.read('document-ir.markdown-manifest.v1.json')
    if len(expected)+1!=len(list(directory.iterdir())):return False
    if not (directory/'README.md').is_file():return False
    for name,body in expected.items():
        file=directory/name
        if file.is_symlink() or not file.is_file() or digest(file.read_bytes())!=digest(body):return False
    return True

def materialize_version(vault,book,sha,data):
    """Make immutable Obsidian-readable MD copies before publishing pointer.

    The generated directory is versioned by the archive digest; readers must
    use the pointer to choose the current generation, never the newest mtime.
    """
    directory=generated_version_dir(vault,book,sha)
    root=directory.parent.parent
    if root.is_symlink():fail('EACCES','Generated MD root is a symlink',403)
    if not root.exists():root.mkdir(mode=0o755)
    versions=root/'versions'
    if versions.is_symlink():fail('EACCES','Generated versions is a symlink',403)
    if not versions.exists():versions.mkdir(mode=0o755)
    archive=zipfile.ZipFile(io.BytesIO(data))
    if directory.exists():
        if not verify_materialized(vault,book,sha,archive):
            fail('ECONFLICT','Existing generated version differs from immutable archive',409)
        return
    staging=Path(tempfile.mkdtemp(prefix='.ocr2md-ir-staging-',dir=versions))
    try:
        for info in archive.infolist():
            if info.filename.startswith('chapters/'):
                target=staging/info.filename.split('/',1)[-1]
            elif info.filename=='document-ir.markdown-manifest.v1.json':
                target=staging/'document-ir.markdown-manifest.v1.json'
            else:continue
            with open(target,'xb') as out:
                out.write(archive.read(info.filename))
                out.flush();os.fsync(out.fileno())
        readme=staging/'README.md'
        manifest=json.loads(archive.read('document-ir.markdown-manifest.v1.json'))
        draft=manifest.get('projectionState')=='whole-book-unreviewed'
        with open(readme,'xb') as out:
            out.write((('# DIRjson 全书连续草稿 · 章节尚未人工定界\n\n'
                        if draft else '# DIRjson 已定界章节 · OCR 正文仍待校对\n\n')+
                       '此处是来源可溯的 OCR 草稿，不代表任何原文校对已通过。'
                       '不要直接编辑生成文件；请在 V3 章节定界工作台编辑 DIRjson。\n'
                       '其他版本保留用于恢复；当前版本以 .ocr2md/ir-current.v1.json 为准。\n').encode('utf-8'))
            out.flush();os.fsync(out.fileno())
        # Publication itself is one directory rename after every file is durable.
        if directory.exists():fail('EEXIST','Another generated version was created',409)
        os.rename(staging,directory)
        with zipfile.ZipFile(io.BytesIO(data)) as check:
            if not verify_materialized(vault,book,sha,check):
                fail('ECONFLICT','Published Markdown read-back mismatch',409)
        try:
            fd=os.open(versions,os.O_RDONLY)
            try:os.fsync(fd)
            finally:os.close(fd)
        except OSError:pass
    finally:
        if staging.exists():
            import shutil
            shutil.rmtree(staging)

# Lightweight, versioned chapter-file markings. Immutable OCR evidence and
# published Markdown archives remain untouched until explicit Publish.
# The historical sidecar remains readable, but every new Save commits an
# autonomous start/end/file map. Neither format changes the base DIRjson.
MARKINGS_FILE = 'chapters-map.v1.json'
LEGACY_MARKINGS_FILE = 'ir-markings.v1.json'
MAX_MARKINGS = 48 * 1024

def _read_markings(vault, book, pointer):
    for filename, kind, version in ((MARKINGS_FILE,'ocr2md/chapters-map',1),
                                    (LEGACY_MARKINGS_FILE,'ocr2md/ir-markings',1)):
        logical_path=book+'/.ocr2md/'+filename
        path=vault.path(logical_path)
        if not path.exists():continue
        if path.is_symlink() or not path.is_file():fail('EACCES','章节映射文件不安全',403)
        before=vault.metadata(logical_path)
        try:
            raw=path.read_bytes()
            if len(raw)>MAX_MARKINGS:fail('EQUOTA','章节映射超出限额',413)
            stored=json.loads(raw)
        except (UnicodeError,ValueError,TypeError):fail('ECONFLICT','章节映射记录损坏',409)
        after=vault.metadata(logical_path)
        if before['revision']!=after['revision'] or before['nodeId']!=after['nodeId']:
            fail('ESTALE','章节映射读取期间被修改',409)
        if not isinstance(stored,dict) or stored.get('kind')!=kind or stored.get('schemaVersion')!=version or stored.get('book')!=book:
            fail('ECONFLICT','章节映射版本或来源错误',409)
        if stored.get('baseGeneration')!=(pointer['archiveSha256'] if pointer else None):
            # A new map of the previous DIRjson generation must not let the
            # old sidecar silently resurface after a later pointer update.
            return None,'',before
        marks=stored.get('markings')
        if not isinstance(marks,dict):fail('ECONFLICT','章节映射内容无效',409)
        return marks,before['revision'],before
    return None,'',None

def _validate_markings(ir,marks):
    if isinstance(marks,dict) and set(marks)=={'segments'}:
        segments=marks['segments']
        if not isinstance(segments,list) or not 1<=len(segments)<=512:
            fail('EQUOTA','章节映射数量无效',413)
        blocks=sorted(ir['blocks'],key=lambda b:b['readingOrder'])
        positions={b['blockId']:i for i,b in enumerate(blocks)}
        titles={b['blockId'] for b in blocks if b['type']=='title'}
        synthetic_roots={ch['anchorBlockId'] for ch in ir['chapters']
            if ch.get('parentChapterId') is None and ch.get('anchorBlockId')}
        allowed=titles|synthetic_roots
        if not blocks or blocks[0]['blockId'] not in allowed:
            fail('EINVAL','DIRjson 首块不是可定界章节起点')
        cursor=0;seen=set()
        for i,seg in enumerate(segments):
            if not isinstance(seg,dict) or set(seg)!={'startBlockId','endBlockId','fileName'}:
                fail('EINVAL','章节映射只允许起始块、结束块和目标文件名')
            start=positions.get(seg['startBlockId']) if isinstance(seg['startBlockId'],str) else None
            end=positions.get(seg['endBlockId']) if isinstance(seg['endBlockId'],str) else None
            name=seg['fileName']
            if (not isinstance(name,str) or start is None or end is None or start!=cursor or end<start or
                seg['startBlockId'] not in allowed or not safe_chapter_member('chapters/'+str(name)) or
                name.casefold() in seen):
                fail('EINVAL','章节映射必须连续、从标题起始、文件名唯一')
            cursor=end+1;seen.add(name.casefold())
        if cursor!=len(blocks):fail('EINVAL','章节映射不能漏掉或重复原文块')
        return
    if not isinstance(marks,dict) or set(marks)!={'layout','chapterNames','operations'}:
        fail('EINVAL','标定只能修改文件边界、章节文件名及编号历史')
    layout=marks['layout'];names=marks['chapterNames'];operations=marks['operations']
    if (not isinstance(layout,list) or not isinstance(names,list) or not isinstance(operations,list)
            or len(layout)>512 or len(names)>512 or len(operations)>512):
        fail('EQUOTA','章节标定数量超出安全限制',413)
    titles=sorted((b for b in ir['blocks'] if b.get('type')=='title'),key=lambda b:b.get('readingOrder',0))
    title_ids=[b['blockId'] for b in titles]
    if len(layout)!=len(titles) or [x.get('blockId') for x in layout if isinstance(x,dict)]!=title_ids:
        fail('EINVAL','章节标定必须完整对应原始标题顺序')
    seen=set()
    for idx,entry in enumerate(layout):
        if (set(entry)-{'blockId','standalone','fileName'} or not isinstance(entry.get('standalone'),bool)
                or (idx==0 and not entry['standalone']) or
                (entry.get('fileName') is not None and not safe_chapter_member('chapters/'+str(entry['fileName'])))):
            fail('EINVAL','非法的独立成章边界或文件名')
        if entry['standalone']:
            name=entry.get('fileName')
            if not name or name.casefold() in seen:fail('EINVAL','独立章节文件名缺失或重复')
            seen.add(name.casefold())
    chapter_ids={ch['chapterId'] for ch in ir['chapters']}
    if len(names)!=len(chapter_ids) or {v.get('chapterId') for v in names if isinstance(v,dict)}!=chapter_ids:
        fail('EINVAL','章节文件名必须对应原始章节集合')
    for entry in names:
        if set(entry)-{'chapterId','fileName'}:fail('EINVAL','未知章节标定字段')
        name=entry.get('fileName')
        if name is not None and not safe_chapter_member('chapters/'+str(name)):
            fail('EINVAL','非法章节文件名')
    existing_ids={op['operationId'] for op in (ir.get('chapterStructure') or {}).get('operations',[])}
    for op in operations:
        if not isinstance(op,dict) or op.get('kind')!='assign-sequence' or op.get('mode')!='explicit' or not isinstance(op.get('operationId'),str) or op['operationId'] in existing_ids or not isinstance(op.get('chapterIds'),list) or not isinstance(op.get('detail'),str) or set(op)-{'operationId','kind','chapterIds','detail','mode'}:
            fail('EINVAL','标定历史只能追加章节顺序编号操作')
        if any(ch not in chapter_ids and not (isinstance(ch,str) and re.fullmatch(r'ch_[0-9a-f]{24}',ch)) for ch in op['chapterIds']):
            fail('EINVAL','标定历史引用无效章节')
        existing_ids.add(op['operationId'])

def _overlay_chapter_map(base,marks):
    """Derive an ephemeral publish view. Never mutate the stored Document IR."""
    import copy
    doc=copy.deepcopy(base)
    if 'segments' in marks:
        starts={s['startBlockId']:s['fileName'] for s in marks['segments']}
        doc['chapterFileLayout']=[{'blockId':b['blockId'],
            'standalone':b['blockId'] in starts,
            **({'fileName':starts[b['blockId']]} if b['blockId'] in starts else {})}
            for b in sorted(doc['blocks'],key=lambda x:x['readingOrder']) if b['type']=='title']
        for ch in doc['chapters']:
            ch.pop('fileName',None)
            if ch.get('anchorBlockId') in starts:
                ch['fileName']=starts[ch['anchorBlockId']]
    else:
        # Read-only backwards compatibility; the next Save writes segments.
        doc['chapterFileLayout']=marks['layout']
        names={ch['chapterId']:ch['fileName'] for ch in marks['chapterNames']}
        for ch in doc['chapters']:
            ch.pop('fileName',None)
            if names.get(ch['chapterId']):ch['fileName']=names[ch['chapterId']]
        doc['chapterStructure']['operations'].extend(marks['operations'])
    return doc

def load_markings(vault,book):
    with vault.lock:
        book,physical=ensure_book(vault,book)
        pointer,_=read_pointer(vault,book)
        if pointer is None:return {'exists':False,'generation':None,'revision':'','markings':None}
        marks,revision,_=_read_markings(vault,book,pointer)
        return {'exists':marks is not None,'generation':pointer['archiveSha256'],
                'revision':revision,'markings':marks}

def save_markings(vault,payload):
    with vault.lock:
        book,physical=ensure_book(vault,payload.get('book'))
        expected=payload.get('expectedGeneration');rev=payload.get('expectedRevision')
        request=payload.get('requestId');marks=payload.get('markings')
        overwrite=payload.get('overwrite',False)
        if type(overwrite) is not bool:fail('EINVAL','覆盖标定标志必须是布尔值')
        if not isinstance(expected,str) or not HEX.fullmatch(expected) or not isinstance(rev,str) or len(rev)>256 or not isinstance(request,str) or not 8<=len(request)<=100:
            fail('EINVAL','标定事务缺少版本或请求标识')
        pointer,_=read_pointer(vault,book)
        if not pointer or pointer['archiveSha256']!=expected:
            fail('ESTALE','基准 DIRjson 版本已改变；拒绝覆盖',409)
        current,current_revision,node=_read_markings(vault,book,pointer)
        # Retried identical request after a lost HTTP response is idempotent.
        # The idempotency key never overrides another writer's CAS revision.
        if current is not None and current==marks:
            active=MARKINGS_FILE if vault.path(book+'/.ocr2md/'+MARKINGS_FILE).exists() else LEGACY_MARKINGS_FILE
            stored=json.loads(vault.path(book+'/.ocr2md/'+active).read_bytes())
            if stored.get('requestId')==request:
                return {'committed':True,'alreadyCurrent':True,'generation':expected,
                        'revision':current_revision,'bytesWritten':0,
                        'generatedVersionPath':pointer['generatedVersionPath']}
        if current_revision!=rev and not overwrite:
            fail('ESTALE','章节标定已在其他设备修改；请重新载入',409)
        raw=physical/'.ocr2md'/'ir-versions'/(expected+'.zip')
        if raw.is_symlink() or not raw.is_file() or digest(raw.read_bytes())!=expected:
            fail('ESTALE','标定基准版本缺失',409)
        base=json.loads(zipfile.ZipFile(raw).read('document-ir.v1.json'))
        # A tiny marking commit remains anchored to the exact OCR/PDF evidence.
        # Reject stale source rather than allowing a valid sidecar over changed input.
        for original_source in (base['pdf'],base['ocr']):
            src=vault.path(original_source['path'],existing=True)
            if src.is_symlink() or not src.is_file() or digest(src.read_bytes())!=original_source['sha256']:
                fail('ESTALE','源 PDF/OCR 已改变，拒绝保存过期标定',409)
        if not isinstance(marks,dict) or set(marks)!={'segments'}:
            fail('EINVAL','只能保存新版章节起止块映射；旧文件请先加载再保存')
        _validate_markings(base,marks)
        stored={'kind':'ocr2md/chapters-map','schemaVersion':1,'book':book,
                'baseGeneration':expected,'requestId':request,'markings':marks}
        data=canonical_json(stored)+b'\n'
        if len(data)>MAX_MARKINGS:fail('EQUOTA','标定记录超出 48KiB',413)
        target_name=book+'/.ocr2md/'+MARKINGS_FILE
        target=vault.path(target_name)
        if target.exists():
            # A new file created during legacy migration cannot be replaced
            # using the old sidecar's revision. Never mix two file identities.
            if not node or node['path']!=target_name:
                fail('ESTALE','新版章节映射已被并发创建，请重新载入',409)
            fresh=vault.metadata(target_name)
            if fresh['revision']!=node['revision'] or fresh['nodeId']!=node['nodeId']:
                fail('ESTALE','章节映射修订号已变化，请重新载入',409)
            if current==marks:
                return {'committed':True,'alreadyCurrent':True,'generation':expected,
                        'revision':current_revision,'bytesWritten':0,
                        'generatedVersionPath':pointer['generatedVersionPath']}
            if not vault.coordinated_replace_supported():fail('EUNSUPPORTED','Mac 原生 CAS 不可用',409)
            # Explicit Save may supersede a stale file revision, but never
            # discard the previous map. Backup must finish BEFORE replacement.
            old=target.read_bytes()
            after=vault.metadata(target_name)
            if after['revision']!=node['revision'] or after['nodeId']!=node['nodeId']:
                fail('ESTALE','备份期间章节映射发生变化',409)
            backups=physical/'.ocr2md'/'chapters-map-backups'
            if backups.is_symlink():fail('EACCES','章节映射备份目录不可为符号链接',403)
            backups.mkdir(mode=0o700,exist_ok=True)
            if not backups.is_dir():fail('EACCES','章节映射备份路径无效',403)
            import secrets
            timestamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
            backup=backups/(timestamp+'-'+digest(old)[:12]+'-'+secrets.token_hex(3)+'.json')
            with open(backup,'xb') as out:
                out.write(old);out.flush();os.fsync(out.fileno())
            if backup.read_bytes()!=old:fail('ECONFLICT','章节映射覆盖前备份未通过读回',409)
            vault.coordinated_sidecar_replace(target,data,node['revision'])
        else:
            vault.create_file(target,data)
        saved,revision,_=_read_markings(vault,book,pointer)
        if saved!=marks or revision=='':fail('ECONFLICT','标定保存后读回失败',409)
        return {'committed':True,'generation':expected,'revision':revision,
                'bytesWritten':len(data),'generatedVersionPath':pointer['generatedVersionPath']}

def save_snapshot(vault, payload):
    with vault.lock:
        book,physical=ensure_book(vault,payload.get('book'))
        request=payload.get('requestId');expected=payload.get('expectedGeneration')
        if (not isinstance(request,str) or not 1<=len(request)<=256 or
                (expected is not None and (not isinstance(expected,str) or not HEX.fullmatch(expected)))):
            fail('EINVAL','Invalid request or expected generation')
        try:data=base64.b64decode(payload.get('archiveBase64',''),validate=True)
        except (ValueError, TypeError):fail('EINVAL','Invalid archive encoding')
        ir,manifest=validate_archive(data,vault.workspace_id,book)
        current,node=read_pointer(vault,book)
        _,mark_revision,_=_read_markings(vault,book,current) if current else (None,'',None)
        if mark_revision!=payload.get('expectedMarkingsRevision',''):
            fail('ESTALE','章节标定记录已经变更，请重新载入再保存',409)
        archive_sha=digest(data)
        if current and current.get('requestId')==request and current['archiveSha256']==archive_sha:
            return {'committed':True,'generation':archive_sha,'alreadyCurrent':True,'pointerRevision':node['revision'],
                    'generatedVersionPath':book+'/ir-generated/versions/'+archive_sha}
        if (current['archiveSha256'] if current else None)!=expected:
            fail('ESTALE','IR pointer changed; reload and reconcile before saving',409)
        # Validate both immutable input sources immediately before pointer CAS.
        for source in (ir['pdf'],ir['ocr']):
            source_path=vault.path(source['path'],existing=True)
            if not source_path.is_file() or source_path.is_symlink() or digest(source_path.read_bytes())!=source['sha256']:
                fail('ESTALE','Original PDF/OCR source changed',409)
        if current and current['archiveSha256']==archive_sha:
            return {'committed':True,'generation':archive_sha,'alreadyCurrent':True,'pointerRevision':node['revision'],
                    'generatedVersionPath':book+'/ir-generated/versions/'+archive_sha}
        # No native file coordination? Fail closed before writing any generated state
        # when the active pointer exists. Initial pointer uses create/no-replace.
        if node and not vault.coordinated_replace_supported():
            fail('EUNSUPPORTED','Native CAS coordinator unavailable',409)
        immutable_snapshot(vault,book,archive_sha,data)
        materialize_version(vault,book,archive_sha,data)
        # A source modified during large snapshot materialization must NEVER
        # become a published current IR version.
        for source in (ir['pdf'],ir['ocr']):
            if digest(vault.path(source['path'],existing=True).read_bytes())!=source['sha256']:
                fail('ESTALE','Original OCR/PDF changed during publication',409)
        pointer={'kind':'ocr2md/ir-pointer','schemaVersion':1,'book':book,
                 'requestId':request,
                 'generatedVersionPath':book+'/ir-generated/versions/'+archive_sha,
                 'archiveSha256':archive_sha,'irSha256':manifest['irSha256'],
                 'pdfSha256':ir['pdf']['sha256'],'ocrSha256':ir['ocr']['sha256'],
                 'previousGeneration':current['archiveSha256'] if current else None,
                 'createdAt':datetime.datetime.now(datetime.timezone.utc).isoformat()}
        body=canonical_json(pointer)+b'\n'
        dest=vault.path(book+'/.ocr2md/'+POINTER)
        if node:
            vault.coordinated_sidecar_replace(dest,body,node['revision'])
        else:vault.create_file(dest,body)
        saved,revision=read_pointer(vault,book)
        if saved!=pointer or digest((dest.parent/'ir-versions'/(archive_sha+'.zip')).read_bytes())!=archive_sha:
            fail('ECONFLICT','Committed IR did not survive read-back',409)
        return {'committed':True,'generation':archive_sha,'alreadyCurrent':False,'pointerRevision':revision['revision'],
                'generatedVersionPath':pointer['generatedVersionPath']}

def load_snapshot(vault,book):
    with vault.lock:
        book,_=ensure_book(vault,book)
        pointer,node=read_pointer(vault,book)
        if pointer is None:return {'exists':False,'generation':None}
        sha=pointer['archiveSha256']
        filename=vault.path(book+'/.ocr2md').joinpath('ir-versions',sha+'.zip')
        if filename.parent.is_symlink() or filename.is_symlink() or not filename.is_file():
            fail('ESTALE','IR pointer exists but immutable version has not synchronized yet',409)
        raw=filename.read_bytes()
        if digest(raw)!=sha:fail('ECONFLICT','Snapshot checksum mismatch',409)
        ir,manifest=validate_archive(raw,vault.workspace_id,book)
        if pointer.get('generatedVersionPath')!=book+'/ir-generated/versions/'+sha:
            fail('ECONFLICT','Pointer references incorrect generated Markdown path',409)
        if not verify_materialized(vault,book,sha,zipfile.ZipFile(io.BytesIO(raw))):
            fail('ESTALE','Obsidian-readable Markdown version incomplete or not yet synchronized',409)
        if pointer['irSha256']!=manifest['irSha256']:
            fail('ECONFLICT','Pointer mismatches snapshot',409)
        # A source can change after save. Return it with a stale-source flag, but
        # NEVER silently treat the snapshot as current OCR.
        source_current=all(vault.path(s['path']).is_file() and digest(vault.path(s['path']).read_bytes())==s['sha256']
                           for s in (ir['pdf'],ir['ocr']))
        marks,mark_revision,_=_read_markings(vault,book,pointer)
        if marks is not None:_validate_markings(ir,marks)
        return {'exists':True,'generation':sha,'markings':marks,'markingsRevision':mark_revision,
                'pointerRevision':node['revision'],
                'generatedVersionPath':pointer['generatedVersionPath'],
                'parentGeneration':pointer.get('previousGeneration'),'sourcesCurrent':source_current,
                'irBase64':base64.b64encode(zipfile.ZipFile(io.BytesIO(raw)).read('document-ir.v1.json')).decode('ascii')}

# Publication is deliberately separate from the immutable DIRjson snapshot.
# chapters/ contains editable MD. Explicit Publish now replaces a previous
# publication with a canonical snapshot and retains the entire old directory
# in .ocr2md/chapter-backups/ before the final rename.
PUBLISH_MARKER = '.ocr2md-published.v1.json'

def publish_chapters(vault, payload, *, projected_archive=None):
    import shutil
    with vault.lock:
        book, physical = ensure_book(vault, payload.get('book'))
        requested = payload.get('expectedGeneration')
        if not isinstance(requested, str) or not HEX.fullmatch(requested):
            fail('EINVAL', '请先保存并确认当前 DIRjson 版本')
        pointer, _ = read_pointer(vault, book)
        if not pointer or pointer['archiveSha256'] != requested:
            fail('ESTALE', 'DIRjson 当前保存版本已改变；先重新载入再发布', 409)
        archive_path = physical/'.ocr2md'/'ir-versions'/(requested+'.zip')
        if (archive_path.parent.is_symlink() or archive_path.is_symlink() or
            not archive_path.is_file()):
            fail('ESTALE', '已保存的 DIRjson 版本不可读取', 409)
        base_raw = archive_path.read_bytes()
        if digest(base_raw) != requested:
            fail('ECONFLICT', 'DIRjson 快照校验失败', 409)
        # Publishing may use an in-memory projection with separate chapter
        # boundaries. The original archive and current pointer stay untouched.
        raw = projected_archive if projected_archive is not None else base_raw
        ir, manifest = validate_archive(raw, vault.workspace_id, book)
        if manifest.get('projectionState') not in ('confirmed-chapters','chapter-files-for-cleaning'):
            fail('EINVAL', '章节文件未完成定界或命名，不能发布全书待审核草稿')
        if not verify_materialized(vault, book, requested, zipfile.ZipFile(io.BytesIO(base_raw))):
            fail('ESTALE', '章节版本尚未完整同步；请先保存并重试', 409)
        for source in (ir['pdf'], ir['ocr']):
            src = vault.path(source['path'], existing=True)
            if not src.is_file() or src.is_symlink() or digest(src.read_bytes()) != source['sha256']:
                fail('ESTALE', '原 PDF/OCR 已改变，不允许发布过期章节', 409)
        with zipfile.ZipFile(io.BytesIO(raw)) as archive:
            chapters = {info.filename[len('chapters/'):]: archive.read(info.filename)
                        for info in archive.infolist() if info.filename.startswith('chapters/')}
        if not chapters or 'whole-book-draft.md' in chapters:
            fail('EINVAL', '没有可发布的人工定界章节文件')
        if len({name.casefold() for name in chapters}) != len(chapters):
            fail('EINVAL', '章节文件名大小写冲突')
        marker = {'kind':'ocr2md/editable-chapters-publication','schemaVersion':1,
                  'book':book,'sourceGeneration':requested,
                  'files':{name:digest(data) for name,data in sorted(chapters.items())}}
        marker_bytes = canonical_json(marker)+b'\n'
        destination = physical/'chapters'
        if destination.is_symlink():
            fail('EACCES', 'chapters 不能是符号链接', 403)
        existing_marker=None
        if destination.exists():
            if not destination.is_dir():fail('EEXIST','chapters 路径被文件占用',409)
            marker_path=destination/PUBLISH_MARKER
            # Only replace a directory that this project has actually
            # published before. Unmanaged folders remain protected.
            if marker_path.is_symlink() or not marker_path.is_file():
                fail('EEXIST','chapters/ 不是 OCR2MD 的已发布目录，拒绝覆盖',409)
            try:existing_marker=json.loads(marker_path.read_bytes())
            except (ValueError,UnicodeDecodeError):
                fail('ECONFLICT','chapters 发布标记损坏；拒绝覆盖',409)
            if (existing_marker.get('kind')!='ocr2md/editable-chapters-publication'
                    or existing_marker.get('book')!=book
                    or not isinstance(existing_marker.get('files'),dict)):
                fail('EACCES','章节目录不属于本书已发布成果',403)
            if (existing_marker==marker and
                    all((destination/name).is_file() and
                        not (destination/name).is_symlink() and
                        digest((destination/name).read_bytes())==digest(body)
                        for name,body in chapters.items()) and
                    {path.name for path in destination.iterdir()
                     if path.name.endswith('.md')}==set(chapters)):
                return {'published':True,'alreadyPublished':True,'overwritten':False,
                        'count':len(chapters),'path':book+'/chapters',
                        'generation':requested,'backupPath':None}
        # Complete staging first, so failed generation cannot damage any
        # existing chapter. The prior directory will be renamed into a
        # timestamped lossless backup rather than destroyed.
        staging=Path(tempfile.mkdtemp(prefix='.ocr2md-chapters-staging-',dir=physical))
        try:
            for name, data in chapters.items():
                if not safe_chapter_member('chapters/'+name):
                    fail('EINVAL','非法章节文件名')
                with open(staging/name,'xb') as out:
                    out.write(data);out.flush();os.fsync(out.fileno())
            with open(staging/PUBLISH_MARKER,'xb') as out:
                out.write(marker_bytes);out.flush();os.fsync(out.fileno())
            backup_path=None
            if existing_marker is not None:
                # The replacement is explicit. Preserve old chapters, any
                # manual edits, old imgs/, and the old publication marker.
                meta=physical/'.ocr2md'
                if meta.is_symlink() or not meta.is_dir():
                    fail('EACCES','DIRjson 数据目录不安全，拒绝覆盖',403)
                backup_root=meta/'chapter-backups'
                if backup_root.is_symlink():
                    fail('EACCES','章节备份目录不能是符号链接',403)
                backup_root.mkdir(mode=0o700,exist_ok=True)
                if not backup_root.is_dir():
                    fail('EACCES','章节备份目录不可写',403)
                stamp=datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
                backup_path=backup_root/(stamp+'-'+requested[:12])
                if backup_path.exists():fail('ECONFLICT','备份文件名冲突',409)
                # Keep existing local images available if a new canonical
                # chapter still refers to them. Do not follow symlinks.
                images=destination/'imgs'
                if images.exists():
                    if images.is_symlink() or not images.is_dir():
                        fail('EACCES','旧章节媒体目录异常，拒绝覆盖',403)
                    for folder,dirs,files in os.walk(images,followlinks=False):
                        if any((Path(folder)/name).is_symlink() for name in dirs+files):
                            fail('EACCES','旧章节图片含符号链接，拒绝覆盖',403)
                    shutil.copytree(images,staging/'imgs',symlinks=False)
                # Under the Vault lock; rename the old complete tree into
                # backup, then create the new tree with no-replace semantics.
                os.rename(destination,backup_path)
                try:
                    if destination.exists() or destination.is_symlink():
                        fail('ECONFLICT','发布期间出现另一个 chapters/，拒绝覆盖',409)
                    if os.uname().sysname=='Darwin':
                        import ctypes
                        rename=ctypes.CDLL(None,use_errno=True).renamex_np
                        rename.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint]
                        rename.restype=ctypes.c_int
                        if rename(os.fsencode(staging),os.fsencode(destination),4)!=0:
                            fail('ECONFLICT','章节替换阶段目录被占用',409)
                    else:os.rename(staging,destination)
                except BaseException:
                    # Never discard the previously published tree when the
                    # new destination could not be installed.
                    if not destination.exists() and not destination.is_symlink():
                        os.rename(backup_path,destination)
                    raise
            else:
                if destination.exists() or destination.is_symlink():
                    fail('EEXIST','chapters 在发布期间被其它程序创建，拒绝覆盖',409)
                if os.uname().sysname == 'Darwin':
                    import ctypes
                    rename=ctypes.CDLL(None,use_errno=True).renamex_np
                    rename.argtypes=[ctypes.c_char_p,ctypes.c_char_p,ctypes.c_uint]
                    rename.restype=ctypes.c_int
                    if rename(os.fsencode(staging),os.fsencode(destination),4)!=0:
                        fail('EEXIST','chapters 在发布期间已存在，未覆盖',409)
                else:os.rename(staging,destination)
            if any(digest((destination/name).read_bytes())!=digest(data)
                   for name,data in chapters.items()):
                fail('ECONFLICT','发布后章节内容校验失败；请检查 chapters',409)
            return {'published':True,'alreadyPublished':False,
                    'overwritten':backup_path is not None,
                    'backupPath':(book+'/.ocr2md/chapter-backups/'+backup_path.name)
                       if backup_path else None,
                    'count':len(chapters),'path':book+'/chapters',
                    'generation':requested}
        finally:
            if staging.exists():shutil.rmtree(staging)


def publish_saved_chapters(vault, payload):
    """One authenticated *small* request: saved DIRjson -> canonical split -> chapters/.

    Never accept browser-generated zip bytes or an unsaved in-memory IR here.
    Cross-check original sources, current pointer and expected document digest,
    then run our bundled deterministic projection against the saved archive.
    """
    import subprocess
    with vault.lock:
        book, physical = ensure_book(vault, payload.get('book'))
        expected = payload.get('expectedGeneration')
        expected_ir = payload.get('expectedIrSha256')
        if (not isinstance(expected, str) or not HEX.fullmatch(expected) or
                not isinstance(expected_ir, str) or not HEX.fullmatch(expected_ir)):
            fail('EINVAL','缺少已保存 DIRjson 的版本及校验码')
        pointer, _ = read_pointer(vault, book)
        if not pointer or pointer['archiveSha256'] != expected:
            fail('ESTALE','书籍保存版本已改变，刷新工作台后再发布',409)
        marks,mark_revision,_=_read_markings(vault,book,pointer)
        if payload.get('expectedMarkingsRevision','')!=mark_revision:
            fail('ESTALE','章节映射已变化，必须重新读取后发布',409)
        if pointer['irSha256'] != expected_ir:
            fail('ESTALE','源码内容与保存版本不一致，请保存或重新打开',409)
        destination = physical/'chapters'
        if destination.is_symlink():fail('EACCES','chapters 不能是符号链接',403)
        archive_path=physical/'.ocr2md'/'ir-versions'/(expected+'.zip')
        if archive_path.is_symlink() or not archive_path.is_file():
            fail('ESTALE','当前不可变保存快照不存在',409)
        raw=archive_path.read_bytes()
        if digest(raw)!=expected:fail('ECONFLICT','保存快照 SHA 校验失败',409)
        ir,manifest=validate_archive(raw,vault.workspace_id,book)
        if not verify_materialized(vault,book,expected,zipfile.ZipFile(io.BytesIO(raw))):
            fail('ESTALE','分章来源快照未完全同步',409)
        source_zip_ir=zipfile.ZipFile(io.BytesIO(raw)).read('document-ir.v1.json')
        if digest(source_zip_ir)!=expected_ir:
            fail('ECONFLICT','原始 DIRjson SHA 校验失败',409)
        for src in (ir['pdf'],ir['ocr']):
            file=vault.path(src['path'],existing=True)
            if file.is_symlink() or not file.is_file() or digest(file.read_bytes())!=src['sha256']:
                fail('ESTALE','原始 PDF 或 OCR 已改变，拒绝发布',409)
        if marks is not None:
            _validate_markings(ir,marks)
            ephemeral=_overlay_chapter_map(ir,marks)
            source=canonical_json(ephemeral)
        else:
            ephemeral=ir
            source=source_zip_ir
        command=Path(__file__).resolve().parent/'v3IrChapterProjection.cjs'
        if command.is_symlink() or not command.is_file():
            fail('EUNSUPPORTED','分章投影组件未安装',503)
        try:
            projected=subprocess.run(['node',str(command)],input=source,
                capture_output=True,timeout=45,check=False)
        except (subprocess.TimeoutExpired,OSError) as err:
            fail('EOFFLINE','本地章节投影不可用：'+str(err)[:100],503)
        if projected.returncode or not projected.stdout:
            fail('EINVAL','章节文件边界未完成：'+projected.stderr.decode('utf-8','replace')[:200])
        if len(projected.stdout)>MAX_ARCHIVE:fail('EQUOTA','生成章节快照过大',413)
        generated_ir,output_manifest=validate_archive(projected.stdout,vault.workspace_id,book)
        if (generated_ir!=ephemeral or
            output_manifest.get('projectionState') not in ('confirmed-chapters','chapter-files-for-cleaning')):
            fail('ECONFLICT','章节投影与独立映射不一致',409)
        # A remote iCloud writer can bypass this process' local lock. Do not
        # publish a map changed during the Node projection.
        _,latest_revision,_=_read_markings(vault,book,pointer)
        if latest_revision!=mark_revision:
            fail('ESTALE','章节映射在发布过程中发生变化',409)
        # No DIRjson new generation, no pointer replacement. Only explicit
        # publish owns chapters/, retaining its existing lossless backups.
        result=publish_chapters(vault,{'book':book,'expectedGeneration':expected},
            projected_archive=projected.stdout)
        return {**result,'projectionUpgraded':False,'previousGeneration':expected}


# Only explicitly published, already existing chapter MD files are editable.
# The marker is provenance, not the current-content SHA after human cleaning.
def save_cleaned_chapter(vault, payload):
    import base64 as b64
    with vault.lock:
        book, physical = ensure_book(vault, payload.get('book'))
        name = payload.get('filename')
        if (not isinstance(name,str) or not name.endswith('.md') or
                name.startswith('.') or name in ('.','..') or '/' in name or '\\' in name or
                len(name)>220):
            fail('EINVAL','非法章节 MD 文件名')
        if not safe_chapter_member('chapters/'+name):
            fail('EINVAL','章节文件名不符合安全命名规范')
        chapters=physical/'chapters'
        marker=chapters/PUBLISH_MARKER
        if (chapters.is_symlink() or not chapters.is_dir() or
                marker.is_symlink() or not marker.is_file()):
            fail('EACCES','只允许编辑已发布 chapters/ 下的章节文件',403)
        try: publication=json.loads(marker.read_text(encoding='utf-8'))
        except (ValueError, UnicodeDecodeError):
            fail('ECONFLICT','章节来源记录不可用',409)
        if (publication.get('kind')!='ocr2md/editable-chapters-publication' or
            publication.get('book')!=book or name not in publication.get('files',{})):
            fail('EACCES','所选章节不属于本书已发布清单',403)
        path=book+'/chapters/'+name
        file=chapters/name
        if file.is_symlink() or not file.is_file():
            fail('ENOENT','章节文件已经移动或不是常规文件',404)
        current=vault.metadata(path)
        expected=payload.get('expectedRevision')
        ref={'nodeId':payload.get('nodeId')}
        vault.ensure_ref(ref,current,expected)
        if current['size']>512*1024:fail('EQUOTA','当前章节超过安全编辑大小',413)
        try: data=b64.b64decode(payload.get('base64',''),validate=True)
        except (TypeError,ValueError):fail('EINVAL','Markdown 数据无效')
        if len(data)>512*1024:fail('EQUOTA','章节编辑内容超过 512KiB',413)
        try: content=data.decode('utf-8')
        except UnicodeDecodeError:fail('EINVAL','章节需使用 UTF-8 文本')
        if '\x00' in content:fail('EINVAL','拒绝写入二进制内容')
        vault.coordinated_sidecar_replace(file,data,current['revision'],published_chapter=True)
        verified=vault.metadata(path)
        if digest(file.read_bytes())!=digest(data):
            fail('ECONFLICT','保存后的章节字节校验失败',409)
        return {'saved':True,'file':verified,'sha256':digest(data),'path':path}


def download_cleaning_image(vault, payload, downloader):
    """V3 counterpart to V2's guarded media downloader.

    Reuses V2's URL/DNS/redirect/20MB/MIME checks, then performs a revision-
    guarded rewrite only for a *published*, unchanged chapter. No arbitrary
    destination path and no user-provided bytes. Download is user-triggered.
    """
    import re
    from urllib.parse import urlsplit
    book = payload.get('book')
    name = payload.get('filename')
    url = payload.get('sourceUrl')
    if not isinstance(name, str) or not safe_chapter_member('chapters/' + name):
        fail('EINVAL', '媒体下载只能用于已发布章节')
    if not isinstance(url, str) or not url.startswith(('http://', 'https://')) or len(url) > 4096:
        fail('EINVAL', '仅支持当前 MD 中的外部 HTTP(S) 图片来源')
    with vault.lock:
        book, physical = ensure_book(vault, book)
        folder = physical/'chapters'
        marker = folder/PUBLISH_MARKER
        file = folder/name
        if (folder.is_symlink() or not folder.is_dir() or
            marker.is_symlink() or not marker.is_file() or
            file.is_symlink() or not file.is_file()):
            fail('EACCES', '只能下载到当前书籍已发布的章节', 403)
        try:
            manifest = json.loads(marker.read_text(encoding='utf-8'))
        except (ValueError, UnicodeDecodeError):
            fail('ECONFLICT', '章节发布记录损坏', 409)
        if (manifest.get('book') != book or manifest.get('kind') != 'ocr2md/editable-chapters-publication'
                or name not in manifest.get('files', {})):
            fail('EACCES', '章节与 DIRjson 发布来源不一致', 403)
        path = book + '/chapters/' + name
        current = vault.metadata(path)
        vault.ensure_ref({'nodeId': payload.get('nodeId')}, current,
                         payload.get('expectedRevision'))
        original = file.read_text(encoding='utf-8')
        # Only a Markdown image/link with the matching URL is downloadable;
        # mere text mentions of private resources are never enough.
        link_pattern = re.compile(r'(!?\[([^\]\n]*)\]\(' + re.escape(url) + r'\))')
        found = list(link_pattern.finditer(original))
        html_image = re.compile(r'(<img\s+[^>]*src\s*=\s*["\']' + re.escape(url)
                                + r'["\'][^>]*>)', re.I)
        if not found and not html_image.search(original):
            fail('EINVAL', '当前章节没有相应的图片引用，不能下载')
    # The V2 downloader enforces public destinations, safe redirects,
    # bounded bytes and detected MIME. No Mac filesystem lock during fetch.
    image_bytes, mime_type = downloader(url)
    ext = {'image/png':'.png','image/jpeg':'.jpg','image/webp':'.webp',
           'image/gif':'.gif'}.get(mime_type)
    if not ext or not image_bytes or len(image_bytes) > 20 * 1024 * 1024:
        fail('EINVAL', '不支持的图片类型或超过 20 MB')
    image_name = digest(image_bytes)[:24] + ext
    local_path = 'imgs/' + image_name
    with vault.lock:
        current = vault.metadata(path)
        vault.ensure_ref({'nodeId': payload.get('nodeId')}, current,
                         payload.get('expectedRevision'))
        if file.read_text(encoding='utf-8') != original:
            fail('ESTALE', '媒体下载期间章节源码已改变，拒绝覆盖', 409)
        def replace(m):
            label = m.group(2)
            if m.group(1).startswith('!'):
                return '![' + label + '](' + local_path + ')'
            # OCR2MD's inert remote provenance image becomes an actual local
            # embedded image after an explicit user download.
            if '图片' in label or '图表' in label:
                return '![' + label.replace('（仅链接，不自动载入）','') + '](' + local_path + ')'
            return '[' + label + '](' + local_path + ')'
        updated = link_pattern.sub(replace, original)
        updated = html_image.sub(lambda m: m.group(1).replace(url,local_path),updated)
        if updated == original:
            fail('EINVAL', '没有可替换的图片路径')
        image_dir = folder/'imgs'
        if image_dir.is_symlink():
            fail('EACCES', '图片目录不能是符号链接', 403)
        if not image_dir.exists():
            image_dir.mkdir(mode=0o755)
        if not image_dir.is_dir():
            fail('EACCES', '图片目录不可用', 403)
        target = image_dir/image_name
        if target.is_symlink():
            fail('EACCES', '图片不能是符号链接', 403)
        if target.exists():
            if not target.is_file() or digest(target.read_bytes()) != digest(image_bytes):
                fail('ECONFLICT', '已有媒体文件内容不一致，禁止覆盖', 409)
        else:
            try:
                with open(target, 'xb') as image:
                    image.write(image_bytes)
                    image.flush();os.fsync(image.fileno())
            except FileExistsError:
                if not target.is_file() or digest(target.read_bytes()) != digest(image_bytes):
                    fail('ECONFLICT', '图片文件正在被其它操作修改', 409)
        result = save_cleaned_chapter(vault, {
            'book':book,'filename':name,'nodeId':payload.get('nodeId'),
            'expectedRevision':payload.get('expectedRevision'),
            'base64':base64.b64encode(updated.encode('utf-8')).decode('ascii'),
        })
        if file.read_text(encoding='utf-8') != updated:
            fail('ECONFLICT', '媒体路径替换完成后读回不一致', 409)
        return {**result, 'workingText':updated,
                'localPath':local_path,'fileName':image_name,
                'mediaSizeBytes':len(image_bytes),'mimeType':mime_type}
