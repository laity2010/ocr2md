"""V5 device-scoped, opt-in 30-day authorization for read-only directory routes.

The browser stores an opaque, signed, HttpOnly bearer cookie, NEVER a Vault key.
The gateway uses the existing private Mac Vault secret only after verification.
Rotating the Vault key invalidates all remembered devices.
"""
from __future__ import annotations
from http.cookies import SimpleCookie
import hashlib
import hmac
import re
import secrets
import time
from pathlib import Path

COOKIE = '__Host-ocr2md-workspace'
DAYS_30 = 30 * 24 * 60 * 60
TOKEN = re.compile(r'v1\.([0-9]{10})\.([A-Za-z0-9_-]{22})\.([A-Za-z0-9_-]{43})\Z')


def load_vault_key(path: Path) -> str:
    if path.is_symlink() or not path.is_file():
        raise OSError('Vault credential not configured')
    key = path.read_text(encoding='utf-8').strip()
    if len(key) < 22:
        raise OSError('Vault credential invalid')
    return key


def signature(key: str, expiry: str, nonce: str) -> str:
    body = ('ocr2md-v5-workspace-remember-v1:' + expiry + ':' + nonce).encode()
    import base64
    return base64.urlsafe_b64encode(hmac.new(key.encode(), body, hashlib.sha256).digest()).rstrip(b'=').decode()


def issue(key: str, now: int | None = None) -> str:
    expiry = str(int(time.time() if now is None else now) + DAYS_30)
    import base64
    nonce = base64.urlsafe_b64encode(secrets.token_bytes(16)).rstrip(b'=').decode()
    return f'v1.{expiry}.{nonce}.{signature(key, expiry, nonce)}'


def verify(value: str, key: str, now: int | None = None) -> bool:
    m = TOKEN.fullmatch(value)
    if not m:
        return False
    expiry, nonce, mac = m.groups()
    at = int(time.time() if now is None else now)
    return at < int(expiry) <= at + DAYS_30 and hmac.compare_digest(mac, signature(key, expiry, nonce))


def from_headers(header: str, key: str, now: int | None = None) -> bool:
    try:
        cookie = SimpleCookie()
        cookie.load(header[:4096])
        item = cookie.get(COOKIE)
        return bool(item and verify(item.value, key, now))
    except (ValueError, TypeError):
        return False


def cookie_header(value: str | None = None) -> str:
    # __Host- ensures Secure, Path=/ and no Domain attribute.
    if value:
        return f'{COOKIE}={value}; Max-Age={DAYS_30}; Path=/; Secure; HttpOnly; SameSite=Lax'
    return f'{COOKIE}=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax'
