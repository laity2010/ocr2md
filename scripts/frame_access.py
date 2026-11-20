"""Frame-owned allowlisted directory and short-lived signed session authority.

No Main/V1 process, cookie, database, or workspace API is consulted. The private
bootstrap config is deliberately outside Git; it is managed by frame-access-setup.
"""
from __future__ import annotations
import hmac
import json
import os
from pathlib import Path
import secrets
import stat
import threading
import time
from http.cookies import SimpleCookie

CONFIG=Path(os.environ.get('OCR2MD_FRAME_ACCESS_CONFIG',str(Path(__file__).resolve().parents[3]/'.ops/frame-access.json')))
COOKIE='ocr2md_frame_access'
TTL=7*24*3600
_attempts=[]
_lock=threading.Lock()

class AccessError(Exception):
    def __init__(self,code,message):super().__init__(message);self.code=code

def settings():
    try:
        info=os.lstat(CONFIG)
        if not stat.S_ISREG(info.st_mode) or info.st_uid!=os.getuid() or info.st_mode & 0o077:
            raise AccessError(503,'Frame 独立授权文件权限不安全')
        doc=json.loads(CONFIG.read_text(encoding='utf-8'))
        if doc.get('schema')!='ocr2md-frame-access/v1' or not isinstance(doc.get('code'),str) or len(doc['code'])!=16:
            raise AccessError(503,'Frame 独立授权配置无效')
        if not isinstance(doc.get('secret'),str) or len(doc['secret'])!=64:
            raise AccessError(503,'Frame 会话签名密钥无效')
        bytes.fromhex(doc['secret'])
        if not isinstance(doc.get('allowedRoots'),list) or not doc['allowedRoots']:
            raise AccessError(503,'Frame 尚未配置允许访问的目录')
        roots=[]
        for value in doc['allowedRoots']:
            if not isinstance(value,str) or not value.startswith('/'):
                raise AccessError(503,'Frame 授权目录配置无效')
            path=Path(value)
            if path.is_symlink() or not path.is_dir():
                raise AccessError(503,'Frame 授权目录不存在或包含符号链接')
            roots.append(path.resolve(strict=True))
        return doc,roots
    except (OSError,ValueError,TypeError,KeyError) as error:
        raise AccessError(503,'Frame 独立授权尚未配置或不可用') from error

def _key(doc):return bytes.fromhex(doc['secret'])
def _signature(doc,payload):return hmac.new(_key(doc),payload.encode('ascii'),'sha256').hexdigest()

def session_status(raw_cookie):
    doc,_=settings()
    try:
        if not isinstance(raw_cookie,str) or len(raw_cookie)>8192:return False
        jar=SimpleCookie();jar.load(raw_cookie)
        item=jar.get(COOKIE)
        if item is None:return False
        expiry,nonce,signature=item.value.split('.')
        if len(nonce)!=32 or len(signature)!=64 or not nonce.isascii():return False
        if not expiry.isdigit() or not int(time.time())<int(expiry)<=int(time.time())+TTL:return False
        return hmac.compare_digest(signature,_signature(doc,expiry+'.'+nonce))
    except (ValueError,KeyError,TypeError):return False

def authorized_roots(raw_cookie):
    if not session_status(raw_cookie):raise AccessError(403,'需要 Lab-Frame 独立访问授权')
    _,roots=settings()
    return roots

def unlock(code):
    doc,_=settings()
    now=time.monotonic()
    with _lock:
        _attempts[:]=[t for t in _attempts if now-t<60]
        if len(_attempts)>=8:raise AccessError(429,'授权尝试过多，请稍后再试')
        _attempts.append(now)
    if not isinstance(code,str) or not hmac.compare_digest(code.strip().upper(),doc['code']):
        raise AccessError(403,'Frame 访问码不正确')
    expiry=str(int(time.time())+TTL)
    nonce=secrets.token_hex(16)
    token=expiry+'.'+nonce+'.'+_signature(doc,expiry+'.'+nonce)
    cookie=f'{COOKIE}={token}; Path=/labs/; HttpOnly; Secure; SameSite=Lax; Max-Age={TTL}'
    with _lock:_attempts.clear()
    return cookie
