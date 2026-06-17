from __future__ import annotations

import hashlib
import json
import mimetypes
import re
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen


MANIFEST_NAME = "title_manifest.json"
WORKSPACE_NAME = "md-workspace"

MARKDOWN_HEADING_RE = re.compile(r"^(#{1,6})\s+(.+?)\s*$")
NUMERIC_TITLE_RE = re.compile(r"^\d{1,3}$")
CHINESE_NUMERAL_RE = re.compile(r"^[一二三四五六七八九十百千万零〇两]{1,6}$")
CHAPTER_RE = re.compile(r"^第\s*[\d一二三四五六七八九十百千万零〇两]+\s*[章节回部卷篇]\b")
SHORT_MIXED_RE = re.compile(r"^[\w\u4e00-\u9fff《》：:，,、（）()\-\s]{1,32}$")
ANNOTATION_BODY_RE = re.compile(
    r"^\s*(?P<marker>[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\[\d{1,3}\]|［\d{1,3}］|\(\d{1,3}\)|（\d{1,3}）)\s*(?P<body>.*)$"
)
ANNOTATION_MARKER_RE = re.compile(
    r"(?P<marker>[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\[\d{1,3}\]|［\d{1,3}］|\(\d{1,3}\)|（\d{1,3}）)"
)
MARKDOWN_IMAGE_RE = re.compile(r"!\[(?P<alt>[^\]]*)\]\((?P<destination>[^)]*)\)")
EXTERNAL_URL_RE = re.compile(r"^(?:https?:)?//", re.IGNORECASE)

KNOWN_SAMPLE_BOOKS = ("漫长的告别", "再见，吾爱", "长眠不醒")
IGNORED_TITLE_TEXTS = {"目录", "目 录"}
CIRCLED_NUMBER_MAP = {
    char: str(idx)
    for idx, char in enumerate("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳", start=1)
}


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
    annotations = merge_annotations(
        scan_annotations(root, files, merged),
        workspace.get("manifest", {}).get("annotations", []),
    )
    imgs = merge_images(
        scan_images(root, files),
        workspace.get("manifest", {}).get("imgs", []),
        root,
    )

    return {
        "schema_version": 1,
        "input_dir": str(root),
        "generated_at": now_iso(),
        "files": [str(path.relative_to(root)) for path in files],
        "headings": merged,
        "annotations": annotations,
        "imgs": imgs,
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
        "annotations": payload.get("annotations", []),
        "imgs": payload.get("imgs", []),
    }
    path = manifest_path(root)
    path.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    workspace = save_workspace(root, saved, payload.get("ui_state", {}))
    return {
        "ok": True,
        "path": str(path),
        "workspace_path": str(workspace),
        "headings": headings,
        "annotations": saved["annotations"],
        "imgs": saved["imgs"],
    }


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
    manifest = workspace.get("manifest") or load_manifest(root) or scan_directory(root)
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
    annotation_refs_by_line, annotation_body_lines = build_annotation_export_transforms(payload.get("annotations", []))
    image_local_paths_by_line = build_image_local_path_transforms(root, payload.get("imgs", []))

    export_target_by_group = build_export_target_map(enabled)
    first_item_by_export_target: dict[tuple[str, str], dict[str, Any]] = {}
    export_target_by_heading_id: dict[str, tuple[str, str]] = {}
    for item in enabled:
        target = export_target_by_group[export_group_key(item)]
        first_item_by_export_target.setdefault(target, item)
        if item.get("id"):
            export_target_by_heading_id[str(item["id"])] = target

    chunks_by_target: dict[tuple[str, str], list[str]] = {}
    for (export_dir, export_name), item in first_item_by_export_target.items():
        next_boundary = next_export_boundary(item, boundaries, file_index, export_group_key(item), export_target_by_group)
        chunk = slice_between(
            root,
            file_lines,
            file_index,
            item,
            next_boundary,
            heading_rewrites,
            annotation_refs_by_line,
            annotation_body_lines,
            image_local_paths_by_line,
        )
        if item.get("kind") == "manual":
            level = int(item.get("level") or 2)
            level = min(6, max(1, level))
            chunk = f"{'#' * level} {item.get('title', '').strip()}\n\n{chunk}"
        chunks_by_target.setdefault((export_dir, export_name), []).append(chunk.rstrip() + "\n")

    append_annotation_bodies(chunks_by_target, payload.get("annotations", []), export_target_by_heading_id, file_index)

    output_dir = root / "output"
    output_dir.mkdir(parents=True, exist_ok=True)
    clean_exported_markdown(output_dir)
    written: list[dict[str, Any]] = []
    used_filenames_by_dir: dict[str, dict[str, int]] = {}
    for (export_dir, export_name), chunks in chunks_by_target.items():
        target_dir = output_dir / sanitize_export_dir(export_dir) if export_dir else output_dir
        target_dir.mkdir(parents=True, exist_ok=True)
        used_filenames = used_filenames_by_dir.setdefault(str(target_dir), {})
        filename = unique_filename(sanitize_filename(export_name) + ".md", used_filenames)
        path = target_dir / filename
        content = "\n".join(chunk for chunk in chunks if chunk.strip()).rstrip() + "\n"
        path.write_text(content, encoding="utf-8")
        written.append({
            "export_dir": export_dir,
            "export_name": export_name,
            "file": filename,
            "path": str(path),
            "chars": len(content),
        })

    return {"ok": True, "output_dir": str(output_dir), "count": len(written), "files": written, "headings": headings}


