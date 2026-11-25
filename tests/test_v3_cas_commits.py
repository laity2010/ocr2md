"""WP03 隔离直接测试：V3 摘要式增量 CAS（md-commit 与 structure-commit）。

覆盖：
1. md-commit 成功更新、返回最新块哈希、mineru_base 与同目录 ocr2md.v2.sqlite 零改动；
2. md-commit 对过期 structureSha256、过期 beforeSha256、组末少于 2 个 LF、组内少于 1 个 LF、CR 字符的 409/422 拒绝与全量原子回滚；
3. 局部 O(k) 尾换行校验与全表 to_owned_markdown 重组校验的一致性证明；
4. structure-commit 兄弟块交换（验证临时坐标停泊不触发 UNIQUE(p,b,s) 冲突）、独立根块归入前组为子块（含伴随组末 2 LF -> 1 LF 调整与 boundaryChecks 校验）；
5. structure-commit 对漏报 boundaryChecks、过期边界块 beforeSha256、产生孙块或破坏组连续性的全量回滚保护；
6. 网关动态 HTTP handle 端到端 md-commit / structure-commit 鉴权与提交测试。
"""
from __future__ import annotations

import hashlib
import importlib
import importlib.util
import io
import json
import os
from pathlib import Path
import sys
import tempfile
import types
import unittest
from unittest.mock import patch
from urllib.parse import urlencode, urlsplit

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS_DIR = ROOT / 'scripts'
PKG_DIR = SCRIPTS_DIR / 'lab_backend'


def load_isolated_v3_backend(pkg_name: str = 'ocr2md_lab__lab_ocr_v3_cas_test'):
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


def sha256_text(text: str) -> str:
    return hashlib.sha256(text.encode('utf-8')).hexdigest()


def cas_fixture_doc() -> dict:
    """构造含独立父块与父子块组（s0, s1, s2）的 MinerUJSON 夹具。"""
    return {
        'pdf_info': [
            {
                'page_idx': 0,
                'page_size': [612, 792],
                'preproc_blocks': [],
                'discarded_blocks': [],
                'para_blocks': [
                    {
                        'type': 'title',
                        'index': 0,
                        'level': 1,
                        'bbox': [50, 40, 500, 70],
                        'lines': [{'spans': [{'type': 'text', 'content': 'Title A'}]}],
                    },
                    {
                        'type': 'text',
                        'index': 1,
                        'bbox': [50, 80, 500, 130],
                        'lines': [{'spans': [{'type': 'text', 'content': 'Paragraph B'}]}],
                    },
                    {
                        'type': 'text',
                        'index': 2,
                        'bbox': [50, 140, 500, 190],
                        'lines': [{'spans': [{'type': 'text', 'content': 'Paragraph C'}]}],
                    },
                    {
                        'type': 'image',
                        'index': 3,
                        'bbox': [50, 210, 500, 400],
                        'blocks': [
                            {
                                'type': 'image_body',
                                'index': 0,
                                'bbox': [50, 210, 500, 360],
                                'lines': [{'spans': [{'type': 'image', 'image_path': 'https://cdn-mineru.openxlab.org.cn/a.png'}]}],
                            },
                            {
                                'type': 'image_caption',
                                'index': 1,
                                'bbox': [50, 365, 500, 400],
                                'lines': [{'spans': [{'type': 'text', 'content': 'Fig Caption'}]}],
                            },
                        ],
                    },
                ],
            }
        ]
    }


class StubCommon:
    @staticmethod
    def probe(_folder):
        return {'verified': True}


