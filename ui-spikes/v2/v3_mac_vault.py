"""V3 Mac-backed Obsidian Vault API. Isolated from v2 chapters/translation.

Only single-operation filesystem commits; external iCloud writers are not
coordinated. Never advertise multi-op atomicity or true FS file coordination.
"""
import base64
import hashlib
import hmac
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
import sys
import sqlite3
import stat as stat_module
import tempfile
import threading
from urllib.parse import parse_qs, urlparse


class VaultError(Exception):
    def __init__(self, code, message, status=400):
        super().__init__(message)
        self.code = code
        self.status = status


def fail(code, message, status=400):
    raise VaultError(code, message, status)


def ir_pointer_path(value):
    """Only an independently authenticated IR endpoint can write this pointer."""
    if not isinstance(value, str):
        return False
    parts = value.strip('/').split('/')
    return (len(parts) == 4 and parts[0] == 'ocr2md'
            and bool(parts[1]) and not parts[1].startswith('.')
            and parts[2] == '.ocr2md' and parts[3] in ('ir-current.v1.json', 'ir-markings.v1.json', 'chapters-map.v1.json'))


def mapping_sidecar_path(value):
    """Strictly two reviewed per-book metadata files may cross hidden-path boundary."""
    if not isinstance(value, str):
        return False
    parts = value.strip("/").split("/")
    return (len(parts) == 4 and parts[0] == "ocr2md"
            and bool(parts[1]) and not parts[1].startswith(".")
            and parts[2] == ".ocr2md" and parts[3] in ("pdf-md-map.v1.json", "pdf-md-review.v1.json"))


def mapping_metadata_directory(value):
    if not isinstance(value, str):
        return False
    parts = value.strip("/").split("/")
    return (len(parts) == 3 and parts[0] == "ocr2md"
            and bool(parts[1]) and not parts[1].startswith(".")
            and parts[2] == ".ocr2md")


def logical(value):
    if not isinstance(value, str) or not value.startswith("/") or len(value) > 4096:
        fail("EINVAL", "Invalid absolute logical path")
    if value == "/":
        return value
    parts = value[1:].split("/")
    if any(not x or x in (".", "..") or "\\" in x or any(ord(c) < 32 for c in x) for x in parts):
        fail("EINVAL", "Invalid path segment")
    if any(x.startswith(".") for x in parts):
        if not (mapping_metadata_directory(value) or mapping_sidecar_path(value) or ir_pointer_path(value)):
            fail("EACCES", "Hidden files and Obsidian configuration are protected", 403)
    return value


def safe_name(value):
    if not isinstance(value, str) or not value or value in (".", "..") or len(value) > 255:
        fail("EINVAL", "Invalid filename")
    if value.startswith(".") or "/" in value or "\\" in value:
        fail("EACCES", "Hidden or invalid name is protected", 403)
    return value


def request_location(loc, workspace="obsidian-ocr2md"):
    if not isinstance(loc, dict) or loc.get("workspaceId") != workspace:
        fail("EINVAL", "Wrong workspaceId")
    return logical(loc.get("path"))


