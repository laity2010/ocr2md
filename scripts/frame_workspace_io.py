"""Lab-Frame standalone Workspace I/O, directory discovery and access session.

Runs inside the neutral shared Lab gateway; never calls Main or V1 endpoints.
Session and allowed roots are owned by the Frame private runtime config.
"""
from __future__ import annotations
import base64
import binascii
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import secrets
import stat
from urllib.parse import parse_qs
from frame_access import AccessError, authorized_roots, session_status, unlock, settings

LAN_ORIGIN=os.environ.get('OCR2MD_LAN_ORIGIN','')
ALLOWED_ORIGINS=frozenset(v for v in ('https://ocr2md.laity.bid',
    'http://127.0.0.1:4414',LAN_ORIGIN) if v)
MAX_BODY=12*1024*1024
MAX_FILE=8*1024*1024
DIR_FLAGS=os.O_RDONLY|getattr(os,'O_DIRECTORY',0)|getattr(os,'O_NOFOLLOW',0)
FILE_NOFOLLOW=getattr(os,'O_NOFOLLOW',0)

class WorkspaceIOError(Exception):
    def __init__(self,code:int,message:str):
        super().__init__(message)
        self.code=code

def sha(data:bytes)->str:
    return hashlib.sha256(data).hexdigest()

def checked_workspace(raw,roots:list[Path])->Path:
    if not isinstance(raw,str) or not raw.startswith('/') or len(raw)>2048 or '\0' in raw or '\n' in raw or '\r' in raw or '..' in Path(raw).parts:
        raise WorkspaceIOError(422,'工作目录必须是合法的绝对路径')
    path=Path(raw)
    if path.is_symlink() or not path.is_dir():
        raise WorkspaceIOError(422,'工作目录不存在或属于符号链接')
    try:real=path.resolve(strict=True)
    except OSError as error:raise WorkspaceIOError(422,'工作目录不可访问') from error
    for root in roots:
        # Check the ORIGINAL lexical path, not the resolved path that would
        # conceal a symlink in the selected-directory ancestry.
        if path.is_relative_to(root) and real.is_relative_to(root):
            cursor=root
            for part in path.relative_to(root).parts:
                cursor=cursor/part
                if cursor.is_symlink():raise WorkspaceIOError(403,'工作目录含符号链接')
            return real
    raise WorkspaceIOError(403,'工作目录不在 Frame 授权范围内')

def relative_parts(raw,*,allow_empty=False):
    if allow_empty and raw in ('',None):return ()
    if not isinstance(raw,str) or not raw or len(raw)>1024 or raw.startswith('/') or '\\' in raw or '\0' in raw or '\r' in raw or '\n' in raw:
        raise WorkspaceIOError(422,'文件路径必须是工作目录下的相对路径')
    parts=raw.split('/')
    if any(part in ('','.','..') or len(part)>200 or part.startswith('.ocr2md-frame-io-')
            or part in ('.git','.v6') for part in parts):
        raise WorkspaceIOError(422,'文件路径包含禁止的目录或保留名称')
    return tuple(parts)

@contextmanager
def directory_fd(workspace:Path,parts:tuple[str,...]):
    fd=os.open(workspace,DIR_FLAGS)
    try:
        for part in parts:
            new=os.open(part,DIR_FLAGS,dir_fd=fd)
            os.close(fd)
            fd=new
        yield fd
    finally:
        os.close(fd)

def regular_file(fd):
    info=os.fstat(fd)
    if not stat.S_ISREG(info.st_mode) or info.st_nlink!=1:
        raise WorkspaceIOError(422,'仅允许访问普通非硬链接文件')
    if info.st_size>MAX_FILE:
        raise WorkspaceIOError(413,'文件超过当前公共 API 的 8 MiB 限额')
    return info

def read_exact(fd):
    info=regular_file(fd)
    result=bytearray()
    while len(result)<info.st_size:
        data=os.read(fd,min(65536,info.st_size-len(result)))
        if not data:raise WorkspaceIOError(409,'读取期间文件发生变化')
        result.extend(data)
    if os.read(fd,1):raise WorkspaceIOError(409,'读取期间文件大小发生变化')
    return bytes(result)

