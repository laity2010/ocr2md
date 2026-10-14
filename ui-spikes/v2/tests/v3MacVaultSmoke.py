import base64
import json
from pathlib import Path
import tempfile
import unittest
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from v3_mac_vault import V3MacVault, VaultError


class TestMacVault(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='ocr2md-v3-real-fs-')
        self.addCleanup(self.temp.cleanup)
        root = Path(self.temp.name) / 'ocr2md'
        root.mkdir()
        (root / 'ocr2md').mkdir()
        (root / 'books').mkdir()
        (root / '.obsidian').mkdir()
        (root / '.obsidian' / 'sensitive.json').write_text('secret')
        self.root = root
        self.counter = 0
        self.store = V3MacVault(root, Path(self.temp.name) / 'private' / 'key')

    def loc(self, path):
        return {'workspaceId': self.store.workspace_id, 'path': path}

    def commit(self, operation, request=None):
        if request is None:
            self.counter += 1
            request = f"test-{self.counter}"
        return self.store.commit({'workspaceId': self.store.workspace_id, 'requestId': request, 'operations': [operation]})

    def test_real_root_and_hidden_protection(self):
        page = self.store.list('/')
        self.assertEqual([x['path'] for x in page['entries']], ['/books', '/ocr2md'])
        self.assertEqual(self.store.metadata('/')['kind'], 'directory')
        with self.assertRaises(VaultError):
            self.store.metadata('/.obsidian/sensitive.json')

    def test_directory_create_and_file_binary_read(self):
        self.commit({'type': 'create-directory', 'at': self.loc('/ocr2md/WP3'), 'ifAbsent': True})
        data = '# 真实 Mac Vault\n测试'.encode()
        self.commit({'type': 'create-file', 'at': self.loc('/ocr2md/WP3/first.md'),
                     'ifAbsent': True, 'base64': base64.b64encode(data).decode()})
        node = self.store.metadata('/ocr2md/WP3/first.md')
        response = self.store.read({'path': node['path'], 'nodeId': node['nodeId']}, 0, len(data), node['revision'])
        self.assertEqual(base64.b64decode(response['base64']), data)
        self.assertEqual((self.root / 'ocr2md/WP3/first.md').read_bytes(), data)
        with self.assertRaises(VaultError) as error:
            self.commit({'type': 'create-file', 'at': self.loc('/ocr2md/WP3/first.md'), 'ifAbsent': True, 'base64': ''})
        self.assertEqual(error.exception.code, 'EEXIST')

    def test_move_copy_conflict_remove_and_stale(self):
        data = base64.b64encode(b'alpha').decode()
        self.commit({'type': 'create-file', 'at': self.loc('/ocr2md/a.md'), 'ifAbsent': True, 'base64': data})
        node = self.store.metadata('/ocr2md/a.md')
        self.commit({'type': 'copy', 'target': node, 'expectedRevision': node['revision'],
                     'to': self.loc('/ocr2md/b.md'), 'ifAbsent': True})
        self.assertEqual((self.root / 'ocr2md/b.md').read_bytes(), b'alpha')
        self.commit({'type': 'move', 'target': node, 'expectedRevision': node['revision'],
                     'to': self.loc('/ocr2md/moved.md'), 'ifAbsent': True})
        self.assertEqual(self.store.metadata('/ocr2md/moved.md')['nodeId'], node['nodeId'])
        with self.assertRaises(VaultError) as conflict:
            self.commit({'type': 'remove', 'target': node, 'expectedRevision': node['revision']})
        self.assertEqual(conflict.exception.code, 'ENOENT')
        other = self.store.metadata('/ocr2md/moved.md')
        with self.assertRaises(VaultError) as stale:
            self.commit({'type': 'remove', 'target': other, 'expectedRevision': 'outdated'})
        self.assertEqual(stale.exception.code, 'ESTALE')
        self.commit({'type': 'remove', 'target': other, 'expectedRevision': other['revision']})
        self.assertFalse((self.root / 'ocr2md/moved.md').exists())
        self.assertTrue((self.root / 'ocr2md/b.md').exists())

    def test_traversal_symlink_and_root_guard(self):
        for path in ['/../escape', '/a//b', '/.obsidian/plugins', '/ocr2md/../../outside']:
            with self.assertRaises(VaultError):
                self.store.path(path)
        outside = Path(self.temp.name) / 'outside'
        outside.mkdir()
        (self.root / 'ocr2md' / 'escape').symlink_to(outside)
        with self.assertRaises(VaultError) as error:
            self.store.path('/ocr2md/escape/test.md')
        self.assertEqual(error.exception.code, 'EACCES')
        top = self.store.metadata('/books')
        with self.assertRaises(VaultError):
            self.commit({'type': 'remove', 'target': top, 'expectedRevision': top['revision']})
        with self.assertRaises(VaultError):
            self.commit({'type': 'remove-tree', 'target': top, 'expectedRevision': top['revision'], 'expectedTreeRevision': top['revision'], 'recursive': True})

    def test_external_change_invalidates_page_cursor_and_file_revision(self):
        self.store.page_limit = 1
        first = self.store.list('/')
        (self.root / 'newcategory').mkdir()
        with self.assertRaises(VaultError) as error:
            self.store.list('/', first['nextCursor'])
        self.assertEqual(error.exception.code, 'ESTALE')

    def test_idempotent_single_commit(self):
        operation = {'type': 'create-directory', 'at': self.loc('/ocr2md/once'), 'ifAbsent': True}
        result = self.commit(operation, 'same-key')
        self.assertEqual(self.commit(operation, 'same-key'), result)
        with self.assertRaises(VaultError) as error:
            self.commit({'type': 'create-directory', 'at': self.loc('/ocr2md/other'), 'ifAbsent': True}, 'same-key')
        self.assertEqual(error.exception.code, 'ECONFLICT')
        replacement = V3MacVault(self.root, self.store.secret_path)
        self.assertEqual(replacement.commit({'workspaceId': self.store.workspace_id,
            'requestId': 'same-key', 'operations': [operation]}), result)

    def test_sidecar_scoped_coordinated_create_replace(self):
        book = self.root / 'ocr2md' / 'Trial'
        book.mkdir()
        meta = book / '.ocr2md'
        meta.mkdir()
        # These historical metadata files must not become remotely exposed.
        (meta / 'table-presentation.json').write_text('private', encoding='utf-8')
        target = '/ocr2md/Trial/.ocr2md/pdf-md-map.v1.json'
        for denied in [
            '/.obsidian/sensitive.json',
            '/ocr2md/Trial/.ocr2md/table-presentation.json',
            '/ocr2md/Trial/.ocr2md/chapter-boundary',
            '/ocr2md/Trial/.ocr2md/other-file.json',
        ]:
            with self.assertRaises(VaultError) as hidden:
                self.store.metadata(denied)
            self.assertEqual(hidden.exception.code, 'EACCES')
        with self.assertRaises(VaultError) as browsing:
            self.store.list('/ocr2md/Trial/.ocr2md')
        self.assertEqual(browsing.exception.code, 'EACCES')
        self.assertFalse(any(x['path'].endswith('/.ocr2md') for x
                             in self.store.list('/ocr2md/Trial')['entries']))

        def update(kind, data, ref=None, request_id=None):
            encoded = base64.b64encode(data).decode('ascii')
            if kind == 'create-file':
                op = {'type': kind, 'at': self.loc(target), 'ifAbsent': True,
                      'base64': encoded}
            else:
                op = {'type': kind, 'target': ref, 'expectedRevision': ref['revision'],
                      'base64': encoded}
            return self.commit(op, request=request_id)

        first = update('create-file', b'{"v":1}', request_id='sidecar-created')
        self.assertEqual(first['committed'], True)
        self.assertEqual((meta / 'pdf-md-map.v1.json').read_bytes(), b'{"v":1}')
        node = self.store.metadata(target)
        self.assertEqual(base64.b64decode(self.store.read(
            {'path': target, 'nodeId': node['nodeId']}, 0, 7, node['revision'])['base64']), b'{"v":1}')
        with self.assertRaises(VaultError) as duplicate:
            update('create-file', b'{"v":2}')
        self.assertEqual(duplicate.exception.code, 'EEXIST')
        with self.assertRaises(VaultError) as removal:
            self.commit({'type': 'remove', 'target': node,
                         'expectedRevision': node['revision']})
        self.assertEqual(removal.exception.code, 'EACCES')

        if not self.store.coordinated_replace_supported():
            self.skipTest('macOS Swift NSFileCoordinator unavailable')
        update('replace-file', b'{"v":2}', ref=node, request_id='sidecar-replaced')
        self.assertEqual((meta / 'pdf-md-map.v1.json').read_bytes(), b'{"v":2}')
        with self.assertRaises(VaultError) as stale:
            update('replace-file', b'{"v":3}', ref=node)
        self.assertEqual(stale.exception.code, 'ESTALE')
        self.assertEqual((meta / 'pdf-md-map.v1.json').read_bytes(), b'{"v":2}')

        review = '/ocr2md/Trial/.ocr2md/pdf-md-review.v1.json'
        self.commit({'type': 'create-file', 'at': self.loc(review),
                     'ifAbsent': True, 'base64': base64.b64encode(b'{"kind":"review"}').decode()}, 'review-created')
        review_node = self.store.metadata(review)
        self.assertEqual((meta / 'pdf-md-review.v1.json').read_bytes(), b'{"kind":"review"}')
        self.commit({'type': 'replace-file', 'target': review_node,
                     'expectedRevision': review_node['revision'],
                     'base64': base64.b64encode(b'{"kind":"review-2"}').decode()}, 'review-replaced')
        self.assertEqual((meta / 'pdf-md-review.v1.json').read_bytes(), b'{"kind":"review-2"}')
        with self.assertRaises(VaultError) as review_stale:
            self.commit({'type': 'replace-file', 'target': review_node,
                         'expectedRevision': review_node['revision'],
                         'base64': base64.b64encode(b'unsafe').decode()}, 'review-stale')
        self.assertEqual(review_stale.exception.code, 'ESTALE')
        with self.assertRaises(VaultError) as review_remove:
            self.commit({'type': 'remove', 'target': self.store.metadata(review),
                         'expectedRevision': self.store.metadata(review)['revision']})
        self.assertEqual(review_remove.exception.code, 'EACCES')

        normal = '/ocr2md/Trial/ordinary.md'
        self.commit({'type': 'create-file', 'at': self.loc(normal),
                     'ifAbsent': True, 'base64': base64.b64encode(b'normal').decode()})
        normal_node = self.store.metadata(normal)
        with self.assertRaises(VaultError) as uncoordinated:
            self.commit({'type': 'replace-file', 'target': normal_node,
                         'expectedRevision': normal_node['revision'],
                         'base64': base64.b64encode(b'unsafe').decode()})
        self.assertEqual(uncoordinated.exception.code, 'EUNSUPPORTED')
        self.assertEqual((book / 'ordinary.md').read_bytes(), b'normal')

    def test_pairing_local_only_and_auth(self):
        class FakeHandler:
            def __init__(self, host, forwarded=False, token=''):
                self.headers = {'Host': host}
                if forwarded:
                    self.headers['CF-Ray'] = 'abc'
                if token:
                    self.headers['X-OCR2MD-V3-Key'] = token
                self.client_address = ('127.0.0.1', 12345)
        self.assertTrue(self.store.authorized(FakeHandler('127.0.0.1:4176')))
        self.assertFalse(self.store.authorized(FakeHandler('ocr2md.laity.bid')))
        self.assertFalse(self.store.authorized(FakeHandler('127.0.0.1:4176', forwarded=True)))
        self.assertTrue(self.store.authorized(FakeHandler('ocr2md.laity.bid', token=self.store.secret)))


if __name__ == '__main__':
    unittest.main()
