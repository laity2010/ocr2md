from __future__ import annotations

import hashlib
import json
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any


MANIFEST_NAME = "title_manifest.json"
WORKSPACE_NAME = "md-workspace"

MARKDOWN_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
NUMERIC_TITLE_RE = re.compile(r"^\d{1,3}$")
CHINESE_NUMERAL_RE = re.compile(r"^[一二三四五六七八九十百千万零〇两]{1,6}$")
CHAPTER_RE = re.compile(r"^第\s*[\d一二三四五六七八九十百千万零〇两]+\s*[章节回部卷篇]\b")
SHORT_MIXED_RE = re.compile(r"^[\w\u4e00-\u9fff《》：:，,、（）()\-\s]{1,32}$")

KNOWN_SAMPLE_BOOKS = ("漫长的告别", "再见，吾爱", "长眠不醒")
IGNORED_TITLE_TEXTS = {"目录", "目 录"}


@dataclass
class HeadingCandidate:
    id: str
    enabled: bool
    book_id: str
    book_title: str
    level: int
    local_no: str
    global_no: str
    title: str
    source_file: str
    line_no: int
    status: str
    kind: str
    confidence: str
    raw_text: str
    insert_before_line: int | None = None
    insert_after_line: int | None = None
    missing: bool = False
    metadata: dict[str, Any] = field(default_factory=dict)


def manifest_path(input_dir: Path) -> Path:
    return input_dir / "output" / MANIFEST_NAME


def workspace_path(input_dir: Path) -> Path:
    return input_dir / WORKSPACE_NAME


def scan_directory(input_dir: str | Path) -> dict[str, Any]:
    root = Path(input_dir).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Input directory does not exist: {root}")

    files = list_markdown_files(root)
    workspace = load_workspace(root)
    existing = workspace.get("manifest") or load_manifest(root)
    old_by_id = {item.get("id"): item for item in existing.get("headings", []) if item.get("id")}

    headings: list[HeadingCandidate] = []
    for file_path in files:
        headings.extend(scan_file(root, file_path))

    merged: list[dict[str, Any]] = []
    seen_ids: set[str] = set()
    for candidate in headings:
        candidate_dict = asdict(candidate)
        old = old_by_id.get(candidate.id)
        if old:
            candidate_dict = merge_candidate(candidate_dict, old)
        merged.append(candidate_dict)
        seen_ids.add(candidate.id)

    for old in existing.get("headings", []):
        old_id = old.get("id")
        if old_id in seen_ids:
            continue
        if old.get("kind") == "manual":
            merged.append(old)
            seen_ids.add(old_id)
            continue
        stale = dict(old)
        stale["missing"] = True
        stale["status"] = "待确认"
        merged.append(stale)

    apply_sample_book_defaults(merged)
    recompute_statuses(merged)

    return {
        "schema_version": 1,
        "input_dir": str(root),
        "generated_at": now_iso(),
        "files": [str(path.relative_to(root)) for path in files],
        "headings": merged,
        "workspace_path": str(workspace_path(root)),
        "workspace_loaded": bool(workspace),
        "ui_state": workspace.get("ui_state", {}),
    }


def save_manifest(payload: dict[str, Any]) -> dict[str, Any]:
    root = Path(payload["input_dir"]).expanduser().resolve()
    headings = payload.get("headings", [])
    recompute_statuses(headings)
    root_output = root / "output"
    root_output.mkdir(parents=True, exist_ok=True)
    saved = {
        "schema_version": 1,
        "input_dir": str(root),
        "saved_at": now_iso(),
        "files": payload.get("files", []),
        "headings": headings,
    }
    path = manifest_path(root)
    path.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    workspace = save_workspace(root, saved, payload.get("ui_state", {}))
    return {"ok": True, "path": str(path), "workspace_path": str(workspace), "headings": headings}


def save_workspace(root: Path, manifest: dict[str, Any], ui_state: dict[str, Any] | None = None) -> Path:
    payload = {
        "schema_version": 1,
        "kind": "ocr2md-workspace",
        "input_dir": str(root),
        "saved_at": now_iso(),
        "manifest": manifest,
        "ui_state": ui_state or {},
    }
    path = workspace_path(root)
    path.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return path


def update_workspace_ui_state(payload: dict[str, Any]) -> dict[str, Any]:
    root = Path(payload["input_dir"]).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Input directory does not exist: {root}")
    workspace = load_workspace(root)
    manifest = workspace.get("manifest") or load_manifest(root) or {
        "schema_version": 1,
        "input_dir": str(root),
        "files": [str(path.relative_to(root)) for path in list_markdown_files(root)],
        "headings": [],
    }
    path = save_workspace(root, manifest, payload.get("ui_state", {}))
    return {"ok": True, "workspace_path": str(path)}


