"""Network-edge Tailnet ingress: host/origin checks and upstream header mapping.

The fixture never calls Main, reads documents, or accesses real credentials.
"""
import http.client
import sys
import threading
import unittest
from http.server import ThreadingHTTPServer
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
from v6_tailnet_https_ingress import TailnetIngress


class FakeResponse:
    status = 200
    def getheaders(self):
        return [('Content-Type', 'text/plain'), ('Content-Length', '2')]
    def getheader(self, name):
        return '2' if name.lower() == 'content-length' else None
    def read(self, amount):
        if not hasattr(self, 'sent'):
            self.sent = True
            return b'OK'
        return b''


class FakeUpstream:
    requests = []
    def __init__(self, *args, **kwargs):
        self.requests = FakeUpstream.requests
    def request(self, method, path, body=None, headers=None):
        self.requests.append((method, path, body, headers.copy()))
    def getresponse(self):
        return FakeResponse()
    def close(self):
        pass


class TailnetIngressTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), TailnetIngress)
        cls.server.settings = {
            'tailnet_ip': '100.82.183.98', 'listen_port': 4456,
            'lan_ip': '192.168.1.10', 'lan_port': 4443, 'lan_ca': '/fixture/ca.crt',
        }
        cls.patch_connection = patch('v6_tailnet_https_ingress.http.client.HTTPSConnection',
                                     FakeUpstream)
        cls.patch_context = patch('v6_tailnet_https_ingress.ssl.create_default_context',
                                  return_value=object())
        cls.patch_connection.start()
        cls.patch_context.start()
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.thread.join(timeout=4)
        cls.server.server_close()
        cls.patch_connection.stop()
        cls.patch_context.stop()

    def setUp(self):
        FakeUpstream.requests.clear()

    def call(self, method, path, headers=None, body=None):
        client = http.client.HTTPConnection('127.0.0.1', self.server.server_port, timeout=3)
        options = {'Host': '100.82.183.98:4456', **(headers or {})}
        client.request(method, path, body=body, headers=options)
        response = client.getresponse()
        status, payload = response.status, response.read()
        client.close()
        return status, payload

    def test_tailnet_get_preserves_path_and_uses_validated_lan_host(self):
        status, body = self.call('GET', '/labs/lab-ocr-v2/?a=b')
        self.assertEqual((status, body), (200, b'OK'))
        method, path, data, headers = FakeUpstream.requests[-1]
        self.assertEqual((method, path), ('GET', '/labs/lab-ocr-v2/?a=b'))
        self.assertEqual(headers['Host'], '192.168.1.10:4443')

    def test_same_origin_post_rewrites_both_host_and_origin(self):
        status, body = self.call('POST', '/api/unlock',
                                 headers={'Origin': 'https://100.82.183.98:4456',
                                          'Content-Type': 'application/json'},
                                 body=b'{}')
        self.assertEqual((status, body), (200, b'OK'))
        method, path, data, headers = FakeUpstream.requests[-1]
        self.assertEqual((method, path, data), ('POST', '/api/unlock', b'{}'))
        self.assertEqual(headers['Host'], '192.168.1.10:4443')
        self.assertEqual(headers['Origin'], 'https://192.168.1.10:4443')
        self.assertEqual(headers['Content-Length'], '2')

    def test_host_rebinding_and_cross_origin_do_not_reach_upstream(self):
        for headers in ({'Host': 'attacker.invalid:4456'},
                        {'Host': '192.168.1.10:4456'}):
            status, _ = self.call('GET', '/', headers=headers)
            self.assertEqual(status, 421)
        for origin in ('https://attacker.invalid', 'https://192.168.1.10:4443'):
            status, _ = self.call('POST', '/api/unlock',
                                  headers={'Origin': origin}, body=b'{}')
            self.assertEqual(status, 403)
        self.assertEqual(FakeUpstream.requests, [])


if __name__ == '__main__':
    unittest.main()
