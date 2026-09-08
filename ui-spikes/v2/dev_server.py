#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import threading
import uuid
from datetime import datetime, timezone
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlparse
from urllib.request import Request, urlopen

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


def default_project_dir():
    home = Path.home()
    pattern = (
        "Library/CloudStorage/GoogleDrive-*/我的云端硬盘/Obsidian/ocr2md/"
        "books/ocr/Bufett’s Alpha"
    )
    matches = sorted(home.glob(pattern))
    return matches[0] if matches else None


class ChapterProjectStore:
    def __init__(self, project_dir):
        self.project_dir = Path(project_dir).expanduser().resolve()
        self.chapters_dir = (self.project_dir / "chapters").resolve()
        if not self.project_dir.is_dir():
            raise RuntimeError(f"project directory does not exist: {self.project_dir}")
        if not self.chapters_dir.is_dir():
            raise RuntimeError(f"chapters directory does not exist: {self.chapters_dir}")
        if self.chapters_dir.parent != self.project_dir:
            raise RuntimeError("invalid chapters directory")
        self.lock = threading.RLock()

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
        missing = []
        if working is None:
            missing.append("working")
        if sidecar is None:
            missing.append("sidecar")
        return {
            "id": self.chapter_id(chapter_dir),
            "name": chapter_dir.name,
            "ready": not missing,
            "reason": f"缺少 {' + '.join(missing)}" if missing else None,
            "workingFile": working.name if working else None,
            "sidecarFile": sidecar.name if sidecar else None,
            "_dir": chapter_dir,
            "_working": working,
            "_sidecar": sidecar,
        }

    def catalog(self):
        records = []
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
            sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
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
                "storagePath": str(working_path),
                "originalPath": str(original_path) if original_path is not None else None,
                "sidecarPath": str(sidecar_path),
            }

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
            current_sidecar_text = sidecar_path.read_text(encoding="utf-8")
            current_sidecar = json.loads(current_sidecar_text)
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
                self.write_text_fsync(sidecar_path, current_sidecar_text)
                raise

            persisted_working = working_path.read_text(encoding="utf-8")
            persisted_sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
            return {
                "conflict": False,
                "revision": self.revision(persisted_working, persisted_sidecar),
                "savedAt": utc_now(),
                "workingText": persisted_working,
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
            trans_dir / ".ocr2md-translations.json",
        )

    def read_translation(self, chapter_id):
        with self.lock:
            record, _, source_path, state_path = self.translation_paths(chapter_id)
            if not source_path.is_file():
                raise RuntimeError(
                    f"章节尚未导出 trans：{record['name']}"
                )
            source_text = source_path.read_text(encoding="utf-8")
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
            return {
                "chapterId": record["id"],
                "chapterName": record["name"],
                "path": (
                    f"project://{self.project_dir.name}/chapters/"
                    f"{record['name']}/trans/{source_path.name}"
                ),
                "sourceText": source_text,
                "translationState": state,
                "revision": self.translation_revision(source_text, state),
                "storagePath": str(source_path),
                "statePath": str(state_path),
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

            _, trans_dir, source_path, _ = self.translation_paths(chapter_id)
            trans_dir.mkdir(parents=True, exist_ok=True)
            previous = source_path.read_bytes() if source_path.exists() else None
            temp = source_path.with_name(
                f".{source_path.name}.{uuid.uuid4().hex}.tmp"
            )
            try:
                self.write_text_fsync(temp, markdown)
                os.replace(temp, source_path)
            except Exception:
                if temp.exists():
                    temp.unlink()
                self._restore_file(source_path, previous)
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

            _, trans_dir, _, state_path = self.translation_paths(chapter_id)
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
                            "originalPath": str(original_path),
                            "workingPath": str(working_path),
                            "sidecarPath": str(sidecar_path),
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
                    "storagePath": str(path),
                }
            source = path.read_text(encoding="utf-8")
            if len(source.encode("utf-8")) > 1_000_000:
                raise RuntimeError("表格配置文件过大")
            return {
                "exists": True,
                "source": source,
                "storagePath": str(path),
            }

    def save_table_presentation(self, source):
        if not isinstance(source, str):
            raise ValueError("source must be a string")
        if len(source.encode("utf-8")) > 1_000_000:
            raise ValueError("表格配置文件过大")
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

    def read_translation(self, chapter_id):
        self.resolve(chapter_id)
        return self._request(
            "GET",
            "/__workspace/translation?chapterId=" + chapter_id,
        )

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


class V2DevHandler(SimpleHTTPRequestHandler):
    project_store = None
    debug_dir = None

    def _write_json(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False, indent=2).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
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
    parser.add_argument(
        "--workspace-upstream",
        default=os.environ.get("OCR2MD_WORKSPACE_UPSTREAM", ""),
    )
    parser.add_argument(
        "--debug-dir",
        default=os.environ.get("OCR2MD_DEBUG_DIR", ""),
    )
    args = parser.parse_args()

    if args.workspace_upstream:
        V2DevHandler.project_store = UpstreamChapterProjectStore(
            args.workspace_upstream
        )
        store_label = f"upstream {args.workspace_upstream}"
    else:
        project_dir = (
            Path(args.project_dir).expanduser()
            if args.project_dir
            else default_project_dir()
        )
        if project_dir is None:
            raise RuntimeError(
                "could not discover the v2 real project; pass --project-dir explicitly"
            )
        V2DevHandler.project_store = ChapterProjectStore(project_dir)
        store_label = str(V2DevHandler.project_store.project_dir)

    V2DevHandler.debug_dir = (
        Path(args.debug_dir).expanduser().resolve()
        if args.debug_dir
        else None
    )

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
