"""Tailnet-only *purpose* HTTPS ingress for the existing OCR2MD LAN gateway.

Shadowrocket's embedded Tailscale IP is not a bindable macOS interface.
This ingress therefore listens on a configurable wildcard socket, but
accepts only one exact browser-facing Host and an exact same-origin for
mutating requests. It proxies to the already-published LAN HTTPS gateway;
it never serves static files or accesses book data directly.
"""

import http.client
import ipaddress
import os
import ssl
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

HOP_HEADERS = frozenset({
    'host', 'connection', 'keep-alive', 'upgrade', 'proxy-connection',
    'transfer-encoding', 'trailer', 'te', 'proxy-authenticate',
    'proxy-authorization', 'forwarded', 'x-forwarded-for',
    'x-forwarded-host', 'x-forwarded-proto',
})
MAX_BODY = 64 * 1024 * 1024


def parse_allowed_clients(raw):
    """Deny-by-default IPv4 Tailnet /32 peers; no wildcard subnet grants."""
    if not raw.strip():
        raise ValueError('OCR2MD_TAILNET_ALLOWED_CLIENTS must not be empty')
    peers = set()
    tailnet = ipaddress.ip_network('100.64.0.0/10')
    for item in raw.split(','):
        address = ipaddress.IPv4Address(item.strip())
        if address not in tailnet:
            raise ValueError('An allowed client must be a Tailnet IPv4 address')
        peers.add(address)
    return frozenset(peers)


def allowed_peer(source, clients):
    try:
        ip = ipaddress.IPv4Address(source)
    except ipaddress.AddressValueError:
        return False
    # Local health and operational tests remain available, never other LAN IPs.
    return ip == ipaddress.IPv4Address('127.0.0.1') or ip in clients


class RestrictedTailnetHTTPServer(ThreadingHTTPServer):
    """Reject disallowed TCP sources *before* starting the TLS handshake.

    This is an application socket admission gate, not a kernel firewall.
    macOS PF remains unavailable without an administrator credential.
    """
    def __init__(self, address, handler, context, allowed_clients):
        super().__init__(address, handler)
        self.tls_context = context
        self.allowed_clients = allowed_clients

    def get_request(self):
        socket, address = self.socket.accept()
        if not allowed_peer(address[0], self.allowed_clients):
            socket.close()
            raise ConnectionAbortedError('Source rejected before TLS')
        try:
            return self.tls_context.wrap_socket(socket, server_side=True), address
        except (OSError, ssl.SSLError):
            socket.close()
            raise


class TailnetIngress(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'

    def log_message(self, *args):
        # Do not log URLs, document paths, session cookies, or access tokens.
        pass

    def reject(self, status, message):
        data = message.encode('utf-8')
        self.send_response(status)
        self.send_header('Content-Type', 'text/plain; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        # Rejections may happen before reading a request body. Never let the
        # discarded bytes become another HTTP/1.1 request on this socket.
        self.send_header('Connection', 'close')
        self.close_connection = True
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(data)

    def proxy(self):
        settings = self.server.settings
        public = f"{settings['tailnet_ip']}:{settings['listen_port']}"
        upstream = f"{settings['lan_ip']}:{settings['lan_port']}"
        if self.headers.get_all('Host', []) != [public]:
            self.reject(421, 'Unexpected Tailnet Host')
            return
        if self.headers.get('Transfer-Encoding') or self.headers.get('Upgrade'):
            self.reject(400, 'Unsupported transport')
            return
        # Never turn an arbitrary hostile Origin into an allowed LAN Origin.
        if len(self.headers.get_all('Origin', [])) > 1 or len(self.headers.get_all('Content-Length', [])) > 1:
            self.reject(400, 'Ambiguous request headers')
            return
        origin = self.headers.get('Origin')
        if self.command in ('POST', 'PUT') and origin != 'https://' + public:
            self.reject(403, 'Invalid Tailnet Origin')
            return
        content_length = self.headers.get('Content-Length')
        if self.command in ('POST', 'PUT'):
            try:
                amount = int(content_length) if content_length is not None else -1
            except ValueError:
                amount = -1
            if not 0 <= amount <= MAX_BODY:
                self.reject(413, 'Invalid body size')
                return
            body = self.rfile.read(amount) if amount else b''
            if len(body) != amount:
                self.reject(400, 'Incomplete request')
                return
        else:
            body = None
        headers = {key: value for key, value in self.headers.items()
                   if key.lower() not in HOP_HEADERS}
        headers['Host'] = upstream
        if origin == 'https://' + public:
            headers['Origin'] = 'https://' + upstream
        if body is not None:
            headers['Content-Length'] = str(len(body))
        tls = ssl.create_default_context(cafile=settings['lan_ca'])
        conn = http.client.HTTPSConnection(settings['lan_ip'], settings['lan_port'],
                                           context=tls, timeout=30)
        started = False
        try:
            conn.request(self.command, self.path, body=body, headers=headers)
            response = conn.getresponse()
            self.send_response(response.status)
            for name, value in response.getheaders():
                if name.lower() in HOP_HEADERS or name.lower() in ('server', 'date'):
                    continue
                if name.lower() == 'location' and value.startswith('https://' + upstream):
                    value = 'https://' + public + value[len('https://' + upstream):]
                self.send_header(name, value)
            # The LAN gateway supplies Content-Length for ordinary responses.
            # If not, close after forwarding rather than hang on HTTP/1.1.
            if response.getheader('Content-Length') is None:
                self.send_header('Connection', 'close')
                self.close_connection = True
            self.end_headers()
            started = True
            if self.command != 'HEAD':
                while True:
                    chunk = response.read(65536)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (OSError, ssl.SSLError, http.client.HTTPException):
            if not started:
                try:
                    self.reject(502, 'Existing LAN gateway unavailable')
                except (OSError, ConnectionError):
                    pass
        finally:
            conn.close()

    do_GET = proxy
    do_HEAD = proxy
    do_POST = proxy
    do_PUT = proxy


def run():
    tailnet_ip = os.environ['OCR2MD_TAILNET_IP']
    lan_ip = os.environ['OCR2MD_LAN_UPSTREAM_IP']
    ipaddress.IPv4Address(tailnet_ip)
    ipaddress.IPv4Address(lan_ip)
    listen_port = int(os.environ.get('OCR2MD_TAILNET_PORT', '4456'))
    lan_port = int(os.environ.get('OCR2MD_LAN_UPSTREAM_PORT', '4443'))
    if not (1024 <= listen_port <= 65535 and 1024 <= lan_port <= 65535):
        raise RuntimeError('Invalid HTTPS port')
    allowed_clients = parse_allowed_clients(os.environ.get('OCR2MD_TAILNET_ALLOWED_CLIENTS', ''))
    settings = {
        'tailnet_ip': tailnet_ip,
        'listen_port': listen_port,
        'lan_ip': lan_ip,
        'lan_port': lan_port,
        'lan_ca': os.environ['OCR2MD_LAN_CA'],
    }
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.minimum_version = ssl.TLSVersion.TLSv1_2
    tls.load_cert_chain(os.environ['OCR2MD_TAILNET_CERT'],
                        os.environ['OCR2MD_TAILNET_KEY'])
    server = RestrictedTailnetHTTPServer(
        ('0.0.0.0', listen_port), TailnetIngress, tls, allowed_clients)
    server.settings = settings
    server.serve_forever()


if __name__ == '__main__':
    run()