def decode_blob(payload):
    content=payload.get('contentBase64')
    if not isinstance(content,str) or len(content)>(MAX_FILE*4//3+8):
        raise WorkspaceIOError(413,'提交的文件内容超出 8 MiB 限额')
    try:value=base64.b64decode(content,validate=True)
    except (binascii.Error,ValueError) as error:
        raise WorkspaceIOError(422,'文件内容不是合法的 Base64') from error
    if len(value)>MAX_FILE:raise WorkspaceIOError(413,'文件内容超过 8 MiB 限额')
    return value

def write_all(fd,data:bytes):
    position=0
    while position<len(data):
        position+=os.write(fd,data[position:])
    os.fsync(fd)

def probe(workspace:Path):
    """Actual create/readback/unlink in the selected directory, no book edits."""
    data=secrets.token_bytes(32)
    with directory_fd(workspace,()) as root:
        name='.ocr2md-frame-io-'+secrets.token_hex(12)
        created=False
        try:
            fd=os.open(name,os.O_WRONLY|os.O_CREAT|os.O_EXCL|FILE_NOFOLLOW,0o600,dir_fd=root)
            created=True
            try:write_all(fd,data)
            finally:os.close(fd)
            fd=os.open(name,os.O_RDONLY|FILE_NOFOLLOW,dir_fd=root)
            try:verified=read_exact(fd)==data
            finally:os.close(fd)
            if not verified:raise WorkspaceIOError(409,'工作目录写入后读回校验失败')
        finally:
            if created:os.unlink(name,dir_fd=root)
    return {'readable':True,'writable':True,'verified':True,'method':'create-read-verify-cleanup'}

def list_files(workspace:Path,relative:str=''):
    parts=relative_parts(relative,allow_empty=True)
    with directory_fd(workspace,parts) as folder:
        entries=[]
        for name in sorted(os.listdir(folder)):
            if name.startswith('.'):continue
            try:info=os.stat(name,dir_fd=folder,follow_symlinks=False)
            except OSError:continue
            kind=('directory' if stat.S_ISDIR(info.st_mode) else 'file' if stat.S_ISREG(info.st_mode) else 'other')
            if kind=='other':continue
            entries.append({'name':name,'kind':kind,'size':info.st_size if kind=='file' else None})
            if len(entries)>=200:break
        return {'path':relative,'entries':entries,'truncated':len(entries)>=200}

def read_file(workspace:Path,relative:str):
    parts=relative_parts(relative)
    with directory_fd(workspace,parts[:-1]) as parent:
        fd=os.open(parts[-1],os.O_RDONLY|FILE_NOFOLLOW,dir_fd=parent)
        try:data=read_exact(fd)
        finally:os.close(fd)
    return {'path':relative,'size':len(data),'sha256':sha(data),
        'contentBase64':base64.b64encode(data).decode('ascii')}

def create_file(workspace:Path,relative:str,content:bytes):
    parts=relative_parts(relative)
    with directory_fd(workspace,parts[:-1]) as parent:
        fd=os.open(parts[-1],os.O_WRONLY|os.O_CREAT|os.O_EXCL|FILE_NOFOLLOW,0o600,dir_fd=parent)
        try:write_all(fd,content)
        except BaseException:
            os.close(fd)
            os.unlink(parts[-1],dir_fd=parent)
            raise
        else:os.close(fd)
    return {'path':relative,'size':len(content),'sha256':sha(content),'created':True}

def replace_file(workspace:Path,relative:str,content:bytes,expected_sha:str):
    if not isinstance(expected_sha,str) or len(expected_sha)!=64 or any(c not in '0123456789abcdef' for c in expected_sha):
        raise WorkspaceIOError(422,'覆盖文件必须提供 64 位 SHA-256 原版本')
    parts=relative_parts(relative)
    with directory_fd(workspace,parts[:-1]) as parent:
        # An advisory lock serializes this API's writers. Other processes may
        # still edit files: CAS detects stale data before the atomic rename.
        import fcntl
        fd=os.open(parts[-1],os.O_RDONLY|FILE_NOFOLLOW,dir_fd=parent)
        try:
            fcntl.flock(fd,fcntl.LOCK_EX)
            info=regular_file(fd)
            existing=read_exact(fd)
            if sha(existing)!=expected_sha:
                raise WorkspaceIOError(409,'文件已被其他操作修改，请重新读取后保存')
            temp='.ocr2md-frame-io-'+secrets.token_hex(12)
            tmpfd=os.open(temp,os.O_WRONLY|os.O_CREAT|os.O_EXCL|FILE_NOFOLLOW,info.st_mode&0o777,dir_fd=parent)
            try:
                write_all(tmpfd,content)
                os.close(tmpfd)
                tmpfd=-1
                latest=os.stat(parts[-1],dir_fd=parent,follow_symlinks=False)
                if latest.st_ino!=info.st_ino or latest.st_size!=info.st_size or latest.st_mtime_ns!=info.st_mtime_ns:
                    raise WorkspaceIOError(409,'保存时文件发生变化，请重新读取')
                os.replace(temp,parts[-1],src_dir_fd=parent,dst_dir_fd=parent)
            finally:
                if tmpfd>=0:os.close(tmpfd)
                try:os.unlink(temp,dir_fd=parent)
                except FileNotFoundError:pass
        finally:os.close(fd)
    return {'path':relative,'size':len(content),'sha256':sha(content),'replaced':True}

def browse_directories(raw,roots):
    folder=checked_workspace(raw,roots)
    children=[]
    with directory_fd(folder,()) as fd:
        for name in sorted(os.listdir(fd)):
            if name.startswith('.'):continue
            try:info=os.stat(name,dir_fd=fd,follow_symlinks=False)
            except OSError:continue
            if not stat.S_ISDIR(info.st_mode):continue
            children.append({'path':str(folder/name),'name':name})
            if len(children)>=120:break
    return {'path':str(folder),'children':children}

def dispatch(method,operation,query,payload,roots):
    verbs={'probe':'POST','list':'GET','read':'GET','create':'POST','replace':'POST','roots':'GET','browse':'GET'}
    if operation not in verbs:raise WorkspaceIOError(404,'未知工作区 I/O 接口')
    if method!=verbs[operation]:raise WorkspaceIOError(405,'HTTP 请求方法不匹配')
    if operation=='roots':return {'allowedRoots':[str(p) for p in roots]}
    if operation=='browse':return browse_directories(query.get('path',[None])[0],roots)
    value=payload.get('workspace') if method=='POST' else query.get('workspace',[None])[0]
    folder=checked_workspace(value,roots)
    if operation=='probe':return probe(folder)
    if operation=='list':return list_files(folder,query.get('path',[''])[0])
    if operation=='read':return read_file(folder,query.get('path',[''])[0])
    if operation=='create':return create_file(folder,payload.get('path'),decode_blob(payload))
    return replace_file(folder,payload.get('path'),decode_blob(payload),payload.get('expectedSha256'))

def handle(handler,operation,parsed):
    def respond(code,result):
        handler.respond(code,json.dumps(result,ensure_ascii=False),'application/json; charset=utf-8')
    try:
        if handler.command=='POST':
            if handler.headers.get('Origin') not in ALLOWED_ORIGINS:
                raise WorkspaceIOError(403,'拒绝非 Frame 允许来源的写入')
            if handler.headers.get('Transfer-Encoding'):
                raise WorkspaceIOError(400,'不支持 chunked 请求')
            try:size=int(handler.headers.get('Content-Length','-1'))
            except ValueError:size=-1
            if not 2<=size<=MAX_BODY:raise WorkspaceIOError(413,'文件请求体超限')
            raw=handler.rfile.read(size)
            if len(raw)!=size:raise WorkspaceIOError(400,'文件请求体不完整')
            try:payload=json.loads(raw)
            except (ValueError,UnicodeDecodeError) as error:
                raise WorkspaceIOError(400,'请求 JSON 不合法') from error
            if not isinstance(payload,dict):raise WorkspaceIOError(422,'请求须为对象')
        else:payload={}
        if operation=='session':
            if handler.command!='GET':raise WorkspaceIOError(405,'会话查询仅允许 GET')
            # A missing configuration is a hard error rather than fake success.
            settings()
            respond(200,{'authorized':session_status(handler.headers.get('Cookie',''))})
            return
        if operation=='unlock':
            if handler.command!='POST':raise WorkspaceIOError(405,'访问码授权仅允许 POST')
            cookie=unlock(payload.get('code'))
            handler.respond(200,json.dumps({'authorized':True},ensure_ascii=False),
                'application/json; charset=utf-8',[('Set-Cookie',cookie)])
            return
        roots=authorized_roots(handler.headers.get('Cookie',''))
        response=dispatch(handler.command,operation,parse_qs(parsed.query),payload,roots)
        respond(200,response)
    except AccessError as error:respond(error.code,{'error':str(error)})
    except WorkspaceIOError as error:respond(error.code,{'error':str(error)})
    except PermissionError:respond(403,{'error':'工作目录文件权限不足（macOS/iCloud），读写验证未通过'})
    except FileExistsError:respond(409,{'error':'文件已经存在，拒绝覆盖'})
    except FileNotFoundError:respond(404,{'error':'工作区文件或目录不存在'})
    except (IsADirectoryError,NotADirectoryError,ValueError,TypeError):
        respond(422,{'error':'工作区文件路径或数据无效'})
    except OSError:respond(503,{'error':'工作区文件系统暂不可用，操作未确认成功'})