def export_markdown(payload: dict[str, Any]) -> dict[str, Any]:
    root = Path(payload["input_dir"]).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Input directory does not exist: {root}")

    files = [str(path) for path in payload.get("files", [])]
    if not files:
        files = [str(path.relative_to(root)) for path in list_markdown_files(root)]
    file_index = {source_file: idx for idx, source_file in enumerate(files)}
    file_lines = read_source_lines(root, files)

    headings = [dict(item) for item in payload.get("headings", [])]
    recompute_statuses(headings)
    selected_ids = {str(item_id) for item_id in payload.get("export_selected_ids", [])}
    selected_only = bool(payload.get("export_selected_only"))
    if selected_only and not selected_ids:
        raise ValueError("No selected headings to export")
    enabled = [
        item
        for item in headings
        if item.get("enabled")
        and not item.get("missing")
        and item.get("source_file") in file_index
        and item.get("line_no")
        and export_name_for_item(item)
        and (not selected_only or str(item.get("id")) in selected_ids)
    ]
    enabled.sort(key=lambda item: (file_index[str(item["source_file"])], int(item["line_no"])))
    if not enabled:
        raise ValueError("No enabled headings to export")

    boundaries = [
        item
        for item in headings
        if item.get("enabled")
        and not item.get("missing")
        and item.get("source_file") in file_index
        and item.get("line_no")
    ]
    boundaries.sort(key=lambda item: (file_index[str(item["source_file"])], int(item["line_no"])))
    heading_rewrites = build_heading_rewrites(headings)

    export_by_key = build_export_name_map(enabled)
    first_item_by_export_name: dict[str, dict[str, Any]] = {}
    for item in enabled:
        first_item_by_export_name.setdefault(export_by_key[export_key(item)], item)

    chunks_by_name: dict[str, list[str]] = {}
    for export_name, item in first_item_by_export_name.items():
        next_boundary = next_export_boundary(item, boundaries, file_index, export_by_key, export_name)
        chunk = slice_between(root, file_lines, file_index, item, next_boundary, heading_rewrites)
        if item.get("kind") == "manual":
            level = int(item.get("level") or 2)
            level = min(6, max(1, level))
            chunk = f"{'#' * level} {item.get('title', '').strip()}\n\n{chunk}"
        chunks_by_name.setdefault(export_name, []).append(chunk.rstrip() + "\n")

    output_dir = root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    clean_exported_markdown(output_dir)
    written: list[dict[str, Any]] = []
    used_filenames: dict[str, int] = {}
    for export_name, chunks in chunks_by_name.items():
        filename = unique_filename(sanitize_filename(export_name) + ".md", used_filenames)
        path = output_dir / filename
        content = "\n".join(chunk for chunk in chunks if chunk.strip()).rstrip() + "\n"
        path.write_text(content, encoding="utf-8")
        written.append({"export_name": export_name, "file": filename, "path": str(path), "chars": len(content)})

    return {"ok": True, "output_dir": str(output_dir), "count": len(written), "files": written, "headings": headings}


def clean_exported_markdown(output_dir: Path) -> None:
    for path in output_dir.glob("*.md"):
        if path.name == MANIFEST_NAME:
            continue
        if path.is_file():
            path.unlink()


def get_context(input_dir: str | Path, source_file: str, line_no: int, radius: int = 12) -> dict[str, Any]:
    root = Path(input_dir).expanduser().resolve()
    file_path = (root / source_file).resolve()
    ensure_inside(file_path, root)
    lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
    start = max(1, int(line_no) - radius)
    end = min(len(lines), int(line_no) + radius)
    return {
        "source_file": source_file,
        "line_no": int(line_no),
        "start": start,
        "end": end,
        "lines": [{"line_no": idx, "text": lines[idx - 1]} for idx in range(start, end + 1)],
    }


def get_file_text(input_dir: str | Path, source_file: str, line_no: int = 1) -> dict[str, Any]:
    root = Path(input_dir).expanduser().resolve()
    file_path = (root / source_file).resolve()
    ensure_inside(file_path, root)
    text = file_path.read_text(encoding="utf-8", errors="replace")
    return {
        "source_file": source_file,
        "line_no": int(line_no),
        "text": text,
        "line_count": len(text.splitlines()),
    }


def read_source_lines(root: Path, files: list[str]) -> dict[str, list[str]]:
    result: dict[str, list[str]] = {}
    for source_file in files:
        path = (root / source_file).resolve()
        ensure_inside(path, root)
        result[source_file] = path.read_text(encoding="utf-8", errors="replace").splitlines(keepends=True)
    return result