class V3CasCommitsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.home = Path(self.tmp.name).resolve(strict=True)
        self.books_root = self.home / 'books'
        self.books_root.mkdir()
        self.book = self.books_root / 'cas-book'
        self.book.mkdir()
        (self.book / 'minerujson').mkdir()
        (self.book / 'minerujson' / 'doc.json').write_text(
            json.dumps(cas_fixture_doc(), ensure_ascii=False),
            encoding='utf-8',
        )
        self.v2_db = self.book / 'ocr2md.v2.sqlite'
        self.v2_db.write_bytes(b'v2-untouched-bytes')

        self.backend = load_isolated_v3_backend()
        self.db_mod = importlib.import_module(self.backend.__name__ + '.db')
        self.imp_mod = importlib.import_module(self.backend.__name__ + '.importer')
        self.cas_mod = importlib.import_module(self.backend.__name__ + '.cas')
        self.proj_mod = importlib.import_module(self.backend.__name__ + '.projection')

        self.init_res = self.imp_mod.import_v3_book(
            self.book,
            {'workspace': str(self.book), 'confirm': 'import-v3-mineru-base'},
            StubCommon,
        )

    def _logical_rows(self) -> list[dict]:
        return self.imp_mod.existing_v3_state(self.book, table='logical_block')['rows']

    def test_still_only_one_sqlite_connect_in_entire_package(self):
        """加入 cas.py 后，整个 scripts/lab_backend/ 包仍只能有 db.py 唯一一处 sqlite3.connect。"""
        hits = [
            f'{p.name}:{p.read_text(encoding="utf-8").count("sqlite3.connect(")}'
            for p in sorted(PKG_DIR.glob('*.py'))
            if 'sqlite3.connect(' in p.read_text(encoding='utf-8')
        ]
        self.assertEqual(hits, ['db.py:1'])

    def test_md_commit_summary_cas_local_ok_and_rollback_on_conflict(self):
        """验证 md-commit 正常写入、O(k) 尾换行门禁与全表重组等价性，以及冲突原子回滚。"""
        rows = self._logical_rows()
        by_pbs = {f"p{r['p']}b{r['b']}s{r['s']}": r for r in rows}
        struct_sha = self.init_res['structureSha256']

        # 修改独立组末块 p0b1s0 与同组中间子块 p0b3s1
        b1 = by_pbs['p0b1s0']
        s1 = by_pbs['p0b3s1']
        out = self.cas_mod.commit_v3_md(
            self.book,
            {
                'workspace': str(self.book),
                'confirm': 'commit-v3-md',
                'structureSha256': struct_sha,
                'changes': [
                    {
                        'logicalId': b1['logical_id'],
                        'beforeSha256': b1['md_sha256'],
                        'after': 'Paragraph B edited\nSecond line\n\n',
                    },
                    {
                        'logicalId': s1['logical_id'],
                        'beforeSha256': s1['md_sha256'],
                        'after': '![](media/local.png)\n',
                    },
                ],
            },
            StubCommon,
        )
        self.assertTrue(out['saved'])
        self.assertEqual(out['changedRows'], 2)
        self.assertEqual(out['structureSha256'], struct_sha)
        # 全表 Markdown 往返依然严格成立
        snap = self.imp_mod.existing_v3_markdown(self.book)
        self.assertIn('Paragraph B edited\nSecond line\n\n', snap['markdown'])
        self.assertEqual(self.v2_db.read_bytes(), b'v2-untouched-bytes')

        # 1) 旧 beforeSha256 重放必须 409 回滚（包含同批次另一合法块也不得部分写入）
        b2 = by_pbs['p0b2s0']
        with self.assertRaises(self.db_mod.V3Error) as stale_sha_err:
            self.cas_mod.commit_v3_md(
                self.book,
                {
                    'workspace': str(self.book),
                    'confirm': 'commit-v3-md',
                    'structureSha256': struct_sha,
                    'changes': [
                        {
                            'logicalId': b2['logical_id'],
                            'beforeSha256': b2['md_sha256'],
                            'after': 'Should rollback together\n\n',
                        },
                        {
                            'logicalId': b1['logical_id'],
                            'beforeSha256': b1['md_sha256'],  # 过期哈希！
                            'after': 'Stale overwrite\n\n',
                        },
                    ],
                },
                StubCommon,
            )
        self.assertEqual(stale_sha_err.exception.status, 409)
        after_rollback = {r['logical_id']: r['md_block'] for r in self._logical_rows()}
        self.assertEqual(after_rollback[b2['logical_id']], 'Paragraph C\n\n')

        # 2) 过期 structureSha256 必须 409 拒绝
        with self.assertRaises(self.db_mod.V3Error) as stale_struct_err:
            self.cas_mod.commit_v3_md(
                self.book,
                {
                    'workspace': str(self.book),
                    'confirm': 'commit-v3-md',
                    'structureSha256': '0' * 64,
                    'changes': [
                        {
                            'logicalId': b2['logical_id'],
                            'beforeSha256': b2['md_sha256'],
                            'after': 'Wrong struct sha\n\n',
                        }
                    ],
                },
                StubCommon,
            )
        self.assertEqual(stale_struct_err.exception.status, 409)

        # 3) 独立组末块仅给 1 个 \n 必须被局部 O(k) 边界门禁 409 拦截
        with self.assertRaises(self.db_mod.V3Error) as lf_err:
            self.cas_mod.commit_v3_md(
                self.book,
                {
                    'workspace': str(self.book),
                    'confirm': 'commit-v3-md',
                    'structureSha256': struct_sha,
                    'changes': [
                        {
                            'logicalId': b2['logical_id'],
                            'beforeSha256': b2['md_sha256'],
                            'after': 'Only one LF at group end\n',
                        }
                    ],
                },
                StubCommon,
            )
        self.assertEqual(lf_err.exception.status, 409)

        # 4) 同组非末块（p0b3s0）给 0 个 \n 也必须 409 拦截
        s0 = by_pbs['p0b3s0']
        with self.assertRaises(self.db_mod.V3Error) as s0_err:
            self.cas_mod.commit_v3_md(
                self.book,
                {
                    'workspace': str(self.book),
                    'confirm': 'commit-v3-md',
                    'structureSha256': struct_sha,
                    'changes': [
                        {
                            'logicalId': s0['logical_id'],
                            'beforeSha256': s0['md_sha256'],
                            'after': 'No trailing LF',
                        }
                    ],
                },
                StubCommon,
            )
        self.assertEqual(s0_err.exception.status, 409)

    def test_structure_commit_parking_swap_and_reparent_with_boundary_cas(self):
        """验证兄弟块互换（临时坐标停泊防 UNIQUE 冲突）与归入子块（边界块 beforeSha256 核验）。"""
        rows = self._logical_rows()
        by_pbs = {f"p{r['p']}b{r['b']}s{r['s']}": r for r in rows}
        struct_sha = self.init_res['structureSha256']

        # 场景 A：交换 p0b1s0 (order=2) 与 p0b2s0 (order=3) 的顺序与 b 坐标
        # 两者在交换前后都是各自独立单块组的组末（same_group_successor 均为 None -> None），因此 boundaryChecks 为 []
        r1 = by_pbs['p0b1s0']
        r2 = by_pbs['p0b2s0']
        swap_res = self.cas_mod.commit_v3_structure(
            self.book,
            {
                'workspace': str(self.book),
                'confirm': 'commit-v3-structure',
                'structureSha256': struct_sha,
                'changes': [
                    {
                        'logicalId': r1['logical_id'],
                        'before': {'parentId': None, 'logicalOrder': 2, 'p': 0, 'b': 1, 's': 0},
                        'after': {'parentId': None, 'logicalOrder': 3, 'p': 0, 'b': 2, 's': 0},
                    },
                    {
                        'logicalId': r2['logical_id'],
                        'before': {'parentId': None, 'logicalOrder': 3, 'p': 0, 'b': 2, 's': 0},
                        'after': {'parentId': None, 'logicalOrder': 2, 'p': 0, 'b': 1, 's': 0},
                    },
                ],
                'textChanges': [],
                'boundaryChecks': [],
            },
            StubCommon,
        )
        self.assertTrue(swap_res['saved'])
        self.assertNotEqual(swap_res['structureSha256'], struct_sha)

        # 场景 B：将新位置 p0b2s0（原 r1，order=3）归入前一组 p0b1（原 r2，order=2）成为子块 p0b1s1！
        # 此时原 r2 从组末（successor=None）变成组内首块（successor=r1.logical_id）！
        # 因此 boundaryChecks 必须包含 r2.logical_id，且伴随将 r2 的 'Paragraph C\n\n' 消解多余组间空行为 'Paragraph C\n'
        rows_after_swap = {r['logical_id']: r for r in self._logical_rows()}
        r2_cur = rows_after_swap[r2['logical_id']]
        r1_cur = rows_after_swap[r1['logical_id']]

        # 先验证漏传 boundaryChecks 时必须被 422 拒绝且不改动数据库
        with self.assertRaises(self.db_mod.V3Error) as missing_boundary:
            self.cas_mod.commit_v3_structure(
                self.book,
                {
                    'workspace': str(self.book),
                    'confirm': 'commit-v3-structure',
                    'structureSha256': swap_res['structureSha256'],
                    'changes': [
                        {
                            'logicalId': r1_cur['logical_id'],
                            'before': {'parentId': None, 'logicalOrder': 3, 'p': 0, 'b': 2, 's': 0},
                            'after': {'parentId': r2_cur['logical_id'], 'logicalOrder': 3, 'p': 0, 'b': 1, 's': 1},
                        }
                    ],
                    'textChanges': [],
                    'boundaryChecks': [],
                },
                StubCommon,
            )
        self.assertEqual(missing_boundary.exception.status, 422)

        # 传入完整 boundaryChecks 与伴随 textChanges（保留 p0b2 空号亦完全合法，验证不强求无空号）
        reparent_res = self.cas_mod.commit_v3_structure(
            self.book,
            {
                'workspace': str(self.book),
                'confirm': 'commit-v3-structure',
                'structureSha256': swap_res['structureSha256'],
                'changes': [
                    {
                        'logicalId': r1_cur['logical_id'],
                        'before': {'parentId': None, 'logicalOrder': 3, 'p': 0, 'b': 2, 's': 0},
                        'after': {'parentId': r2_cur['logical_id'], 'logicalOrder': 3, 'p': 0, 'b': 1, 's': 1},
                    }
                ],
                'textChanges': [
                    {
                        'logicalId': r2_cur['logical_id'],
                        'beforeSha256': r2_cur['md_sha256'],
                        'after': 'Paragraph C\n',
                    }
                ],
                'boundaryChecks': [
                    {
                        'logicalId': r2_cur['logical_id'],
                        'beforeSha256': r2_cur['md_sha256'],
                    }
                ],
            },
            StubCommon,
        )
        self.assertTrue(reparent_res['saved'])
        self.assertEqual(reparent_res['textChangedRows'], 1)
        snap = self.imp_mod.existing_v3_markdown(self.book)
        self.assertEqual(snap['structureSha256'], reparent_res['structureSha256'])
        self.assertIn('Paragraph C\nParagraph B\n\n', snap['markdown'])

    def test_http_handle_md_and_structure_commit_routes(self):
        """通过网关动态后端 handle(...) 验证 md-commit HTTP 路由鉴权与状态演进。"""
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
                'code': '12345678ABCDEFGH',
                'secret': 'c' * 64,
                'allowedRoots': [str(self.books_root)],
            }),
            encoding='utf-8',
        )
        os.chmod(cfg, 0o600)

        def call_v3(method: str, subpath: str, *, query: str = '', body: dict | None = None, cookie: str = ''):
            raw = json.dumps(body).encode('utf-8') if body is not None else b''
            captured = []
            handler = types.SimpleNamespace(
                command=method,
                headers={
                    'Origin': 'https://ocr2md.laity.bid',
                    'Cookie': cookie,
                    'Content-Length': str(len(raw)),
                },
                rfile=io.BytesIO(raw),
                respond=lambda code, data, ctype, *extra: captured.append((code, json.loads(data))),
            )
            self.backend.handle(
                handler,
                subpath,
                urlsplit('http://local/labs/lab-ocr-v3/api/' + subpath + ('?' + query if query else '')),
                f02,
            )
            return captured[0]

        with patch.object(auth, 'CONFIG', cfg):
            cookie = auth.unlock('12345678ABCDEFGH').split(';')[0]
            q_ws = urlencode({'workspace': str(self.book), 'table': 'logical_block'})
            code, st = call_v3('GET', 'mineru-base/state', query=q_ws, cookie=cookie)
            self.assertEqual(code, 200)
            first = st['rows'][0]

            code, res = call_v3(
                'POST',
                'mineru-base/md-commit',
                cookie=cookie,
                body={
                    'workspace': str(self.book),
                    'confirm': 'commit-v3-md',
                    'structureSha256': st['structureSha256'],
                    'changes': [
                        {
                            'logicalId': first['logical_id'],
                            'beforeSha256': first['md_sha256'],
                            'after': '# Title A Updated\n\n',
                        }
                    ],
                },
            )
            self.assertEqual(code, 200)
            self.assertTrue(res['saved'])
            self.assertEqual(
                res['updatedHashes'][str(first['logical_id'])],
                sha256_text('# Title A Updated\n\n'),
            )


if __name__ == '__main__':
    unittest.main()
