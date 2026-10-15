#!/usr/bin/env python3
"""Private LAN TLS facade for the SINGLE canonical OCR2MD V4 release.

No static file copies; HTTPS -> LAN FastDev 4292 -> canonical v2 slots, with
FastDev's existing Vault Origin + authorization policy. Never expose 4176.
The user must trust this Mac's LOCAL CA on their iPad; no TLS trust bypass.
"""
import argparse
import http.client
import os
import socket
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlsplit

ALLOWED_PATHS = ('/v4-directory/', '/v4-wp3-candidate/', '/__v3/fs', '/__v3/ir', '/__v3/ir/markings')
ALLOWED_POSTS = frozenset(('/__v3/ir/commit', '/__v3/ir/publish-chapters',
                          '/__v3/chapters/commit', '/__v3/chapters/media/download',
                          '/__v3/ir/cache/prepare',
                          '/__v3/ir/markings/commit'))
MAX_POST = 24 * 1024 * 1024
MAX_RESPONSE = 64 * 1024 * 1024


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--bind', required=True)
    parser.add_argument('--port', type=int, default=4443)
    parser.add_argument('--upstream-port', type=int, default=4292)
    parser.add_argument('--cert-dir', required=True)
    options = parser.parse_args()
    certdir = Path(options.cert_dir).expanduser().resolve()
    cert = certdir / 'server.crt'
    key = certdir / 'server.key'
    if not cert.is_file() or not key.is_file():
        raise SystemExit('LAN_TLS_CERTS_MISSING')
    origin = f'https://{options.bind}:{options.port}'
    upstream_origin = f'http://{options.bind}:{options.upstream_port}'

    class Handler(BaseHTTPRequestHandler):
        server_version = 'OCR2MD-LanTls/1.0'
        sys_version = ''

        def log_message(self, fmt, *args):
            # No query strings, usernames, paths, auth keys or book metadata.
            pass

        def _reply(self, status, body=b'', content_type='text/plain; charset=utf-8'):
            self.send_response(status)
            self.send_header('Content-Type', content_type)
            self.send_header('Cache-Control', 'no-store')
            self.send_header('X-Content-Type-Options', 'nosniff')
            self.send_header('Content-Length', str(len(body)))
            self.end_headers()
            if self.command != 'HEAD':
                self.wfile.write(body)

        def _proxy(self):
            parts = urlsplit(self.path)
            route = parts.path
            if route == '/':
                self.send_response(302)
                self.send_header('Location', '/v4-directory/')
                self.send_header('Content-Length', '0')
                self.end_headers()
                return
            if self.command in ('GET', 'HEAD'):
                allowed = (route.startswith('/v4-directory/') or
                           route.startswith('/v4-wp3-candidate/') or
                           route in ('/__v3/fs', '/__v3/ir', '/__v3/ir/markings', '/__v3/ir/cache'))
            elif self.command == 'POST':
                allowed = route in ALLOWED_POSTS
            else:
                allowed = False
            if not allowed or len(self.path) > 4096:
                return self._reply(404, b'Not found')
            if '/..' in route or '\\' in route:
                return self._reply(400, b'Bad path')
            payload = None
            if self.command == 'POST':
                if self.headers.get('Origin') != origin:
                    return self._reply(403, b'Untrusted write origin')
                if not self.headers.get('X-OCR2MD-V3-Key'):
                    return self._reply(401, b'Authorization required')
                if self.headers.get('Content-Type', '').split(';')[0].strip().lower() != 'application/json':
                    return self._reply(415, b'JSON required')
                try:
                    count = int(self.headers.get('Content-Length', '0'))
                except ValueError:
                    return self._reply(400, b'Bad request length')
                if count < 2 or count > MAX_POST or (route == '/__v3/ir/cache/prepare' and count > 4096):
                    return self._reply(413, b'Request too large')
                payload = self.rfile.read(count)
            headers = {'Host': f'{options.bind}:{options.upstream_port}',
                       'Accept': self.headers.get('Accept', '*/*')}
            key = self.headers.get('X-OCR2MD-V3-Key', '')
            if key and len(key) <= 256:
                headers['X-OCR2MD-V3-Key'] = key
            if self.command == 'POST':
                # Only after rejecting untrusted client origins, present the
                # LAN FastDev server's expected Origin to its CSRF gate.
                headers['Origin'] = upstream_origin
                headers['Content-Type'] = 'application/json'
            conn = http.client.HTTPConnection(options.bind, options.upstream_port, timeout=40)
            try:
                conn.request(self.command, self.path, body=payload, headers=headers)
                res = conn.getresponse()
                raw = res.read(MAX_RESPONSE + 1)
                if len(raw) > MAX_RESPONSE:
                    return self._reply(502, b'Upstream response too large')
                self.send_response(res.status)
                for head in ('Content-Type', 'Cache-Control', 'Last-Modified', 'ETag'):
                    if res.getheader(head):
                        self.send_header(head, res.getheader(head))
                self.send_header('X-OCR2MD-Canonical-Static', 'shared-v2-release')
                self.send_header('X-Content-Type-Options', 'nosniff')
                self.send_header('Content-Length', str(len(raw)))
                self.end_headers()
                if self.command != 'HEAD':
                    self.wfile.write(raw)
            except (OSError, http.client.HTTPException):
                self._reply(502, b'LAN upstream unavailable')
            finally:
                conn.close()

        do_GET = _proxy
        do_HEAD = _proxy
        do_POST = _proxy

    context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    context.minimum_version = ssl.TLSVersion.TLSv1_2
    context.load_cert_chain(str(cert), str(key))
    # Bind only the current LAN IP; not a public listener or loopback bypass.
    class Server(ThreadingHTTPServer):
        allow_reuse_address = True
    server = Server((options.bind, options.port), Handler)
    server.socket = context.wrap_socket(server.socket, server_side=True)
    print(f'OCR2MD_UNIFIED_LAN_HTTPS_READY {origin}/ -> {upstream_origin}/', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        server.server_close()


if __name__ == '__main__':
    main()
