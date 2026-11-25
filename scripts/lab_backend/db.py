"""V3 SQLite 统一连接工厂、双物理表底座与 zlib 原始档案加解密校验。

严格遵循 SQL.md 第 1–4 节：
1. 唯一数据库文件名为 ocr2md.v3.sqlite，严禁触碰 ocr2md.v2.sqlite 或其他文件；
2. 后端正式 SQLite 访问统一经 open_v3_db(folder, mode) 上下文工厂完成；
3. blockid=0 原始源文件档案采用 zlib 无损压缩存储，并在解压时逐文件核验 SHA-256。
"""
from __future__ import annotations

import base64
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import stat
from typing import Iterator
import zlib

DB_NAME = 'ocr2md.v3.sqlite'
SCHEMA = 'ocr2md-v3-mineru-base/v1'
V3_USER_VERSION = 3001
OWNED_MD_SCHEMA = 'v3-logical-md/v1'
PDF_PROJECTION_SCHEMA = 'v3-pdf-projection/v1'

MAX_SOURCE_FILE = 64 * 1024 * 1024
MAX_PDF_FILE = 64 * 1024 * 1024
MAX_SOURCE_TOTAL = 128 * 1024 * 1024
# Base64 + JSON 封装后的最大允许解压字节上限，防止异常压缩炸弹耗尽内存
MAX_ARCHIVE_UNCOMPRESSED = 192 * 1024 * 1024
PAGE_SIZE = 120

FILE_NOFOLLOW = getattr(os, 'O_NOFOLLOW', 0)
DIR_FLAGS = os.O_RDONLY | getattr(os, 'O_DIRECTORY', 0) | FILE_NOFOLLOW

BLOCK_LISTS = ('preproc_blocks', 'discarded_blocks', 'para_blocks')
BASE_COLUMNS = (
    'blockid', 'source_path', 'source_sha256', 'page_index', 'page_number',
    'block_group', 'page_block_index', 'source_json_path', 'block_type',
    'mineru_index', 'bbox_json', 'angle', 'level', 'lines_json', 'blocks_json',
    'block_json', 'record_kind', 'original_bytes',
)
LOGICAL_COLUMNS = (
    'logical_id', 'base_blockid', 'parent_id', 'logical_order',
    'md_block', 'block_type', 'p', 'b', 's', 'raw_path',
)


class V3Error(Exception):
    """V3 后端统一业务与安全门禁异常，携带精确 HTTP 状态码。"""

    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def sha256_bytes(data: bytes) -> str:
    """计算字节序列的十六进制 SHA-256 摘要。"""
    return hashlib.sha256(data).hexdigest()


def sha256_text(text: str) -> str:
    """计算 UTF-8 文本的十六进制 SHA-256 摘要。"""
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def compact_json(obj: object) -> str:
    """生成无多余空白、保留非 ASCII 字符的确定性紧凑 JSON。"""
    return json.dumps(obj, ensure_ascii=False, separators=(',', ':'))


def sqlite_file_uri(path: Path, mode: str) -> str:
    """构造安全的 SQLite file URI，转义路径中的 %、?、# 特殊字符。"""
    if mode not in ('ro', 'rw'):
        raise ValueError(f'不支持的数据库连接模式：{mode}')
    escaped = str(path).replace('%', '%25').replace('?', '%3f').replace('#', '%23')
    return f'file:{escaped}?mode={mode}'


def verify_db_regular_file(folder: Path, db_name: str = DB_NAME) -> tuple[Path, os.stat_result]:
    """核验授权书籍目录及其下目标 SQLite 文件为非符号链接、单硬链接普通文件。"""
    if not isinstance(folder, Path) or folder.is_symlink() or not folder.is_dir():
        raise V3Error(403, '工作目录不存在或不允许使用符号链接')
    db_path = folder / db_name
    if db_path.is_symlink():
        raise V3Error(403, 'V3 SQLite 数据库不允许是符号链接')
    try:
        fd = os.open(db_path, os.O_RDONLY | FILE_NOFOLLOW)
    except FileNotFoundError as exc:
        raise V3Error(409, '尚未初始化 V3 SQLite（ocr2md.v3.sqlite）') from exc
    try:
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise V3Error(422, 'V3 SQLite 必须是独立非硬链接的普通文件')
        return db_path, info
    finally:
        os.close(fd)


def ensure_no_active_journal(folder: Path, db_name: str = DB_NAME) -> None:
    """覆盖或替换检查前，拒绝存在未结束的 -wal / -shm / -journal 日志文件。"""
    for suffix in ('-wal', '-shm', '-journal'):
        if os.path.lexists(folder / (db_name + suffix)):
            raise V3Error(409, 'V3 SQLite 存在活动日志文件，请等待其他连接结束后重试')


