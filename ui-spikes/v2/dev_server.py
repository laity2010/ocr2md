#!/usr/bin/env python3
import argparse
import base64
import hashlib
import html
import ipaddress
import json
import os
import re
import shutil
import socket
import subprocess
import threading
import time
import uuid
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, quote, urlparse
from urllib.request import HTTPRedirectHandler, Request, build_opener, urlopen

states = {}
state_history = {}
commands = {}
command_acks = {}
command_sequences = {}
state_lock = threading.Lock()
runtime_latest = None
runtime_bridge_latest = None
runtime_lock = threading.Lock()

ALLOWED_COMMANDS = {
    "open-chapter",
    "open-boundary",
    "assign-boundary-sequence",
    "export-boundary",
    "edit",
    "select-review-module",
    "focus-first-calibration",
    "ignore-first-calibration",
    "demote-first-heading",
    "renumber-first-annotation",
    "toggle-heading-numbering",
    "undo",
    "redo",
    "save",
    "close",
    "leave-cancel",
    "leave-discard",
    "leave-save",
    "enter-debug",
    "exit-debug",
}

ALLOWED_REVIEW_MODULES = {
    "章节定界",
    "章节标题",
    "注释",
    "嵌入块",
    "非法断行",
    "变动行",
}


def utc_now():
    return datetime.now(timezone.utc).isoformat()


MEDIA_DOWNLOAD_MAX_BYTES = 20 * 1024 * 1024
MEDIA_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MEDIA_REFERENCE_PATTERN = re.compile(
    r"!\[\[[^\]\r\n]+?\.(?:png|jpe?g|webp|gif)(?:\|[^\]\r\n]+)?\]\]"
    r"|!\[[^\]\r\n]*\]\(\s*(?:<[^>\r\n]+>|[^\s)\r\n]+)(?:\s+[\"'][^\"']*[\"'])?\s*\)"
    r"|<img\b[^>]*\bsrc\s*=\s*(?:\"[^\"]+\"|'[^']+'|[^\s>]+)[^>]*>",
    re.IGNORECASE,
)


DEEPL_PROTECTED_TAG_PATTERN = re.compile(
    r'(<ocr2md-protected\b[^>]*?(?:/\s*>|>\s*</ocr2md-protected\s*>))',
    re.IGNORECASE,
)


def deepl_xml_safe_text(value):
    """Escape XML text while preserving ocr2md placeholder elements."""
    if not isinstance(value, str) or not value:
        return value
    parts = DEEPL_PROTECTED_TAG_PATTERN.split(value)
    return "".join(
        part if DEEPL_PROTECTED_TAG_PATTERN.fullmatch(part)
        else html.escape(part, quote=False)
        for part in parts
    )



def sync_media_references(source_text, working_text):
    """Refresh structural media refs without overwriting trans working edits."""
    source_refs = list(MEDIA_REFERENCE_PATTERN.finditer(source_text))
    working_refs = list(MEDIA_REFERENCE_PATTERN.finditer(working_text))
    if not source_refs or len(source_refs) != len(working_refs):
        return working_text
    output = working_text
    for source_match, working_match in reversed(list(zip(source_refs, working_refs))):
        source_ref = source_match.group(0)
        if working_match.group(0) == source_ref:
            continue
        output = output[:working_match.start()] + source_ref + output[working_match.end():]
    return output