def download_images(payload: dict[str, Any]) -> dict[str, Any]:
    root = Path(payload["input_dir"]).expanduser().resolve()
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Input directory does not exist: {root}")

    imgs = [dict(item) for item in payload.get("imgs", [])]
    output_dir = root / "output" / "imgs"
    output_dir.mkdir(parents=True, exist_ok=True)
    used_filenames = {path.name: 1 for path in output_dir.iterdir() if path.is_file()}
    selected_ids = {str(item_id) for item_id in payload.get("image_ids", [])}
    results: list[dict[str, Any]] = []

    for item in imgs:
        if selected_ids and str(item.get("id") or "") not in selected_ids:
            continue
        url = absolute_image_url(str(item.get("url") or "").strip())
        if not is_external_url(url):
            item["download_status"] = "跳过"
            item["download_error"] = "非外部图片链接"
            results.append({"id": item.get("id"), "ok": False, "error": item["download_error"]})
            continue

        existing = str(item.get("local_path") or "").strip()
        if existing and (root / existing).exists():
            item["download_status"] = "已存在"
            item["download_error"] = ""
            results.append({"id": item.get("id"), "ok": True, "path": existing, "skipped": True})
            continue

        try:
            data, content_type = fetch_image_bytes(url)
            filename = image_download_filename(item, url, content_type, used_filenames)
            path = output_dir / filename
            path.write_bytes(data)
            local_path = str(path.relative_to(root))
            item["local_path"] = local_path
            item["download_status"] = "已下载"
            item["download_error"] = ""
            results.append({"id": item.get("id"), "ok": True, "path": local_path})
        except Exception as exc:  # noqa: BLE001
            item["download_status"] = "失败"
            item["download_error"] = str(exc)
            results.append({"id": item.get("id"), "ok": False, "error": str(exc)})

    manifest = {
        "schema_version": payload.get("schema_version", 1),
        "input_dir": str(root),
        "generated_at": payload.get("generated_at"),
        "files": payload.get("files", []),
        "headings": payload.get("headings", []),
        "annotations": payload.get("annotations", []),
        "imgs": imgs,
    }
    save_workspace(root, manifest, payload.get("ui_state", {}))
    ok_count = sum(1 for item in results if item.get("ok") and not item.get("skipped"))
    skipped_count = sum(1 for item in results if item.get("ok") and item.get("skipped"))
    failed_count = sum(1 for item in results if not item.get("ok"))
    return {
        "ok": failed_count == 0,
        "output_dir": str(output_dir),
        "imgs": imgs,
        "results": results,
        "downloaded": ok_count,
        "skipped": skipped_count,
        "failed": failed_count,
    }


