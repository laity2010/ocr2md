#!/usr/bin/env python3
"""Audit-only port preflight: block live listeners, not leftover TIME_WAIT."""
import re
import socket
import sys
from pathlib import Path


def can_listen(port: int) -> bool:
    """Test the same 127.0.0.1 TCP listen operation used by test servers."""
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        # Safe reuse of a closed server's TIME_WAIT connections. SO_REUSEPORT
        # is intentionally NEVER enabled: a live listener must remain busy.
        sock.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            sock.bind(('127.0.0.1', port))
            sock.listen(1)
            return True
        except OSError:
            return False


def registered_ports() -> set[int]:
    ports: set[int] = set()
    for script in Path('tests').rglob('*.test.mjs'):
        source = script.read_text(encoding='utf-8')
        for match in re.finditer(r'\bport\s*=\s*(\d{4})(\s*\+\s*[in])?', source):
            base = int(match.group(1))
            ports.add(base)
            if match.group(2):
                ports.add(base + 1)
    return ports


def self_test() -> None:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        listener.bind(('127.0.0.1', 0))
        listener.listen(1)
        port = listener.getsockname()[1]
        assert not can_listen(port), 'live listener was not blocked'
        with socket.create_connection(('127.0.0.1', port), timeout=2) as client:
            connection, _ = listener.accept()
            with connection:
                connection.sendall(b'x')
                client.recv(1)
        # Listener remains active until the containing with exits.
    assert can_listen(port), 'closed listener / TIME_WAIT remained blocked'
    print('AUDIT_PORT_PREFLIGHT_SELFTEST_PASS live_listener=blocked closed_server=reusable')


def main() -> None:
    if sys.argv[1:] == ['--self-test']:
        self_test()
        return
    ports = registered_ports()
    assert ports, 'no known browser-test ports discovered'
    busy = [port for port in sorted(ports) if not can_listen(port)]
    if busy:
        print('AUDIT_TEST_PORT_BUSY: ' + ','.join(map(str, busy)), file=sys.stderr)
        print('A live listener, foreign socket, or non-reusable prior binding may own a test port.', file=sys.stderr)
        print('Do not kill processes automatically; inspect listeners and retry.', file=sys.stderr)
        sys.exit(2)
    print('AUDIT_TEST_PORT_PREFLIGHT_PASS ports=' + str(len(ports)))


if __name__ == '__main__':
    main()
