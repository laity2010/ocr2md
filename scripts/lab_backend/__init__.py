"""WP04E: dynamic Lab backend, mounted by the existing shared Gateway."""
from contextlib import closing
import hashlib
import http.client
import json
import os
import re
import sqlite3
import stat
import subprocess
from urllib.parse import urlencode

from .sentence_store import SentenceStore
from .sentence_initialize import prepare_sentence_rows

DB_NAME = 'ocr2md.v2.sqlite'
MAX_SNAPSHOT = 32 * 1024 * 1024


class SentenceError(Exception):
    def __init__(self, code, message):
        super().__init__(message)
        self.code = code


def read_public_snapshot(folder, cookie):
    """Use only the published V2 GET contract through the existing loopback gateway."""
    port = int(os.environ.get('OCR2MD_LABS_GATEWAY_PORT', '4414'))
    path = '/labs/lab-ocr-v2/api/mineru-base/markdown?' + urlencode({'workspace': str(folder)})
    with closing(http.client.HTTPConnection('127.0.0.1', port, timeout=20)) as conn:
        conn.request('GET', path, headers={'Cookie': cookie, 'Cache-Control': 'no-store'})
        response = conn.getresponse()
        if response.status != 200:
            raise SentenceError(response.status if response.status in (403,404,409) else 503,
                                'V2 已保存正文读取失败')
        raw = response.read(MAX_SNAPSHOT + 1)
    if len(raw) > MAX_SNAPSHOT:
        raise SentenceError(413, 'V2 快照超限')
    return json.loads(raw)


def snapshot_hash(snapshot):
    text = snapshot.get('markdown')
    if snapshot.get('schema') != 'v2-logical-md/v3' or not isinstance(text, str):
        raise SentenceError(409, '需要 V2 真实 LF 已保存正文')
    digest = hashlib.sha256(text.encode('utf-8')).hexdigest()
    if len(text.encode('utf-8')) > 8*1024*1024 or digest != snapshot.get('sha256'):
        raise SentenceError(409, 'V2 快照摘要或大小无效')
    return digest


def file_identity(path):
    try:
        st = path.lstat()
    except FileNotFoundError:
        raise SentenceError(409, '请先在 V2 初始化 SQLite') from None
    if not stat.S_ISREG(st.st_mode) or st.st_nlink != 1:
        raise SentenceError(403, 'V2 SQLite 必须为独立普通文件')
    return st.st_dev, st.st_ino


def dispatch(folder, operation, expected_hash, reader, *, prepare=prepare_sentence_rows):
    """Authorized runtime service. No upstream private row reads or writes."""
    path = folder / DB_NAME
    identity = file_identity(path)

    def verify_identity():
        if file_identity(path) != identity:
            raise SentenceError(409, 'SQLite 文件已切换，请重新打开工作目录')

    def current():
        verify_identity()
        snapshot = reader()
        if snapshot_hash(snapshot) != expected_hash:
            raise SentenceError(409, '上游 MDLine 已变化，请重新打开工作目录')
        verify_identity()
        return snapshot

    snapshot = current()
    markdown = snapshot['markdown']

    def response(state, rows):
        verify_identity()
        return {'state': state, 'source_document_hash': expected_hash, 'rows': rows}

    # mode=rw cannot silently create a new database. The V2 public read
    # verifies its own schema. The sentence connection uses only its own table.
    def connect():
        verify_identity()
        return sqlite3.connect(path.as_uri() + '?mode=rw', uri=True, timeout=10)

    if operation == 'open':
        with closing(connect()) as db:
            state, rows = SentenceStore(db).inspect(markdown, verify_source=current)
        if state != 'missing':
            return response(state, rows)
    elif operation != 'reinitialize':
        raise SentenceError(404, '未知句表操作')

    rows = prepare(snapshot)
    with closing(connect()) as db:
        store = SentenceStore(db)
        if operation == 'reinitialize':
            store.replace_all(markdown, rows, verify_source=current)
        else:
            try:
                store.initialize(markdown, rows, verify_source=current)
            except ValueError as error:
                # Concurrent first open: never replace a table another open created.
                if str(error) != 'sentence table already exists; automatic initialization refused':
                    raise
                state, existing = store.inspect(markdown, verify_source=current)
                return response(state, existing)
    return response('ready', rows)


def handle(handler, operation, parsed, common):
    def respond(code, obj):
        handler.respond(code, json.dumps(obj, ensure_ascii=False), 'application/json; charset=utf-8')
    try:
        if common is None:
            raise SentenceError(503, 'Frame 授权服务不可用')
        if operation not in ('sentence/open','sentence/reinitialize'):
            raise SentenceError(404, '未知分句接口')
        if handler.command != 'POST':
            raise SentenceError(405, '句表操作只允许 POST')
        if handler.headers.get('Origin') not in common.ALLOWED_ORIGINS:
            raise SentenceError(403, '拒绝未授权来源')
        if handler.headers.get('Transfer-Encoding'):
            raise SentenceError(400, '不支持 chunked 请求')
        try:
            size = int(handler.headers.get('Content-Length', '-1'))
        except ValueError:
            size = -1
        if not 2 <= size <= 8192:
            raise SentenceError(413, '请求体超限')
        raw = handler.rfile.read(size)
        if len(raw) != size:
            raise SentenceError(400, '请求体不完整')
        payload = json.loads(raw)
        op = operation.split('/')[-1]
        expected = {'workspace','source_document_hash'} | ({'confirm'} if op == 'reinitialize' else set())
        if not isinstance(payload, dict) or set(payload) != expected:
            raise SentenceError(422, '句表请求字段不合法')
        digest = payload['source_document_hash']
        if not isinstance(digest, str) or not re.fullmatch('[0-9a-f]{64}', digest):
            raise SentenceError(422, '来源摘要无效')
        if op == 'reinitialize' and payload['confirm'] != 'reinitialize-sentence-table':
            raise SentenceError(422, '缺少重新初始化确认')
        cookie = handler.headers.get('Cookie','')
        folder = common.checked_workspace(payload['workspace'], common.authorized_roots(cookie))
        common.probe(folder)
        respond(200, dispatch(folder, op, digest, lambda: read_public_snapshot(folder,cookie)))
    except SentenceError as error:
        respond(error.code, {'error': str(error)})
    except (ValueError, TypeError, KeyError, UnicodeDecodeError):
        respond(409, {'error': '句表结构、来源或数据校验失败，未确认写入'})
    except (sqlite3.DatabaseError, subprocess.SubprocessError, http.client.HTTPException, OSError):
        respond(503, {'error': '句表操作未确认成功，请重新打开工作目录'})
    except Exception as error:
        # F02 AccessError/WorkspaceIOError retain their established safe error code.
        if type(error).__name__ in ('AccessError','WorkspaceIOError') and hasattr(error,'code'):
            respond(error.code, {'error': str(error)})
        else:
            raise