def clean_exported_markdown(output_dir: Path) -> None:
    for path in output_dir.rglob("*.md"):
        if path.name == MANIFEST_NAME:
            continue
        if path.is_file():
            path.unlink()


def export_dir_for_item(item: dict[str, Any]) -> str:
    return str(item.get("export_dir") or "").strip()


def export_target_for_item(item: dict[str, Any]) -> tuple[str, str]:
    return (export_dir_for_item(item), export_name_for_item(item))


def build_export_target_map(items: list[dict[str, Any]]) -> dict[str, tuple[str, str]]:
    result: dict[str, tuple[str, str]] = {}
    for item in items:
        key = export_group_key(item)
        if key not in result:
            result[key] = export_target_for_item(item)
    return result


def export_group_key(item: dict[str, Any]) -> str:
    explicit = str(item.get("export_name") or "").strip()
    export_dir = export_dir_for_item(item)
    if explicit:
        return f"explicit:{export_dir}\0{explicit}"
    return logic_key(item) or str(item.get("id") or "")


def append_annotation_bodies(
    chunks_by_target: dict[tuple[str, str], list[str]],
    annotations: list[dict[str, Any]],
    export_target_by_heading_id: dict[str, tuple[str, str]],
    file_index: dict[str, int],
) -> None:
    ref_target_by_note_key: dict[tuple[str, str], tuple[str, str]] = {}
    for item in annotations:
        if not is_annotation_ref(item):
            continue
        note_key = annotation_note_key(item)
        heading_id = str(item.get("heading_id") or "")
        target = export_target_by_heading_id.get(heading_id)
        if note_key and target:
            ref_target_by_note_key.setdefault(note_key, target)

    bodies_by_target: dict[tuple[str, str], list[dict[str, Any]]] = {}
    for item in annotations:
        if str(item.get("type") or "").strip() != "正文":
            continue
        heading_id = str(item.get("heading_id") or "")
        target = ref_target_by_note_key.get(annotation_note_key(item)) or export_target_by_heading_id.get(heading_id)
        if not target or target not in chunks_by_target:
            continue
        bodies_by_target.setdefault(target, []).append(item)

    for target, items in bodies_by_target.items():
        items.sort(
            key=lambda item: (
                file_index.get(str(item.get("source_file") or ""), 10**9),
                int(item.get("line_no") or 0),
                note_sort_key(str(item.get("note_no") or "")),
            )
        )
        lines: list[str] = []
        for item in items:
            note_no = str(item.get("note_no") or "").strip()
            content = strip_annotation_body_marker(str(item.get("content") or "").strip())
            if not note_no or not content:
                continue
            lines.append(f"[^{note_no}]: {content}")
        if lines:
            chunks_by_target[target].append("\n".join(lines).rstrip() + "\n")


def build_annotation_export_transforms(
    annotations: list[dict[str, Any]],
) -> tuple[dict[tuple[str, int], list[dict[str, Any]]], set[tuple[str, int]]]:
    refs_by_line: dict[tuple[str, int], list[dict[str, Any]]] = {}
    body_lines: set[tuple[str, int]] = set()
    for item in annotations:
        source_file = str(item.get("source_file") or "")
        line_no = int(item.get("line_no") or 0)
        if not source_file or not line_no:
            continue
        if is_annotation_ref(item):
            refs_by_line.setdefault((source_file, line_no), []).append(item)
        elif str(item.get("type") or "").strip() == "正文":
            body_lines.add((source_file, line_no))
    return refs_by_line, body_lines


def is_annotation_ref(item: dict[str, Any]) -> bool:
    return str(item.get("type") or "").strip() in {"引用", "应用"}


def annotation_note_key(item: dict[str, Any]) -> tuple[str, str]:
    return (str(item.get("group_no") or "").strip(), str(item.get("note_no") or "").strip())