def build_export_name_map(items: list[dict[str, Any]]) -> dict[str, str]:
    result: dict[str, str] = {}
    for item in items:
        key = logic_key(item)
        if not key or key in result:
            continue
        result[key] = export_name_for_item(item)
    for item in items:
        key = export_key(item)
        if key not in result:
            result[key] = export_name_for_item(item)
    return result


def export_name_for_item(item: dict[str, Any]) -> str:
    local_no = str(item.get("local_no") or "").strip()
    title = str(item.get("title") or "").strip()
    if local_no and title and normalize_export_part(local_no) == normalize_export_part(title):
        return local_no
    return " ".join(part for part in (local_no, title) if part).strip()


def logic_key(item: dict[str, Any]) -> str:
    local_no = str(item.get("local_no") or "").strip()
    if not local_no:
        return ""
    return f"{item.get('book_id') or ''}:{local_no}"


def export_key(item: dict[str, Any]) -> str:
    return logic_key(item) or str(item.get("id") or "")


def normalize_export_part(value: str) -> str:
    return re.sub(r"^0+(\d+)$", r"\1", str(value).strip())


def next_export_boundary(
    item: dict[str, Any],
    boundaries: list[dict[str, Any]],
    file_index: dict[str, int],
    export_by_key: dict[str, str],
    export_name: str,
) -> dict[str, Any] | None:
    current_pos = (file_index[str(item.get("source_file"))], int(item.get("line_no") or 0))
    for candidate in boundaries:
        candidate_pos = (file_index[str(candidate.get("source_file"))], int(candidate.get("line_no") or 0))
        if candidate_pos <= current_pos:
            continue
        if candidate.get("enabled") and export_by_key.get(export_key(candidate)) == export_name:
            continue
        return candidate
    return None


def slice_between(
    root: Path,
    file_lines: dict[str, list[str]],
    file_index: dict[str, int],
    start: dict[str, Any],
    end: dict[str, Any] | None,
    heading_rewrites: dict[tuple[str, int], str],
) -> str:
    start_file = str(start["source_file"])
    start_line = max(1, int(start["line_no"]))
    end_file = str(end["source_file"]) if end else None
    end_line = max(1, int(end["line_no"])) if end else None
    ordered_files = sorted(file_index, key=lambda name: file_index[name])
    start_idx = file_index[start_file]
    end_idx = file_index[end_file] if end_file else len(ordered_files) - 1
    chunks: list[str] = []

    for idx in range(start_idx, end_idx + 1):
        source_file = ordered_files[idx]
        lines = file_lines[source_file]
        from_line = start_line if source_file == start_file else 1
        to_line = (end_line - 1) if end_file == source_file and end_line is not None else len(lines)
        if to_line >= from_line:
            chunks.append(render_source_slice(source_file, lines, from_line, to_line, heading_rewrites))
    return "".join(chunks)


def render_source_slice(
    source_file: str,
    lines: list[str],
    from_line: int,
    to_line: int,
    heading_rewrites: dict[tuple[str, int], str],
) -> str:
    rendered: list[str] = []
    for line_no in range(from_line, to_line + 1):
        rewrite = heading_rewrites.get((source_file, line_no))
        if rewrite is not None:
            original = lines[line_no - 1]
            newline = "\n" if original.endswith("\n") else ""
            rendered.append(rewrite + newline)
        else:
            rendered.append(lines[line_no - 1])
    return "".join(rendered)


def build_heading_rewrites(headings: list[dict[str, Any]]) -> dict[tuple[str, int], str]:
    rewrites: dict[tuple[str, int], str] = {}
    for item in headings:
        if not item.get("enabled") or item.get("missing") or item.get("kind") == "manual":
            continue
        source_file = str(item.get("source_file") or "")
        line_no = item.get("line_no")
        title = str(item.get("title") or "").strip()
        if not source_file or not line_no or not title:
            continue
        level = int(item.get("level") or 2)
        level = min(6, max(1, level))
        rewrites[(source_file, int(line_no))] = f"{'#' * level} {title}"
    return rewrites


def sanitize_filename(name: str) -> str:
    cleaned = re.sub(r"[\\/:*?\"<>|]", "_", name).strip().strip(".")
    cleaned = re.sub(r"\s+", " ", cleaned)
    return cleaned[:120] or "untitled"


def unique_filename(filename: str, used: dict[str, int]) -> str:
    if filename not in used:
        used[filename] = 1
        return filename
    used[filename] += 1
    stem = filename[:-3] if filename.endswith(".md") else filename
    return f"{stem}-{used[filename]}.md"


