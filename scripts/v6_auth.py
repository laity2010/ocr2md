"""V6 edit-session credentials derived from the private editor token.

The raw token (KEY) never leaves the server: browsers receive an HMAC
session value, and the human unlock code is a separate HMAC derivation, so
neither reveals any characters of KEY.

Migration from the pre-R2 scheme (cookie=KEY, unlock code=KEY[:12]):
  * The unlock code changes. Print it locally with
      python3 scripts/v6_auth.py [path/to/editor-token]
  * Existing browsers holding the legacy raw-KEY cookie keep working only
    while V6_LEGACY_RAW_COOKIE is not '0'; every such request is answered
    with a replacement HMAC cookie, so sessions migrate on first use.
    Set V6_LEGACY_RAW_COOKIE=0 once migrated to stop accepting it.
"""
import base64
import hashlib
import hmac
import sys


def _mac(key, label):
    digest = hmac.new(key.encode('utf-8'), label.encode('utf-8'), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).decode('ascii').rstrip('=')


def session_token(key, cookie_name):
    return _mac(key, 'ocr2md-v6-session-v1|' + cookie_name)


def unlock_code(key):
    return _mac(key, 'ocr2md-v6-unlock-v1')[:12]


if __name__ == '__main__':
    from pathlib import Path
    path = Path(sys.argv[1] if len(sys.argv) > 1 else '.v6/private/editor-token')
    print(unlock_code(path.read_text().strip()))