@contextmanager
def open_v3_db(
    folder: Path,
    mode: str = 'ro',
    *,
    _stage_filename: str | None = None,
) -> Iterator[sqlite3.Connection]:
    """V3 后端唯一 SQLite 连接上下文工厂（全包唯一 sqlite3.connect 入口）。

    集中强制 O_NOFOLLOW / st_nlink==1 安全校验、PRAGMA foreign_keys=ON、
    PRAGMA busy_timeout=5000 及显式事务控制（isolation_level=None）。
    _stage_filename 仅供同目录原子建库阶段的私有 .ocr2md-v3-*.tmp 暂存文件使用。
    """
    if mode not in ('ro', 'rw'):
        raise V3Error(500, f'无效数据库打开模式：{mode}')
    target_name = DB_NAME
    if _stage_filename is not None:
        if (
            mode != 'rw'
            or '/' in _stage_filename
            or '\\' in _stage_filename
            or not _stage_filename.startswith('.ocr2md-v3-')
            or not _stage_filename.endswith('.tmp')
        ):
            raise V3Error(500, '非法暂存数据库文件名')
        target_name = _stage_filename
    db_path, _ = verify_db_regular_file(folder, target_name)
    uri = sqlite_file_uri(db_path, mode)
    conn = sqlite3.connect(uri, uri=True, timeout=5.0, isolation_level=None)
    try:
        conn.row_factory = sqlite3.Row
        conn.execute('PRAGMA busy_timeout = 5000')
        conn.execute('PRAGMA foreign_keys = ON')
        if conn.execute('PRAGMA foreign_keys').fetchone()[0] != 1:
            raise V3Error(500, 'SQLite 外键约束未能启用')
        yield conn
    finally:
        if conn.in_transaction:
            try:
                conn.execute('ROLLBACK')
            except sqlite3.Error:
                pass
        conn.close()


def create_v3_schema(db: sqlite3.Connection) -> None:
    """创建 V3 两张主业务物理表与两层 PBS 唯一索引。"""
    db.execute(
        '''
        CREATE TABLE mineru_base(
          blockid INTEGER PRIMARY KEY CHECK(blockid >= 0),
          source_path TEXT,
          source_sha256 TEXT,
          page_index INTEGER,
          page_number INTEGER,
          block_group TEXT,
          page_block_index INTEGER,
          source_json_path TEXT,
          block_type TEXT,
          mineru_index INTEGER,
          bbox_json TEXT,
          angle REAL,
          level INTEGER,
          lines_json TEXT,
          blocks_json TEXT,
          block_json TEXT NOT NULL,
          record_kind TEXT NOT NULL,
          original_bytes BLOB
        )
        '''
    )
    db.execute(
        '''
        CREATE TABLE logical_block(
          logical_id INTEGER PRIMARY KEY CHECK(logical_id > 0),
          base_blockid INTEGER NOT NULL,
          parent_id INTEGER,
          logical_order INTEGER NOT NULL CHECK(logical_order > 0),
          md_block TEXT NOT NULL,
          block_type TEXT NOT NULL DEFAULT '',
          p INTEGER NOT NULL CHECK(p >= 0),
          b INTEGER NOT NULL CHECK(b >= 0),
          s INTEGER NOT NULL CHECK(s >= 0),
          raw_path TEXT,
          FOREIGN KEY(base_blockid) REFERENCES mineru_base(blockid)
        )
        '''
    )
    db.execute('CREATE UNIQUE INDEX logical_block_pbs_unique ON logical_block(p, b, s)')
    db.execute(f'PRAGMA user_version = {V3_USER_VERSION}')


def validate_pbs_coordinates(rows: list[dict]) -> dict[tuple[int, int], dict[int, int]]:
    """校验两层 (p, b, s) 坐标合法唯一、禁止负值且每个父组均具备 s=0 锚点。"""
    seen_ids: set[int] = set()
    seen_coords: set[tuple[int, int, int]] = set()
    groups: dict[tuple[int, int], dict[int, int]] = {}
    for row in rows:
        lid = row['logical_id']
        pbs = (row['p'], row['b'], row['s'])
        if type(lid) is not int or lid <= 0:
            raise ValueError('logical_id 必须为正整数')
        if any(type(v) is not int or v < 0 for v in pbs):
            raise ValueError('PBS 坐标必须为非负整数')
        if lid in seen_ids or pbs in seen_coords:
            raise ValueError('logical_id 或 PBS 坐标存在重复')
        seen_ids.add(lid)
        seen_coords.add(pbs)
        group = groups.setdefault((pbs[0], pbs[1]), {})
        group[pbs[2]] = lid
    for coord, members in groups.items():
        if 0 not in members:
            raise ValueError(f'PBS 分组 p{coord[0]}b{coord[1]} 缺少 s0 根块')
    return groups