def validate_public_media_url(value):
    if not isinstance(value, str) or not value:
        raise ValueError("sourceUrl is required")
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise ValueError("仅支持 HTTP(S) 外部媒体")
    if parsed.username or parsed.password:
        raise ValueError("外部媒体 URL 不能包含账号信息")
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    try:
        literal_host = ipaddress.ip_address(parsed.hostname)
    except ValueError:
        literal_host = None
    if literal_host is not None and not literal_host.is_global:
        raise ValueError("拒绝下载内网或本机媒体地址")
    try:
        addresses = socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)
    except OSError as error:
        raise ValueError(f"无法解析媒体地址：{parsed.hostname}") from error
    if not addresses:
        raise ValueError("无法解析媒体地址")
    for info in addresses:
        address = info[4][0].split("%", 1)[0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError as error:
            raise ValueError("媒体地址解析结果无效") from error
        # Clash/Surge-style TUN DNS commonly maps public hostnames into the
        # RFC 2544 benchmark range 198.18.0.0/15. Allow that synthetic range
        # only for a hostname (never for an IP literal); all actual private,
        # loopback, link-local and other non-global destinations stay blocked.
        fake_ip = ip in ipaddress.ip_network("198.18.0.0/15")
        if not ip.is_global and not (literal_host is None and fake_ip):
            raise ValueError("拒绝下载内网或本机媒体地址")
    return value


class PublicMediaRedirectHandler(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        validate_public_media_url(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def detect_image_mime(data):
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if data.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if data.startswith((b"GIF87a", b"GIF89a")):
        return "image/gif"
    if len(data) >= 12 and data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def download_public_media(source_url):
    validate_public_media_url(source_url)
    opener = build_opener(PublicMediaRedirectHandler())
    request = Request(
        source_url,
        headers={
            "User-Agent": "ocr2md-media-downloader/1.0",
            "Accept": "image/png,image/jpeg,image/webp,image/gif,image/*;q=0.8",
        },
    )
    try:
        with opener.open(request, timeout=30) as response:
            validate_public_media_url(response.geturl())
            content_length = response.headers.get("Content-Length")
            if content_length:
                try:
                    if int(content_length) > MEDIA_DOWNLOAD_MAX_BYTES:
                        raise ValueError("媒体文件不能超过 20 MB")
                except ValueError as error:
                    if str(error) == "媒体文件不能超过 20 MB":
                        raise
            chunks = []
            total = 0
            while True:
                chunk = response.read(64 * 1024)
                if not chunk:
                    break
                total += len(chunk)
                if total > MEDIA_DOWNLOAD_MAX_BYTES:
                    raise ValueError("媒体文件不能超过 20 MB")
                chunks.append(chunk)
            data = b"".join(chunks)
            if not data:
                raise ValueError("下载到的媒体为空")
            header_mime = response.headers.get_content_type()
            detected_mime = detect_image_mime(data)
            mime_type = detected_mime or header_mime
            if mime_type not in MEDIA_MIME_TYPES:
                raise ValueError("当前媒体下载仅支持 PNG / JPEG / WebP / GIF")
            return data, mime_type
    except HTTPError as error:
        raise RuntimeError(f"媒体下载失败：HTTP {error.code}") from error
    except URLError as error:
        raise RuntimeError(f"媒体下载失败：{error.reason}") from error


def default_project_dir():
    home = Path.home()
    pattern = (
        "Library/CloudStorage/GoogleDrive-*/我的云端硬盘/Obsidian/ocr2md/"
        "books/ocr/Bufett’s Alpha"
    )
    matches = sorted(home.glob(pattern))
    return matches[0] if matches else None


class ChapterProjectStore:
    def __init__(self, project_dir, workspace_root=None):
        self.project_dir = Path(project_dir).expanduser().resolve()
        self.chapters_dir = (self.project_dir / "chapters").resolve()
        self.workspace_root = (
            Path(workspace_root).expanduser().resolve()
            if workspace_root is not None
            else None
        )
        if not self.project_dir.is_dir():
            raise RuntimeError(f"project directory does not exist: {self.project_dir}")
        if self.chapters_dir.exists() and not self.chapters_dir.is_dir():
            raise RuntimeError(f"chapters path is not a directory: {self.chapters_dir}")
        if self.chapters_dir.parent != self.project_dir:
            raise RuntimeError("invalid chapters directory")
        if self.workspace_root is not None:
            if not self.workspace_root.is_dir():
                raise RuntimeError(
                    f"workspace root does not exist: {self.workspace_root}"
                )
            try:
                self.project_dir.relative_to(self.workspace_root)
            except ValueError as error:
                raise RuntimeError(
                    "project directory must be inside workspace root"
                ) from error
        self.lock = threading.RLock()

    def storage_path(self, path):
        resolved = Path(path).resolve()
        if self.workspace_root is None:
            return str(resolved)
        try:
            relative = resolved.relative_to(self.workspace_root)
        except ValueError as error:
            raise RuntimeError("storage path escapes workspace root") from error
        relative_text = relative.as_posix()
        return "/data" + (
            f"/{relative_text}"
            if relative_text and relative_text != "."
            else ""
        )

    @property
    def project_name(self):
        return self.project_dir.name

    @staticmethod
    def canonical_sidecar(sidecar):
        return json.dumps(
            sidecar,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )

    @classmethod
    def revision(cls, working_text, sidecar):
        payload = working_text + "\0" + cls.canonical_sidecar(sidecar)
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    @staticmethod
    def chapter_id(chapter_dir):
        return hashlib.sha256(chapter_dir.name.encode("utf-8")).hexdigest()[:16]

    @staticmethod
    def first_file(chapter_dir, pattern):
        matches = sorted(chapter_dir.glob(pattern))
        return matches[0] if matches else None

    def chapter_record(self, chapter_dir):
        working = self.first_file(chapter_dir, "*.working.md")
        sidecar = self.first_file(chapter_dir, "*.ocr2md.json")
        if sidecar is None:
            sidecar = chapter_dir / f"{chapter_dir.name}.ocr2md.json"
        trans_source = chapter_dir / "trans" / f"{chapter_dir.name}.md"
        missing = []
        if working is None:
            missing.append("working")
        return {
            "id": self.chapter_id(chapter_dir),
            "name": chapter_dir.name,
            "ready": not missing,
            "reason": f"缺少 {' + '.join(missing)}" if missing else None,
            "workingFile": working.name if working else None,
            "sidecarFile": sidecar.name if sidecar.is_file() else None,
            "transReady": trans_source.is_file(),
            "_dir": chapter_dir,
            "_working": working,
            "_sidecar": sidecar,
        }

    def catalog(self):
        records = []
        if not self.chapters_dir.is_dir():
            return records
        for chapter_dir in sorted(
            (item for item in self.chapters_dir.iterdir() if item.is_dir()),
            key=lambda item: item.name,
        ):
            records.append(self.chapter_record(chapter_dir))
        return records

    def list_chapters(self):
        return [
            {
                key: value
                for key, value in record.items()
                if not key.startswith("_") and value is not None
            }
            for record in self.catalog()
        ]

    def resolve(self, chapter_id, require_ready=True):
        if not isinstance(chapter_id, str) or not chapter_id:
            raise ValueError("chapterId is required")
        record = next(
            (item for item in self.catalog() if item["id"] == chapter_id),
            None,
        )
        if record is None:
            raise KeyError("unknown chapterId")
        if require_ready and not record["ready"]:
            raise RuntimeError(
                f"章节尚不可打开：{record['name']} · {record['reason']}"
            )
        return record

    def chapter_original_path(self, record, working_path, sidecar):
        original_name = working_path.name.removesuffix(".working.md") + ".md"
        same_dir = working_path.with_name(original_name)
        if same_dir.is_file():
            return same_dir

        source_file = sidecar.get("sourceFile") if isinstance(sidecar, dict) else None
        if isinstance(source_file, str) and source_file.strip():
            normalized = source_file.replace("\\", "/")
            source_name = normalized.rsplit("/", 1)[-1]
            if source_name.endswith(".md"):
                source_dir_name = source_name.removesuffix(".md")
                sibling = (self.chapters_dir / source_dir_name / source_name).resolve()
                if (
                    sibling.is_file()
                    and sibling.parent.parent == self.chapters_dir
                ):
                    return sibling
        return None

    def read(self, chapter_id):
        record = self.resolve(chapter_id)
        with self.lock:
            working_path = record["_working"]
            sidecar_path = record["_sidecar"]
            working_text = working_path.read_text(encoding="utf-8")
            sidecar = (
                json.loads(sidecar_path.read_text(encoding="utf-8"))
                if sidecar_path.is_file()
                else {}
            )
            original_path = self.chapter_original_path(record, working_path, sidecar)
            original_text = (
                original_path.read_text(encoding="utf-8")
                if original_path is not None
                else working_text
            )
            return {
                "id": record["id"],
                "path": (
                    f"project://{self.project_dir.name}/chapters/"
                    f"{record['name']}/{working_path.name}"
                ),
                "name": working_path.name.removesuffix(".working.md") + ".md",
                "originalText": original_text,
                "workingText": working_text,
                "sidecar": sidecar,
                "revision": self.revision(working_text, sidecar),
                "storagePath": self.storage_path(working_path),
                "originalPath": (
                    self.storage_path(original_path)
                    if original_path is not None
                    else None
                ),
                "sidecarPath": self.storage_path(sidecar_path),
                "media": self.list_chapter_media(chapter_id),
            }

    def read_mineru_annotations(self, chapter_id):
        record = self.resolve(chapter_id)
        script_path = Path(__file__).resolve().parents[2] / "out" / "mineruAnnotationWebCli.js"
        node = shutil.which("node")
        if not node:
            for candidate in ("/opt/homebrew/bin/node", "/usr/local/bin/node"):
                if Path(candidate).is_file():
                    node = candidate
                    break
        if not node or not script_path.is_file():
            raise RuntimeError("MinerU annotation source-map runtime is unavailable")
        result = subprocess.run(
            [node, str(script_path), str(self.project_dir), record["name"]],
            capture_output=True,
            text=True,
            timeout=45,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError("MinerU annotation source-map error: " + result.stderr.strip()[:800])
        return json.loads(result.stdout)

    @staticmethod
    def write_text_fsync(path, text):
        with path.open("w", encoding="utf-8", newline="") as stream:
            stream.write(text)
            stream.flush()
            os.fsync(stream.fileno())

    def save(self, chapter_id, expected_revision, working_text, sidecar):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if not isinstance(working_text, str):
            raise ValueError("workingText must be a string")
        if not isinstance(sidecar, dict):
            raise ValueError("sidecar must be an object")

        record = self.resolve(chapter_id)
        with self.lock:
            working_path = record["_working"]
            sidecar_path = record["_sidecar"]
            current_working = working_path.read_text(encoding="utf-8")
            sidecar_existed = sidecar_path.is_file()
            current_sidecar_text = (
                sidecar_path.read_text(encoding="utf-8")
                if sidecar_existed
                else None
            )
            current_sidecar = (
                json.loads(current_sidecar_text)
                if current_sidecar_text is not None
                else {}
            )
            current_revision = self.revision(current_working, current_sidecar)
            if current_revision != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current_revision,
                }

            sidecar_text = json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n"
            working_temp = working_path.with_name(
                f".{working_path.name}.{uuid.uuid4().hex}.tmp"
            )
            sidecar_temp = sidecar_path.with_name(
                f".{sidecar_path.name}.{uuid.uuid4().hex}.tmp"
            )

            try:
                self.write_text_fsync(working_temp, working_text)
                self.write_text_fsync(sidecar_temp, sidecar_text)
                os.replace(working_temp, working_path)
                os.replace(sidecar_temp, sidecar_path)
            except Exception:
                if working_temp.exists():
                    working_temp.unlink()
                if sidecar_temp.exists():
                    sidecar_temp.unlink()
                self.write_text_fsync(working_path, current_working)
                if current_sidecar_text is not None:
                    self.write_text_fsync(sidecar_path, current_sidecar_text)
                elif sidecar_path.exists():
                    sidecar_path.unlink()
                raise

            persisted_working = working_path.read_text(encoding="utf-8")
            persisted_sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            return {
                "conflict": False,
                "revision": self.revision(persisted_working, persisted_sidecar),
                "savedAt": utc_now(),
                "workingText": persisted_working,
            }

    def read_chapter_image(self, chapter_id, relative_path):
        if not isinstance(relative_path, str) or not relative_path:
            raise ValueError("path is required")
        normalized = relative_path.replace("\\", "/")
        if not normalized.startswith("imgs/"):
            raise ValueError("图片路径必须位于 imgs/")
        if normalized.startswith("/") or ".." in Path(normalized).parts:
            raise ValueError("invalid image path")

        record = self.resolve(chapter_id)
        chapter_dir = record["_dir"].resolve()
        image_path = (chapter_dir / normalized).resolve()
        imgs_dir = (chapter_dir / "imgs").resolve()
        if image_path.parent != imgs_dir:
            raise ValueError("invalid image path")
        if not image_path.is_file():
            raise KeyError("image not found")

        mime_by_extension = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        mime_type = mime_by_extension.get(image_path.suffix.lower())
        if mime_type is None:
            raise ValueError("unsupported image type")
        return image_path.read_bytes(), mime_type

    def list_chapter_media(self, chapter_id):
        record = self.resolve(chapter_id)
        chapter_dir = record["_dir"].resolve()
        imgs_dir = (chapter_dir / "imgs").resolve()
        if imgs_dir.parent != chapter_dir:
            raise RuntimeError("invalid chapter image directory")
        if not imgs_dir.is_dir():
            return []

        mime_by_extension = {
            ".png": "image/png",
            ".jpg": "image/jpeg",
            ".jpeg": "image/jpeg",
            ".webp": "image/webp",
            ".gif": "image/gif",
        }
        media = []
        for item in sorted(imgs_dir.iterdir(), key=lambda path: path.name.lower()):
            if not item.is_file() or item.name.startswith("."):
                continue
            mime_type = mime_by_extension.get(item.suffix.lower())
            if mime_type is None:
                continue
            media.append({
                "fileName": item.name,
                "relativePath": f"imgs/{item.name}",
                "sizeBytes": item.stat().st_size,
                "mimeType": mime_type,
            })
        return media

    def save_pasted_image(self, chapter_id, mime_type, data_base64):
        extension_by_mime = {
            "image/png": ".png",
            "image/jpeg": ".jpg",
            "image/webp": ".webp",
            "image/gif": ".gif",
        }
        if mime_type not in extension_by_mime:
            raise ValueError("仅支持 PNG / JPEG / WebP / GIF 图片")
        if not isinstance(data_base64, str) or not data_base64:
            raise ValueError("image data is required")
        try:
            image_bytes = base64.b64decode(data_base64, validate=True)
        except Exception as error:
            raise ValueError("invalid image data") from error
        if not image_bytes:
            raise ValueError("image data is empty")
        if len(image_bytes) > 20 * 1024 * 1024:
            raise ValueError("图片不能超过 20 MB")

        record = self.resolve(chapter_id)
        with self.lock:
            chapter_dir = record["_dir"].resolve()
            if chapter_dir.parent != self.chapters_dir:
                raise RuntimeError("invalid chapter directory")
            imgs_dir = (chapter_dir / "imgs").resolve()
            if imgs_dir.parent != chapter_dir:
                raise RuntimeError("invalid chapter image directory")
            imgs_dir.mkdir(parents=True, exist_ok=True)

            stamp = datetime.now().strftime("%Y%m%d-%H%M%S-%f")[:-3]
            extension = extension_by_mime[mime_type]
            file_name = f"image-{stamp}{extension}"
            image_path = imgs_dir / file_name
            if image_path.exists():
                file_name = f"image-{stamp}-{uuid.uuid4().hex[:6]}{extension}"
                image_path = imgs_dir / file_name
            temp_path = imgs_dir / f".{file_name}.{uuid.uuid4().hex}.tmp"
            try:
                with temp_path.open("wb") as stream:
                    stream.write(image_bytes)
                    stream.flush()
                    os.fsync(stream.fileno())
                os.replace(temp_path, image_path)
            finally:
                if temp_path.exists():
                    temp_path.unlink()

            return {
                "fileName": file_name,
                "relativePath": f"imgs/{file_name}",
                "media": self.list_chapter_media(chapter_id),
            }

    @staticmethod
    def translation_revision(source_text, state):
        payload = (
            source_text
            + "\0"
            + json.dumps(
                state,
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
            )
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()

    def translation_paths(self, chapter_id):
        record = self.resolve(chapter_id)
        trans_dir = record["_dir"] / "trans"
        return (
            record,
            trans_dir,
            trans_dir / f"{record['name']}.md",
            trans_dir / f"{record['name']}.working.md",
            trans_dir / ".ocr2md-translations.json",
        )

    def sentence_paths(self, chapter_id):
        record, trans_dir, _, _, _ = self.translation_paths(chapter_id)
        sentence_dir = trans_dir / "sentences"
        return record, sentence_dir, sentence_dir / "original.json"

    @staticmethod
    def sentence_provider_file_name(provider):
        normalized = str(provider or "").strip().lower()
        if normalized == "openai":
            normalized = "chatgpt"
        safe = re.sub(r"[^a-z0-9._-]+", "-", normalized).strip("-.")
        return f"{safe or 'translation'}.json"

    def read_sentence_files(self, chapter_id):
        _, sentence_dir, source_path = self.sentence_paths(chapter_id)
        source = None
        if source_path.is_file():
            try:
                source = json.loads(source_path.read_text(encoding="utf-8"))
            except (OSError, json.JSONDecodeError):
                source = None
        translations = []
        if sentence_dir.is_dir():
            for path in sorted(sentence_dir.glob("*.json")):
                if path.name == "original.json":
                    continue
                try:
                    data = json.loads(path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    continue
                if not isinstance(data, dict):
                    continue
                provider = data.get("provider") or path.stem
                translations.append({
                    "fileName": path.name,
                    "provider": provider,
                    "data": data,
                })
        return source, translations

    def migrate_legacy_sentence_translations(self, chapter_id):
        _, sentence_dir, _ = self.sentence_paths(chapter_id)
        _, _, _, _, state_path = self.translation_paths(chapter_id)
        if not state_path.is_file():
            return
        try:
            state = json.loads(state_path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return
        entries = state.get("entries") if isinstance(state, dict) else None
        if not isinstance(entries, dict) or not entries:
            return

        grouped = {}
        state_version = state.get("version")
        for key, raw in entries.items():
            if not isinstance(raw, dict):
                continue
            provider_results = raw.get("translations") if state_version == 2 else None
            if isinstance(provider_results, dict):
                items = provider_results.items()
            else:
                items = [("deepl", raw)]
            for provider, result in items:
                if not isinstance(result, dict):
                    continue
                status = result.get("status")
                if status not in ("translated", "error"):
                    continue
                output_provider = "chatgpt" if provider == "openai" else str(provider)
                target = grouped.setdefault(output_provider, {})
                target[key] = {
                    "sentenceId": raw.get("sentenceId") or key,
                    "sourceFingerprint": raw.get("sourceFingerprint"),
                    "contextFingerprint": raw.get("contextFingerprint"),
                    "translatedText": result.get("translatedText"),
                    "status": status,
                    "error": result.get("error"),
                    "updatedAt": result.get("updatedAt"),
                    "model": result.get("model"),
                }

        if not grouped:
            return
        sentence_dir.mkdir(parents=True, exist_ok=True)
        for provider, migrated_entries in grouped.items():
            target_path = sentence_dir / self.sentence_provider_file_name(provider)
            existing = {}
            if target_path.is_file():
                try:
                    existing = json.loads(target_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    existing = {}
            if not isinstance(existing, dict):
                existing = {}
            existing_entries = existing.get("entries")
            if not isinstance(existing_entries, dict):
                existing_entries = {}
            changed = False
            for key, value in migrated_entries.items():
                if key not in existing_entries:
                    existing_entries[key] = value
                    changed = True
            if target_path.is_file() and not changed:
                continue
            payload = {
                "version": 1,
                "provider": provider,
                "label": "ChatGPT" if provider == "chatgpt" else "DeepL" if provider == "deepl" else provider,
                "sourceFile": "original.json",
                "entries": existing_entries,
            }
            temp = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
            try:
                self.write_text_fsync(
                    temp,
                    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                )
                os.replace(temp, target_path)
            finally:
                if temp.exists():
                    temp.unlink()

    def sync_sentence_source(self, chapter_id, expected_revision, source):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if not isinstance(source, dict):
            raise ValueError("source must be an object")
        with self.lock:
            current = self.read_translation(chapter_id)
            if current["revision"] != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current["revision"],
                }
            _, sentence_dir, source_path = self.sentence_paths(chapter_id)
            sentence_dir.mkdir(parents=True, exist_ok=True)
            existing = None
            if source_path.is_file():
                try:
                    existing = json.loads(source_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    existing = None
            if existing != source:
                temp = source_path.with_name(f".{source_path.name}.{uuid.uuid4().hex}.tmp")
                try:
                    self.write_text_fsync(
                        temp,
                        json.dumps(source, ensure_ascii=False, indent=2) + "\n",
                    )
                    os.replace(temp, source_path)
                finally:
                    if temp.exists():
                        temp.unlink()
            self.migrate_legacy_sentence_translations(chapter_id)
            payload = self.read_translation(chapter_id)
            return {
                "conflict": False,
                "savedAt": utc_now(),
                **payload,
            }

    def upsert_sentence_translations(
        self,
        chapter_id,
        provider,
        label,
        updates,
    ):
        if not isinstance(updates, list) or not updates:
            raise ValueError("sentence translation updates are required")
        with self.lock:
            _, sentence_dir, _ = self.sentence_paths(chapter_id)
            sentence_dir.mkdir(parents=True, exist_ok=True)
            file_name = self.sentence_provider_file_name(provider)
            target_path = sentence_dir / file_name
            payload = {}
            if target_path.is_file():
                try:
                    payload = json.loads(target_path.read_text(encoding="utf-8"))
                except (OSError, json.JSONDecodeError):
                    payload = {}
            if not isinstance(payload, dict):
                payload = {}
            entries = payload.get("entries")
            if not isinstance(entries, dict):
                entries = {}
            for update in updates:
                if not isinstance(update, dict):
                    raise ValueError("invalid sentence translation update")
                sentence = update.get("sentence")
                status = update.get("status")
                if not isinstance(sentence, dict) or not isinstance(sentence.get("id"), str):
                    raise ValueError("sentence is required")
                if status not in ("translated", "error", "pending"):
                    raise ValueError("invalid sentence translation status")
                sentence_id = sentence["id"]
                entry = {
                    "sentenceId": sentence_id,
                    "sourceFingerprint": sentence.get("sourceFingerprint"),
                    "contextFingerprint": sentence.get("contextFingerprint"),
                    "status": status,
                    "updatedAt": utc_now(),
                }
                translated_text = update.get("translatedText")
                error = update.get("error")
                model = update.get("model")
                if translated_text is not None:
                    entry["translatedText"] = translated_text
                if error:
                    entry["error"] = error
                if model:
                    entry["model"] = model
                entries[sentence_id] = entry
            payload = {
                "version": 1,
                "provider": provider,
                "label": label,
                "sourceFile": "original.json",
                "entries": entries,
            }
            temp = target_path.with_name(f".{target_path.name}.{uuid.uuid4().hex}.tmp")
            try:
                self.write_text_fsync(
                    temp,
                    json.dumps(payload, ensure_ascii=False, indent=2) + "\n",
                )
                os.replace(temp, target_path)
            finally:
                if temp.exists():
                    temp.unlink()
            return {
                "fileName": file_name,
                "provider": provider,
                "data": payload,
            }

    def upsert_sentence_translation(
        self,
        chapter_id,
        provider,
        label,
        sentence,
        status,
        translated_text=None,
        error=None,
        model=None,
    ):
        return self.upsert_sentence_translations(
            chapter_id,
            provider,
            label,
            [{
                "sentence": sentence,
                "status": status,
                "translatedText": translated_text,
                "error": error,
                "model": model,
            }],
        )

    def read_translation(self, chapter_id):
        with self.lock:
            record, trans_dir, source_path, working_path, state_path = self.translation_paths(chapter_id)
            if not source_path.is_file():
                raise RuntimeError(
                    f"章节尚未导出 trans：{record['name']}"
                )
            source_text = source_path.read_text(encoding="utf-8")
            if not working_path.is_file():
                trans_dir.mkdir(parents=True, exist_ok=True)
                temp = working_path.with_name(
                    f".{working_path.name}.{uuid.uuid4().hex}.tmp"
                )
                try:
                    self.write_text_fsync(temp, source_text)
                    os.replace(temp, working_path)
                finally:
                    if temp.exists():
                        temp.unlink()
            working_text = working_path.read_text(encoding="utf-8")
            state = (
                json.loads(state_path.read_text(encoding="utf-8"))
                if state_path.is_file()
                else {
                    "version": 2,
                    "sourcePath": (
                        f"project://{self.project_dir.name}/chapters/"
                        f"{record['name']}/trans/{source_path.name}"
                    ),
                    "entries": {},
                }
            )
            sentence_source, sentence_translations = self.read_sentence_files(chapter_id)
            return {
                "chapterId": record["id"],
                "chapterName": record["name"],
                "path": (
                    f"project://{self.project_dir.name}/chapters/"
                    f"{record['name']}/trans/{working_path.name}"
                ),
                "sourceText": source_text,
                "workingText": working_text,
                "translationState": state,
                "sentenceSource": sentence_source,
                "sentenceTranslations": sentence_translations,
                "revision": self.translation_revision(working_text, state),
                "storagePath": self.storage_path(working_path),
                "sourceStoragePath": self.storage_path(source_path),
                "statePath": self.storage_path(state_path),
            }

    def save_translation_working(
        self,
        chapter_id,
        expected_revision,
        working_text,
    ):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if not isinstance(working_text, str):
            raise ValueError("workingText must be a string")

        with self.lock:
            current = self.read_translation(chapter_id)
            if current["revision"] != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current["revision"],
                }

            _, trans_dir, _, working_path, _ = self.translation_paths(chapter_id)
            trans_dir.mkdir(parents=True, exist_ok=True)
            previous = working_path.read_bytes() if working_path.exists() else None
            temp = working_path.with_name(
                f".{working_path.name}.{uuid.uuid4().hex}.tmp"
            )
            try:
                self.write_text_fsync(temp, working_text)
                os.replace(temp, working_path)
            except Exception:
                if temp.exists():
                    temp.unlink()
                self._restore_file(working_path, previous)
                raise

            payload = self.read_translation(chapter_id)
            return {
                "conflict": False,
                "savedAt": utc_now(),
                **payload,
            }

    def export_calibration(
        self,
        chapter_id,
        expected_revision,
        destination,
        markdown,
    ):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if destination not in ("trans", "output"):
            raise ValueError("destination must be trans or output")
        if not isinstance(markdown, str):
            raise ValueError("markdown must be a string")

        record = self.resolve(chapter_id)
        with self.lock:
            current = self.read(chapter_id)
            if current["revision"] != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current["revision"],
                }

            export_dir = record["_dir"] / destination
            export_path = export_dir / f"{record['name']}.md"
            export_dir.mkdir(parents=True, exist_ok=True)
            previous = export_path.read_bytes() if export_path.exists() else None
            temp = export_path.with_name(
                f".{export_path.name}.{uuid.uuid4().hex}.tmp"
            )
            try:
                self.write_text_fsync(temp, markdown)
                os.replace(temp, export_path)
            except Exception:
                if temp.exists():
                    temp.unlink()
                self._restore_file(export_path, previous)
                raise

            return {
                "conflict": False,
                "savedAt": utc_now(),
                "destination": destination,
                "relativePath": f"{destination}/{export_path.name}",
                "fileName": export_path.name,
            }

    def export_trans_source(self, chapter_id, expected_revision, markdown):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if not isinstance(markdown, str):
            raise ValueError("markdown must be a string")

        record = self.resolve(chapter_id)
        with self.lock:
            current = self.read(chapter_id)
            if current["revision"] != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current["revision"],
                }

            _, trans_dir, source_path, working_path, _ = self.translation_paths(chapter_id)
            trans_dir.mkdir(parents=True, exist_ok=True)
            previous_source = source_path.read_bytes() if source_path.exists() else None
            previous_working = working_path.read_bytes() if working_path.exists() else None
            source_temp = source_path.with_name(
                f".{source_path.name}.{uuid.uuid4().hex}.tmp"
            )
            working_temp = None
            synced_working = None
            if working_path.is_file():
                current_working = working_path.read_text(encoding="utf-8")
                synced_working = sync_media_references(markdown, current_working)
                if synced_working != current_working:
                    working_temp = working_path.with_name(
                        f".{working_path.name}.{uuid.uuid4().hex}.tmp"
                    )
            try:
                self.write_text_fsync(source_temp, markdown)
                if working_temp is not None:
                    self.write_text_fsync(working_temp, synced_working)
                os.replace(source_temp, source_path)
                if working_temp is not None:
                    os.replace(working_temp, working_path)
            except Exception:
                if source_temp.exists():
                    source_temp.unlink()
                if working_temp is not None and working_temp.exists():
                    working_temp.unlink()
                self._restore_file(source_path, previous_source)
                self._restore_file(working_path, previous_working)
                raise

            payload = self.read_translation(chapter_id)
            return {
                "conflict": False,
                "savedAt": utc_now(),
                **payload,
            }

    def save_translation_state(
        self,
        chapter_id,
        expected_revision,
        state,
    ):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if not isinstance(state, dict):
            raise ValueError("translationState must be an object")

        with self.lock:
            current = self.read_translation(chapter_id)
            if current["revision"] != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current["revision"],
                }

            _, trans_dir, _, _, state_path = self.translation_paths(chapter_id)
            trans_dir.mkdir(parents=True, exist_ok=True)
            previous = state_path.read_bytes() if state_path.exists() else None
            temp = state_path.with_name(
                f".{state_path.name}.{uuid.uuid4().hex}.tmp"
            )
            try:
                self.write_text_fsync(
                    temp,
                    json.dumps(state, ensure_ascii=False, indent=2) + "\n",
                )
                os.replace(temp, state_path)
            except Exception:
                if temp.exists():
                    temp.unlink()
                self._restore_file(state_path, previous)
                raise

            payload = self.read_translation(chapter_id)
            return {
                "conflict": False,
                "savedAt": utc_now(),
                **payload,
            }

    @property
    def boundary_working_path(self):
        return self.project_dir / ".ocr2md-merged.working.md"

    @property
    def boundary_dir(self):
        return self.project_dir / ".ocr2md" / "chapter-boundary"

    @property
    def boundary_baseline_path(self):
        return self.boundary_dir / "baseline.md"

    @property
    def boundary_sidecar_path(self):
        return self.boundary_dir / "sidecar.json"

    @property
    def boundary_manifest_path(self):
        return self.boundary_dir / "manifest.json"

    def boundary_source_paths(self):
        return sorted(
            (
                item
                for item in self.project_dir.iterdir()
                if item.is_file()
                and not item.name.startswith(".")
                and item.suffix.lower() in {".md", ".markdown"}
            ),
            key=lambda item: item.name,
        )

    def _boundary_revision_unlocked(self):
        sources = [
            {
                "name": path.name,
                "text": path.read_text(encoding="utf-8"),
            }
            for path in self.boundary_source_paths()
        ]
        working = (
            self.boundary_working_path.read_text(encoding="utf-8")
            if self.boundary_working_path.is_file()
            else None
        )
        baseline = (
            self.boundary_baseline_path.read_text(encoding="utf-8")
            if self.boundary_baseline_path.is_file()
            else None
        )
        sidecar = (
            json.loads(self.boundary_sidecar_path.read_text(encoding="utf-8"))
            if self.boundary_sidecar_path.is_file()
            else None
        )
        payload = json.dumps(
            {
                "sources": sources,
                "working": working,
                "baseline": baseline,
                "sidecar": sidecar,
            },
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        )
        return hashlib.sha256(payload.encode("utf-8")).hexdigest()


    def read_boundary(self):
        with self.lock:
            payload = {
                "id": "__boundary__",
                "path": (
                    f"project://{self.project_dir.name}/"
                    ".ocr2md-merged.working.md"
                ),
                "name": ".ocr2md-merged.working.md",
                "rootMarkdown": [
                    {
                        "name": path.name,
                        "text": path.read_text(encoding="utf-8"),
                    }
                    for path in self.boundary_source_paths()
                ],
                "revision": self._boundary_revision_unlocked(),
            }
            if self.boundary_working_path.is_file():
                payload["workingText"] = self.boundary_working_path.read_text(
                    encoding="utf-8"
                )
            if self.boundary_baseline_path.is_file():
                payload["baselineText"] = self.boundary_baseline_path.read_text(
                    encoding="utf-8"
                )
            if self.boundary_sidecar_path.is_file():
                payload["sidecar"] = json.loads(
                    self.boundary_sidecar_path.read_text(encoding="utf-8")
                )
            return payload

    @staticmethod
    def _restore_file(path, previous):
        if previous is None:
            if path.exists():
                path.unlink()
            return
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(previous)

    def _persist_boundary_unlocked(
        self,
        working_text,
        sidecar,
        baseline_text=None,
        source_files=None,
    ):
        if not isinstance(working_text, str):
            raise ValueError("workingText must be a string")
        if not isinstance(sidecar, dict):
            raise ValueError("sidecar must be an object")
        if baseline_text is not None and not isinstance(baseline_text, str):
            raise ValueError("baselineText must be a string")
        if source_files is not None and not all(
            isinstance(item, str) for item in source_files
        ):
            raise ValueError("sourceFiles must be strings")

        self.boundary_dir.mkdir(parents=True, exist_ok=True)
        changes = {
            self.boundary_working_path: working_text,
            self.boundary_sidecar_path: (
                json.dumps(sidecar, ensure_ascii=False, indent=2) + "\n"
            ),
        }
        if (
            baseline_text is not None
            and not self.boundary_baseline_path.exists()
        ):
            changes[self.boundary_baseline_path] = baseline_text
        if not self.boundary_manifest_path.exists():
            changes[self.boundary_manifest_path] = (
                json.dumps(
                    {
                        "schemaVersion": 2,
                        "createdAt": utc_now(),
                        "workingFile": self.boundary_working_path.name,
                        "sourceFiles": list(source_files or []),
                    },
                    ensure_ascii=False,
                    indent=2,
                )
                + "\n"
            )

        previous = {
            path: path.read_bytes() if path.exists() else None
            for path in changes
        }
        temps = {}
        try:
            for path, text in changes.items():
                path.parent.mkdir(parents=True, exist_ok=True)
                temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
                self.write_text_fsync(temp, text)
                temps[path] = temp
            for path, temp in temps.items():
                os.replace(temp, path)
        except Exception:
            for temp in temps.values():
                if temp.exists():
                    temp.unlink()
            for path, value in previous.items():
                self._restore_file(path, value)
            raise

    def save_boundary(
        self,
        expected_revision,
        working_text,
        sidecar,
        baseline_text=None,
        source_files=None,
    ):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        with self.lock:
            current_revision = self._boundary_revision_unlocked()
            if current_revision != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current_revision,
                }
            self._persist_boundary_unlocked(
                working_text,
                sidecar,
                baseline_text,
                source_files,
            )
            return {
                "conflict": False,
                "revision": self._boundary_revision_unlocked(),
                "savedAt": utc_now(),
                "workingText": self.boundary_working_path.read_text(
                    encoding="utf-8"
                ),
            }

    @staticmethod
    def validate_boundary_chapter_file(chapter_file):
        if not isinstance(chapter_file, str) or not chapter_file.strip():
            raise ValueError("chapterFile is required")
        chapter_file = chapter_file.strip()
        if (
            chapter_file != Path(chapter_file).name
            or "/" in chapter_file
            or "\\" in chapter_file
            or "\x00" in chapter_file
        ):
            raise ValueError("chapterFile must be a plain filename")
        if not chapter_file.lower().endswith(".md"):
            raise ValueError("chapterFile must end with .md")
        stem = Path(chapter_file).stem.strip()
        if not stem or stem in {".", ".."}:
            raise ValueError("chapterFile has an invalid stem")
        return chapter_file, stem

    def export_boundary(
        self,
        expected_revision,
        working_text,
        sidecar,
        outputs,
        baseline_text=None,
        source_files=None,
    ):
        if not isinstance(expected_revision, str) or not expected_revision:
            raise ValueError("expectedRevision is required")
        if not isinstance(outputs, list) or not outputs:
            raise ValueError("outputs must contain at least one chapter")
        normalized = []
        seen = set()
        for item in outputs:
            if not isinstance(item, dict):
                raise ValueError("each output must be an object")
            chapter_file, stem = self.validate_boundary_chapter_file(
                item.get("chapterFile")
            )
            text = item.get("text")
            if not isinstance(text, str):
                raise ValueError("output text must be a string")
            chapter_sidecar = item.get("sidecar")
            if not isinstance(chapter_sidecar, dict):
                raise ValueError("output sidecar must be an object")
            if stem in seen:
                raise ValueError("duplicate chapter output")
            seen.add(stem)
            normalized.append((chapter_file, stem, text, chapter_sidecar))

        with self.lock:
            current_revision = self._boundary_revision_unlocked()
            if current_revision != expected_revision:
                return {
                    "conflict": True,
                    "currentRevision": current_revision,
                }

            boundary_paths = (
                self.boundary_working_path,
                self.boundary_baseline_path,
                self.boundary_sidecar_path,
                self.boundary_manifest_path,
            )
            boundary_backups = {
                path: path.read_bytes() if path.exists() else None
                for path in boundary_paths
            }
            backups = {}
            created_working = []
            created_sidecars = []
            written = []
            try:
                self._persist_boundary_unlocked(
                    working_text,
                    sidecar,
                    baseline_text,
                    source_files,
                )
                for chapter_file, stem, text, chapter_sidecar in normalized:
                    chapter_dir = self.chapters_dir / stem
                    chapter_dir.mkdir(parents=True, exist_ok=True)
                    (chapter_dir / "imgs").mkdir(parents=True, exist_ok=True)
                    original_path = chapter_dir / f"{stem}.md"
                    working_path = chapter_dir / f"{stem}.working.md"
                    sidecar_path = chapter_dir / f"{stem}.ocr2md.json"
                    backups[original_path] = (
                        original_path.read_bytes()
                        if original_path.exists()
                        else None
                    )
                    original_temp = original_path.with_name(
                        f".{original_path.name}.{uuid.uuid4().hex}.tmp"
                    )
                    self.write_text_fsync(original_temp, text)
                    os.replace(original_temp, original_path)
                    if not working_path.exists():
                        working_temp = working_path.with_name(
                            f".{working_path.name}.{uuid.uuid4().hex}.tmp"
                        )
                        self.write_text_fsync(working_temp, text)
                        os.replace(working_temp, working_path)
                        created_working.append(working_path)
                    if not sidecar_path.exists():
                        sidecar_temp = sidecar_path.with_name(
                            f".{sidecar_path.name}.{uuid.uuid4().hex}.tmp"
                        )
                        self.write_text_fsync(
                            sidecar_temp,
                            json.dumps(
                                chapter_sidecar,
                                ensure_ascii=False,
                                indent=2,
                            )
                            + "\n",
                        )
                        os.replace(sidecar_temp, sidecar_path)
                        created_sidecars.append(sidecar_path)
                    written.append(
                        {
                            "chapterFile": chapter_file,
                            "originalPath": self.storage_path(original_path),
                            "workingPath": self.storage_path(working_path),
                            "sidecarPath": self.storage_path(sidecar_path),
                        }
                    )
            except Exception:
                for path, value in boundary_backups.items():
                    self._restore_file(path, value)
                for path, value in backups.items():
                    self._restore_file(path, value)
                for path in created_working:
                    if path.exists():
                        path.unlink()
                for path in created_sidecars:
                    if path.exists():
                        path.unlink()
                raise

            return {
                "conflict": False,
                "revision": self._boundary_revision_unlocked(),
                "savedAt": utc_now(),
                "workingText": self.boundary_working_path.read_text(
                    encoding="utf-8"
                ),
                "exported": written,
            }


    @property
    def table_presentation_config_path(self):
        return self.project_dir / ".ocr2md" / "table-presentation.json"

    def read_table_presentation(self):
        path = self.table_presentation_config_path
        with self.lock:
            if not path.is_file():
                return {
                    "exists": False,
                    "source": None,
                    "storagePath": self.storage_path(path),
                }
            source = path.read_text(encoding="utf-8")
            if len(source.encode("utf-8")) > 1_000_000:
                raise RuntimeError("配置文件过大")
            return {
                "exists": True,
                "source": source,
                "storagePath": str(path),
            }

    def save_table_presentation(self, source):
        if not isinstance(source, str):
            raise ValueError("source must be a string")
        if len(source.encode("utf-8")) > 1_000_000:
            raise ValueError("配置文件过大")
        path = self.table_presentation_config_path
        with self.lock:
            path.parent.mkdir(parents=True, exist_ok=True)
            temp = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
            try:
                self.write_text_fsync(temp, source)
                os.replace(temp, path)
            except Exception:
                if temp.exists():
                    temp.unlink()
                raise
            return {
                "exists": True,
                "source": source,
                "storagePath": str(path),
                "savedAt": utc_now(),
            }

    def delete_table_presentation(self):
        path = self.table_presentation_config_path
        with self.lock:
            if path.exists():
                path.unlink()
            return {
                "exists": False,
                "source": None,
                "storagePath": str(path),
                "deletedAt": utc_now(),
            }



class UpstreamStoreError(Exception):
    def __init__(self, status, payload):
        self.status = status
        self.payload = payload if isinstance(payload, dict) else {"error": str(payload)}
        super().__init__(self.payload.get("error", f"upstream HTTP {status}"))


class UpstreamChapterProjectStore:
    def __init__(self, base_url):
        self.base_url = str(base_url).rstrip("/")
        if not self.base_url.startswith(("http://", "https://")):
            raise ValueError("workspace upstream must be an http(s) URL")

    def _request(self, method, path, payload=None):
        body = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = Request(
            self.base_url + path,
            data=body,
            headers=headers,
            method=method,
        )
        try:
            with urlopen(request, timeout=10) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            try:
                error_payload = json.loads(error.read().decode("utf-8"))
            except Exception:
                error_payload = {"error": f"upstream HTTP {error.code}"}
            raise UpstreamStoreError(error.code, error_payload) from error
        except URLError as error:
            raise RuntimeError(
                f"workspace upstream unavailable: {error.reason}"
            ) from error

    def catalog_payload(self):
        payload = self._request("GET", "/__workspace/chapters")
        if not isinstance(payload.get("chapters"), list):
            raise RuntimeError("workspace upstream returned an invalid catalog")
        return payload

    @property
    def project_name(self):
        return str(self.catalog_payload().get("projectName") or "workspace")

    def list_chapters(self):
        return self.catalog_payload()["chapters"]

    def resolve(self, chapter_id, require_ready=True):
        if not isinstance(chapter_id, str) or not chapter_id:
            raise ValueError("chapterId is required")
        record = next(
            (item for item in self.list_chapters() if item.get("id") == chapter_id),
            None,
        )
        if record is None:
            raise KeyError("unknown chapterId")
        if require_ready and not record.get("ready"):
            raise RuntimeError(
                f"章节尚不可打开：{record.get('name', chapter_id)} · "
                f"{record.get('reason', 'not ready')}"
            )
        return record

    def read(self, chapter_id):
        self.resolve(chapter_id)
        return self._request(
            "GET",
            "/__workspace/chapter?chapterId=" + chapter_id,
        )

    def save(self, chapter_id, expected_revision, working_text, sidecar):
        try:
            return self._request(
                "POST",
                "/__workspace/chapter",
                {
                    "chapterId": chapter_id,
                    "expectedRevision": expected_revision,
                    "workingText": working_text,
                    "sidecar": sidecar,
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise

    def read_chapter_image(self, chapter_id, relative_path):
        query = (
            "/__workspace/chapter/image?chapterId="
            + quote(chapter_id, safe="")
            + "&path="
            + quote(relative_path, safe="")
        )
        request = Request(
            self.base_url + query,
            headers={"Accept": "image/*"},
            method="GET",
        )
        try:
            with urlopen(request, timeout=10) as response:
                return (
                    response.read(),
                    response.headers.get("Content-Type", "application/octet-stream"),
                )
        except HTTPError as error:
            try:
                error_payload = json.loads(error.read().decode("utf-8"))
            except Exception:
                error_payload = {"error": f"upstream HTTP {error.code}"}
            raise UpstreamStoreError(error.code, error_payload) from error
        except URLError as error:
            raise RuntimeError(
                f"workspace upstream unavailable: {error.reason}"
            ) from error

    def save_pasted_image(self, chapter_id, mime_type, data_base64):
        return self._request(
            "POST",
            "/__workspace/chapter/image",
            {
                "chapterId": chapter_id,
                "mimeType": mime_type,
                "dataBase64": data_base64,
            },
        )

    def export_calibration(
        self,
        chapter_id,
        expected_revision,
        destination,
        markdown,
    ):
        try:
            return self._request(
                "POST",
                "/__workspace/chapter/export-calibrated",
                {
                    "chapterId": chapter_id,
                    "expectedRevision": expected_revision,
                    "destination": destination,
                    "markdown": markdown,
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise

    def read_translation(self, chapter_id):
        self.resolve(chapter_id)
        return self._request(
            "GET",
            "/__workspace/translation?chapterId=" + chapter_id,
        )

    def save_translation_working(
        self,
        chapter_id,
        expected_revision,
        working_text,
    ):
        try:
            return self._request(
                "POST",
                "/__workspace/translation",
                {
                    "chapterId": chapter_id,
                    "expectedRevision": expected_revision,
                    "workingText": working_text,
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise

    def export_trans_source(self, chapter_id, expected_revision, markdown):
        try:
            return self._request(
                "POST",
                "/__workspace/translation/source",
                {
                    "chapterId": chapter_id,
                    "expectedRevision": expected_revision,
                    "markdown": markdown,
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise

    def save_translation_state(
        self,
        chapter_id,
        expected_revision,
        state,
    ):
        try:
            return self._request(
                "POST",
                "/__workspace/translation/state",
                {
                    "chapterId": chapter_id,
                    "expectedRevision": expected_revision,
                    "translationState": state,
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise

    def sync_sentence_source(self, chapter_id, expected_revision, source):
        try:
            return self._request(
                "POST",
                "/__workspace/translation/sentences",
                {
                    "chapterId": chapter_id,
                    "expectedRevision": expected_revision,
                    "source": source,
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise


    def read_table_presentation(self):
        return self._request("GET", "/__workspace/table-presentation")

    def save_table_presentation(self, source):
        return self._request(
            "POST",
            "/__workspace/table-presentation",
            {"source": source},
        )


    def delete_table_presentation(self):
        return self._request("DELETE", "/__workspace/table-presentation")

    def read_boundary(self):
        return self._request("GET", "/__workspace/boundary")

    def save_boundary(
        self,
        expected_revision,
        working_text,
        sidecar,
        baseline_text=None,
        source_files=None,
    ):
        try:
            return self._request(
                "POST",
                "/__workspace/boundary",
                {
                    "expectedRevision": expected_revision,
                    "workingText": working_text,
                    "sidecar": sidecar,
                    "baselineText": baseline_text,
                    "sourceFiles": source_files or [],
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise

    def export_boundary(
        self,
        expected_revision,
        working_text,
        sidecar,
        outputs,
        baseline_text=None,
        source_files=None,
    ):
        try:
            return self._request(
                "POST",
                "/__workspace/boundary/export",
                {
                    "expectedRevision": expected_revision,
                    "workingText": working_text,
                    "sidecar": sidecar,
                    "outputs": outputs,
                    "baselineText": baseline_text,
                    "sourceFiles": source_files or [],
                },
            )
        except UpstreamStoreError as error:
            if error.status == 409:
                return {
                    "conflict": True,
                    "currentRevision": error.payload.get("currentRevision"),
                }
            raise


class TranslationProviderError(RuntimeError):
    def __init__(self, provider_status, message):
        super().__init__(message)
        self.provider_status = provider_status


class TranslationServiceStore:
    DEFAULTS = {
        "deepl": {
            "label": "DeepL",
            "endpoint": "https://api-free.deepl.com",
            "sourceLanguage": "EN",
            "targetLanguage": "ZH-HANS",
            "model": "",
        },
        "chatgpt": {
            "label": "ChatGPT",
            "endpoint": "https://api.openai.com/v1/responses",
            "model": "gpt-5.6-luna",
            "targetLanguage": "Simplified Chinese",
            "instruction": (
                "Translate the input into Simplified Chinese. Preserve every "
                "<ocr2md-protected .../> token byte-for-byte and return only the translated text."
            ),
        },
    }
    ALLOWED_HOSTS = {
        "deepl": {
            "api-free.deepl.com",
            "api.deepl.com",
            "api-jp.deepl.com",
            "api-us.deepl.com",
        },
        "chatgpt": {"api.openai.com"},
    }

    def __init__(self, config_dir):
        self.config_dir = Path(config_dir).expanduser().resolve()
        self.path = self.config_dir / "translation-services.json"
        self.lock = threading.RLock()

    def _defaults(self):
        return {
            "version": 1,
            "activeProvider": "deepl",
            "services": {
                key: {**value, "apiKey": ""}
                for key, value in self.DEFAULTS.items()
            },
        }

    def _load(self):
        data = self._defaults()
        if not self.path.is_file():
            return data
        try:
            raw = json.loads(self.path.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            return data
        if isinstance(raw, dict):
            active_provider = raw.get("activeProvider")
            if active_provider in self.DEFAULTS:
                data["activeProvider"] = active_provider
        services = raw.get("services") if isinstance(raw, dict) else None
        if not isinstance(services, dict):
            return data
        for provider, defaults in self.DEFAULTS.items():
            incoming = services.get(provider)
            if not isinstance(incoming, dict):
                continue
            merged = data["services"][provider]
            for key in defaults:
                value = incoming.get(key)
                if isinstance(value, str):
                    merged[key] = value
            api_key = incoming.get("apiKey")
            if isinstance(api_key, str):
                merged["apiKey"] = api_key
        return data

    def _write(self, data):
        self.config_dir.mkdir(parents=True, exist_ok=True)
        try:
            os.chmod(self.config_dir, 0o700)
        except OSError:
            pass
        temp = self.path.with_name(f".{self.path.name}.{uuid.uuid4().hex}.tmp")
        try:
            temp.write_text(
                json.dumps(data, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            try:
                os.chmod(temp, 0o600)
            except OSError:
                pass
            os.replace(temp, self.path)
            try:
                os.chmod(self.path, 0o600)
            except OSError:
                pass
        finally:
            if temp.exists():
                temp.unlink()

    def public_payload(self):
        with self.lock:
            data = self._load()
            services = []
            for provider in ("deepl", "chatgpt"):
                service = data["services"][provider]
                public = {
                    key: value
                    for key, value in service.items()
                    if key != "apiKey"
                }
                public.update({
                    "id": provider,
                    "apiKeyConfigured": bool(service.get("apiKey")),
                })
                services.append(public)
            return {
                "version": 1,
                "activeProvider": data.get("activeProvider", "deepl"),
                "services": services,
            }

    def select_provider(self, provider):
        if provider not in self.DEFAULTS:
            raise ValueError("unsupported translation provider")
        with self.lock:
            data = self._load()
            data["activeProvider"] = provider
            self._write(data)
            return self.public_payload()

    def provider_metadata(self, provider):
        if provider not in self.DEFAULTS:
            raise ValueError("unsupported translation provider")
        with self.lock:
            service = dict(self._load()["services"][provider])
        return {
            "provider": provider,
            "label": service.get("label") or provider,
            "model": service.get("model") or "",
            "apiKeyConfigured": bool(service.get("apiKey")),
        }

    def save_service(self, provider, payload):
        if provider not in self.DEFAULTS:
            raise ValueError("unsupported translation provider")
        if not isinstance(payload, dict):
            raise ValueError("service config must be an object")
        with self.lock:
            data = self._load()
            service = data["services"][provider]
            allowed = set(self.DEFAULTS[provider].keys()) - {"label"}
            for key in allowed:
                if key not in payload:
                    continue
                value = payload.get(key)
                if not isinstance(value, str):
                    raise ValueError(f"{key} must be a string")
                if len(value) > 4000:
                    raise ValueError(f"{key} is too long")
                service[key] = value.strip() if key != "instruction" else value.strip()
            if "apiKey" in payload:
                api_key = payload.get("apiKey")
                if not isinstance(api_key, str):
                    raise ValueError("apiKey must be a string")
                if len(api_key) > 1000:
                    raise ValueError("apiKey is too long")
                if api_key.strip():
                    service["apiKey"] = api_key.strip()
            if payload.get("clearApiKey") is True:
                service["apiKey"] = ""
            self._validate_endpoint(provider, service.get("endpoint", ""))
            self._write(data)
            return self.public_payload()

    @staticmethod
    def _translation_result(provider, source_text, translation_text, translated, duration_ms):
        expected_tokens = re.findall(r'<ocr2md-protected\b[^>]*\/>', translation_text)
        returned_tokens = re.findall(r'<ocr2md-protected\b[^>]*\/>', translated)
        missing = [token for token in expected_tokens if token not in returned_tokens]
        unexpected = [token for token in returned_tokens if token not in expected_tokens]
        return {
            "provider": provider,
            "sourceText": source_text,
            "translationText": translation_text,
            "translatedText": translated,
            "durationMs": duration_ms,
            "placeholderIntegrity": not missing and not unexpected,
            "missingPlaceholders": missing,
            "unexpectedPlaceholders": unexpected,
        }

    def test_sentence(self, provider, source_text, translation_text):
        if provider not in self.DEFAULTS:
            raise ValueError("unsupported translation provider")
        if not isinstance(source_text, str) or not isinstance(translation_text, str):
            raise ValueError("sentence text is required")
        with self.lock:
            service = dict(self._load()["services"][provider])
        api_key = service.get("apiKey", "")
        if not api_key:
            raise ValueError("API Key 未配置")
        self._validate_endpoint(provider, service.get("endpoint", ""))
        started = time.perf_counter()
        if provider == "deepl":
            translated = self._test_deepl(service, translation_text)
        else:
            translated = self._test_chatgpt(service, translation_text)
        duration_ms = round((time.perf_counter() - started) * 1000)
        return self._translation_result(
            provider, source_text, translation_text, translated, duration_ms,
        )

    def translate_deepl_batch(self, sentences, context=""):
        if not isinstance(sentences, list) or not sentences:
            raise ValueError("sentences must be a non-empty array")
        if len(sentences) > 32:
            raise ValueError("DeepL batch is limited to 32 sentences")
        source_texts = []
        translation_texts = []
        for sentence in sentences:
            if not isinstance(sentence, dict):
                raise ValueError("invalid sentence batch item")
            source_text = sentence.get("sourceText")
            translation_text = sentence.get("translationText")
            if not isinstance(source_text, str) or not isinstance(translation_text, str):
                raise ValueError("sentence text is required")
            source_texts.append(source_text)
            translation_texts.append(translation_text)
        if not isinstance(context, str):
            raise ValueError("context must be a string")
        with self.lock:
            service = dict(self._load()["services"]["deepl"])
        if not service.get("apiKey"):
            raise ValueError("API Key 未配置")
        self._validate_endpoint("deepl", service.get("endpoint", ""))
        started = time.perf_counter()
        translated = self._test_deepl_batch(service, translation_texts, context)
        duration_ms = round((time.perf_counter() - started) * 1000)
        return {
            "provider": "deepl",
            "durationMs": duration_ms,
            "contextCharacters": len(context),
            "results": [
                self._translation_result(
                    "deepl", source_text, translation_text, translated_text, duration_ms,
                )
                for source_text, translation_text, translated_text
                in zip(source_texts, translation_texts, translated)
            ],
        }

    def _validate_endpoint(self, provider, endpoint):
        if not isinstance(endpoint, str) or not endpoint:
            raise ValueError("endpoint is required")
        parsed = urlparse(endpoint)
        if parsed.scheme != "https" or parsed.hostname not in self.ALLOWED_HOSTS[provider]:
            raise ValueError("endpoint must use the official HTTPS provider host")

    def _test_deepl(self, service, text):
        return self._test_deepl_batch(service, [text])[0]

    def _test_deepl_batch(self, service, texts, context=""):
        base = service["endpoint"].rstrip("/")
        endpoint = base + "/translate" if base.endswith("/v2") else base + "/v2/translate"
        safe_texts = [deepl_xml_safe_text(text) for text in texts]
        body = {
            "text": safe_texts,
            "target_lang": service.get("targetLanguage") or "ZH-HANS",
            "split_sentences": "0",
            "preserve_formatting": True,
            "tag_handling": "xml",
            "ignore_tags": ["ocr2md-protected"],
        }
        if context.strip():
            # DeepL applies XML parsing to context when tag_handling=xml too.
            # Source prose such as R&D or mathematical '<' must therefore be
            # escaped even though context itself is not translated.
            body["context"] = deepl_xml_safe_text(context.strip())
        source_lang = service.get("sourceLanguage")
        if source_lang:
            body["source_lang"] = source_lang
        model = service.get("model")
        if model:
            body["model_type"] = model
        payload = self._request_json(
            endpoint,
            body,
            {
                "Authorization": f"DeepL-Auth-Key {service['apiKey']}",
                "Content-Type": "application/json",
            },
        )
        translations = payload.get("translations") if isinstance(payload, dict) else None
        if not isinstance(translations, list) or len(translations) != len(texts):
            raise RuntimeError("DeepL 返回的 translations 数量与请求不一致")
        translated = []
        for item in translations:
            text = item.get("text") if isinstance(item, dict) else None
            if not isinstance(text, str):
                raise RuntimeError("DeepL 返回中没有译文")
            # Undo only the XML entity escaping introduced for transport.
            # Placeholder elements remain elements and are restored later by
            # the normal Markdown-protection pipeline.
            translated.append(html.unescape(text))
        return translated

    def _test_chatgpt(self, service, text):
        body = {
            "model": service.get("model") or "gpt-5.6-luna",
            "instructions": service.get("instruction") or self.DEFAULTS["chatgpt"]["instruction"],
            "input": text,
        }
        payload = self._request_json(
            service["endpoint"],
            body,
            {
                "Authorization": f"Bearer {service['apiKey']}",
                "Content-Type": "application/json",
            },
        )
        direct = payload.get("output_text") if isinstance(payload, dict) else None
        if isinstance(direct, str) and direct:
            return direct
        if isinstance(payload, dict):
            for item in payload.get("output", []):
                if not isinstance(item, dict):
                    continue
                for content in item.get("content", []):
                    if isinstance(content, dict) and content.get("type") == "output_text":
                        text_value = content.get("text")
                        if isinstance(text_value, str) and text_value:
                            return text_value
        raise RuntimeError("ChatGPT 返回中没有 output_text")

    @staticmethod
    def _request_json(endpoint, body, headers):
        request = Request(
            endpoint,
            data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        try:
            with urlopen(request, timeout=30) as response:
                return json.loads(response.read().decode("utf-8"))
        except HTTPError as error:
            raw = b""
            try:
                raw = error.read()
            except Exception:
                raw = b""
            message = ""
            if raw:
                try:
                    payload = json.loads(raw.decode("utf-8", errors="replace"))
                    message = payload.get("message") or payload.get("error") or str(payload)
                    if isinstance(message, dict):
                        message = message.get("message") or str(message)
                except Exception:
                    message = raw.decode("utf-8", errors="replace").strip()
            if error.code == 429:
                message = message or "请求过于频繁或当前账号/IP 被限流，请稍后重试"
            elif error.code in (401, 403):
                message = message or "API Key 无效、权限不足或 endpoint 与账号类型不匹配"
            elif error.code == 456:
                message = message or "本月字符额度已用尽"
            else:
                message = message or f"HTTP {error.code}"
            raise TranslationProviderError(error.code, str(message)) from error
        except URLError as error:
            raise TranslationProviderError(None, f"服务不可达：{error.reason}") from error


class V2DevHandler(SimpleHTTPRequestHandler):
    project_store = None
    translation_service_store = None
    debug_dir = None
    workspace_root = None
    workspace_selection_path = None
    project_store_lock = threading.RLock()

    def end_headers(self):
        route = urlparse(self.path).path
        if not route.startswith("/__"):
            self.send_header("Cache-Control", "no-store, max-age=0")
            self.send_header("Pragma", "no-cache")
            self.send_header("Expires", "0")
        super().end_headers()

    def send_head(self):
        route = urlparse(self.path).path
        accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "").lower()
        if accepts_gzip and route in ("/dist/app.js", "/dist/app.css"):
            source_path = Path(self.translate_path(route))
            gzip_path = Path(f"{source_path}.gz")
            if (
                source_path.is_file()
                and gzip_path.is_file()
                and int(gzip_path.stat().st_mtime) >= int(source_path.stat().st_mtime)
            ):
                file_handle = gzip_path.open("rb")
                stat_result = os.fstat(file_handle.fileno())
                self.send_response(200)
                self.send_header("Content-type", self.guess_type(str(source_path)))
                self.send_header("Content-Encoding", "gzip")
                self.send_header("Vary", "Accept-Encoding")
                self.send_header("Content-Length", str(stat_result.st_size))
                self.send_header(
                    "Last-Modified",
                    self.date_time_string(source_path.stat().st_mtime),
                )
                self.end_headers()
                return file_handle
        return super().send_head()

    @classmethod
    def _workspace_relative_path(cls, target):
        if cls.workspace_root is None:
            raise RuntimeError("workspace directory browsing is not configured")
        root = cls.workspace_root.resolve()
        resolved = Path(target).resolve()
        try:
            relative = resolved.relative_to(root)
        except ValueError as error:
            raise ValueError("workspace path escapes the configured root") from error
        return "" if str(relative) == "." else relative.as_posix()

    @classmethod
    def _resolve_workspace_directory(cls, relative_path):
        if cls.workspace_root is None:
            raise RuntimeError("workspace directory browsing is not configured")
        if relative_path is None:
            relative_path = ""
        if not isinstance(relative_path, str):
            raise ValueError("path must be a string")
        normalized = relative_path.strip().replace("\\", "/").strip("/")
        root = cls.workspace_root.resolve()
        target = (root / normalized).resolve() if normalized else root
        cls._workspace_relative_path(target)
        if not target.is_dir():
            raise KeyError("workspace directory does not exist")
        return target

    @classmethod
    def workspace_directory_payload(cls, relative_path=""):
        target = cls._resolve_workspace_directory(relative_path)
        relative = cls._workspace_relative_path(target)
        root = cls.workspace_root.resolve()
        current_project = cls.project_store.project_dir.resolve()
        current_relative = cls._workspace_relative_path(current_project)
        directories = []
        for item in sorted(
            (entry for entry in target.iterdir() if entry.is_dir()),
            key=lambda entry: (entry.name.lower(), entry.name),
        ):
            try:
                item_relative = cls._workspace_relative_path(item.resolve())
            except ValueError:
                continue
            directories.append({
                "name": item.name,
                "path": item_relative,
                "hasChapters": (item / "chapters").is_dir(),
            })
        parent = None
        if target != root:
            parent = cls._workspace_relative_path(target.parent)
        display = "/data" + (f"/{relative}" if relative else "")
        current_display = "/data" + (f"/{current_relative}" if current_relative else "")
        return {
            "root": "/data",
            "path": relative,
            "displayPath": display,
            "parentPath": parent,
            "directories": directories,
            "currentProjectPath": current_relative,
            "currentProjectDisplayPath": current_display,
            "currentProjectName": cls.project_store.project_name,
        }

    @classmethod
    def switch_workspace_directory(cls, relative_path):
        target = cls._resolve_workspace_directory(relative_path)
        store = ChapterProjectStore(target, workspace_root=cls.workspace_root)
        with cls.project_store_lock:
            cls.project_store = store
            if cls.workspace_selection_path is not None:
                selection_path = cls.workspace_selection_path
                selection_path.parent.mkdir(parents=True, exist_ok=True)
                temp = selection_path.with_name(
                    f".{selection_path.name}.{uuid.uuid4().hex}.tmp"
                )
                temp.write_text(
                    json.dumps(
                        {"path": cls._workspace_relative_path(target)},
                        ensure_ascii=False,
                        indent=2,
                    ) + "\n",
                    encoding="utf-8",
                )
                os.replace(temp, selection_path)
        return cls.workspace_directory_payload(cls._workspace_relative_path(target))

    def _write_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _write_binary(self, status, body, content_type):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 2_000_000:
            raise ValueError("payload too large")
        raw = self.rfile.read(length)
        return json.loads(raw.decode("utf-8"))

    def _write_store_error(self, error):
        if isinstance(error, UpstreamStoreError):
            self._write_json(error.status, error.payload)
        elif isinstance(error, ValueError):
            self._write_json(400, {"error": str(error)})
        elif isinstance(error, KeyError):
            self._write_json(404, {"error": str(error).strip("'")})
        elif isinstance(error, RuntimeError):
            self._write_json(409, {"error": str(error)})
        else:
            self._write_json(500, {"error": str(error)})

    def _persist_runtime_report(self, payload):
        global runtime_latest, runtime_bridge_latest
        stored = {
            **payload,
            "receivedAt": utc_now(),
            "remoteAddress": self.client_address[0],
        }
        with runtime_lock:
            runtime_latest = stored
            bridge = stored.get("deviceDebugBridge")
            if isinstance(bridge, dict):
                runtime_bridge_latest = stored
            if self.debug_dir is not None:
                self.debug_dir.mkdir(parents=True, exist_ok=True)
                devices_dir = self.debug_dir / "devices"
                devices_dir.mkdir(parents=True, exist_ok=True)
                serialized = json.dumps(stored, ensure_ascii=False, indent=2) + "\n"
                (self.debug_dir / "latest.json").write_text(serialized, encoding="utf-8")
                if isinstance(bridge, dict):
                    (self.debug_dir / "bridge-latest.json").write_text(
                        serialized,
                        encoding="utf-8",
                    )
                    session_id = bridge.get("sessionId")
                    if not session_id:
                        session_id = stored.get("clientId") or "unknown"
                    device_key = hashlib.sha256(
                        str(session_id).encode("utf-8")
                    ).hexdigest()[:20]
                    (devices_dir / f"{device_key}.json").write_text(
                        serialized,
                        encoding="utf-8",
                    )
                with (self.debug_dir / "history.jsonl").open(
                    "a",
                    encoding="utf-8",
                ) as stream:
                    stream.write(
                        json.dumps(
                            stored,
                            ensure_ascii=False,
                            separators=(",", ":"),
                        )
                        + "\n"
                    )
        return stored

    def _store_state_report_locked(self, payload, authoritative_ack=None):
        client_id = payload.get("clientId")
        stored = {
            **payload,
            "receivedAt": utc_now(),
            "remoteAddress": self.client_address[0],
        }
        accepted = True
        existing = states.get(client_id)
        if existing is not None:
            incoming_page = str(stored.get("pageLoadedAt") or "")
            existing_page = str(existing.get("pageLoadedAt") or "")
            incoming_sequence = stored.get("sequence")
            existing_sequence = existing.get("sequence")
            if incoming_page < existing_page:
                accepted = False
            elif incoming_page == existing_page:
                if (
                    isinstance(incoming_sequence, int)
                    and isinstance(existing_sequence, int)
                    and incoming_sequence <= existing_sequence
                ):
                    accepted = False

        if not accepted:
            return False

        incoming_page = str(stored.get("pageLoadedAt") or "")
        existing_page = (
            str(existing.get("pageLoadedAt") or "")
            if existing is not None
            else ""
        )
        if existing is not None and incoming_page != existing_page:
            state_history[client_id] = []
            commands[client_id] = []

        ack = authoritative_ack or command_acks.get(client_id)
        if ack is not None and ack.get("pageLoadedAt") == incoming_page:
            stored["lastCommandId"] = ack["commandId"]
            stored["lastCommandAckAt"] = ack["ackAt"]
        elif ack is not None and authoritative_ack is None:
            command_acks.pop(client_id, None)

        states[client_id] = stored
        history = state_history.setdefault(client_id, [])
        history.append(dict(stored))
        if len(history) > 200:
            del history[:-200]
        return True

    def do_GET(self):
        parsed = urlparse(self.path)
        route = parsed.path

        if route == "/__workspace/directories":
            relative_path = parse_qs(parsed.query).get("path", [""])[0]
            try:
                self._write_json(
                    200,
                    self.workspace_directory_payload(relative_path),
                )
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/chapters":
            try:
                self._write_json(
                    200,
                    {
                        "projectName": self.project_store.project_name,
                        "chapters": self.project_store.list_chapters(),
                    },
                )
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/table-presentation":
            try:
                self._write_json(
                    200,
                    self.project_store.read_table_presentation(),
                )
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/chapter":
            chapter_id = parse_qs(parsed.query).get("chapterId", [""])[0]
            try:
                self._write_json(200, self.project_store.read(chapter_id))
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/chapter/annotations":
            chapter_id = parse_qs(parsed.query).get("chapterId", [""])[0]
            try:
                if hasattr(self.project_store, "read_mineru_annotations"):
                    self._write_json(
                        200, self.project_store.read_mineru_annotations(chapter_id)
                    )
                else:
                    self.project_store.resolve(chapter_id)
                    self._write_json(200, {"available": False, "chapterId": chapter_id, "rows": []})
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/chapter/image":
            query = parse_qs(parsed.query)
            chapter_id = query.get("chapterId", [""])[0]
            relative_path = query.get("path", [""])[0]
            try:
                body, content_type = self.project_store.read_chapter_image(
                    chapter_id,
                    relative_path,
                )
                self._write_binary(200, body, content_type)
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation":
            chapter_id = parse_qs(parsed.query).get("chapterId", [""])[0]
            try:
                self._write_json(
                    200,
                    self.project_store.read_translation(chapter_id),
                )
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation/sentence-files":
            chapter_id = parse_qs(parsed.query).get("chapterId", [""])[0]
            try:
                source, translations = self.project_store.read_sentence_files(chapter_id)
                self._write_json(200, {
                    "sourceHash": source.get("sourceHash") if isinstance(source, dict) else None,
                    "sentenceTranslations": translations,
                })
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation-services":
            try:
                self._write_json(200, self.translation_service_store.public_payload())
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/boundary":
            try:
                self._write_json(200, self.project_store.read_boundary())
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__debug/health":
            self._write_json(
                200,
                {
                    "ok": True,
                    "time": utc_now(),
                    "projectName": self.project_store.project_name,
                },
            )
            return

        if route == "/__debug/runtime/bridge":
            with runtime_lock:
                latest = runtime_bridge_latest
                if latest is None and self.debug_dir is not None:
                    latest_path = self.debug_dir / "bridge-latest.json"
                    if latest_path.is_file():
                        latest = json.loads(latest_path.read_text(encoding="utf-8"))
            if latest is None:
                self._write_json(
                    404,
                    {"ok": False, "error": "no rich device report yet"},
                )
            else:
                self._write_json(200, latest)
            return

        if route == "/__debug/runtime":
            with runtime_lock:
                latest = runtime_latest
                if latest is None and self.debug_dir is not None:
                    latest_path = self.debug_dir / "latest.json"
                    if latest_path.is_file():
                        latest = json.loads(latest_path.read_text(encoding="utf-8"))
            if latest is None:
                self._write_json(
                    404,
                    {"ok": False, "error": "no runtime report yet"},
                )
            else:
                self._write_json(200, latest)
            return

        if route == "/__debug/state":
            with state_lock:
                clients = sorted(
                    states.values(),
                    key=lambda item: item.get("receivedAt", ""),
                    reverse=True,
                )
            self._write_json(200, {"clients": clients})
            return

        if route == "/__debug/state/history":
            client_id = parse_qs(parsed.query).get("clientId", [""])[0]
            if not client_id:
                self._write_json(400, {"error": "clientId is required"})
                return
            try:
                after_sequence = int(
                    parse_qs(parsed.query).get("afterSequence", ["0"])[0]
                )
            except ValueError:
                self._write_json(400, {"error": "afterSequence must be an integer"})
                return
            with state_lock:
                current = states.get(client_id)
                current_page = (
                    str(current.get("pageLoadedAt") or "")
                    if current is not None
                    else ""
                )
                history = [
                    item
                    for item in state_history.get(client_id, [])
                    if str(item.get("pageLoadedAt") or "") == current_page
                    and isinstance(item.get("sequence"), int)
                    and item["sequence"] > after_sequence
                ]
            self._write_json(200, {"states": history})
            return

        if route == "/__debug/ack":
            client_id = parse_qs(parsed.query).get("clientId", [""])[0]
            if not client_id:
                self._write_json(400, {"error": "clientId is required"})
                return
            with state_lock:
                ack = command_acks.get(client_id)
            self._write_json(200, {"ack": ack})
            return

        if route == "/__debug/command":
            client_id = parse_qs(parsed.query).get("clientId", [""])[0]
            if not client_id:
                self._write_json(400, {"error": "clientId is required"})
                return
            with state_lock:
                queue = commands.setdefault(client_id, [])
                command = queue[0] if queue else None
            self._write_json(200, {"command": command})
            return

        super().do_GET()

    def do_DELETE(self):
        parsed = urlparse(self.path)
        route = parsed.path

        if route == "/__workspace/table-presentation":
            try:
                deleted = self.project_store.delete_table_presentation()
            except Exception as error:
                self._write_store_error(error)
                return
            self._write_json(200, deleted)
            return

        self._write_json(404, {"error": "unknown delete endpoint"})

    def do_POST(self):
        route = urlparse(self.path).path

        try:
            payload = self._read_json()
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as error:
            self._write_json(400, {"error": str(error)})
            return

        if route == "/__debug/ack":
            client_id = payload.get("clientId")
            command_id = payload.get("commandId")
            command_sequence = payload.get("commandSequence")
            page_loaded_at = payload.get("pageLoadedAt")
            state_report = payload.get("stateReport")
            if not isinstance(client_id, str) or not client_id:
                self._write_json(400, {"error": "clientId is required"})
                return
            if not isinstance(command_id, str) or not command_id:
                self._write_json(400, {"error": "commandId is required"})
                return
            if not isinstance(command_sequence, int) or command_sequence < 1:
                self._write_json(400, {"error": "commandSequence is required"})
                return
            with state_lock:
                existing = states.get(client_id)
                if existing is None:
                    self._write_json(404, {"error": "unknown clientId"})
                    return
                if (
                    isinstance(page_loaded_at, str)
                    and page_loaded_at
                    and str(existing.get("pageLoadedAt") or "") != page_loaded_at
                ):
                    self._write_json(409, {"error": "stale page session"})
                    return
                if state_report is not None:
                    if not isinstance(state_report, dict):
                        self._write_json(
                            400,
                            {"error": "stateReport must be an object"},
                        )
                        return
                    if state_report.get("clientId") != client_id:
                        self._write_json(
                            400,
                            {"error": "stateReport clientId mismatch"},
                        )
                        return
                    if (
                        str(state_report.get("pageLoadedAt") or "")
                        != str(existing.get("pageLoadedAt") or "")
                    ):
                        self._write_json(
                            409,
                            {"error": "stateReport page session mismatch"},
                        )
                        return
                prior_ack = command_acks.get(client_id)
                if (
                    prior_ack is not None
                    and prior_ack.get("pageLoadedAt")
                    == str(existing.get("pageLoadedAt") or "")
                    and command_sequence <= prior_ack.get("commandSequence", 0)
                ):
                    self._write_json(
                        200,
                        {
                            "ok": True,
                            "accepted": False,
                            "reason": "stale command acknowledgement",
                        },
                    )
                    return
                ack = {
                    "pageLoadedAt": str(existing.get("pageLoadedAt") or ""),
                    "commandId": command_id,
                    "commandSequence": command_sequence,
                    "ackAt": utc_now(),
                }
                command_acks[client_id] = ack
                state_accepted = None
                if state_report is not None:
                    state_accepted = self._store_state_report_locked(
                        state_report,
                        authoritative_ack=ack,
                    )
                current = states.get(client_id)
                if current is not None:
                    current["lastCommandId"] = ack["commandId"]
                    current["lastCommandAckAt"] = ack["ackAt"]
                queue = commands.setdefault(client_id, [])
                commands[client_id] = [
                    item
                    for item in queue
                    if not (
                        item.get("commandId") == command_id
                        and item.get("commandSequence") == command_sequence
                    )
                ]
            response = {"ok": True}
            if state_report is not None:
                response["stateAccepted"] = state_accepted
            self._write_json(200, response)
            return

        if route == "/__workspace/project-directory":
            try:
                switched = self.switch_workspace_directory(payload.get("path"))
            except Exception as error:
                self._write_store_error(error)
                return
            self._write_json(200, switched)
            return

        if route == "/__workspace/chapter/media/download":
            chapter_id = payload.get("chapterId")
            expected_revision = payload.get("expectedRevision")
            source_url = payload.get("sourceUrl")
            try:
                current = self.project_store.read(chapter_id)
                if current.get("revision") != expected_revision:
                    self._write_json(
                        409,
                        {
                            "error": "章节 working 已变化，媒体下载已暂停",
                            "currentRevision": current.get("revision"),
                        },
                    )
                    return
                if not isinstance(source_url, str) or source_url not in current.get("workingText", ""):
                    raise ValueError("当前章节中已找不到该外部媒体链接")
                media_bytes, mime_type = download_public_media(source_url)
                image = self.project_store.save_pasted_image(
                    chapter_id,
                    mime_type,
                    base64.b64encode(media_bytes).decode("ascii"),
                )
                local_path = image.get("relativePath")
                if not isinstance(local_path, str) or not local_path.startswith("imgs/"):
                    raise RuntimeError("媒体落盘返回了无效路径")
                next_working = current["workingText"].replace(source_url, local_path)
                saved = self.project_store.save(
                    chapter_id,
                    expected_revision,
                    next_working,
                    current["sidecar"],
                )
                if saved.get("conflict"):
                    self._write_json(
                        409,
                        {
                            "error": "章节 working 已变化，媒体已落盘但引用未覆盖；该文件会显示为未采用",
                            "currentRevision": saved.get("currentRevision"),
                        },
                    )
                    return
                refreshed = self.project_store.read(chapter_id)
            except Exception as error:
                self._write_store_error(error)
                return
            self._write_json(
                200,
                {
                    **saved,
                    "relativePath": image["relativePath"],
                    "fileName": image["fileName"],
                    "media": refreshed.get("media", []),
                },
            )
            return

        if route == "/__workspace/chapter/image":
            try:
                saved = self.project_store.save_pasted_image(
                    payload.get("chapterId"),
                    payload.get("mimeType"),
                    payload.get("dataBase64"),
                )
            except Exception as error:
                self._write_store_error(error)
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/table-presentation":
            try:
                saved = self.project_store.save_table_presentation(
                    payload.get("source")
                )
            except Exception as error:
                self._write_store_error(error)
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/chapter":
            try:
                saved = self.project_store.save(
                    payload.get("chapterId"),
                    payload.get("expectedRevision"),
                    payload.get("workingText"),
                    payload.get("sidecar"),
                )
            except Exception as error:
                self._write_store_error(error)
                return

            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "章节 working 已在其他位置更新，已拒绝覆盖",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return

            self._write_json(200, saved)
            return

        if route == "/__workspace/chapter/export-calibrated":
            try:
                saved = self.project_store.export_calibration(
                    payload.get("chapterId"),
                    payload.get("expectedRevision"),
                    payload.get("destination"),
                    payload.get("markdown"),
                )
            except Exception as error:
                self._write_store_error(error)
                return
            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "章节 working 已变化，已拒绝导出标定",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/translation":
            try:
                saved = self.project_store.save_translation_working(
                    payload.get("chapterId"),
                    payload.get("expectedRevision"),
                    payload.get("workingText"),
                )
            except Exception as error:
                self._write_store_error(error)
                return
            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "trans 工作稿已在其他位置更新，已拒绝覆盖",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/translation-services/active":
            try:
                result = self.translation_service_store.select_provider(
                    payload.get("provider")
                )
                self._write_json(200, result)
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation-services/config":
            try:
                provider = payload.get("provider")
                config = payload.get("config")
                result = self.translation_service_store.save_service(provider, config)
                self._write_json(200, result)
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation-services/translate-batch":
            provider = payload.get("provider")
            chapter_id = payload.get("chapterId")
            sentence_ids = payload.get("sentenceIds")
            metadata = None
            pending = []
            try:
                if provider != "deepl":
                    raise ValueError("batch translation currently supports DeepL only")
                if (
                    not isinstance(sentence_ids, list)
                    or not sentence_ids
                    or len(sentence_ids) > 32
                    or any(not isinstance(item, str) or not item for item in sentence_ids)
                ):
                    raise ValueError("sentenceIds must contain 1-32 sentence ids")
                metadata = self.translation_service_store.provider_metadata(provider)
                translation = self.project_store.read_translation(chapter_id)
                source = translation.get("sentenceSource")
                entries = source.get("entries") if isinstance(source, dict) else None
                if not isinstance(entries, list):
                    raise RuntimeError("句子原文 JSON 尚未生成，请重新进入 trans 工作区")
                by_id = {
                    item.get("id"): item
                    for item in entries
                    if isinstance(item, dict) and isinstance(item.get("id"), str)
                }
                requested = []
                for sentence_id in sentence_ids:
                    sentence = by_id.get(sentence_id)
                    if sentence is None:
                        raise KeyError(f"unknown sentenceId: {sentence_id}")
                    requested.append(sentence)

                existing_file = None
                existing_entries = {}
                for item in translation.get("sentenceTranslations") or []:
                    if not isinstance(item, dict) or item.get("provider") != provider:
                        continue
                    existing_file = item
                    data = item.get("data")
                    candidate_entries = data.get("entries") if isinstance(data, dict) else None
                    if isinstance(candidate_entries, dict):
                        existing_entries = candidate_entries
                    break
                pending = [
                    sentence for sentence in requested
                    if not (
                        isinstance(existing_entries.get(sentence.get("id")), dict)
                        and existing_entries[sentence.get("id")].get("status") == "translated"
                    )
                ]
                if not pending:
                    self._write_json(200, {
                        "skipped": True,
                        "provider": provider,
                        "sentenceIds": sentence_ids,
                        "translatedCount": 0,
                        "failedCount": 0,
                        "translationFile": existing_file,
                    })
                    return

                index_by_id = {
                    item.get("id"): index
                    for index, item in enumerate(entries)
                    if isinstance(item, dict) and isinstance(item.get("id"), str)
                }
                pending_indices = [index_by_id[item["id"]] for item in pending]
                context_start = max(0, min(pending_indices) - 2)
                context_end = min(len(entries), max(pending_indices) + 3)
                # A shared DeepL context lets every text[] item see its nearby
                # paragraph/chapter neighborhood while each returned translation
                # still maps one-to-one to the original sentence.
                context_parts = []
                context_chars = 0
                for item in entries[context_start:context_end]:
                    if not isinstance(item, dict):
                        continue
                    text = item.get("sourceText")
                    if not isinstance(text, str) or not text.strip():
                        continue
                    addition = text.strip()
                    if context_chars + len(addition) + 1 > 12000:
                        break
                    context_parts.append(addition)
                    context_chars += len(addition) + 1
                context = "\n".join(context_parts)
                result = self.translation_service_store.translate_deepl_batch(
                    pending,
                    context,
                )
                result_items = result.get("results") or []
                if len(result_items) != len(pending):
                    raise RuntimeError("DeepL 批量翻译结果数量不匹配")
                updates = []
                failed = 0
                for sentence, translated in zip(pending, result_items):
                    if translated.get("placeholderIntegrity"):
                        updates.append({
                            "sentence": sentence,
                            "status": "translated",
                            "translatedText": translated.get("translatedText"),
                            "model": metadata.get("model"),
                        })
                    else:
                        missing = len(translated.get("missingPlaceholders") or [])
                        unexpected = len(translated.get("unexpectedPlaceholders") or [])
                        message = f"占位符完整性检查失败：缺失 {missing} / 异常 {unexpected}"
                        updates.append({
                            "sentence": sentence,
                            "status": "error",
                            "error": message,
                            "model": metadata.get("model"),
                        })
                        failed += 1
                file_result = self.project_store.upsert_sentence_translations(
                    chapter_id,
                    provider,
                    metadata["label"],
                    updates,
                )
                self._write_json(424 if failed else 200, {
                    **result,
                    "skipped": False,
                    "sentenceIds": [item["id"] for item in pending],
                    "translatedCount": len(pending) - failed,
                    "failedCount": failed,
                    "translationFile": file_result,
                    **({"error": f"DeepL 批次中有 {failed} 句占位符校验失败"} if failed else {}),
                })
            except TranslationProviderError as error:
                status = error.provider_status
                label = (metadata or {}).get("label") or "DeepL"
                if status == 429:
                    message = f"{label} 429 · {error}"
                elif status:
                    message = f"{label} HTTP {status} · {error}"
                else:
                    message = f"{label} · {error}"
                file_result = None
                if pending and isinstance(chapter_id, str):
                    try:
                        file_result = self.project_store.upsert_sentence_translations(
                            chapter_id,
                            "deepl",
                            label,
                            [{
                                "sentence": sentence,
                                "status": "error",
                                "error": message,
                                "model": (metadata or {}).get("model"),
                            } for sentence in pending],
                        )
                    except Exception:
                        file_result = None
                self._write_json(424, {
                    "error": message,
                    "providerStatus": status,
                    "provider": provider,
                    "sentenceIds": [item.get("id") for item in pending],
                    "translationFile": file_result,
                })
            except RuntimeError as error:
                self._write_json(424, {"error": str(error), "provider": provider})
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation-services/translate-sentence":
            provider = payload.get("provider")
            chapter_id = payload.get("chapterId")
            sentence_id = payload.get("sentenceId")
            sentence = None
            metadata = None
            try:
                metadata = self.translation_service_store.provider_metadata(provider)
                translation = self.project_store.read_translation(chapter_id)
                source = translation.get("sentenceSource")
                entries = source.get("entries") if isinstance(source, dict) else None
                if not isinstance(entries, list):
                    raise RuntimeError("句子原文 JSON 尚未生成，请重新进入 trans 工作区")
                sentence = next(
                    (item for item in entries if isinstance(item, dict) and item.get("id") == sentence_id),
                    None,
                )
                if sentence is None:
                    raise KeyError("unknown sentenceId")

                for item in translation.get("sentenceTranslations") or []:
                    if not isinstance(item, dict) or item.get("provider") != provider:
                        continue
                    data = item.get("data")
                    file_entries = data.get("entries") if isinstance(data, dict) else None
                    existing = file_entries.get(sentence_id) if isinstance(file_entries, dict) else None
                    if isinstance(existing, dict) and existing.get("status") == "translated":
                        self._write_json(200, {
                            "skipped": True,
                            "provider": provider,
                            "sentenceId": sentence_id,
                            "translationFile": item,
                        })
                        return

                result = self.translation_service_store.test_sentence(
                    provider,
                    sentence.get("sourceText"),
                    sentence.get("translationText"),
                )
                if not result.get("placeholderIntegrity"):
                    missing = len(result.get("missingPlaceholders") or [])
                    unexpected = len(result.get("unexpectedPlaceholders") or [])
                    message = f"占位符完整性检查失败：缺失 {missing} / 异常 {unexpected}"
                    file_result = self.project_store.upsert_sentence_translation(
                        chapter_id,
                        provider,
                        metadata["label"],
                        sentence,
                        "error",
                        error=message,
                        model=metadata.get("model"),
                    )
                    self._write_json(424, {
                        "error": message,
                        "provider": provider,
                        "sentenceId": sentence_id,
                        "translationFile": file_result,
                    })
                    return
                file_result = self.project_store.upsert_sentence_translation(
                    chapter_id,
                    provider,
                    metadata["label"],
                    sentence,
                    "translated",
                    translated_text=result.get("translatedText"),
                    model=metadata.get("model"),
                )
                self._write_json(200, {
                    **result,
                    "skipped": False,
                    "sentenceId": sentence_id,
                    "translationFile": file_result,
                })
            except TranslationProviderError as error:
                status = error.provider_status
                label = (metadata or {}).get("label") or ("DeepL" if provider == "deepl" else "ChatGPT")
                if status == 429:
                    message = f"{label} 429 · {error}"
                elif status:
                    message = f"{label} HTTP {status} · {error}"
                else:
                    message = f"{label} · {error}"
                file_result = None
                if isinstance(sentence, dict) and isinstance(chapter_id, str):
                    try:
                        file_result = self.project_store.upsert_sentence_translation(
                            chapter_id,
                            provider,
                            label,
                            sentence,
                            "error",
                            error=message,
                            model=(metadata or {}).get("model"),
                        )
                    except Exception:
                        file_result = None
                self._write_json(424, {
                    "error": message,
                    "providerStatus": status,
                    "provider": provider,
                    "sentenceId": sentence_id,
                    "translationFile": file_result,
                })
            except RuntimeError as error:
                self._write_json(424, {"error": str(error), "provider": provider})
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation-services/test":
            try:
                provider = payload.get("provider")
                chapter_id = payload.get("chapterId")
                sentence_id = payload.get("sentenceId")
                translation = self.project_store.read_translation(chapter_id)
                source = translation.get("sentenceSource")
                entries = source.get("entries") if isinstance(source, dict) else None
                if not isinstance(entries, list):
                    raise RuntimeError("句子原文 JSON 尚未生成，请重新进入 trans 工作区")
                sentence = next(
                    (item for item in entries if isinstance(item, dict) and item.get("id") == sentence_id),
                    None,
                )
                if sentence is None:
                    raise KeyError("unknown sentenceId")
                result = self.translation_service_store.test_sentence(
                    provider,
                    sentence.get("sourceText"),
                    sentence.get("translationText"),
                )
                self._write_json(200, result)
            except TranslationProviderError as error:
                status = error.provider_status
                if status == 429:
                    label = "DeepL" if payload.get("provider") == "deepl" else "ChatGPT"
                    message = f"{label} 429 · {error}"
                elif status:
                    label = "DeepL" if payload.get("provider") == "deepl" else "ChatGPT"
                    message = f"{label} HTTP {status} · {error}"
                else:
                    message = str(error)
                # 424 keeps the JSON body intact through the external reverse proxy;
                # using 502 here caused the proxy to replace our error payload.
                self._write_json(424, {
                    "error": message,
                    "providerStatus": status,
                    "provider": payload.get("provider"),
                })
            except RuntimeError as error:
                self._write_json(424, {"error": str(error)})
            except Exception as error:
                self._write_store_error(error)
            return

        if route == "/__workspace/translation/source":
            try:
                saved = self.project_store.export_trans_source(
                    payload.get("chapterId"),
                    payload.get("expectedRevision"),
                    payload.get("markdown"),
                )
            except Exception as error:
                self._write_store_error(error)
                return
            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "章节 working 已变化，已拒绝覆盖 trans 原文",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/translation/sentences":
            try:
                saved = self.project_store.sync_sentence_source(
                    payload.get("chapterId"),
                    payload.get("expectedRevision"),
                    payload.get("source"),
                )
            except Exception as error:
                self._write_store_error(error)
                return
            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "trans 工作稿已变化，已拒绝刷新句子原文",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/translation/state":
            try:
                saved = self.project_store.save_translation_state(
                    payload.get("chapterId"),
                    payload.get("expectedRevision"),
                    payload.get("translationState"),
                )
            except Exception as error:
                self._write_store_error(error)
                return
            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "翻译 source/state 已变化，已拒绝覆盖",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return
            self._write_json(200, saved)
            return

        if route == "/__workspace/boundary":
            try:
                saved = self.project_store.save_boundary(
                    payload.get("expectedRevision"),
                    payload.get("workingText"),
                    payload.get("sidecar"),
                    payload.get("baselineText"),
                    payload.get("sourceFiles"),
                )
            except Exception as error:
                self._write_store_error(error)
                return

            if saved.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "章节定界输入或 working 已在其他位置更新，已拒绝覆盖",
                        "currentRevision": saved["currentRevision"],
                    },
                )
                return

            self._write_json(200, saved)
            return

        if route == "/__workspace/boundary/export":
            try:
                exported = self.project_store.export_boundary(
                    payload.get("expectedRevision"),
                    payload.get("workingText"),
                    payload.get("sidecar"),
                    payload.get("outputs"),
                    payload.get("baselineText"),
                    payload.get("sourceFiles"),
                )
            except Exception as error:
                self._write_store_error(error)
                return

            if exported.get("conflict"):
                self._write_json(
                    409,
                    {
                        "error": "章节定界输入或 working 已在其他位置更新，已拒绝导出",
                        "currentRevision": exported["currentRevision"],
                    },
                )
                return

            self._write_json(200, exported)
            return

        if route == "/__debug/runtime":
            if not isinstance(payload, dict):
                self._write_json(
                    400,
                    {"error": "runtime report must be an object"},
                )
                return
            self._persist_runtime_report(payload)
            self._write_json(200, {"ok": True})
            return

        if route == "/__debug/state":
            client_id = payload.get("clientId")
            if not isinstance(client_id, str) or not client_id:
                self._write_json(400, {"error": "clientId is required"})
                return

            with state_lock:
                accepted = self._store_state_report_locked(payload)
            self._write_json(200, {"ok": True, "accepted": accepted})
            return

        if route == "/__debug/command":
            client_id = payload.get("clientId")
            action = payload.get("action")
            if not isinstance(client_id, str) or not client_id:
                self._write_json(400, {"error": "clientId is required"})
                return
            if action not in ALLOWED_COMMANDS:
                self._write_json(400, {"error": "action is not allowed"})
                return
            if action == "open-chapter":
                try:
                    self.project_store.resolve(payload.get("chapterId"))
                except Exception as error:
                    self._write_store_error(error)
                    return
            if action == "select-review-module":
                if payload.get("reviewModule") not in ALLOWED_REVIEW_MODULES:
                    self._write_json(400, {"error": "reviewModule is not allowed"})
                    return

            with state_lock:
                if client_id not in states:
                    self._write_json(404, {"error": "unknown clientId"})
                    return
                command_sequence = command_sequences.get(client_id, 0) + 1
                command_sequences[client_id] = command_sequence
                command = {
                    "commandId": uuid.uuid4().hex,
                    "commandSequence": command_sequence,
                    "action": action,
                    "issuedAt": utc_now(),
                    "chapterId": payload.get("chapterId"),
                    "reviewModule": payload.get("reviewModule"),
                }
                commands.setdefault(client_id, []).append(command)

            self._write_json(200, {"ok": True, "command": command})
            return

        self._write_json(404, {"error": "not found"})


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="0.0.0.0")
    parser.add_argument("--port", type=int, default=4180)
    parser.add_argument("--directory", default=".")
    parser.add_argument("--project-dir")
    parser.add_argument("--workspace-root")
    parser.add_argument("--workspace-selection-file")
    parser.add_argument(
        "--workspace-upstream",
        default=os.environ.get("OCR2MD_WORKSPACE_UPSTREAM", ""),
    )
    parser.add_argument(
        "--debug-dir",
        default=os.environ.get("OCR2MD_DEBUG_DIR", ""),
    )
    parser.add_argument(
        "--config-dir",
        default=os.environ.get(
            "OCR2MD_CONFIG_DIR",
            str(Path.home() / ".config" / "ocr2md"),
        ),
    )
    args = parser.parse_args()

    if args.workspace_upstream:
        V2DevHandler.project_store = UpstreamChapterProjectStore(
            args.workspace_upstream
        )
        V2DevHandler.workspace_root = None
        V2DevHandler.workspace_selection_path = None
        store_label = f"upstream {args.workspace_upstream}"
    else:
        project_dir = (
            Path(args.project_dir).expanduser().resolve()
            if args.project_dir
            else default_project_dir()
        )
        if project_dir is None:
            raise RuntimeError(
                "could not discover the v2 real project; pass --project-dir explicitly"
            )
        workspace_root = (
            Path(args.workspace_root).expanduser().resolve()
            if args.workspace_root
            else project_dir
        )
        if not workspace_root.is_dir():
            raise RuntimeError(f"workspace root does not exist: {workspace_root}")
        V2DevHandler.workspace_root = workspace_root
        V2DevHandler.workspace_selection_path = (
            Path(args.workspace_selection_file).expanduser().resolve()
            if args.workspace_selection_file
            else None
        )
        try:
            project_dir.relative_to(workspace_root)
        except ValueError as error:
            raise RuntimeError("project directory must be inside workspace root") from error
        if (
            V2DevHandler.workspace_selection_path is not None
            and V2DevHandler.workspace_selection_path.is_file()
        ):
            try:
                selected = json.loads(
                    V2DevHandler.workspace_selection_path.read_text(encoding="utf-8")
                )
                selected_path = selected.get("path") if isinstance(selected, dict) else None
                if isinstance(selected_path, str):
                    project_dir = V2DevHandler._resolve_workspace_directory(selected_path)
            except Exception as error:
                print(f"ignoring invalid workspace selection: {error}", flush=True)
        V2DevHandler.project_store = ChapterProjectStore(
            project_dir,
            workspace_root=workspace_root,
        )
        store_label = str(V2DevHandler.project_store.project_dir)

    V2DevHandler.debug_dir = (
        Path(args.debug_dir).expanduser().resolve()
        if args.debug_dir
        else None
    )

    V2DevHandler.translation_service_store = TranslationServiceStore(args.config_dir)

    handler = partial(V2DevHandler, directory=args.directory)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(
        f"ocr2md v2 dev server listening on http://{args.bind}:{args.port}\n"
        f"project store: {store_label}\n"
        f"chapters: {len(V2DevHandler.project_store.list_chapters())}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