def list_markdown_files(root: Path) -> list[Path]:
    files: list[Path] = []
    for path in root.rglob("*.md"):
        if "output" in path.relative_to(root).parts:
            continue
        if path.is_file():
            files.append(path)
    return sorted(files, key=lambda path: str(path.relative_to(root)))


def scan_file(root: Path, file_path: Path) -> list[HeadingCandidate]:
    rel = str(file_path.relative_to(root))
    lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
    candidates: list[HeadingCandidate] = []
    for idx, line in enumerate(lines, start=1):
        stripped = line.strip()
        md_match = MARKDOWN_HEADING_RE.match(stripped)
        if md_match:
            hashes = md_match.group(1)
            title = md_match.group(2).strip()
            candidates.append(
                make_candidate(
                    rel,
                    idx,
                    stripped,
                    title,
                    level=len(hashes),
                    kind="markdown",
                    confidence="high",
                    enabled=default_enabled_for_title(title),
                )
            )
            continue

        if is_plain_heading_candidate(lines, idx - 1):
            candidates.append(
                make_candidate(
                    rel,
                    idx,
                    stripped,
                    stripped,
                    level=2,
                    kind="plain",
                    confidence="low",
                    enabled=False,
                )
            )
    return candidates


def make_candidate(
    source_file: str,
    line_no: int,
    raw_text: str,
    title: str,
    *,
    level: int,
    kind: str,
    confidence: str,
    enabled: bool,
) -> HeadingCandidate:
    local_no = title if NUMERIC_TITLE_RE.fullmatch(title) else ""
    return HeadingCandidate(
        id=stable_id(source_file, line_no, raw_text),
        enabled=enabled,
        book_id="",
        book_title="",
        level=level,
        local_no=local_no,
        global_no="",
        title=title,
        source_file=source_file,
        line_no=line_no,
        status="",
        kind=kind,
        confidence=confidence,
        raw_text=raw_text,
    )


def stable_id(source_file: str, line_no: int, raw_text: str) -> str:
    digest = hashlib.sha1(f"{source_file}:{line_no}:{raw_text}".encode("utf-8")).hexdigest()[:16]
    return f"h_{digest}"


def is_plain_heading_candidate(lines: list[str], zero_idx: int) -> bool:
    text = lines[zero_idx].strip()
    if not text or text.startswith("!") or text.startswith("|"):
        return False
    if len(text) > 32:
        return False
    prev_blank = zero_idx == 0 or not lines[zero_idx - 1].strip()
    next_blank = zero_idx == len(lines) - 1 or not lines[zero_idx + 1].strip()
    if not (prev_blank or next_blank):
        return False
    return (
        NUMERIC_TITLE_RE.fullmatch(text) is not None
        or CHINESE_NUMERAL_RE.fullmatch(text) is not None
        or CHAPTER_RE.match(text) is not None
        or (prev_blank and next_blank and SHORT_MIXED_RE.fullmatch(text) is not None)
    )


def default_enabled_for_title(title: str) -> bool:
    if title in IGNORED_TITLE_TEXTS:
        return False
    if re.search(r"CIP|图书在版|图鉴|Personal Belongings", title, re.I):
        return False
    return True


def load_manifest(root: Path) -> dict[str, Any]:
    path = manifest_path(root)
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def load_workspace(root: Path) -> dict[str, Any]:
    path = workspace_path(root)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if payload.get("kind") != "ocr2md-workspace":
        return {}
    manifest = payload.get("manifest")
    if not isinstance(manifest, dict):
        return {}
    ui_state = payload.get("ui_state")
    return {
        "manifest": manifest,
        "ui_state": ui_state if isinstance(ui_state, dict) else {},
    }


def merge_candidate(candidate: dict[str, Any], old: dict[str, Any]) -> dict[str, Any]:
    editable_fields = {
        "enabled",
        "book_id",
        "book_title",
        "level",
        "local_no",
        "global_no",
        "title",
        "status",
        "insert_before_line",
        "insert_after_line",
        "metadata",
    }
    merged = dict(candidate)
    for field_name in editable_fields:
        if field_name in old:
            merged[field_name] = old[field_name]
    merged["missing"] = False
    return merged


