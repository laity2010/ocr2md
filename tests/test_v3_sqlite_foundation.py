"""WP02 隔离直接测试：V3 SQLite 底座、open_v3_db、zlib 归档、单轨 owned-LF 与动态网关加载。

不访问任何用户真实书库或 V2 运行目录，全部在 TemporaryDirectory 内构造完备夹具验证。
"""
from __future__ import annotations

import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from urllib.parse import urlsplit
import zlib

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / 'scripts'
PKG_DIR = SCRIPTS_DIR / 'lab_backend'


def load_isolated_v3_backend(pkg_name: str = 'ocr2md_lab__lab_ocr_v3_test'):
    """完全复刻统一网关 _load_dynamic_backend 的隔离加载方式，不修改 sys.path。"""
    for key in [k for k in sys.modules if k == pkg_name or k.startswith(pkg_name + '.')]:
        sys.modules.pop(key, None)
    spec = importlib.util.spec_from_file_location(
        pkg_name,
        str(PKG_DIR / '__init__.py'),
        submodule_search_locations=[str(PKG_DIR)],
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    sys.modules[pkg_name] = module
    spec.loader.exec_module(module)
    return module


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def sample_mineru_doc() -> dict:
    """构造覆盖标题、正文+行内公式、行间公式、图片及跨页续表恢复的两页 MinerUJSON 夹具。"""
    return {
        'pdf_info': [
            {
                'page_idx': 0,
                'page_size': [612, 792],
                'preproc_blocks': [
                    {
                        'type': 'table',
                        'index': 4,
                        'bbox': [50, 400, 550, 700],
                        'blocks': [
                            {
                                'type': 'table_caption',
                                'index': 0,
                                'bbox': [50, 400, 550, 425],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Table 1: Summary'}]}],
                            },
                            {
                                'type': 'table_body',
                                'index': 1,
                                'bbox': [50, 430, 550, 680],
                                'lines': [{'spans': [{'type': 'table', 'html': '<table><thead><tr><th>Portfolio / Regression Factor Specification</th><th>Annualized Excess Alpha (%)</th><th>t-Statistic</th></tr></thead><tbody><tr><td>2020</td><td>1.2</td></tr></tbody></table>'}]}],
                            },
                        ],
                    }
                ],
                'discarded_blocks': [
                    {
                        'type': 'header',
                        'index': 99,
                        'bbox': [50, 10, 550, 30],
                        'lines': [{'spans': [{'type': 'text', 'content': 'Running Header'}]}],
                    }
                ],
                'para_blocks': [
                    {
                        'type': 'title',
                        'index': 0,
                        'level': 2,
                        'bbox': [50, 50, 500, 80],
                        'lines': [{'spans': [{'type': 'text', 'content': "Buffett's\nAlpha"}]}],
                    },
                    {
                        'type': 'text',
                        'index': 1,
                        'bbox': [50, 95, 550, 160],
                        'lines': [
                            {
                                'spans': [
                                    {'type': 'text', 'content': 'Ratio is '},
                                    {'type': 'inline_equation', 'content': r'\alpha_i > 0'},
                                    {'type': 'text', 'content': ' in sample.'},
                                ]
                            }
                        ],
                    },
                    {
                        'type': 'interline_equation',
                        'index': 2,
                        'bbox': [80, 180, 500, 220],
                        'lines': [{'spans': [{'type': 'interline_equation', 'content': 'E = mc^2'}]}],
                    },
                    {
                        'type': 'image',
                        'index': 3,
                        'bbox': [60, 230, 520, 380],
                        'blocks': [
                            {
                                'type': 'image_body',
                                'index': 0,
                                'bbox': [60, 230, 520, 350],
                                'lines': [{'spans': [{'type': 'image', 'image_path': 'https://cdn-mineru.openxlab.org.cn/demo/fig1.png'}]}],
                            },
                            {
                                'type': 'image_caption',
                                'index': 1,
                                'bbox': [60, 355, 520, 380],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Figure 1'}]}],
                            },
                        ],
                    },
                    {
                        'type': 'table',
                        'index': 4,
                        'bbox': [50, 400, 550, 700],
                        'blocks': [
                            {
                                'type': 'table_caption',
                                'index': 0,
                                'bbox': [50, 400, 550, 425],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Table 1: Summary'}]}],
                            },
                            {
                                'type': 'table_body',
                                'index': 1,
                                'bbox': [50, 430, 550, 680],
                                'lines': [{'spans': [{'type': 'table', 'html': '<table><thead><tr><th>Portfolio / Regression Factor Specification</th><th>Annualized Excess Alpha (%)</th><th>t-Statistic</th></tr></thead><tbody><tr><td>2020</td><td>1.2</td></tr><tr><td>2021</td><td>1.5</td></tr></tbody></table>'}]}],
                            },
                            {
                                'type': 'table_footnote',
                                'index': 2,
                                'bbox': [50, 682, 550, 700],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Note: Continued from p2.'}]}],
                            },
                        ],
                    },
                ],
            },
            {
                'page_idx': 1,
                'page_size': [612, 792],
                'preproc_blocks': [
                    {
                        'type': 'table',
                        'index': 0,
                        'bbox': [50, 60, 550, 360],
                        'blocks': [
                            {
                                'type': 'table_caption',
                                'index': 0,
                                'bbox': [50, 60, 550, 85],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Table 1 (continued)'}]}],
                            },
                            {
                                'type': 'table_body',
                                'index': 1,
                                'bbox': [50, 90, 550, 330],
                                'lines': [{'spans': [{'type': 'table', 'html': '<table><thead><tr><th>Portfolio / Regression Factor Specification</th><th>Annualized Excess Alpha (%)</th><th>t-Statistic</th></tr></thead><tbody><tr><td>2021</td><td>1.5</td></tr></tbody></table>'}]}],
                            },
                            {
                                'type': 'table_footnote',
                                'index': 2,
                                'bbox': [50, 335, 550, 360],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Note: Continued from p2.'}]}],
                            },
                        ],
                    }
                ],
                'discarded_blocks': [],
                'para_blocks': [
                    {
                        'type': 'table',
                        'index': 0,
                        'bbox': [50, 60, 550, 360],
                        'blocks': [
                            {
                                'type': 'table_caption',
                                'index': 0,
                                'bbox': [50, 60, 550, 85],
                                'lines_deleted': True,
                                'lines': [],
                            },
                            {
                                'type': 'table_body',
                                'index': 1,
                                'bbox': [50, 90, 550, 330],
                                'lines_deleted': True,
                                'lines': [],
                            },
                            {
                                'type': 'table_footnote',
                                'index': 2,
                                'bbox': [50, 335, 550, 360],
                                'lines_deleted': True,
                                'lines': [],
                            },
                        ],
                    }
                ],
            },
        ]
    }


class V3SqliteFoundationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name).resolve(strict=True)
        self.books_root = self.home / 'books'
        self.books_root.mkdir()
        # 故意使用带空格与 # ? 字符的子目录名称测试 SQLite URI 转义安全性
        self.book = self.books_root / 'Book #1? Alpha'
        self.book.mkdir()
        (self.book / 'mineru json').mkdir()
        (self.book / 'pdf').mkdir()

        self.json_path = self.book / 'mineru json' / 'sample.json'
        self.json_bytes = json.dumps(sample_mineru_doc(), ensure_ascii=False, indent=2).encode('utf-8')
        self.json_path.write_bytes(self.json_bytes)

        self.pdf_path = self.book / 'pdf' / 'sample.pdf'
        self.pdf_bytes = b'%PDF-1.7\n1 0 obj\n<<>>\nendobj\n%%EOF\n'
        self.pdf_path.write_bytes(self.pdf_bytes)

        # 在同目录预置模拟的 ocr2md.v2.sqlite，核验 V3 绝不触碰 V2 数据库
        self.v2_db_path = self.book / 'ocr2md.v2.sqlite'
        self.v2_sentinel = b'SQLite format 3\x00v2-untouched-sentinel-payload'
        self.v2_db_path.write_bytes(self.v2_sentinel)
        self.v2_stat_before = self.v2_db_path.stat()

        self.backend = load_isolated_v3_backend()
        self.db_mod = importlib.import_module(self.backend.__name__ + '.db')
        self.imp_mod = importlib.import_module(self.backend.__name__ + '.importer')
        self.proj_mod = importlib.import_module(self.backend.__name__ + '.projection')

    def test_single_sqlite_connect_callsite_in_package(self):
        """静态源码审计：整个 scripts/lab_backend/ 包仅允许 db.py 的 open_v3_db 调用 sqlite3.connect。"""
        hits: list[str] = []
        for py_file in sorted(PKG_DIR.glob('*.py')):
            text = py_file.read_text(encoding='utf-8')
            count = text.count('sqlite3.connect(')
            if count:
                hits.append(f'{py_file.name}:{count}')
        self.assertEqual(hits, ['db.py:1'])

    def test_zlib_archive_single_track_owned_lf_and_v2_isolation(self):
        """验证新建 ocr2md.v3.sqlite、zlib 压缩归档、跨页表格恢复、owned-LF 往返及 V2 零触碰。"""
        probe_called = []

        class StubCommon:
            @staticmethod
            def probe(folder):
                probe_called.append(folder)
                return {'verified': True}

        res = self.imp_mod.import_v3_book(
            self.book,
            {'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
            StubCommon,
        )
        self.assertEqual(probe_called, [self.book])
        self.assertTrue(res['created'])
        self.assertEqual(res['dbFile'], 'ocr2md.v3.sqlite')
        self.assertEqual(res['compression'], 'zlib')
        self.assertLess(res['compressedBytes'], len(self.json_bytes))

        # 核验 V2 数据库及原始 JSON/PDF 完全未被修改
        v2_stat_after = self.v2_db_path.stat()
        self.assertEqual(self.v2_db_path.read_bytes(), self.v2_sentinel)
        self.assertEqual(v2_stat_after.st_ino, self.v2_stat_before.st_ino)
        self.assertEqual(v2_stat_after.st_mtime_ns, self.v2_stat_before.st_mtime_ns)
        self.assertEqual(self.json_path.read_bytes(), self.json_bytes)
        self.assertEqual(self.pdf_path.read_bytes(), self.pdf_bytes)

        # 直接通过 open_v3_db('ro') 检查 zlib 原始字节、外键约束及只读保护
        with self.db_mod.open_v3_db(self.book, 'ro') as ro_db:
            self.assertEqual(ro_db.execute('PRAGMA foreign_keys').fetchone()[0], 1)
            self.assertEqual(ro_db.execute('PRAGMA busy_timeout').fetchone()[0], 5000)
            self.assertEqual(ro_db.execute('PRAGMA user_version').fetchone()[0], 3001)
            row0 = ro_db.execute('SELECT block_json, original_bytes FROM mineru_base WHERE blockid = 0').fetchone()
            meta = json.loads(row0['block_json'])
            raw_decompressed = zlib.decompress(row0['original_bytes'])
            entries = json.loads(raw_decompressed.decode('utf-8'))
            self.assertEqual(len(entries), 1)
            self.assertEqual(entries[0]['sha256'], meta['sources'][0]['sha256'])
            with self.assertRaises(sqlite3.OperationalError):
                ro_db.execute('DELETE FROM logical_block')

        # 核验外键约束在 rw 模式下真实拦截非法 base_blockid
        with self.db_mod.open_v3_db(self.book, 'rw') as rw_db:
            rw_db.execute('BEGIN IMMEDIATE')
            with self.assertRaises(sqlite3.IntegrityError):
                rw_db.execute(
                    'INSERT INTO logical_block(logical_id, base_blockid, parent_id, logical_order, md_block, block_type, p, b, s, raw_path) '
                    "VALUES (9999, 999999, NULL, 9999, 'x\n\n', 'text', 99, 0, 0, '$')"
                )
            rw_db.execute('ROLLBACK')

        # 核验单轨 owned-LF 编译结果（标题、行内公式、行间公式、图片、跨页表格恢复与脚注去重）
        state = self.imp_mod.existing_v3_state(self.book, table='logical_block')
        self.assertTrue(state['exists'])
        self.assertEqual(state['structureSha256'], res['structureSha256'])
        rows_by_pbs = {f"p{r['p']}b{r['b']}s{r['s']}": r for r in state['rows']}

        self.assertEqual(rows_by_pbs['p0b0s0']['md_block'], "## Buffett's Alpha\n\n")
        self.assertEqual(rows_by_pbs['p0b0s0']['raw_block'], "Buffett's\nAlpha")
        self.assertEqual(rows_by_pbs['p0b1s0']['md_block'], 'Ratio is $\\alpha_i > 0$ in sample.\n\n')
        self.assertEqual(rows_by_pbs['p0b2s0']['md_block'], '$$E = mc^2$$\n\n')
        # 同组相邻子块（p0b3s0 -> s1 -> s2）：s0 与 s1 以 1 个 \n 结尾，组末 s2 以 2 个 \n 结尾
        self.assertEqual(rows_by_pbs['p0b3s0']['md_block'], '\n')
        self.assertEqual(
            rows_by_pbs['p0b3s1']['md_block'],
            '![](<https://cdn-mineru.openxlab.org.cn/demo/fig1.png>)\n',
        )
        self.assertEqual(rows_by_pbs['p0b3s2']['md_block'], 'Figure 1\n\n')

        # 跨页表格恢复核验：p0b4 表体恢复本页 preproc 表体，重复的续页脚注在 p0b4s3 被清空，并在 p1b0s1..s3 完整恢复！
        self.assertIn('<td>2020</td>', rows_by_pbs['p0b4s2']['md_block'])
        self.assertNotIn('<td>2021</td>', rows_by_pbs['p0b4s2']['md_block'])
        self.assertEqual(rows_by_pbs['p0b4s3']['md_block'], '\n\n')
        self.assertEqual(rows_by_pbs['p1b0s1']['md_block'], 'Table 1 (continued)\n')
        self.assertIn('<td>2021</td>', rows_by_pbs['p1b0s2']['md_block'])
        self.assertEqual(rows_by_pbs['p1b0s3']['md_block'], 'Note: Continued from p2.\n\n')

        # 核验 Markdown 导出与严格逆变换、PDF 投影（含空块 empty 判定与公式块提取）
        md_snap = self.imp_mod.existing_v3_markdown(self.book)
        self.assertEqual(md_snap['structureSha256'], res['structureSha256'])
        self.assertEqual(len(self.proj_mod.from_owned_markdown(md_snap)), state['logicalCount'])

        pdf_map = self.imp_mod.existing_v3_pdf_map(self.book)
        self.assertEqual(pdf_map['pageCount'], 2)
        self.assertEqual(pdf_map['structureSha256'], res['structureSha256'])
        covers_by_pbs = {c['pbs']: c for c in pdf_map['covers']}
        self.assertTrue(covers_by_pbs['p0b3s0']['empty'])
        self.assertFalse(covers_by_pbs['p0b3s1']['empty'])
        self.assertEqual(len(pdf_map['formulaBlocks']), 2)

        # 重复 import 必须幂等且不覆盖已有库；篡改磁盘 JSON 后 import 必须 409 拒绝覆盖
        res_again = self.imp_mod.import_v3_book(
            self.book,
            {'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
            StubCommon,
        )
        self.assertFalse(res_again['created'])
        self.assertEqual(len(probe_called), 1)

        self.json_path.write_bytes(self.json_bytes + b'\n')
        with self.assertRaises(self.db_mod.V3Error) as ctx:
            self.imp_mod.import_v3_book(
                self.book,
                {'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
                StubCommon,
            )
        self.assertEqual(ctx.exception.status, 409)

    def test_open_v3_db_rejects_symlinks_and_hardlinks(self):
        """核验 open_v3_db 对符号链接和 st_nlink > 1 硬链接数据库的强制阻断。"""
        class StubCommon:
            @staticmethod
            def probe(_folder):
                return {'verified': True}

        self.imp_mod.import_v3_book(
            self.book,
            {'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
            StubCommon,
        )
        db_file = self.book / 'ocr2md.v3.sqlite'

        # 制造硬链接后访问必须被 422 拒绝
        hardlink = self.book / 'extra-hardlink.sqlite'
        os.link(db_file, hardlink)
        try:
            with self.assertRaises(self.db_mod.V3Error) as hl_err:
                with self.db_mod.open_v3_db(self.book, 'ro'):
                    pass
            self.assertEqual(hl_err.exception.status, 422)
        finally:
            hardlink.unlink()

        # 替换为符号链接后访问必须被 403 拒绝
        real_backup = self.book / 'moved.sqlite'
        db_file.rename(real_backup)
        db_file.symlink_to(real_backup)
        with self.assertRaises(self.db_mod.V3Error) as sym_err:
            with self.db_mod.open_v3_db(self.book, 'ro'):
                pass
        self.assertEqual(sym_err.exception.status, 403)

    def test_gateway_http_handle_auth_and_endpoints(self):
        """通过真实 Frame F02 鉴权模块测试网关动态入口 handle(...) 全链路行为。"""
        sys_path_before = list(sys.path)
        sys.path.insert(0, str(SCRIPTS_DIR))
        try:
            import frame_access as auth
            import frame_workspace_io as f02
        finally:
            sys.path[:] = sys_path_before

        cfg = self.home / 'frame-access.json'
        cfg.write_text(
            json.dumps({
                'schema': 'ocr2md-frame-access/v1',
                'code': 'ABCD1234EFGH5678',
                'secret': 'b' * 64,
                'allowedRoots': [str(self.books_root)],
            }),
            encoding='utf-8',
        )
        os.chmod(cfg, 0o600)

        def call_v3(method: str, subpath: str, *, query: str = '', body: dict | None = None, cookie: str = '', origin: str = 'https://ocr2md.laity.bid'):
            raw = json.dumps(body).encode('utf-8') if body is not None else b''
            captured = []
            handler = types.SimpleNamespace(
                command=method,
                headers={
                    'Origin': origin,
                    'Cookie': cookie,
                    'Content-Length': str(len(raw)),
                },
                rfile=io.BytesIO(raw),
                respond=lambda code, data, ctype, *extra: captured.append((code, data, ctype)),
            )
            self.backend.handle(handler, subpath, urlsplit('http://local/labs/lab-ocr-v3/api/' + subpath + ('?' + query if query else '')), f02)
            code, payload, ctype = captured[0]
            if ctype.startswith('application/json'):
                return code, json.loads(payload)
            return code, payload

        with patch.object(auth, 'CONFIG', cfg):
            # 未登录必须 403
            code, _ = call_v3('GET', 'mineru-base/state', query=f'workspace={self.book}')
            self.assertEqual(code, 403)

            cookie = auth.unlock('ABCD1234EFGH5678').split(';')[0]
            ws_q = urlsplit('')._replace(query='').geturl()  # placeholder unused
            from urllib.parse import urlencode
            q_ws = urlencode({'workspace': str(self.book)})

            # 非法 Origin 的 POST 必须 403
            code, _ = call_v3(
                'POST',
                'mineru-base/import',
                body={'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
                cookie=cookie,
                origin='https://evil.example',
            )
            self.assertEqual(code, 403)

            # 建库前 state exists=False
            code, pre = call_v3('GET', 'mineru-base/state', query=q_ws, cookie=cookie)
            self.assertEqual(code, 200)
            self.assertFalse(pre['exists'])

            # 合法导入建库
            code, imp = call_v3(
                'POST',
                'mineru-base/import',
                body={'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
                cookie=cookie,
            )
            self.assertEqual(code, 200)
            self.assertTrue(imp['created'])

            # 读取 state、markdown、pdf-map、pdf
            code, st = call_v3('GET', 'mineru-base/state', query=q_ws + '&table=logical_block', cookie=cookie)
            self.assertEqual(code, 200)
            self.assertEqual(st['tableName'], 'logical_block')
            self.assertEqual(st['logicalCount'], imp['logicalCount'])

            code, md = call_v3('GET', 'mineru-base/markdown', query=q_ws, cookie=cookie)
            self.assertEqual(code, 200)
            self.assertEqual(md['schema'], 'v3-logical-md/v1')

            code, pmap = call_v3('GET', 'mineru-base/pdf-map', query=q_ws, cookie=cookie)
            self.assertEqual(code, 200)
            self.assertEqual(pmap['schema'], 'v3-pdf-projection/v1')

            code, pdf_raw = call_v3('GET', 'mineru-base/pdf', query=q_ws, cookie=cookie)
            self.assertEqual(code, 200)
            self.assertEqual(pdf_raw, self.pdf_bytes)


if __name__ == '__main__':
    unittest.main()