def strip_annotation_body_marker(content: str) -> str:
    match = ANNOTATION_BODY_RE.match(content)
    if match:
        return match.group("body").strip()
    return content.strip()


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
    explicit = str(item.get("export_name") or "").strip()
    if explicit:
        return explicit
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
    export_group: str,
    export_target_by_group: dict[str, tuple[str, str]],
) -> dict[str, Any] | None:
    current_pos = (file_index[str(item.get("source_file"))], int(item.get("line_no") or 0))
    for candidate in boundaries:
        candidate_pos = (file_index[str(candidate.get("source_file"))], int(candidate.get("line_no") or 0))
        if candidate_pos <= current_pos:
            continue
        candidate_group = export_group_key(candidate)
        if candidate.get("enabled") and candidate_group == export_group and candidate_group in export_target_by_group:
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
    annotation_refs_by_line: dict[tuple[str, int], list[dict[str, Any]]],
    annotation_body_lines: set[tuple[str, int]],
    image_local_paths_by_line: dict[tuple[str, int], dict[str, str]],
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
            chunks.append(
                render_source_slice(
                    source_file,
                    lines,
                    from_line,
                    to_line,
                    heading_rewrites,
                    annotation_refs_by_line,
                    annotation_body_lines,
                    image_local_paths_by_line,
                )
            )
    return "".join(chunks)


def render_source_slice(
    source_file: str,
    lines: list[str],
    from_line: int,
    to_line: int,
    heading_rewrites: dict[tuple[str, int], str],
    annotation_refs_by_line: dict[tuple[str, int], list[dict[str, Any]]],
    annotation_body_lines: set[tuple[str, int]],
    image_local_paths_by_line: dict[tuple[str, int], dict[str, str]],
) -> str:
    rendered: list[str] = []
    for line_no in range(from_line, to_line + 1):
        if (source_file, line_no) in annotation_body_lines:
            continue
        rewrite = heading_rewrites.get((source_file, line_no))
        if rewrite is not None:
            original = lines[line_no - 1]
            newline = "\n" if original.endswith("\n") else ""
            rendered.append(rewrite + newline)
        else:
            line = rewrite_annotation_refs(lines[line_no - 1], annotation_refs_by_line.get((source_file, line_no), []))
            line = rewrite_image_local_paths(line, image_local_paths_by_line.get((source_file, line_no), {}))
            rendered.append(line)
    return "".join(rendered)


def build_image_local_path_transforms(root: Path, imgs: list[dict[str, Any]]) -> dict[tuple[str, int], dict[str, str]]:
    result: dict[tuple[str, int], dict[str, str]] = {}
    for item in imgs:
        source_file = str(item.get("source_file") or "")
        line_no = int(item.get("line_no") or 0)
        url = str(item.get("url") or "").strip()
        local_path = str(item.get("local_path") or "").strip()
        if not source_file or not line_no or not url or not local_path:
            continue
        if not (root / local_path).exists():
            continue
        result.setdefault((source_file, line_no), {})[url] = local_path
    return result


def rewrite_image_local_paths(line: str, local_paths_by_url: dict[str, str]) -> str:
    if not local_paths_by_url:
        return line

    def replace(match: re.Match[str]) -> str:
        destination = match.group("destination")
        url, suffix = split_markdown_image_destination(destination)
        local_path = local_paths_by_url.get(url)
        if not local_path:
            return match.group(0)
        replacement = markdown_image_destination(local_path, suffix)
        return f"![{match.group('alt')}]({replacement})"

    return MARKDOWN_IMAGE_RE.sub(replace, line)


def split_markdown_image_destination(destination: str) -> tuple[str, str]:
    text = str(destination or "").strip()
    if text.startswith("<"):
        end = text.find(">")
        if end != -1:
            return text[1:end].strip(), text[end + 1 :].strip()
    if not text:
        return "", ""
    parts = text.split(None, 1)
    return parts[0].strip(), parts[1].strip() if len(parts) > 1 else ""


