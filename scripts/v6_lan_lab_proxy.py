"""Allowlisted HTTPS LAN lab routes, forwarded to loopback-only V6 lab services.

Only imported by the LAN TLS handler; not exposed on the production tunnel port.
"""
import http.client
import re
from urllib.parse import urlsplit

LAB_ID = re.compile(r'^[a-z][a-z0-9-]{0,31}$')
HOP_HEADERS = {'host', 'connection', 'proxy-connection', 'keep-alive', 'upgrade',
               'transfer-encoding', 'te', 'trailer', 'proxy-authenticate',
               'proxy-authorization', 'x-forwarded-for', 'x-forwarded-host',
               'x-forwarded-proto', 'forwarded'}
MAX_BODY = 16 * 1024 * 1024


def parse_lan_labs(raw):
    """Explicit lab-id=port routes. No arbitrary upstream URL/host allowed."""
    routes = {}
    for item in raw.split(','):
        if not item.strip():
            continue
        key, sep, value = item.strip().partition('=')
        if not sep or not LAB_ID.fullmatch(key) or not value.isdecimal():
            raise ValueError('Invalid V6_LAN_LAB_ROUTES mapping')
        port = int(value)
        if not 1024 <= port <= 65535 or key in routes:
            raise ValueError('Invalid or repeated LAN lab port')
        routes[key] = port
    return routes


def dispatch_lan_lab(handler, routes):
    """Return True if request belongs to the /labs/ namespace."""
    path = urlsplit(handler.path).path
    if path != '/labs' and not path.startswith('/labs/'):
        return False
    parts = path.split('/')
    name = parts[2] if len(parts) >= 3 else ''
    if name not in routes:
        handler.response(404, 'Unknown LAN experiment')
        return True
    if path == f'/labs/{name}':
        handler.send_response(308)
        handler.send_header('Location', f'/labs/{name}/')
        handler.send_header('Content-Length', '0')
        handler.end_headers()
        return True
    if path != f'/labs/{name}/' and not path.startswith(f'/labs/{name}/'):
        handler.response(404, 'Invalid experiment path')
        return True
    if handler.headers.get('Transfer-Encoding'):
        handler.response(400, 'Chunked lab uploads are not supported')
        return True
    length = handler.headers.get('Content-Length')
    if handler.command in ('PUT','POST'):
        try:
            amount = int(length) if length is not None else -1
        except ValueError:
            amount = -1
        if amount < 0 or amount > MAX_BODY:
            handler.response(413, 'Invalid experiment upload size')
            return True
    else:
        amount = 0
    body = handler.rfile.read(amount) if amount else None
    headers = {key: value for key, value in handler.headers.items()
               if key.lower() not in HOP_HEADERS}
    if amount:
        headers['Content-Length'] = str(amount)
    connection = http.client.HTTPConnection('127.0.0.1', routes[name], timeout=25)
    began_response = False
    try:
        connection.request(handler.command, handler.path, body=body, headers=headers)
        upstream = connection.getresponse()
        handler.send_response(upstream.status)
        for key, value in upstream.getheaders():
            if key.lower() not in HOP_HEADERS:
                handler.send_header(key, value)
        handler.end_headers()
        began_response = True
        if handler.command != 'HEAD':
            while True:
                chunk = upstream.read(65536)
                if not chunk:
                    break
                handler.wfile.write(chunk)
    except (OSError, http.client.HTTPException, TimeoutError):
        # If response already began, the transport will close. Never reroute
        # failure to the formal V6 document or return formal V6 assets.
        if not began_response:
            try: handler.response(502, 'Lab service unavailable')
            except (OSError, ConnectionError): pass
    finally:
        connection.close()
    return True