class V3MacVault:
    workspace_id = "obsidian-ocr2md"
    def __init__(self, root, secret_path, *, page_limit=80, test_origin=None):
        self.root = Path(root).expanduser().resolve(strict=True)
        self.test_origin = test_origin
        if not self.root.is_dir() or self.root.name != "ocr2md" or not (self.root / "ocr2md").is_dir():
            raise RuntimeError("Expected real Obsidian vault root 'ocr2md' with /ocr2md directory")
        self.lock = threading.RLock()
        self.page_limit = page_limit
        self.secret_path = Path(secret_path).expanduser()
        self.secret_path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        if not self.secret_path.exists():
            flags = os.O_CREAT | os.O_EXCL | os.O_WRONLY
            try:
                fd = os.open(str(self.secret_path), flags, 0o600)
            except FileExistsError:
                pass
            else:
                with os.fdopen(fd, "w", encoding="utf-8") as stream:
                    stream.write(secrets.token_urlsafe(24) + "\n")
        self.secret = self.secret_path.read_text(encoding="utf-8").strip()
        self.receipt_db_path = self.secret_path.with_name("v3-vault-receipts.sqlite")
        if len(self.secret) < 22:
            raise RuntimeError("V3 access key too short")

    def local_request(self, handler):
        host = handler.headers.get("Host", "").lower()
        return (handler.client_address[0] in ("127.0.0.1", "::1")
                and host in ("127.0.0.1:4176", "localhost:4176")
                and not any(handler.headers.get(k) for k in (
                    "CF-Connecting-IP", "CF-Ray", "X-Forwarded-For", "Forwarded", "X-Forwarded-Proto", "CF-Visitor")))

    def authorized(self, handler):
        if self.local_request(handler):
            return True
        token = handler.headers.get("X-OCR2MD-V3-Key", "")
        return bool(token and hmac.compare_digest(token, self.secret))

    def require_auth(self, handler):
        if not self.authorized(handler):
            fail("EACCES", "Access key required for remote Vault access", 401)

    def check_post_origin(self, handler):
        origin = handler.headers.get("Origin", "")
        host = handler.headers.get("Host", "")
        trusted_origins = {"https://ocr2md.laity.bid", "http://127.0.0.1:4176", "http://localhost:4176"}
        if self.test_origin:
            trusted_origins.add(self.test_origin)
        if origin not in trusted_origins:
            fail("EACCES", "Untrusted request origin", 403)
        if not self.authorized(handler):
            fail("EACCES", "Access key required for filesystem writes", 401)

    def path(self, logical_path, *, existing=False):
        name = logical(logical_path)
        parts = name.strip("/").split("/") if name != "/" else []
        candidate = self.root
        for part in parts:
            candidate = candidate / part
            if candidate.is_symlink():
                fail("EACCES", "Symbolic links are not accessible", 403)
        try:
            if not candidate.resolve(strict=False).is_relative_to(self.root):
                fail("EACCES", "Path escapes Obsidian root", 403)
        except OSError:
            fail("EACCES", "Invalid filesystem path", 403)
        if existing and not candidate.exists():
            fail("ENOENT", "Item does not exist", 404)
        return candidate

    def metadata(self, path):
        physical = self.path(path, existing=True)
        meta = physical.stat(follow_symlinks=False)
        if not stat_module.S_ISDIR(meta.st_mode) and not stat_module.S_ISREG(meta.st_mode):
            fail("EACCES", "Unsupported file type", 403)
        return {"workspaceId": self.workspace_id, "path": path,
                "nodeId": f"inode:{meta.st_dev}:{meta.st_ino}",
                "kind": "directory" if physical.is_dir() else "file",
                "size": meta.st_size if physical.is_file() else 0,
                "revision": f"{meta.st_dev}:{meta.st_ino}:{meta.st_mtime_ns}:{meta.st_ctime_ns}:{meta.st_size}",
                "modifiedAt": __import__("datetime").datetime.fromtimestamp(meta.st_mtime, __import__("datetime").timezone.utc).isoformat()}

    def list(self, path, cursor=None):
        if mapping_metadata_directory(path):
            fail("EACCES", "Sidecar metadata directory is not browsable", 403)
        with self.lock:
            folder = self.path(path, existing=True)
            if not folder.is_dir():
                fail("ENOTDIR", "Not a directory")
            children = []
            for item in folder.iterdir():
                if item.name.startswith(".") or item.is_symlink() or not (item.is_file() or item.is_dir()):
                    continue
                children.append(self.metadata((path.rstrip("/") + "/" + item.name)))
            children.sort(key=lambda item: (item["kind"] != "directory", item["path"].casefold()))
            signature = hashlib.sha256(json.dumps([(x["path"], x["revision"]) for x in children], ensure_ascii=False).encode()).hexdigest()[:20]
            gen = "g:" + signature
            offset = 0
            if cursor:
                match = re.fullmatch(r"(g:[0-9a-f]{20}):(\d+)", cursor)
                if not match or match[1] != gen:
                    fail("ESTALE", "Folder changed during pagination", 409)
                offset = int(match[2])
            if offset > len(children):
                fail("EINVAL", "Bad pagination offset")
            nxt = offset + self.page_limit
            return {"generation": gen, "entries": children[offset:nxt],
                    "nextCursor": (gen + ":" + str(nxt)) if nxt < len(children) else None}

    def read(self, target, offset, length, revision):
        with self.lock:
            current = self.metadata(target["path"])
            self.ensure_ref(target, current, revision)
            if current["kind"] != "file":
                fail("EISDIR", "Cannot read a directory")
            if not isinstance(offset, int) or not isinstance(length, int) or offset < 0 or length < 1 or length > 512*1024:
                fail("EINVAL", "Read range must be <=512KiB")
            with self.path(target["path"]).open("rb") as inp:
                inp.seek(offset)
                body = inp.read(length)
            return {"base64": base64.b64encode(body).decode("ascii"),
                    "revision": current["revision"], "totalBytes": current["size"]}

    def ensure_ref(self, ref, current, revision):
        if ref.get("nodeId") != current["nodeId"] or revision != current["revision"]:
            fail("ESTALE", "File identity or revision changed", 409)

    def no_replace(self, temp_file, dest):
        try:
            os.link(temp_file, dest, follow_symlinks=False)
        except FileExistsError:
            fail("EEXIST", "Destination already exists", 409)

    def create_file(self, dest, data):
        if len(data) > 512*1024:
            fail("EQUOTA", "Direct file creation limited to 512KiB", 413)
        if not dest.parent.is_dir() or dest.parent.is_symlink():
            fail("ENOENT", "Parent directory missing", 404)
        with tempfile.NamedTemporaryFile(prefix=".ocr2md-v3-", dir=dest.parent, delete=False) as tmp:
            temp = Path(tmp.name)
            try:
                tmp.write(data)
                tmp.flush()
                os.fsync(tmp.fileno())
            finally:
                pass
        try:
            self.no_replace(temp, dest)
        finally:
            temp.unlink(missing_ok=True)

    def coordinated_replace_supported(self):
        return sys.platform == "darwin" and shutil.which("swiftc") is not None

    def coordinated_sidecar_replace(self, target, data, expected_revision, *, published_chapter=False):
        """Scoped NSFileCoordinator write+CAS; no generic Markdown mutation."""
        if published_chapter:
            # Caller must first independently check the published-file marker
            # and the owning book before this scoped coordinator is allowed.
            allowed=target.parent.name == "chapters" and target.suffix.lower()==".md" and not target.name.startswith(".")
        else:
            allowed=(mapping_sidecar_path("/" + str(target.relative_to(self.root))) or
                ir_pointer_path("/" + str(target.relative_to(self.root))))
        if not allowed:
            fail("EACCES", "Unapproved coordinated replacement target", 403)
        if not self.coordinated_replace_supported():
            fail("EUNSUPPORTED", "Native iCloud file coordinator unavailable", 409)
        if len(data) > 512 * 1024:
            fail("EQUOTA", "Sidecar replacement exceeds 512KiB", 413)
        coordinator = "v3_chapter_coordinator.swift" if published_chapter else "v3_sidecar_coordinator.swift"
        swift_source = Path(__file__).resolve().with_name(coordinator)
        binary = Path(__file__).resolve().parents[2] / ".tmp" / "wp4" / ("v3-chapter-coordinator" if published_chapter else "v3-sidecar-coordinator")
        if not swift_source.is_file():
            fail("EUNSUPPORTED", "Native coordinator source missing", 409)
        if not binary.is_file() or binary.stat().st_mtime_ns < swift_source.stat().st_mtime_ns:
            binary.parent.mkdir(parents=True, exist_ok=True)
            # Compile into a unique file, then atomically publish the helper.
            fd, build_path = tempfile.mkstemp(prefix=".v3-sidecar-helper-", dir=binary.parent)
            os.close(fd)
            try:
                try:
                    built = subprocess.run(
                        [shutil.which("swiftc"), str(swift_source), "-o", build_path],
                        capture_output=True, text=True, timeout=60,
                    )
                except (OSError, subprocess.TimeoutExpired):
                    fail("EUNSUPPORTED", "Native coordinator compilation unavailable", 409)
                if built.returncode != 0:
                    fail("EUNSUPPORTED", "Native coordinator compile failed", 409)
                os.replace(build_path, binary)
            finally:
                Path(build_path).unlink(missing_ok=True)
        with tempfile.NamedTemporaryFile(prefix=".ocr2md-v3-", dir=target.parent,
                                         delete=False) as stream:
            temporary = Path(stream.name)
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        try:
            try:
                result = subprocess.run(
                    [str(binary), str(target), expected_revision, str(temporary)],
                    capture_output=True, text=True, timeout=30,
                )
            except (OSError, subprocess.TimeoutExpired):
                fail("EUNSUPPORTED", "Native coordinated write unavailable", 409)
            if result.returncode == 42:
                fail("ESTALE", "Sidecar revision changed during coordinated write", 409)
            if result.returncode != 0 or "COORDINATED_CAS_OK" not in result.stdout:
                fail("EUNSUPPORTED", "Native coordinated replacement unsuccessful", 409)
            if hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(data).digest():
                fail("ECONFLICT", "Coordinated replacement checksum mismatch", 409)
        finally:
            temporary.unlink(missing_ok=True)

    def commit(self, body):
        with self.lock:
            if not isinstance(body, dict) or body.get("workspaceId") != self.workspace_id:
                fail("EINVAL", "Wrong workspace")
            request_id = body.get("requestId")
            operations = body.get("operations")
            if not isinstance(request_id, str) or len(request_id) > 256 or not request_id or not isinstance(operations, list) or len(operations) != 1:
                fail("EUNSUPPORTED", "Only single-operation commits are supported")
            fingerprint = hashlib.sha256(json.dumps(body, ensure_ascii=False,
                                      sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
            with sqlite3.connect(self.receipt_db_path, timeout=5) as db:
                db.execute("CREATE TABLE IF NOT EXISTS commits (request_id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, response TEXT NOT NULL)")
                existing_receipt = db.execute("SELECT fingerprint,response FROM commits WHERE request_id=?", (request_id,)).fetchone()
                if existing_receipt:
                    if existing_receipt[0] != fingerprint:
                        fail("ECONFLICT", "Idempotency key reused for a different mutation", 409)
                    return json.loads(existing_receipt[1])
            op = operations[0]
            if not isinstance(op, dict):
                fail("EINVAL", "Invalid mutation")
            kind = op.get("type")
            if kind in ("create-directory", "create-file"):
                at = request_location(op.get("at"), self.workspace_id)
                if op.get("ifAbsent") is not True or at == "/":
                    fail("EINVAL", "Creation requires ifAbsent")
                if ir_pointer_path(at):
                    fail("EACCES", "IR pointer changes require the dedicated verified snapshot endpoint", 403)
                target = self.path(at)
                if not (kind == "create-directory" and mapping_metadata_directory(at)):
                    safe_name(target.name)
                if mapping_sidecar_path(at) and kind != "create-file":
                    fail("EACCES", "Only file creation permitted at sidecar location", 403)
                if target.exists():
                    fail("EEXIST", "Destination exists", 409)
                if kind == "create-directory":
                    try:
                        target.mkdir()
                    except FileExistsError:
                        fail("EEXIST", "Destination exists", 409)
                else:
                    try:
                        data = base64.b64decode(op.get("base64", ""), validate=True)
                    except (ValueError, TypeError):
                        fail("EINVAL", "Invalid file payload")
                    self.create_file(target, data)
                updated = [self.metadata(at)]
                removed = []
            elif kind in ("copy", "move", "remove", "replace-file"):
                ref = op.get("target")
                path = request_location(ref, self.workspace_id)
                if path == "/" or path.count("/") == 1 and kind in ("remove", "move"):
                    fail("EACCES", "Vault root and top-level category directories are protected", 403)
                if ir_pointer_path(path):
                    fail("EACCES", "IR pointer cannot be mutated by generic WorkspaceFS", 403)
                if (mapping_sidecar_path(path) or mapping_metadata_directory(path)) and kind != "replace-file":
                    fail("EACCES", "Removing, moving or copying sidecar metadata is disallowed", 403)
                current = self.metadata(path)
                self.ensure_ref(ref, current, op.get("expectedRevision"))
                src = self.path(path, existing=True)
                removed = []
                if kind == "remove":
                    if current["kind"] == "directory":
                        try:
                            src.rmdir()
                        except OSError:
                            fail("ENOTEMPTY", "Only empty directories can be removed", 409)
                    else:
                        src.unlink()
                    updated = []
                    removed = [current["nodeId"]]
                elif kind == "replace-file":
                    if not mapping_sidecar_path(path):
                        fail("EUNSUPPORTED", "Generic file replacement requires future file coordination", 409)
                    try:
                        data = base64.b64decode(op.get("base64", ""), validate=True)
                    except (ValueError, TypeError):
                        fail("EINVAL", "Invalid replacement payload")
                    self.coordinated_sidecar_replace(src, data, current["revision"])
                    updated = [self.metadata(path)]
                else:
                    dest_path = request_location(op.get("to"), self.workspace_id)
                    if ir_pointer_path(dest_path):
                        fail("EACCES", "Cannot replace IR pointer via a generic copy/move", 403)
                    dest = self.path(dest_path)
                    if dest == src or dest.exists() or not dest.parent.is_dir():
                        fail("EEXIST", "Destination exists or parent missing", 409)
                    if current["kind"] == "directory" and dest.is_relative_to(src):
                        fail("EINVAL", "Cannot move a directory into itself")
                    if kind == "copy":
                        if current["kind"] != "file":
                            fail("EUNSUPPORTED", "Recursive directory copy unavailable")
                        self.create_file(dest, src.read_bytes())
                    else:
                        os.rename(src, dest)
                    updated = [self.metadata(dest_path)]
            else:
                fail("EUNSUPPORTED", "Unsupported mutation: " + str(kind), 409)
            result = {"workspaceId": self.workspace_id, "requestId": request_id,
                      "committed": True, "updated": updated, "removedIds": removed}
            with sqlite3.connect(self.receipt_db_path, timeout=5) as db:
                db.execute("INSERT INTO commits (request_id,fingerprint,response) VALUES (?,?,?)",
                           (request_id, fingerprint, json.dumps(result, ensure_ascii=False)))
            return result

    def get(self, handler):
        parsed = urlparse(handler.path)
        q = parse_qs(parsed.query)
        op = q.get("op", [""])[0]
        if op == "status":
            return {"backend": "mac-obsidian-vault", "authorized": self.authorized(handler),
                    "rootLabel": "Obsidian/ocr2md", "workspaceId": self.workspace_id,
                    "canPairLocally": self.local_request(handler)}
        if op == "pair":
            if not self.local_request(handler):
                fail("EACCES", "Pairing code only visible from Mac localhost", 403)
            return {"accessKey": self.secret}
        self.require_auth(handler)
        if op in ("mounts", "bootstrap"):
            mounts = [{"workspaceId": self.workspace_id, "label": "Mac Obsidian 真实库 · ocr2md", "backendId": "mac-obsidian-vault"}]
            result = {"mounts": mounts}
            if op == "bootstrap":
                result["root"] = self.metadata("/")
                result["page"] = self.list("/")
            return result
        if op == "capabilities":
            return {"casWrites": True, "atomicBatch": False, "rangeRead": True,
                    "notifications": False, "durableLocal": True,
                    "fileCoordination": self.coordinated_replace_supported()}
        path = logical(q.get("path", ["/"])[0])
        if op == "list":
            return self.list(path, q.get("cursor", [None])[0])
        if op == "stat":
            return self.metadata(path)
        if op == "read":
            return self.read({"path": path, "nodeId": q.get("nodeId", [""])[0]},
                             int(q.get("offset", ["0"])[0]),
                             int(q.get("length", ["262144"])[0]),
                             q.get("revision", [""])[0])
        fail("EINVAL", "Unknown filesystem query")

    def post(self, handler, payload):
        self.check_post_origin(handler)
        return self.commit(payload)


def handle_v3_get(handler):
    try:
        result = handler.v3_mac_vault.get(handler)
        handler._write_json(200, result)
    except VaultError as exc:
        handler._write_json(exc.status, {"code": exc.code, "error": str(exc)})
    except Exception:
        handler._write_json(500, {"code": "EIO", "error": "Vault operation failed"})


def handle_v3_post(handler, payload):
    try:
        result = handler.v3_mac_vault.post(handler, payload)
        handler._write_json(200, result)
    except VaultError as exc:
        handler._write_json(exc.status, {"code": exc.code, "error": str(exc)})
    except Exception:
        handler._write_json(500, {"code": "EIO", "error": "Vault operation failed"})