def assert_v3_schema(db: sqlite3.Connection) -> dict:
    """核验现有数据库严格符合 V3 两表结构、单轨 owned-LF 版本标识与归档元数据。"""
    tables = {
        r[0]
        for r in db.execute(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'"
        )
    }
    if tables != {'mineru_base', 'logical_block'}:
        raise V3Error(409, '现有 SQLite 不符合 V3 两表物理结构，拒绝操作')
    base_cols = tuple(r[1] for r in db.execute('PRAGMA table_info(mineru_base)'))
    logical_cols = tuple(r[1] for r in db.execute('PRAGMA table_info(logical_block)'))
    if base_cols != BASE_COLUMNS or logical_cols != LOGICAL_COLUMNS:
        raise V3Error(409, '现有 SQLite 列定义与 V3 契约不一致，拒绝操作')
    user_ver = db.execute('PRAGMA user_version').fetchone()[0]
    if user_ver != V3_USER_VERSION:
        raise V3Error(409, '现有 SQLite 非 V3 单轨 owned-LF 版本，拒绝混用')
    try:
        validate_pbs_coordinates(
            [dict(r) for r in db.execute('SELECT logical_id, p, b, s FROM logical_block')]
        )
    except ValueError as err:
        raise V3Error(409, '现有逻辑块 PBS 状态非法：' + str(err)) from err
    record = db.execute(
        'SELECT block_json, record_kind, original_bytes FROM mineru_base WHERE blockid = 0'
    ).fetchone()
    if not record or record['record_kind'] != 'source_archive' or not record['original_bytes']:
        raise V3Error(409, '现有 SQLite 缺少不可变原始来源档案')
    try:
        meta = json.loads(record['block_json'])
    except (ValueError, TypeError) as err:
        raise V3Error(409, '数据库原始档案元数据损坏') from err
    if (
        not isinstance(meta, dict)
        or meta.get('schema') != SCHEMA
        or meta.get('compression') != 'zlib'
        or not isinstance(meta.get('sources'), list)
    ):
        raise V3Error(409, '现有 SQLite 归档 Schema 或压缩格式不匹配')
    return meta


def compress_source_archive(archive_entries: list[dict]) -> bytes:
    """将源文件归档数组编码为紧凑 UTF-8 JSON 并进行 zlib 无损压缩。"""
    raw_payload = compact_json(archive_entries).encode('utf-8')
    return zlib.compress(raw_payload, level=6)


def decompress_source_archive(blob: bytes | memoryview, expected_sources: list[dict]) -> list[dict]:
    """安全解压 blockid=0 的 zlib 档案并逐文件核验原始字节长度与 SHA-256。"""
    if not isinstance(blob, (bytes, bytearray, memoryview)) or not blob:
        raise V3Error(409, '原始档案压缩字节缺失')
    decompressor = zlib.decompressobj()
    try:
        uncompressed = decompressor.decompress(bytes(blob), MAX_ARCHIVE_UNCOMPRESSED + 1)
        if decompressor.unconsumed_tail or len(uncompressed) > MAX_ARCHIVE_UNCOMPRESSED:
            raise V3Error(413, '原始档案解压体积超出安全上限')
        uncompressed += decompressor.flush()
        entries = json.loads(uncompressed.decode('utf-8'))
    except V3Error:
        raise
    except (zlib.error, UnicodeDecodeError, ValueError) as err:
        raise V3Error(409, '原始档案 zlib 解压或 JSON 解析失败') from err
    if not isinstance(entries, list) or len(entries) != len(expected_sources):
        raise V3Error(409, '原始档案条目数量与元数据不一致')
    verified: list[dict] = []
    for entry, meta in zip(entries, expected_sources):
        if not isinstance(entry, dict) or not isinstance(meta, dict):
            raise V3Error(409, '原始档案条目格式损坏')
        path = entry.get('path')
        digest = entry.get('sha256')
        content_b64 = entry.get('contentBase64')
        if (
            path != meta.get('path')
            or digest != meta.get('sha256')
            or not isinstance(content_b64, str)
        ):
            raise V3Error(409, '原始档案来源摘要与元数据不一致')
        try:
            raw_bytes = base64.b64decode(content_b64, validate=True)
        except ValueError as err:
            raise V3Error(409, '原始档案 Base64 数据损坏') from err
        if len(raw_bytes) != meta.get('size') or sha256_bytes(raw_bytes) != digest:
            raise V3Error(409, '原始档案解压后字节长度或 SHA-256 校验不匹配')
        verified.append({'path': path, 'sha256': digest, 'size': len(raw_bytes), 'raw': raw_bytes})
    return verified
