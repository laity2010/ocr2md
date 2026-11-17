"""Per-book read-only note matching rules. One small JSON config, no SQL schema.
Never touches MinerU/MD/Block artifacts, never follows symbolic links.
"""
from __future__ import annotations
import fcntl
import hashlib
import json
import os
import re
import stat
import tempfile
from contextlib import contextmanager
from pathlib import Path
from v6_lab_ocr_store import OCRImportError

FILENAME='.ocr2md-note-match-rules.json'
LOCKFILE='.ocr2md-note-match-rules.lock'
MAX_BYTES=8192
REFS=('ref.html-sup','ref.md-footnote','ref.unicode-sup','ref.bracket',
      'ref.parenthesis','ref.symbol','ref.html-alpha')
BODIES=('body.md-footnote','body.number-dot','body.number-paren',
        'body.number-bracket','body.labelled','body.symbol','body.letter-dot')
DEFAULT={'referenceRules':list(REFS[:-1]),'bodyRules':list(BODIES[:-1]),
         'scope':'book','chapterLevel':1,'weakAutoMatch':False,
         'continuation':'same-block','customRules':[]}
RULE_ID=re.compile(r'^book\.(?:ref|body)\.[a-z][a-z0-9-]{0,30}$')


def validate_note_match_config(raw):
    if not isinstance(raw,dict) or set(raw)-set(DEFAULT):
        raise OCRImportError('注释规则字段不合法')
    value={**DEFAULT,**raw}
    for name,available in [('referenceRules',REFS),('bodyRules',BODIES)]:
        rules=value[name]
        if not isinstance(rules,list) or len(rules)>len(available) or \
           any(type(v) is not str or v not in available for v in rules) or \
           len(set(rules))!=len(rules):
            raise OCRImportError('注释识别规则列表不合法')
    if value['scope'] not in ('book','chapter') or \
       type(value['chapterLevel']) is not int or \
       not 1<=value['chapterLevel']<=6 or \
       type(value['weakAutoMatch']) is not bool or \
       value['continuation'] not in ('same-block','notes-section'):
        raise OCRImportError('注释范围规则不合法')
    custom=value['customRules']
    if not isinstance(custom,list) or len(custom)>8:
        raise OCRImportError('自定义注释规则数量无效')
    seen=set()
    for rule in custom:
        if not isinstance(rule,dict) or set(rule)!=set(('id','kind','pattern','strength')):
            raise OCRImportError('自定义规则字段无效')
        rid,kind,pattern,strength=(rule[k] for k in ('id','kind','pattern','strength'))
        if type(rid) is not str or not RULE_ID.fullmatch(rid) or rid in seen or \
           kind not in ('reference','body') or \
           not rid.startswith('book.ref.' if kind=='reference' else 'book.body.') or \
           type(pattern) is not str or not 1<=len(pattern)<=240 or \
           '(?<id>' not in pattern or \
           (kind=='body' and (not pattern.startswith('^') or '(?<content>' not in pattern)) or \
           strength not in ('strong','ambiguous'):
            raise OCRImportError('自定义注释规则无效')
        seen.add(rid)
    return json.loads(json.dumps(value,ensure_ascii=False))


def _canonical(config):
    return json.dumps(config,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode('utf-8')


def _revision(config):
    return hashlib.sha256(_canonical(config)).hexdigest()


def _read(book):
    path=book/FILENAME
    if not path.exists() and not path.is_symlink():
        return json.loads(json.dumps(DEFAULT))
    if path.is_symlink():raise OCRImportError('书籍注释规则文件不能是符号链接')
    fd=os.open(path,os.O_RDONLY|getattr(os,'O_NOFOLLOW',0))
    with os.fdopen(fd,'rb') as stream:
        info=os.fstat(stream.fileno())
        if not stat.S_ISREG(info.st_mode) or info.st_size>MAX_BYTES:
            raise OCRImportError('书籍注释规则文件不合法或超出上限')
        data=stream.read(MAX_BYTES+1)
    try:return validate_note_match_config(json.loads(data))
    except (ValueError,TypeError,UnicodeDecodeError) as error:
        raise OCRImportError('书籍注释规则 JSON 无效') from error


def read_note_match_config(book:Path):
    config=_read(book)
    return {'status':'ready','config':config,'revision':_revision(config)}


@contextmanager
def _locked_book(book):
    path=book/LOCKFILE
    fd=os.open(path,os.O_CREAT|os.O_RDWR|getattr(os,'O_NOFOLLOW',0),0o600)
    with os.fdopen(fd,'r+b') as stream:
        if not stat.S_ISREG(os.fstat(stream.fileno()).st_mode):
            raise OCRImportError('书籍规则锁文件无效')
        fcntl.flock(stream,fcntl.LOCK_EX)
        try:yield
        finally:fcntl.flock(stream,fcntl.LOCK_UN)


def save_note_match_config(book:Path,config,expected_revision):
    validated=validate_note_match_config(config)
    if not isinstance(expected_revision,str) or not re.fullmatch(r'[a-f0-9]{64}',expected_revision):
        raise OCRImportError('注释规则版本号无效')
    with _locked_book(book):
        prior=_read(book)
        if _revision(prior)!=expected_revision:
            raise OCRImportError('注释规则已有其他修改，请重新读取后再保存')
        if validated==prior:return read_note_match_config(book)
        fd=None;path=None
        try:
            fd,name=tempfile.mkstemp(prefix='.note-rules-',suffix='.tmp',dir=book)
            path=Path(name)
            with os.fdopen(fd,'wb') as stream:
                fd=None
                stream.write(_canonical(validated)+b'\n')
                stream.flush();os.fsync(stream.fileno())
            dest=book/FILENAME
            if dest.is_symlink() or (dest.exists() and not dest.is_file()):
                raise OCRImportError('书籍注释规则保存目标无效')
            os.replace(path,dest)
        finally:
            if fd is not None:os.close(fd)
            if path is not None and path.exists():path.unlink()
        return {'status':'saved','config':validated,'revision':_revision(validated)}