def apply_sample_book_defaults(headings: list[dict[str, Any]]) -> None:
    current_book = ""
    local_seen = {"long_goodbye": 0, "farewell_my_lovely": 0, "big_sleep": 0}
    global_offsets = {"long_goodbye": 0, "farewell_my_lovely": 53, "big_sleep": 94}
    book_titles = {
        "long_goodbye": "漫长的告别",
        "farewell_my_lovely": "再见，吾爱",
        "big_sleep": "长眠不醒",
    }
    for item in headings:
        title = str(item.get("title", "")).strip()
        if title == "漫长的告别":
            current_book = "long_goodbye"
        elif title == "再见，吾爱":
            current_book = "farewell_my_lovely"
        elif title == "长眠不醒":
            current_book = "big_sleep"

        if item.get("book_id") or not item.get("enabled"):
            continue

        if not current_book or not NUMERIC_TITLE_RE.fullmatch(title):
            continue

        parsed_no = int(title)
        expected_no = local_seen[current_book] + 1
        allow_missing_first = current_book == "big_sleep" and expected_no == 1 and parsed_no == 2
        if parsed_no != expected_no and not allow_missing_first:
            continue

        item["book_id"] = current_book
        item["book_title"] = book_titles[current_book]
        item["local_no"] = title.zfill(2)
        if not item.get("global_no"):
            item["global_no"] = str(global_offsets[current_book] + parsed_no).zfill(3)
        local_seen[current_book] = parsed_no

    backfill_book_title_first_chapters(headings, book_titles, global_offsets)


def backfill_book_title_first_chapters(
    headings: list[dict[str, Any]], book_titles: dict[str, str], global_offsets: dict[str, int]
) -> None:
    for book_id, book_title in book_titles.items():
        assigned = [
            (idx, item)
            for idx, item in enumerate(headings)
            if item.get("book_id") == book_id and item.get("enabled") and str(item.get("local_no")) == "02"
        ]
        has_first = any(
            item.get("book_id") == book_id and item.get("enabled") and str(item.get("local_no")) == "01"
            for item in headings
        )
        if has_first or not assigned:
            continue
        first_idx = assigned[0][0]
        for idx in range(first_idx - 1, -1, -1):
            item = headings[idx]
            if str(item.get("title", "")).strip() != book_title:
                continue
            if item.get("book_id"):
                continue
            item["book_id"] = book_id
            item["book_title"] = book_title
            item["local_no"] = "01"
            if not item.get("global_no"):
                item["global_no"] = str(global_offsets[book_id] + 1).zfill(3)
            item["enabled"] = True
            break


def recompute_statuses(headings: list[dict[str, Any]]) -> None:
    enabled = [item for item in headings if item.get("enabled") and not item.get("missing")]
    duplicate_global = duplicates(item.get("global_no") for item in enabled if item.get("global_no"))
    duplicate_local: set[tuple[str, str]] = set()
    by_book: dict[str, list[dict[str, Any]]] = {}
    for item in enabled:
        book_id = str(item.get("book_id") or "")
        if book_id:
            by_book.setdefault(book_id, []).append(item)
    for book_id, items in by_book.items():
        duplicate_local.update((book_id, no) for no in duplicates(item.get("local_no") for item in items if item.get("local_no")))

    for item in headings:
        if item.get("missing"):
            item["status"] = "待确认"
            continue
        if item.get("kind") == "manual" and not item.get("status"):
            item["status"] = "手动新增"
        if not item.get("enabled"):
            item["status"] = "已禁用"
            continue
        book_id = str(item.get("book_id") or "")
        local_no = str(item.get("local_no") or "")
        global_no = str(item.get("global_no") or "")
        statuses: list[str] = []
        if not book_id:
            statuses.append("未归书")
        if global_no in duplicate_global or (book_id, local_no) in duplicate_local:
            statuses.append("疑似重复")
        if not local_no or not global_no:
            statuses.append("未编号")
        item["status"] = "、".join(statuses) if statuses else "正常"

    mark_gaps(enabled, "global_no")
    for items in by_book.values():
        mark_gaps(items, "local_no")


def mark_gaps(items: list[dict[str, Any]], field_name: str) -> None:
    numbers = sorted(int(str(item[field_name])) for item in items if str(item.get(field_name) or "").isdigit())
    if not numbers:
        return
    expected = set(range(numbers[0], numbers[-1] + 1))
    if expected == set(numbers):
        return
    for item in items:
        if item.get("status") == "正常":
            item["status"] = "疑似漏号"
        elif "疑似漏号" not in item.get("status", ""):
            item["status"] = f"{item.get('status')}、疑似漏号"


def duplicates(values: Any) -> set[str]:
    seen: set[str] = set()
    dupes: set[str] = set()
    for value in values:
        value = str(value)
        if value in seen:
            dupes.add(value)
        seen.add(value)
    return dupes


def ensure_inside(path: Path, root: Path) -> None:
    try:
        path.relative_to(root)
    except ValueError as exc:
        raise ValueError("Path escapes input directory") from exc


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