def markdown_image_destination(local_path: str, suffix: str) -> str:
    path = str(local_path).strip()
    rendered_path = f"<{path}>" if re.search(r"\s", path) else path
    return f"{rendered_path} {suffix}".strip() if suffix else rendered_path


def rewrite_annotation_refs(line: str, refs: list[dict[str, Any]]) -> str:
    rewritten = line
    for item in refs:
        note_no = str(item.get("note_no") or "").strip()
        if not note_no:
            continue
        replacement = f"[^{note_no}]"
        marker = str(item.get("marker") or "").strip()
        if marker and marker in rewritten:
            rewritten = rewritten.replace(marker, replacement, 1)
            continue
        rewritten = replace_first_matching_annotation_marker(rewritten, note_no, replacement)
    return rewritten


def replace_first_matching_annotation_marker(line: str, note_no: str, replacement: str) -> str:
    for match in ANNOTATION_MARKER_RE.finditer(line):
        if normalize_note_no(match.group("marker")) != note_no:
            continue
        return line[: match.start()] + replacement + line[match.end() :]
    return line


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


def sanitize_export_dir(name: str) -> str:
    return sanitize_filename(name)


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


def scan_annotations(root: Path, files: list[Path], headings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    file_order = {str(path.relative_to(root)): idx for idx, path in enumerate(files)}
    heading_ranges = build_heading_ranges(headings, file_order)
    annotations: list[dict[str, Any]] = []

    for file_path in files:
        source_file = str(file_path.relative_to(root))
        lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()

        for idx, line in enumerate(lines, start=1):
            stripped = line.strip()
            if MARKDOWN_HEADING_RE.match(stripped):
                continue
            heading_id = heading_id_for_line(heading_ranges.get(source_file, []), idx)
            for marker_index, match in enumerate(ANNOTATION_MARKER_RE.finditer(line)):
                marker = match.group("marker")
                note_no = normalize_note_no(marker)
                annotations.append(
                    {
                        "id": stable_annotation_line_id(source_file, note_no, idx, marker_index),
                        "note_no": note_no,
                        "marker": marker,
                        "type": "引用",
                        "group_no": "",
                        "content": stripped,
                        "source_file": source_file,
                        "line_no": idx,
                        "heading_id": heading_id,
                        "status": "待确认",
                    }
                )

    return annotations


def scan_images(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    imgs: list[dict[str, Any]] = []
    for file_path in files:
        source_file = str(file_path.relative_to(root))
        lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
        for idx, line in enumerate(lines, start=1):
            for match_index, match in enumerate(MARKDOWN_IMAGE_RE.finditer(line)):
                url = markdown_image_url(match.group("destination"))
                if not is_external_url(url):
                    continue
                alt = match.group("alt").strip()
                imgs.append(
                    {
                        "id": stable_image_id(source_file, idx, match_index, url),
                        "alt": alt,
                        "url": url,
                        "source_file": source_file,
                        "line_no": idx,
                        "content": line.strip(),
                    }
                )
    return imgs


def merge_images(scanned: list[dict[str, Any]], old: list[dict[str, Any]], root: Path) -> list[dict[str, Any]]:
    old_by_id = {str(item.get("id")): item for item in old if item.get("id")}
    for item in scanned:
        previous = old_by_id.get(str(item.get("id")))
        if not previous:
            continue
        local_path = str(previous.get("local_path") or "").strip()
        if local_path and (root / local_path).exists():
            item["local_path"] = local_path
            item["download_status"] = previous.get("download_status") or "已下载"
            item["download_error"] = previous.get("download_error") or ""
    return scanned


def markdown_image_url(destination: str) -> str:
    text = str(destination or "").strip()
    if text.startswith("<"):
        end = text.find(">")
        return text[1:end].strip() if end != -1 else text.strip("<>").strip()
    return text.split(None, 1)[0].strip() if text else ""


def is_external_url(url: str) -> bool:
    return bool(EXTERNAL_URL_RE.match(str(url or "").strip()))


def absolute_image_url(url: str) -> str:
    text = str(url or "").strip()
    if text.startswith("//"):
        return f"https:{text}"
    return text


def fetch_image_bytes(url: str, limit: int = 50 * 1024 * 1024) -> tuple[bytes, str]:
    request = Request(url, headers={"User-Agent": "ocr2md-workbench/0.1"})
    with urlopen(request, timeout=30) as response:  # noqa: S310
        content_type = response.headers.get_content_type() if response.headers else ""
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("图片超过 50MB 限制")
    if not data:
        raise ValueError("下载内容为空")
    return data, content_type


def image_download_filename(
    item: dict[str, Any],
    url: str,
    content_type: str,
    used_filenames: dict[str, int],
) -> str:
    parsed = urlparse(url)
    url_name = Path(parsed.path).name
    alt = str(item.get("alt") or "").strip()
    fallback = f"image-{hashlib.sha1(url.encode('utf-8')).hexdigest()[:10]}"
    raw_stem = Path(url_name).stem or alt or fallback
    stem = sanitize_filename(raw_stem)
    suffix = Path(url_name).suffix.lower()
    if not suffix:
        suffix = mimetypes.guess_extension(content_type or "") or ".img"
    filename = f"{stem}{suffix}"
    if filename not in used_filenames:
        used_filenames[filename] = 1
        return filename
    used_filenames[filename] += 1
    return f"{stem}-{used_filenames[filename]}{suffix}"


def stable_image_id(source_file: str, line_no: int, match_index: int, url: str) -> str:
    digest = hashlib.sha1(f"{source_file}:{line_no}:{match_index}:{url}".encode("utf-8")).hexdigest()[:16]
    return f"img_{digest}"


def merge_annotations(scanned: list[dict[str, Any]], old: list[dict[str, Any]]) -> list[dict[str, Any]]:
    old_by_id = {str(item.get("id")): item for item in old if item.get("id")}
    for item in scanned:
        previous = old_by_id.get(str(item.get("id")))
        if not previous:
            continue
        item["type"] = previous.get("type") or item.get("type") or "引用"
        item["group_no"] = previous.get("group_no") or item.get("group_no") or ""
        item["status"] = previous.get("status") or item.get("status") or "待确认"
    return scanned


def build_heading_ranges(headings: list[dict[str, Any]], file_order: dict[str, int]) -> dict[str, list[dict[str, Any]]]:
    result: dict[str, list[dict[str, Any]]] = {}
    enabled = [
        item
        for item in headings
        if item.get("enabled") and not item.get("missing") and item.get("source_file") in file_order and item.get("line_no")
    ]
    enabled.sort(key=lambda item: (file_order[str(item["source_file"])], int(item["line_no"])))
    for item in enabled:
        result.setdefault(str(item["source_file"]), []).append(item)
    return result


def collect_annotation_bodies(
    source_file: str, lines: list[str], heading_ranges: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    bodies: list[dict[str, Any]] = []
    idx = 0
    while idx < len(lines):
        line_no = idx + 1
        line = lines[idx]
        match = ANNOTATION_BODY_RE.match(line)
        if not match:
            idx += 1
            continue
        marker = match.group("marker")
        body_lines = [match.group("body").strip()]
        idx += 1
        while idx < len(lines):
            candidate = lines[idx]
            stripped = candidate.strip()
            if ANNOTATION_BODY_RE.match(candidate) or MARKDOWN_HEADING_RE.match(stripped):
                break
            body_lines.append(stripped)
            idx += 1
        body = "\n".join(line for line in body_lines).strip()
        bodies.append(
            {
                "note_no": normalize_note_no(marker),
                "marker": marker,
                "body": body,
                "source_file": source_file,
                "line_no": line_no,
                "heading_id": heading_id_for_line(heading_ranges, line_no),
            }
        )
    return bodies


def heading_id_for_line(heading_ranges: list[dict[str, Any]], line_no: int) -> str:
    current = ""
    for heading in heading_ranges:
        if int(heading.get("line_no") or 0) > line_no:
            break
        current = str(heading.get("id") or "")
    return current


def normalize_note_no(marker: str) -> str:
    marker = str(marker).strip()
    if marker in CIRCLED_NUMBER_MAP:
        return CIRCLED_NUMBER_MAP[marker]
    digits = re.sub(r"\D", "", marker)
    return str(int(digits)) if digits else marker


def match_annotations(bodies: list[dict[str, Any]], refs: list[dict[str, Any]]) -> list[dict[str, Any]]:
    keys = sorted(
        {
            (item["source_file"], item.get("heading_id", ""), item["note_no"])
            for item in bodies + refs
        },
        key=lambda key: (key[0], key[1], note_sort_key(key[2])),
    )
    annotations: list[dict[str, Any]] = []
    for source_file, heading_id, note_no in keys:
        group_bodies = [
            item
            for item in bodies
            if item["source_file"] == source_file and item.get("heading_id", "") == heading_id and item["note_no"] == note_no
        ]
        group_refs = [
            item
            for item in refs
            if item["source_file"] == source_file and item.get("heading_id", "") == heading_id and item["note_no"] == note_no
        ]
        max_len = max(len(group_bodies), len(group_refs), 1)
        duplicate = len(group_bodies) > 1 or len(group_refs) > 1
        for index in range(max_len):
            body = group_bodies[min(index, len(group_bodies) - 1)] if group_bodies else None
            ref = nearest_ref(group_refs, body, index) if group_refs else None
            line_no = int(body["line_no"]) if body else 0
            ref_line_no = int(ref["line_no"]) if ref else None
            status = annotation_status(body, ref, duplicate)
            marker = str((body or ref or {}).get("marker") or "")
            annotations.append(
                {
                    "id": stable_annotation_id(source_file, note_no, heading_id, line_no, ref_line_no, index),
                    "note_no": note_no,
                    "marker": marker,
                    "body": str(body.get("body") or "") if body else "",
                    "ref_text": str(ref.get("text") or "") if ref else "",
                    "source_file": source_file,
                    "line_no": line_no or None,
                    "ref_line_no": ref_line_no,
                    "heading_id": heading_id,
                    "status": status,
                }
            )
    annotations.sort(key=lambda item: (item["source_file"], item.get("ref_line_no") or item.get("line_no") or 0, item["note_no"]))
    return annotations


def nearest_ref(refs: list[dict[str, Any]], body: dict[str, Any] | None, index: int) -> dict[str, Any] | None:
    if not refs:
        return None
    if not body:
        return refs[min(index, len(refs) - 1)]
    return sorted(refs, key=lambda item: abs(int(item["line_no"]) - int(body["line_no"])))[0]


def note_sort_key(value: str) -> tuple[int, int | str]:
    text = str(value)
    return (0, int(text)) if text.isdigit() else (1, text)


def annotation_status(body: dict[str, Any] | None, ref: dict[str, Any] | None, duplicate: bool) -> str:
    if duplicate:
        return "疑似重复"
    if body and ref:
        return "正常"
    if body and not ref:
        return "未找到引用"
    if ref and not body:
        return "未找到正文"
    return "待确认"


def stable_annotation_id(
    source_file: str, note_no: str, heading_id: str, line_no: int, ref_line_no: int | None, index: int
) -> str:
    digest = hashlib.sha1(
        f"{source_file}:{heading_id}:{note_no}:{line_no}:{ref_line_no}:{index}".encode("utf-8")
    ).hexdigest()[:16]
    return f"a_{digest}"


def stable_annotation_line_id(source_file: str, note_no: str, line_no: int, marker_index: int) -> str:
    digest = hashlib.sha1(f"{source_file}:{note_no}:{line_no}:{marker_index}".encode("utf-8")).hexdigest()[:16]
    return f"a_{digest}"


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
        "export_dir",
        "export_name",
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
