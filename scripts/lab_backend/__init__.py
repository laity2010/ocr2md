"""Lab-OCR V3 隔离后端包入口（由统一 Lab 网关按 sourceCommit 动态加载与局部热重载）。

遵循 VIEWS.md 第 3 节与 SQL.md：
1. 全部代码收拢于 scripts/lab_backend/ 包内并使用相对导入，绝不污染共享网关 sys.path；
2. 复用 Frame F02 授权会话（authorized_roots / checked_workspace / ALLOWED_ORIGINS）；
3. WP02 暴露 mineru-base/{state,import,markdown,pdf-map,pdf}，WP03 将扩展摘要式 CAS。
"""
from __future__ import annotations

import json
import sqlite3
from urllib.parse import parse_qs

from .cas import commit_v3_md, commit_v3_structure
from .db import V3Error
from .importer import (
    existing_v3_markdown,
    existing_v3_pdf_map,
    existing_v3_state,
    import_v3_book,
    read_verified_pdf,
)

PREFIX = 'mineru-base/'


def _dispatch_mineru_base(
    operation: str,
    method: str,
    folder,
    payload: dict,
    query: dict[str, list[str]],
    common,
):
    """分发 /labs/lab-ocr-v3/api/mineru-base/* 子操作。"""
    if operation == 'state':
        if method != 'GET':
            raise V3Error(405, '数据库状态查询仅允许 GET')
        try:
            offset = int(query.get('offset', ['0'])[0])
        except (ValueError, TypeError) as err:
            raise V3Error(422, '分页参数 offset 无效') from err
        if offset < 0 or offset > 10_000_000:
            raise V3Error(422, '分页参数 offset 超出范围')
        table = query.get('table', ['mineru_base'])[0]
        if not isinstance(table, str) or not table or len(table) > 128:
            raise V3Error(422, 'SQL 物理表名称无效')
        return existing_v3_state(folder, offset=offset, table=table)

    if operation == 'import':
        if method != 'POST':
            raise V3Error(405, '导入操作仅允许 POST')
        return import_v3_book(folder, payload, common)

    if operation == 'md-commit':
        if method != 'POST':
            raise V3Error(405, '正文增量提交仅允许 POST')
        return commit_v3_md(folder, payload, common)

    if operation == 'structure-commit':
        if method != 'POST':
            raise V3Error(405, '结构增量提交仅允许 POST')
        return commit_v3_structure(folder, payload, common)

    if operation == 'markdown':
        if method != 'GET':
            raise V3Error(405, 'Markdown 重构查询仅允许 GET')
        return existing_v3_markdown(folder)

    if operation == 'pdf-map':
        if method != 'GET':
            raise V3Error(405, 'PDF 映射查询仅允许 GET')
        return existing_v3_pdf_map(folder)

    if operation == 'pdf':
        if method != 'GET':
            raise V3Error(405, 'PDF 原文读取仅允许只读 GET')
        return read_verified_pdf(folder)

    raise V3Error(404, '未知的 V3 数据接口操作')


def handle(handler, subpath: str, parsed, common) -> None:
    """统一 Lab 网关动态后端入口：handle(handler, relative_after_api, parsed_url, frame_workspace_io)。"""
    def respond_json(code: int, body: dict) -> None:
        handler.respond(code, json.dumps(body, ensure_ascii=False), 'application/json; charset=utf-8')

    if common is None:
        respond_json(503, {'error': 'Frame F02 授权依赖不可用'})
        return

    try:
        if not isinstance(subpath, str) or not subpath.startswith(PREFIX):
            raise V3Error(404, '未知的 V3 API 路径')
        operation = subpath[len(PREFIX):]
        if not operation or '/' in operation:
            raise V3Error(404, '无效的 V3 API 操作名')

        if handler.command not in ('GET', 'POST'):
            raise V3Error(405, '不允许的 HTTP 请求方法')

        if handler.command == 'POST':
            if handler.headers.get('Origin') not in common.ALLOWED_ORIGINS:
                raise V3Error(403, '拒绝未经授权来源的写入请求')
            if handler.headers.get('Transfer-Encoding'):
                raise V3Error(400, '不支持 chunked 传输编码')
            try:
                content_length = int(handler.headers.get('Content-Length', '-1'))
            except ValueError:
                content_length = -1
            max_len = (
                4 * 1024 * 1024 if operation == 'md-commit'
                else 1024 * 1024 if operation == 'structure-commit'
                else 65536
            )
            if not (2 <= content_length <= max_len):
                raise V3Error(413, '请求体大小不合法')
            raw = handler.rfile.read(content_length)
            if len(raw) != content_length:
                raise V3Error(400, '请求体字节不完整')
            try:
                payload = json.loads(raw.decode('utf-8'))
            except (ValueError, UnicodeDecodeError) as err:
                raise V3Error(400, '请求体不是合法的 UTF-8 JSON') from err
            if not isinstance(payload, dict):
                raise V3Error(422, '请求 JSON 顶层必须是对象')
        else:
            payload = {}

        query = parse_qs(parsed.query)
        workspace_raw = (
            payload.get('workspace') if handler.command == 'POST' else query.get('workspace', [None])[0]
        )
        roots = common.authorized_roots(handler.headers.get('Cookie', ''))
        folder = common.checked_workspace(workspace_raw, roots)
        result = _dispatch_mineru_base(operation, handler.command, folder, payload, query, common)
        if operation == 'pdf':
            handler.respond(200, result, 'application/pdf')
        else:
            respond_json(200, result)
    except V3Error as err:
        respond_json(err.status, {'error': str(err)})
    except common.WorkspaceIOError as err:
        respond_json(err.code, {'error': str(err)})
    except common.AccessError as err:
        respond_json(err.code, {'error': str(err)})
    except FileExistsError:
        respond_json(409, {'error': 'V3 数据库已经存在，拒绝覆盖'})
    except PermissionError:
        respond_json(403, {'error': '工作目录权限不足，无法访问 V3 SQLite'})
    except (OSError, sqlite3.Error) as err:
        respond_json(503, {'error': '本地 V3 SQLite 操作失败：' + type(err).__name__})
