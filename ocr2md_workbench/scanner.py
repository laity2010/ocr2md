from __future__ import annotations

import hashlib
import json
import mimetypes
import re
import shutil
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import urlparse
from urllib.request import Request, urlopen


MANIFEST_NAME = "title_manifest.json"
TRANSLATION_MANIFEST_NAME = "translation_manifest.json"
TRANSLATION_WORKSPACE_NAME = "translation-workspace"
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
MARKDOWN_LIST_RE = re.compile(r"^\s*(?:[-+*]|\d+[.)]|[一二三四五六七八九十]+[、.])\s+")
MARKDOWN_FENCE_RE = re.compile(r"^\s*(`{3,}|~{3,}|\${2,})")
MARKDOWN_TABLE_DIVIDER_RE = re.compile(r"^\s*\|?(?:\s*:?-{3,}:?\s*\|)+\s*:?-{3,}:?\s*\|?\s*$")
MARKDOWN_FOOTNOTE_DEF_RE = re.compile(r"^\[\^(?P<label>[^\]]+)]:\s*(?P<body>.*)$")
MARKDOWN_FOOTNOTE_PREFIX_RE = re.compile(r"^\[\^[^\]]+][：:]\s*")
MARKDOWN_OBSIDIAN_IMAGE_RE = re.compile(r"!\[\[[^\]]+]]")
HTML_TABLE_RE = re.compile(r"<table\b", re.IGNORECASE)
OBSIDIAN_CALLOUT_RE = re.compile(r"^(?P<prefix>\[![^\]]+][+-]?\s*)(?P<title>.*)$", re.IGNORECASE)
FIGURE_TITLE_RE = re.compile(r"^(?:Figure|Fig\.)\s*\d+", re.IGNORECASE)
TABLE_TITLE_RE = re.compile(r"^(?:Table|Exhibit)\s*\d*", re.IGNORECASE)
PANEL_TITLE_RE = re.compile(r"^[A-Z]\.\s+")
NOTES_RE = re.compile(r"^Notes?:", re.IGNORECASE)
ANNOTATION_LINE_RE = re.compile(
    r"^\s*(?:[①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳]|\[\d{1,3}\]|［\d{1,3}］|\(\d{1,3}\)|（\d{1,3}）)\s*"
)
NATURAL_LINE_END_RE = re.compile(r"""(?:[。！？!?；;：:…]|[.!?])["'”’」』】）》）]*$""")
NON_TRANSLATABLE_BLOCK_TYPES = {"图片", "公式", "表格", "YAML 元数据", "代码", "列表", "嵌套块"}
TRANSLATABLE_STRUCTURAL_TYPES = {"图题", "图注", "表题", "表注", "引文"}
SENTENCE_SPLIT_BLOCK_TYPES = {"文本", "图注", "表注", "注释正文", "引文"}
FIGURE_STRUCTURAL_TYPES = {"图题", "图注", "图片"}
TABLE_STRUCTURAL_TYPES = {"表题", "表注", "表格"}
CHINESE_SENTENCE_END_RE = re.compile(r"[。！？；][\"'”’」』】）》）]*")
NUMBERED_LABEL_SENTENCE_RE = re.compile(r"^\s*(?:Table|Figure|Fig\.|Exhibit)\s*\d+[A-Za-z]?\.\s*$", re.IGNORECASE)
SENTENCE_TRAILING_SPACE_RE = re.compile(r"\s*$")
SENTENCE_LEADING_SPACE_RE = re.compile(r"^\s*")
INLINE_PROTECTION_PATTERNS = [
    re.compile(r"!\[\[[^\]]+]]"),
    re.compile(r"\[\[[^\]]+]]"),
    re.compile(r"!\[[^\]]*]\([^)]*\)"),
    re.compile(r"\[[^\]]+]\([^)]*\)"),
    re.compile(r"`[^`]+`"),
    re.compile(r"\\\([^)]*\\\)"),
    re.compile(r"\$[^$\n]+\$"),
    re.compile(r"<eq\b[^>]*>.*?</eq>", re.IGNORECASE),
    re.compile(r"\[\^[^\]]+]"),
    re.compile(r"https?://[^\s<>)]+", re.IGNORECASE),
]

KNOWN_SAMPLE_BOOKS = ("漫长的告别", "再见，吾爱", "长眠不醒")
IGNORED_TITLE_TEXTS = {"目录", "目 录"}
CIRCLED_NUMBER_MAP = {
    char: str(idx)
    for idx, char in enumerate("①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳", start=1)
}
_PYSBD_SEGMENTER: Any | None = None
_PYSBD_AVAILABLE: bool | None = None


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


def translation_manifest_path(input_dir: Path) -> Path:
    return translation_source_dir(input_dir) / TRANSLATION_MANIFEST_NAME


def translation_workspace_path(input_dir: Path) -> Path:
    return translation_source_dir(input_dir) / TRANSLATION_WORKSPACE_NAME


def translation_source_dir(input_dir: Path) -> Path:
    output_dir = input_dir / "output"
    if output_dir.exists() and output_dir.is_dir() and has_translation_markdown_files(output_dir):
        return output_dir
    return input_dir


def has_translation_markdown_files(directory: Path) -> bool:
    for path in directory.rglob("*.md"):
        rel_parts = path.relative_to(directory).parts
        if not is_ignored_translation_path(rel_parts):
            return True
    return False


def is_ignored_translation_path(rel_parts: tuple[str, ...]) -> bool:
    return not rel_parts or rel_parts[0] in {"imgs", "output_translated"}


def normalize_translation_input_root(input_dir: str | Path) -> Path:
    text = str(input_dir)
    for marker in ("/Users/", "/private/", "/var/", "/Volumes/"):
        first = text.find(marker)
        if first == -1:
            continue
        second = text.find(marker, first + len(marker))
        if second != -1:
            text = text[second:]
            break
    root = Path(text).expanduser().resolve()
    if root.name == "output":
        return root.parent
    return root


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
    illegal_breaks = merge_illegal_breaks(
        scan_illegal_line_breaks(root, files),
        workspace.get("manifest", {}).get("illegal_breaks", []),
    )

    return {
        "schema_version": 1,
        "input_dir": str(root),
        "generated_at": now_iso(),
        "files": [str(path.relative_to(root)) for path in files],
        "headings": merged,
        "annotations": annotations,
        "imgs": imgs,
        "illegal_breaks": illegal_breaks,
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
        "illegal_breaks": payload.get("illegal_breaks", []),
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
        "illegal_breaks": saved["illegal_breaks"],
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


def scan_translation(input_dir: str | Path) -> dict[str, Any]:
    root = normalize_translation_input_root(input_dir)
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Input directory does not exist: {root}")
    output_dir = translation_source_dir(root)
    old = load_translation_workspace(root) or load_translation_manifest(root)
    old_by_id = {item.get("id"): item for item in old.get("segments", []) if item.get("id")}
    files = list_translation_markdown_files(root)
    segments: list[dict[str, Any]] = []
    for file_path in files:
        segments.extend(scan_translation_file(output_dir, file_path, old_by_id))
    payload = {
        "schema_version": 1,
        "kind": "ocr2md-translation-workspace",
        "input_dir": str(root),
        "output_dir": str(output_dir),
        "generated_at": now_iso(),
        "files": [str(path.relative_to(output_dir)) for path in files],
        "segments": segments,
        "workspace_path": str(translation_workspace_path(root)),
        "manifest_path": str(translation_manifest_path(root)),
        "workspace_loaded": bool(old),
        "ui_state": old.get("ui_state", {}),
    }
    return payload


def save_translation(payload: dict[str, Any]) -> dict[str, Any]:
    root = normalize_translation_input_root(payload["input_dir"])
    if not root.exists() or not root.is_dir():
        raise ValueError(f"Input directory does not exist: {root}")
    output_dir = translation_source_dir(root)
    output_dir.mkdir(parents=True, exist_ok=True)
    saved = {
        "schema_version": 1,
        "kind": "ocr2md-translation-workspace",
        "input_dir": str(root),
        "output_dir": str(output_dir),
        "saved_at": now_iso(),
        "files": payload.get("files", []),
        "segments": payload.get("segments", []),
    }
    manifest = translation_manifest_path(root)
    manifest.write_text(json.dumps(saved, ensure_ascii=False, indent=2), encoding="utf-8")
    workspace_payload = {**saved, "ui_state": payload.get("ui_state", {})}
    workspace = translation_workspace_path(root)
    workspace.write_text(json.dumps(workspace_payload, ensure_ascii=False, indent=2), encoding="utf-8")
    return {
        "ok": True,
        "path": str(manifest),
        "workspace_path": str(workspace),
        "segments": saved["segments"],
    }


def export_translation(payload: dict[str, Any]) -> dict[str, Any]:
    root = normalize_translation_input_root(payload["input_dir"])
    output_dir = translation_source_dir(root)
    target_root = root / "output_translated"
    if not output_dir.exists():
        raise ValueError(f"Output directory does not exist: {output_dir}")
    segments_by_file: dict[str, dict[int, list[dict[str, Any]]]] = {}
    for item in payload.get("segments", []):
        source_file = str(item.get("source_file") or "")
        start_line = int(item.get("line_no") or 0)
        if not source_file or start_line <= 0:
            continue
        segments_by_file.setdefault(source_file, {}).setdefault(start_line, []).append(item)
    files = [output_dir / str(path) for path in payload.get("files", [])]
    if not files:
        files = list_translation_markdown_files(root)
    clean_translation_variant_dirs(target_root)
    written: list[dict[str, Any]] = []
    for source_path in files:
        if not source_path.exists() or not source_path.is_file():
            continue
        source_file = str(source_path.relative_to(output_dir))
        lines = source_path.read_text(encoding="utf-8").splitlines()
        variants = {
            "org": render_translation_variant_file(lines, segments_by_file.get(source_file, {}), source_file, "org"),
            "trans": render_translation_variant_file(lines, segments_by_file.get(source_file, {}), source_file, "trans"),
            "cross:trans2org": render_translation_variant_file(lines, segments_by_file.get(source_file, {}), source_file, "cross:trans2org"),
            "cross:org2trans": render_translation_variant_file(lines, segments_by_file.get(source_file, {}), source_file, "cross:org2trans"),
        }
        for variant, variant_lines in variants.items():
            target = translation_variant_target_path(target_root, variant, source_file)
            target.parent.mkdir(parents=True, exist_ok=True)
            content = "\n".join(variant_lines) + "\n"
            target.write_text(content, encoding="utf-8")
            written.append({"source_file": source_file, "variant": variant, "path": str(target), "chars": len(content)})
    save_translation(payload)
    return {"ok": True, "output_dir": str(target_root), "count": len(files), "files": written}


def translation_variant_target_path(target_root: Path, variant: str, source_file: str) -> Path:
    if not variant.startswith("cross:"):
        return target_root / variant / source_file
    direction = variant.split(":", 1)[1]
    source_path = Path(source_file)
    return target_root / "cross" / source_path.with_name(f"{direction} {source_path.name}")


def clean_translation_variant_dirs(target_root: Path) -> None:
    for variant in ("org", "trans", "cross"):
        path = target_root / variant
        if path.exists() and path.is_dir():
            shutil.rmtree(path)
    if target_root.exists() and target_root.is_dir():
        for path in target_root.glob("*.md"):
            path.unlink()


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
    illegal_breaks_by_line = build_illegal_break_export_transforms(payload.get("illegal_breaks", []))

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
            illegal_breaks_by_line,
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
        "illegal_breaks": payload.get("illegal_breaks", []),
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
    illegal_breaks_by_line: dict[tuple[str, int], int],
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
                    illegal_breaks_by_line,
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
    illegal_breaks_by_line: dict[tuple[str, int], int],
) -> str:
    rendered: list[str] = []
    line_no = from_line
    while line_no <= to_line:
        if (source_file, line_no) in annotation_body_lines:
            line_no += 1
            continue
        next_line_no = illegal_breaks_by_line.get((source_file, line_no))
        if next_line_no and next_line_no <= to_line:
            current = render_export_line(
                source_file,
                line_no,
                lines,
                heading_rewrites,
                annotation_refs_by_line,
                image_local_paths_by_line,
            )
            following = render_export_line(
                source_file,
                next_line_no,
                lines,
                heading_rewrites,
                annotation_refs_by_line,
                image_local_paths_by_line,
            )
            rendered.append(join_illegal_break_lines(current, following))
            line_no = next_line_no + 1
            continue
        rendered.append(
            render_export_line(
                source_file,
                line_no,
                lines,
                heading_rewrites,
                annotation_refs_by_line,
                image_local_paths_by_line,
            )
        )
        line_no += 1
    return "".join(rendered)


def render_export_line(
    source_file: str,
    line_no: int,
    lines: list[str],
    heading_rewrites: dict[tuple[str, int], str],
    annotation_refs_by_line: dict[tuple[str, int], list[dict[str, Any]]],
    image_local_paths_by_line: dict[tuple[str, int], dict[str, str]],
) -> str:
    rewrite = heading_rewrites.get((source_file, line_no))
    if rewrite is not None:
        original = lines[line_no - 1]
        newline = "\n" if original.endswith("\n") else ""
        return rewrite + newline
    line = rewrite_annotation_refs(lines[line_no - 1], annotation_refs_by_line.get((source_file, line_no), []))
    return rewrite_image_local_paths(line, image_local_paths_by_line.get((source_file, line_no), {}))


def build_illegal_break_export_transforms(illegal_breaks: list[dict[str, Any]]) -> dict[tuple[str, int], int]:
    result: dict[tuple[str, int], int] = {}
    for item in illegal_breaks:
        if str(item.get("confidence") or "").strip() != "高":
            continue
        source_file = str(item.get("source_file") or "")
        line_no = int(item.get("line_no") or 0)
        next_line_no = int(item.get("next_line_no") or 0)
        if source_file and line_no > 0 and next_line_no > line_no:
            result[(source_file, line_no)] = next_line_no
    return result


def join_illegal_break_lines(current: str, following: str) -> str:
    current_text = current.rstrip("\r\n")
    following_text = following.lstrip()
    following_newline = "\n" if following.endswith(("\n", "\r")) else ""
    following_text = following_text.rstrip("\r\n")
    separator = (
        " "
        if re.search(r"[A-Za-z0-9]$", current_text) and re.match(r"^[A-Za-z0-9]", following_text)
        else ""
    )
    return f"{current_text}{separator}{following_text}{following_newline}"


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


def scan_illegal_line_breaks(root: Path, files: list[Path]) -> list[dict[str, Any]]:
    breaks: list[dict[str, Any]] = []
    for file_path in files:
        source_file = str(file_path.relative_to(root))
        lines = file_path.read_text(encoding="utf-8", errors="replace").splitlines()
        fenced_lines = markdown_fenced_line_numbers(lines)
        for current_idx in range(len(lines) - 1):
            next_idx = next_illegal_break_line_index(lines, current_idx)
            if next_idx is None:
                continue
            line_no = current_idx + 1
            next_line_no = next_idx + 1
            current = lines[current_idx]
            following = lines[next_idx]
            if line_no in fenced_lines or next_line_no in fenced_lines:
                continue
            if not is_illegal_line_break(lines, current_idx, next_idx):
                continue
            blank_gap = next_idx - current_idx - 1
            confidence = illegal_break_confidence(current, following)
            if confidence != "高":
                continue
            breaks.append(
                {
                    "id": stable_illegal_break_id(source_file, line_no, current, following),
                    "source_file": source_file,
                    "line_no": line_no,
                    "next_line_no": next_line_no,
                    "before": current.strip(),
                    "after": following.strip(),
                    "reason": (
                        "正文被空行错误分段，上一行未自然结束"
                        if blank_gap
                        else "相邻正文行之间缺少段落分隔，上一行未自然结束"
                    ),
                    "confidence": confidence,
                }
            )
    return breaks


def merge_illegal_breaks(scanned: list[dict[str, Any]], old: list[dict[str, Any]]) -> list[dict[str, Any]]:
    old_by_id = {str(item.get("id")): item for item in old if item.get("id")}
    for item in scanned:
        previous = old_by_id.get(str(item.get("id")))
        if not previous:
            continue
        confidence = str(previous.get("confidence") or "").strip()
        if confidence in {"高", "低"}:
            item["confidence"] = confidence
    return scanned


def next_illegal_break_line_index(lines: list[str], current_idx: int) -> int | None:
    direct_idx = current_idx + 1
    if direct_idx >= len(lines):
        return None
    if lines[direct_idx].strip():
        return direct_idx
    after_blank_idx = direct_idx + 1
    if after_blank_idx < len(lines) and lines[after_blank_idx].strip():
        return after_blank_idx
    return None


def markdown_fenced_line_numbers(lines: list[str]) -> set[int]:
    fenced: set[int] = set()
    fence_token = ""
    fence_length = 0
    for line_no, line in enumerate(lines, start=1):
        match = MARKDOWN_FENCE_RE.match(line)
        if fence_token:
            fenced.add(line_no)
            if match and match.group(1)[0] == fence_token and len(match.group(1)) >= fence_length:
                fence_token = ""
                fence_length = 0
            continue
        if match:
            fence_token = match.group(1)[0]
            fence_length = len(match.group(1))
            fenced.add(line_no)
    return fenced


def is_illegal_line_break(lines: list[str], current_idx: int, next_idx: int) -> bool:
    current = lines[current_idx]
    following = lines[next_idx]
    current_text = current.strip()
    following_text = following.strip()
    if not current_text or not following_text:
        return False
    if current.endswith(("  ", "\\")):
        return False
    if is_markdown_structural_line(current) or is_markdown_structural_line(following):
        return False
    if is_plain_heading_candidate(lines, current_idx) or is_plain_heading_candidate(lines, next_idx):
        return False
    if NATURAL_LINE_END_RE.search(current_text):
        return False
    return True


def is_markdown_structural_line(line: str) -> bool:
    text = line.strip()
    if not text:
        return True
    if MARKDOWN_HEADING_RE.match(text) or MARKDOWN_FENCE_RE.match(text):
        return True
    if MARKDOWN_LIST_RE.match(line) or text.startswith((">", "|", "<!--")):
        return True
    if MARKDOWN_TABLE_DIVIDER_RE.match(text):
        return True
    if re.match(r"^\s*(?:-{3,}|\*{3,}|_{3,})\s*$", line):
        return True
    if re.match(r"^\s{4,}\S", line) or re.match(r"^\s*\[[^\]]+\]:\s+\S", line):
        return True
    if ANNOTATION_LINE_RE.match(line) or re.fullmatch(r"!\[[^\]]*]\([^)]*\)", text):
        return True
    if re.match(r"^\s*</?[A-Za-z][^>]*>\s*$", line):
        return True
    return False


def illegal_break_confidence(current: str, following: str) -> str:
    current_text = current.strip()
    following_text = following.strip()
    if re.search(r"[\u4e00-\u9fff，、]$", current_text) and re.match(r"^[\u4e00-\u9fff“‘（(]", following_text):
        return "高"
    if re.search(r"[A-Za-z0-9,]$", current_text) and re.match(r"^[a-z0-9]", following_text):
        return "高"
    return "中"


def stable_illegal_break_id(source_file: str, line_no: int, current: str, following: str) -> str:
    digest = hashlib.sha1(
        f"{source_file}:{line_no}:{current.strip()}:{following.strip()}".encode("utf-8")
    ).hexdigest()[:16]
    return f"br_{digest}"


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


def load_translation_manifest(root: Path) -> dict[str, Any]:
    path = translation_manifest_path(root)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    return payload if isinstance(payload, dict) else {}


def load_translation_workspace(root: Path) -> dict[str, Any]:
    path = translation_workspace_path(root)
    if not path.exists():
        return {}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}
    if payload.get("kind") != "ocr2md-translation-workspace":
        return {}
    return payload if isinstance(payload, dict) else {}


def list_translation_markdown_files(root: Path) -> list[Path]:
    output_dir = translation_source_dir(root)
    if not output_dir.exists() or not output_dir.is_dir():
        return []
    files: list[Path] = []
    for path in output_dir.rglob("*.md"):
        rel_parts = path.relative_to(output_dir).parts
        if is_ignored_translation_path(rel_parts):
            continue
        files.append(path)
    return sorted(files, key=lambda path: str(path.relative_to(output_dir)))


def scan_translation_file(
    output_dir: Path,
    file_path: Path,
    old_by_id: dict[str, dict[str, Any]],
) -> list[dict[str, Any]]:
    source_file = str(file_path.relative_to(output_dir))
    lines = file_path.read_text(encoding="utf-8").splitlines()
    blocks = markdown_translation_blocks(lines)
    segments: list[dict[str, Any]] = []
    paragraph_no = 1
    block_no = 1
    block_no_by_group: dict[tuple[Any, ...], int] = {}
    sentence_no_by_group: dict[tuple[Any, ...], int] = {}
    current_heading = ""
    for block in blocks:
        if block["type"] == "heading":
            current_heading = block["text"]
            block_type = "标题"
        elif block["type"] == "paragraph":
            block_type = "文本"
        else:
            block_type = block["type"]
        text = str(block["text"])
        group_key = translation_block_group_key(block)
        if group_key in block_no_by_group:
            item_block_no = block_no_by_group[group_key]
        else:
            item_block_no = block_no
            block_no_by_group[group_key] = item_block_no
            block_no += 1
        if block_type in SENTENCE_SPLIT_BLOCK_TYPES:
            for sentence in split_translation_block_sentences(block_type, text, block.get("metadata", {})):
                sentence_no = sentence_no_by_group.get(group_key, 0) + 1
                sentence_no_by_group[group_key] = sentence_no
                sentence_source = str(sentence["text"])
                protected_source, inline_placeholders = protect_inline_nontranslatable(sentence_source)
                metadata = {
                    **(block.get("metadata", {}) if isinstance(block.get("metadata"), dict) else {}),
                    "sentence_engine": sentence["engine"],
                }
                if inline_placeholders:
                    metadata["source_unprotected"] = sentence_source
                    metadata["inline_placeholders"] = inline_placeholders
                item_id = stable_translation_sentence_id(
                    source_file,
                    int(block["start_line"]),
                    item_block_no,
                    sentence_no,
                    sentence_source,
                )
                segments.append(
                    translation_segment_item(
                        old_by_id,
                        item_id,
                        source_file,
                        current_heading,
                        paragraph_no if block_type == "文本" else "",
                        item_block_no,
                        block_type,
                        int(block["start_line"]),
                        int(block["end_line"]),
                        protected_source,
                        metadata,
                        sentence_no=sentence_no,
                        sentence_start=int(sentence["start"]),
                        sentence_end=int(sentence["end"]),
                    )
                )
            if block_type == "文本":
                paragraph_no += 1
            continue
        item_id = stable_translation_id(source_file, int(block["start_line"]), text)
        segments.append(
            translation_segment_item(
                old_by_id,
                item_id,
                source_file,
                current_heading,
                "",
                item_block_no,
                block_type,
                int(block["start_line"]),
                int(block["end_line"]),
                text,
                block.get("metadata", {}),
            )
        )
    return segments


def split_translation_block_sentences(
    block_type: str,
    text: str,
    metadata: dict[str, Any],
) -> list[dict[str, Any]]:
    marker = ""
    body = text
    body_offset = 0
    if block_type == "注释正文" and MARKDOWN_FOOTNOTE_DEF_RE.match(text.strip()):
        marker = str(metadata.get("footnote_marker") or "")
        if marker and text.startswith(marker):
            body = text[len(marker):]
            leading = SENTENCE_LEADING_SPACE_RE.match(body).group(0) if SENTENCE_LEADING_SPACE_RE.match(body) else ""
            marker = f"{marker}{leading}"
            body_offset = len(marker)
            body = text[body_offset:]
    sentences = split_sentences_with_offsets(body)
    if marker and sentences:
        sentences[0] = {
            **sentences[0],
            "text": f"{marker}{sentences[0]['text']}",
            "start": 0,
            "end": body_offset + int(sentences[0]["end"]),
        }
        for index in range(1, len(sentences)):
            sentences[index] = {
                **sentences[index],
                "start": body_offset + int(sentences[index]["start"]),
                "end": body_offset + int(sentences[index]["end"]),
            }
    return sentences


def translation_segment_item(
    old_by_id: dict[str, dict[str, Any]],
    item_id: str,
    source_file: str,
    current_heading: str,
    paragraph_no: int | str,
    item_block_no: int,
    block_type: str,
    start_line: int,
    end_line: int,
    text: str,
    metadata: dict[str, Any],
    sentence_no: int | str = "",
    sentence_start: int | str = "",
    sentence_end: int | str = "",
) -> dict[str, Any]:
    old = old_by_id.get(item_id, {})
    translation = str(old.get("translation") or "")
    status = str(old.get("status") or "")
    if not status:
        if translation.strip():
            status = "已翻译"
        elif block_type in NON_TRANSLATABLE_BLOCK_TYPES and not block_has_translatable_text({"metadata": metadata}):
            status = "不翻译"
        else:
            status = "未翻译"
    return {
        "id": item_id,
        "source_file": source_file,
        "heading": current_heading,
        "paragraph_no": paragraph_no,
        "block_no": item_block_no,
        "block_type": block_type,
        "sentence_no": sentence_no,
        "sentence_start": sentence_start,
        "sentence_end": sentence_end,
        "line_no": start_line,
        "end_line_no": end_line,
        "source": text,
        "translation": translation,
        "status": status,
        "metadata": metadata,
    }


def markdown_translation_blocks(lines: list[str]) -> list[dict[str, Any]]:
    blocks: list[dict[str, Any]] = []
    paragraph: list[tuple[int, str]] = []
    paragraph_start = 0
    last_media_kind = ""
    in_frontmatter = bool(lines and lines[0].strip() == "---")
    frontmatter_start = 1 if in_frontmatter else 0

    def flush_paragraph(end_line: int) -> None:
        nonlocal paragraph, paragraph_start
        if not paragraph:
            return
        metadata = {
            "composite_start": paragraph_start,
            "composite_end": end_line,
            "composite_type": "文本",
        }
        for line_no, text in paragraph:
            blocks.append({
                "type": "paragraph",
                "start_line": line_no,
                "end_line": line_no,
                "text": text,
                "metadata": metadata,
            })
        paragraph = []
        paragraph_start = 0

    index = 1
    while index <= len(lines):
        line = lines[index - 1].rstrip("\n")
        stripped = line.strip()

        if in_frontmatter:
            blocks.append({
                "type": "YAML 元数据",
                "start_line": index,
                "end_line": index,
                "text": line,
                "metadata": {
                    "composite_start": frontmatter_start,
                    "composite_type": "YAML 元数据",
                },
            })
            if index > 1 and stripped == "---":
                in_frontmatter = False
                for block in reversed(blocks):
                    if block["type"] != "YAML 元数据":
                        break
                    block["metadata"]["composite_end"] = index
            index += 1
            continue

        if is_math_fence(stripped):
            flush_paragraph(index - 1)
            fenced_blocks, index = collect_fenced_line_blocks(lines, index, "公式")
            blocks.extend(fenced_blocks)
            continue

        if is_code_fence(stripped):
            flush_paragraph(index - 1)
            fenced_blocks, index = collect_fenced_line_blocks(lines, index, "代码")
            blocks.extend(fenced_blocks)
            continue

        heading = MARKDOWN_HEADING_RE.match(line)
        if heading:
            flush_paragraph(index - 1)
            level = len(heading.group(1))
            blocks.append({
                "type": "heading",
                "start_line": index,
                "end_line": index,
                "text": heading.group(2).strip(),
                "metadata": {"heading_level": level, "heading_prefix": "#" * level},
            })
            last_media_kind = ""
            index += 1
            continue

        if not stripped:
            flush_paragraph(index - 1)
            last_media_kind = ""
            index += 1
            continue

        if MARKDOWN_FOOTNOTE_DEF_RE.match(stripped):
            flush_paragraph(index - 1)
            footnote_blocks, index = collect_footnote_blocks(lines, index)
            blocks.extend(footnote_blocks)
            last_media_kind = ""
            continue

        structural = translation_structure_block(line, last_media_kind)
        if structural:
            flush_paragraph(index - 1)
            if structural["type"] in {"列表", "未知"}:
                blocks.append({
                    **structural,
                    "start_line": index,
                    "end_line": index,
                })
                index += 1
                continue
            composite_blocks, index = collect_composite_structure_block(lines, index, structural, last_media_kind)
            blocks.extend(composite_blocks)
            composite_type = str(composite_blocks[0].get("metadata", {}).get("composite_type") or "") if composite_blocks else ""
            if composite_type == "图片":
                last_media_kind = "figure"
            elif composite_type == "表格":
                last_media_kind = "table"
            else:
                last_media_kind = ""
            continue

        if last_media_kind in {"figure", "table"}:
            flush_paragraph(index - 1)
            blocks.append({
                "type": "表注" if last_media_kind == "table" else "图注",
                "start_line": index,
                "end_line": index,
                "text": stripped,
                "metadata": {},
            })
            index += 1
            continue

        if not paragraph:
            paragraph_start = index
        paragraph.append((index, line))
        last_media_kind = ""
        index += 1
    flush_paragraph(len(lines))
    return blocks


def skip_frontmatter(lines: list[str]) -> int:
    if not lines or lines[0].strip() != "---":
        return 1
    for index in range(2, len(lines) + 1):
        if lines[index - 1].strip() == "---":
            return index + 1
    return 1


def is_math_fence(stripped: str) -> bool:
    return stripped == "$$" or stripped == r"\["


def is_code_fence(stripped: str) -> bool:
    return bool(re.match(r"^(`{3,}|~{3,})", stripped))


def collect_fenced_line_blocks(lines: list[str], start_index: int, block_type: str) -> tuple[list[dict[str, Any]], int]:
    opening = lines[start_index - 1].strip()
    if opening == "$$":
        closing = "$$"
    elif opening == r"\[":
        closing = r"\]"
    else:
        closing = opening[:3]
    collected: list[tuple[int, str]] = []
    index = start_index
    while index <= len(lines):
        line = lines[index - 1].rstrip("\n")
        collected.append((index, line))
        if index > start_index and line.strip().startswith(closing):
            break
        index += 1
    end_line = min(index, len(lines))
    metadata = {
        "composite_start": start_index,
        "composite_end": end_line,
        "composite_type": block_type,
    }
    return [
        {
            "type": block_type,
            "start_line": line_no,
            "end_line": line_no,
            "text": text,
            "metadata": metadata,
        }
        for line_no, text in collected
    ], end_line + 1


def collect_footnote_blocks(lines: list[str], start_index: int) -> tuple[list[dict[str, Any]], int]:
    first = lines[start_index - 1].rstrip("\n")
    match = MARKDOWN_FOOTNOTE_DEF_RE.match(first.strip())
    label = match.group("label") if match else ""
    collected = [(start_index, first)]
    index = start_index + 1
    while index <= len(lines):
        line = lines[index - 1].rstrip("\n")
        stripped = line.strip()
        if not stripped:
            break
        if MARKDOWN_HEADING_RE.match(line) or MARKDOWN_FOOTNOTE_DEF_RE.match(stripped):
            break
        if not re.match(r"^\s{2,}\S", line):
            break
        collected.append((index, line))
        index += 1
    metadata = {
        "composite_start": start_index,
        "composite_end": index - 1,
        "composite_type": "注释正文",
        "footnote_label": label,
        "footnote_marker": f"[^{label}]:" if label else "",
    }
    return [
        {
            "type": "注释正文",
            "start_line": line_no,
            "end_line": line_no,
            "text": text,
            "metadata": metadata,
        }
        for line_no, text in collected
    ], index


def collect_composite_structure_block(
    lines: list[str],
    start_index: int,
    first: dict[str, Any],
    last_media_kind: str,
) -> tuple[list[dict[str, Any]], int]:
    components = [structure_component(first, start_index)]
    types = {str(first["type"])}
    media_kind = structure_media_kind(str(first["type"])) or last_media_kind
    index = start_index + 1

    while index <= len(lines):
        line = lines[index - 1].rstrip("\n")
        stripped = line.strip()
        if (
            not stripped
            or MARKDOWN_HEADING_RE.match(line)
            or MARKDOWN_FOOTNOTE_DEF_RE.match(stripped)
            or is_math_fence(stripped)
            or is_code_fence(stripped)
        ):
            break
        structural = translation_structure_block(line, media_kind)
        if structural:
            if not is_compatible_composite_part(structural, media_kind):
                break
            if structural["type"] != "structure":
                components.append(structure_component(structural, index))
                types.add(str(structural["type"]))
                media_kind = structure_media_kind(str(structural["type"])) or media_kind
            index += 1
            continue
        if media_kind not in {"figure", "table", "nested"}:
            break
        component_type = inferred_plain_component_type(media_kind, components)
        quote_prefix, quote_text = strip_markdown_quote_prefix(line.lstrip())
        text = quote_text if quote_prefix else line
        metadata = {"quote_prefix": quote_prefix} if quote_prefix else {}
        components.append({"type": component_type, "line_no": index, "text": text, "metadata": metadata})
        types.add(component_type)
        index += 1

    block_type = composite_block_type(types)
    metadata = {
        "composite_start": start_index,
        "composite_end": index - 1,
        "composite_type": block_type,
        "components": components,
    }
    blocks = [
        {
            "type": component["type"],
            "start_line": component["line_no"],
            "end_line": component["line_no"],
            "text": component["text"],
            "metadata": {
                **metadata,
                **(component.get("metadata") if isinstance(component.get("metadata"), dict) else {}),
                "component_type": component["type"],
                "has_translatable_text": component["type"] in TRANSLATABLE_STRUCTURAL_TYPES,
            },
        }
        for component in components
    ]
    return blocks, index


def structure_component(block: dict[str, Any], line_no: int) -> dict[str, Any]:
    return {
        "type": str(block.get("type") or ""),
        "line_no": line_no,
        "text": str(block.get("text") or ""),
        "metadata": block.get("metadata", {}),
    }


def structure_media_kind(block_type: str) -> str:
    if block_type == "嵌套块":
        return "nested"
    if block_type in FIGURE_STRUCTURAL_TYPES:
        return "figure"
    if block_type in TABLE_STRUCTURAL_TYPES:
        return "table"
    return ""


def is_compatible_composite_part(block: dict[str, Any], media_kind: str) -> bool:
    block_type = str(block.get("type") or "")
    if block_type == "嵌套块":
        return True
    if block_type == "图片":
        return media_kind in {"", "figure", "table", "nested"}
    if block_type in FIGURE_STRUCTURAL_TYPES:
        return media_kind in {"", "figure", "nested"}
    if block_type in TABLE_STRUCTURAL_TYPES:
        return media_kind in {"", "table", "figure", "nested"}
    return False


def inferred_plain_component_type(media_kind: str, components: list[dict[str, Any]]) -> str:
    last_type = str(components[-1].get("type") or "") if components else ""
    component_types = {str(component.get("type") or "") for component in components}
    if media_kind == "figure":
        if last_type == "图题":
            return "图片"
        return "图注" if "图片" in component_types else "图片"
    if media_kind == "table":
        if last_type == "表题":
            return "表格"
        return "表注" if "表格" in component_types else "表格"
    if media_kind == "nested":
        return "引文"
    return "文本"


def composite_block_type(types: set[str]) -> str:
    if types & TABLE_STRUCTURAL_TYPES:
        return "表格"
    if "图片" in types or types & FIGURE_STRUCTURAL_TYPES:
        return "图片"
    if "嵌套块" in types and len(types) > 1:
        return "结构"
    if len(types) == 1:
        return next(iter(types))
    return "结构"


def block_has_translatable_text(block: dict[str, Any]) -> bool:
    metadata = block.get("metadata") if isinstance(block.get("metadata"), dict) else {}
    return bool(metadata.get("has_translatable_text"))


def translation_block_group_key(block: dict[str, Any]) -> tuple[Any, ...]:
    metadata = block.get("metadata") if isinstance(block.get("metadata"), dict) else {}
    composite_start = metadata.get("composite_start")
    if composite_start:
        return ("composite", int(composite_start))
    return ("line", int(block["start_line"]))


def translation_structure_block(line: str, last_media_kind: str) -> dict[str, Any] | None:
    stripped = line.strip()
    quote_prefix, quote_text = strip_markdown_quote_prefix(line.lstrip())
    body = quote_text.strip() if quote_prefix else stripped
    body_text = quote_text if quote_prefix else stripped
    metadata = {"quote_prefix": quote_prefix} if quote_prefix else {}

    callout = OBSIDIAN_CALLOUT_RE.match(body)
    if quote_prefix and not body:
        return {"type": "嵌套块", "text": stripped, "metadata": metadata}
    if callout:
        return {
            "type": "表题",
            "text": callout.group("title").strip() or body,
            "metadata": {**metadata, "callout_prefix": callout.group("prefix")},
        }
    if MARKDOWN_IMAGE_RE.fullmatch(body) or MARKDOWN_OBSIDIAN_IMAGE_RE.fullmatch(body):
        return {"type": "图片", "text": body, "metadata": metadata}
    if HTML_TABLE_RE.search(body) or MARKDOWN_TABLE_DIVIDER_RE.match(body) or body.startswith("|"):
        return {"type": "表格", "text": body, "metadata": metadata}
    if FIGURE_TITLE_RE.match(body) or PANEL_TITLE_RE.match(body):
        return {"type": "图题", "text": body, "metadata": metadata}
    if TABLE_TITLE_RE.match(body):
        return {"type": "表题", "text": body, "metadata": metadata}
    if NOTES_RE.match(body):
        block_type = "表注" if last_media_kind == "table" else "图注"
        return {"type": block_type, "text": body_text, "metadata": metadata}
    if quote_prefix and body:
        if last_media_kind == "figure":
            return {"type": "图题", "text": body, "metadata": metadata}
        if last_media_kind == "table":
            return {"type": "表题", "text": body, "metadata": metadata}
        return {"type": "引文", "text": body, "metadata": metadata}
    if MARKDOWN_LIST_RE.match(line):
        return {"type": "列表", "text": stripped, "metadata": metadata}
    return None


def strip_markdown_quote_prefix(value: str) -> tuple[str, str]:
    match = re.match(r"^(?P<prefix>>+\s?)(?P<body>.*)$", value)
    if not match:
        return "", value
    return match.group("prefix"), match.group("body")


def stable_translation_id(source_file: str, line_no: int, text: str) -> str:
    digest = hashlib.sha1(f"{source_file}\0{line_no}\0{text}".encode("utf-8")).hexdigest()[:16]
    return f"tr_{digest}"


def stable_translation_sentence_id(source_file: str, line_no: int, block_no: int, sentence_no: int, text: str) -> str:
    digest = hashlib.sha1(
        f"{source_file}\0{line_no}\0{block_no}\0{sentence_no}\0{text}".encode("utf-8")
    ).hexdigest()[:16]
    return f"tr_{digest}"


def protect_inline_nontranslatable(text: str) -> tuple[str, list[dict[str, str]]]:
    spans = inline_protection_spans(text)
    if not spans:
        return text, []
    pieces: list[str] = []
    placeholders: list[dict[str, str]] = []
    cursor = 0
    for index, (start, end) in enumerate(spans, start=1):
        placeholder = f"{{NT{index}}}"
        pieces.append(text[cursor:start])
        pieces.append(placeholder)
        placeholders.append({"placeholder": placeholder, "text": text[start:end]})
        cursor = end
    pieces.append(text[cursor:])
    return "".join(pieces), placeholders


def inline_protection_spans(text: str) -> list[tuple[int, int]]:
    spans: list[tuple[int, int]] = []
    for pattern in INLINE_PROTECTION_PATTERNS:
        for match in pattern.finditer(text):
            start, end = match.span()
            if start == end or is_footnote_definition_marker(text, start, end):
                continue
            if any(start < used_end and end > used_start for used_start, used_end in spans):
                continue
            spans.append((start, end))
    return sorted(spans)


def is_footnote_definition_marker(text: str, start: int, end: int) -> bool:
    return start == 0 and text.startswith("[^", start) and end < len(text) and text[end] == ":"


def sentence_original_source(item: dict[str, Any]) -> str:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    original = metadata.get("source_unprotected")
    if isinstance(original, str):
        return original
    return restore_inline_placeholders(str(item.get("source") or ""), metadata.get("inline_placeholders"))


def restore_inline_placeholders(text: str, placeholders: Any) -> str:
    if not isinstance(placeholders, list):
        return text
    restored = text
    for item in placeholders:
        if not isinstance(item, dict):
            continue
        placeholder = str(item.get("placeholder") or "")
        replacement = str(item.get("text") or "")
        if placeholder:
            restored = restored.replace(placeholder, replacement)
    return restored


def split_sentences_with_offsets(text: str) -> list[dict[str, Any]]:
    if not text:
        return [{"text": text, "start": 0, "end": 0, "engine": sentence_engine_name(False)}]
    raw_segments, uses_pysbd = pysbd_segments(text)
    pieces = map_sentence_segments_to_offsets(text, raw_segments)
    if not pieces:
        pieces = fallback_sentence_offsets(text)
        uses_pysbd = False
    refined: list[dict[str, Any]] = []
    for piece in pieces:
        refined.extend(split_sentence_piece_offsets(text, int(piece["start"]), int(piece["end"]), uses_pysbd))
    return refined or [{"text": text, "start": 0, "end": len(text), "engine": sentence_engine_name(uses_pysbd)}]


def pysbd_segments(text: str) -> tuple[list[str], bool]:
    global _PYSBD_AVAILABLE, _PYSBD_SEGMENTER
    if _PYSBD_AVAILABLE is False:
        return fallback_sentence_texts(text), False
    try:
        if _PYSBD_SEGMENTER is None:
            import pysbd

            _PYSBD_SEGMENTER = pysbd.Segmenter(language="en", clean=False)
        _PYSBD_AVAILABLE = True
        segments = merge_numbered_label_sentence_segments([str(segment) for segment in _PYSBD_SEGMENTER.segment(text) if str(segment)])
        return segments or fallback_sentence_texts(text), True
    except Exception:
        _PYSBD_AVAILABLE = False
        return fallback_sentence_texts(text), False


def merge_numbered_label_sentence_segments(segments: list[str]) -> list[str]:
    merged: list[str] = []
    index = 0
    while index < len(segments):
        segment = segments[index]
        if index + 1 < len(segments) and NUMBERED_LABEL_SENTENCE_RE.match(segment):
            merged.append(segment + segments[index + 1])
            index += 2
            continue
        merged.append(segment)
        index += 1
    return merged


def map_sentence_segments_to_offsets(text: str, segments: list[str]) -> list[dict[str, Any]]:
    offsets: list[dict[str, Any]] = []
    cursor = 0
    for segment in segments:
        start = text.find(segment, cursor)
        if start < 0:
            return []
        end = start + len(segment)
        offsets.append({"start": start, "end": end})
        cursor = end
    if not offsets:
        return []
    if offsets[0]["start"] > 0:
        offsets[0]["start"] = 0
    if offsets[-1]["end"] < len(text):
        offsets[-1]["end"] = len(text)
    for index in range(1, len(offsets)):
        if offsets[index - 1]["end"] < offsets[index]["start"]:
            offsets[index]["start"] = offsets[index - 1]["end"]
    return offsets


def split_sentence_piece_offsets(text: str, start: int, end: int, uses_pysbd: bool) -> list[dict[str, Any]]:
    piece = text[start:end]
    boundaries = sentence_piece_boundary_offsets(piece)
    if not boundaries:
        return [{"text": piece, "start": start, "end": end, "engine": sentence_engine_name(uses_pysbd)}]
    offsets: list[dict[str, Any]] = []
    cursor = 0
    for part_end in boundaries:
        if part_end > cursor:
            offsets.append({
                "text": piece[cursor:part_end],
                "start": start + cursor,
                "end": start + part_end,
                "engine": sentence_engine_name(uses_pysbd),
            })
        cursor = part_end
    if cursor < len(piece):
        offsets.append({
            "text": piece[cursor:],
            "start": start + cursor,
            "end": end,
            "engine": sentence_engine_name(uses_pysbd),
        })
    return offsets


def sentence_piece_boundary_offsets(piece: str) -> list[int]:
    boundaries: list[int] = []
    index = 0
    while index < len(piece):
        char = piece[index]
        if char in "。！？；!?;":
            end = consume_sentence_closers(piece, index + 1)
            boundaries.append(end)
            index = end
            continue
        if char == "." and is_fallback_period_boundary(piece, index):
            end = consume_sentence_closers(piece, index + 1)
            boundaries.append(end)
            index = end
            continue
        index += 1
    return [boundary for boundary in boundaries if boundary < len(piece)]


def consume_sentence_closers(text: str, index: int) -> int:
    while index < len(text) and text[index] in "\"'”’」』】）》）)]}":
        index += 1
    while index < len(text) and text[index].isspace():
        index += 1
    return index


def fallback_sentence_texts(text: str) -> list[str]:
    return [item["text"] for item in fallback_sentence_offsets(text)]


def fallback_sentence_offsets(text: str) -> list[dict[str, Any]]:
    offsets: list[dict[str, Any]] = []
    cursor = 0
    index = 0
    while index < len(text):
        if text[index] in "。！？；!?;":
            end = index + 1
            while end < len(text) and text[end] in "\"'”’」』】）》）":
                end += 1
            offsets.append({"text": text[cursor:end], "start": cursor, "end": end, "engine": "fallback"})
            cursor = end
        elif text[index] == "." and is_fallback_period_boundary(text, index):
            end = index + 1
            while end < len(text) and text[end] in "\"'”’)]}":
                end += 1
            offsets.append({"text": text[cursor:end], "start": cursor, "end": end, "engine": "fallback"})
            cursor = end
        index += 1
    if cursor < len(text):
        offsets.append({"text": text[cursor:], "start": cursor, "end": len(text), "engine": "fallback"})
    return offsets or [{"text": text, "start": 0, "end": len(text), "engine": "fallback"}]


def is_fallback_period_boundary(text: str, index: int) -> bool:
    before = text[max(0, index - 8):index + 1]
    if re.search(r"\b(?:U\.S|Fig|Mr|Mrs|Dr|Prof|Inc|Ltd|vs|e\.g|i\.e)\.$", before, re.IGNORECASE):
        return False
    label_start = max(0, index - 24)
    if NUMBERED_LABEL_SENTENCE_RE.match(text[label_start:index + 1].lstrip()):
        return False
    if index > 0 and index + 1 < len(text) and text[index - 1].isdigit() and text[index + 1].isdigit():
        return False
    return index + 1 == len(text) or text[index + 1].isspace()


def sentence_engine_name(uses_pysbd: bool) -> str:
    return "pysbd" if uses_pysbd else "fallback"


def render_translated_file(
    lines: list[str],
    segments_by_line: dict[int, list[dict[str, Any]]],
    source_file: str = "",
) -> list[str]:
    validate_translation_segments_against_source(lines, segments_by_line, source_file)
    rendered: list[str] = []
    previous_group: tuple[str, Any] | None = None
    for index, original_line in enumerate(lines, start=1):
        if not original_line.strip():
            continue
        items = sorted_translation_line_items(segments_by_line.get(index, []))
        if items:
            if is_sentence_line(items):
                block_lines = [render_sentence_line(items)]
            else:
                item = items[0]
                translation = str(item.get("translation") or "").strip()
                if translation:
                    block_lines = render_translation_block(item, translation)
                else:
                    block_lines = [original_line]
            group = ("block", items[0].get("block_no") or index)
        else:
            block_lines = [original_line]
            group = ("line", index)
        if previous_group is not None and group != previous_group:
            while rendered and rendered[-1] == "":
                rendered.pop()
            rendered.append("")
        rendered.extend(block_lines)
        previous_group = group
    while rendered and rendered[-1] == "":
        if len(rendered) >= 2 and rendered[-2] == "<br>":
            break
        rendered.pop()
    return rendered


def render_translation_variant_file(
    lines: list[str],
    segments_by_line: dict[int, list[dict[str, Any]]],
    source_file: str,
    variant: str,
) -> list[str]:
    validate_translation_segments_against_source(lines, segments_by_line, source_file)
    rendered: list[str] = []
    previous_group: tuple[str, Any] | None = None
    previous_item: dict[str, Any] | None = None
    pending_lines: list[str] = []
    pending_original_lines: list[str] = []

    def flush_pending() -> None:
        nonlocal pending_lines, pending_original_lines, previous_item
        if not pending_lines:
            return
        if previous_item and previous_item.get("block_type") == "YAML 元数据":
            pass
        elif previous_item and is_sentence_id_block(previous_item):
            pass
        elif is_cross_variant(variant) and previous_item and is_cross_inline_original_block(previous_item):
            pending_lines = render_cross_inline_original_block(
                pending_lines,
                pending_original_lines,
                obsidian_block_id(previous_item, "cross"),
                cross_direction(variant),
            )
        elif is_cross_variant(variant) and previous_item:
            pending_lines = append_cross_reference_to_lines(
                pending_lines,
                source_file,
                obsidian_block_id(previous_item, "cross"),
                needs_nested_block_id_separator(previous_item, pending_lines),
                cross_link_target_variant(variant),
            )
        elif previous_item:
            pending_lines = append_block_id_to_lines(
                pending_lines,
                obsidian_block_id(previous_item, variant),
                needs_nested_block_id_separator(previous_item, pending_lines),
            )
        if previous_item and should_append_block_break(previous_item, variant):
            pending_lines = append_block_break_line(pending_lines)
        rendered.extend(pending_lines)
        pending_lines = []
        pending_original_lines = []

    for index, original_line in enumerate(lines, start=1):
        if not original_line.strip():
            continue
        items = sorted_translation_line_items(segments_by_line.get(index, []))
        if items:
            if is_cross_variant(variant):
                block_lines = render_cross_block_lines(original_line, items, source_file, variant)
                original_block_lines = render_cross_counterpart_block_lines(original_line, items, variant)
            elif is_sentence_line(items) and is_sentence_id_block(items[0]):
                block_lines = render_sentence_variant_lines_with_ids(items, variant)
                original_block_lines = []
            elif is_sentence_line(items):
                block_lines = [render_sentence_line(items, variant=variant)]
                original_block_lines = []
            else:
                block_lines = render_non_sentence_variant_lines(original_line, items[0], variant)
                if is_sentence_id_block(items[0]):
                    block_lines = append_block_sentence_id_to_lines(block_lines, items[0], sentence_no=1)
                original_block_lines = []
            group = ("block", items[0].get("block_no") or index)
            group_item = items[0]
        else:
            block_lines = [original_line]
            original_block_lines = []
            group = ("line", index)
            group_item = {
                "id": "",
                "source_file": source_file,
                "line_no": index,
                "block_no": f"line-{index}",
            }
        if previous_group is not None and group != previous_group:
            flush_pending()
            while rendered and rendered[-1] == "":
                rendered.pop()
            rendered.append("")
        pending_lines.extend(block_lines)
        if is_cross_variant(variant) and group_item and is_cross_inline_original_block(group_item):
            pending_original_lines.extend(original_block_lines or [original_line])
        previous_group = group
        previous_item = group_item
    flush_pending()
    while rendered and rendered[-1] == "":
        if len(rendered) >= 2 and rendered[-2] == "<br>":
            break
        rendered.pop()
    return rendered


def is_cross_variant(variant: str) -> bool:
    return variant.startswith("cross")


def cross_direction(variant: str) -> str:
    return variant.split(":", 1)[1] if ":" in variant else "trans2org"


def cross_link_target_variant(variant: str) -> str:
    return "trans" if cross_direction(variant) == "org2trans" else "org"


def render_cross_block_lines(original_line: str, items: list[dict[str, Any]], source_file: str, variant: str) -> list[str]:
    direction = cross_direction(variant)
    primary_variant = "org" if direction == "org2trans" else "trans"
    target_variant = cross_link_target_variant(variant)
    if is_sentence_line(items) and is_sentence_id_block(items[0]):
        lines: list[str] = []
        for item in items:
            if lines and lines[-1] != "":
                lines.append("")
            sentence_no = int(item.get("sentence_no") or 1)
            sentence_id = obsidian_sentence_id(item, sentence_no)
            lines.extend(
                render_cross_linked_unit(
                    [render_single_sentence_line(item, variant=primary_variant)],
                    item,
                    source_file,
                    sentence_id,
                    target_variant,
                )
            )
        return lines
    if is_sentence_line(items):
        return [render_sentence_line(items, variant=primary_variant)]
    item = items[0]
    if item.get("block_type") == "YAML 元数据":
        return [original_line]
    if is_sentence_id_block(item):
        sentence_id = obsidian_sentence_id(item, 1)
        return render_cross_linked_unit(
            render_non_sentence_variant_lines(original_line, item, primary_variant),
            item,
            source_file,
            sentence_id,
            target_variant,
        )
    return render_non_sentence_variant_lines(original_line, item, primary_variant)


def render_cross_counterpart_block_lines(original_line: str, items: list[dict[str, Any]], variant: str) -> list[str]:
    target_variant = cross_link_target_variant(variant)
    if is_sentence_line(items):
        return [render_sentence_line(items, variant=target_variant)]
    if target_variant == "org":
        return [original_line]
    return render_non_sentence_variant_lines(original_line, items[0], target_variant)


def is_cross_inline_original_block(item: dict[str, Any]) -> bool:
    return item.get("block_type") == "注释正文"


def render_cross_inline_original_block(
    translated_lines: list[str],
    original_lines: list[str],
    block_id: str,
    direction: str,
) -> list[str]:
    if direction == "org2trans":
        primary = normalize_cross_footnote_original_lines(translated_lines)
        counterpart = normalize_cross_footnote_translation_lines(original_lines)
        result = primary
        if counterpart:
            result.append(f"<br>{strip_footnote_prefix(counterpart[0])}")
            result.extend(counterpart[1:])
    else:
        primary = normalize_cross_footnote_translation_lines(translated_lines)
        counterpart = normalize_cross_footnote_original_lines(original_lines)
        result = primary
        if counterpart:
            result.append(f"<br>{strip_footnote_prefix(counterpart[0])}")
            result.extend(counterpart[1:])
    return append_block_id_to_lines(result, block_id)


def normalize_cross_footnote_translation_lines(lines: list[str]) -> list[str]:
    if not lines:
        return []
    result = list(lines)
    match = MARKDOWN_FOOTNOTE_PREFIX_RE.match(result[0])
    if not match:
        return result
    marker = result[0][: match.end()].rstrip()
    body = strip_footnote_prefix(result[0][match.end():])
    result[0] = f"{marker} {body}".rstrip()
    return result


def normalize_cross_footnote_original_lines(lines: list[str]) -> list[str]:
    if not lines:
        return []
    return list(lines)


def strip_footnote_prefix(text: str) -> str:
    return MARKDOWN_FOOTNOTE_PREFIX_RE.sub("", text, count=1)


def normalize_footnote_definition_text(text: str, marker: str) -> str:
    body = strip_footnote_prefix(text.strip())
    return f"{marker} {body}".rstrip()


def render_cross_linked_unit(
    content_lines: list[str],
    item: dict[str, Any],
    source_file: str,
    anchor_id: str,
    target_variant: str,
) -> list[str]:
    return append_cross_reference_to_lines(content_lines, source_file, anchor_id, target_variant=target_variant)


def append_cross_reference_to_lines(
    content_lines: list[str],
    source_file: str,
    anchor_id: str,
    nested_separator: bool = False,
    target_variant: str = "org",
) -> list[str]:
    lines = append_block_id_to_lines(content_lines, anchor_id, nested_separator)
    return [
        *lines,
        "",
        ">[! ds]-",
        f">![[{obsidian_link_target(source_file, target_variant)}#^{anchor_id}]]",
    ]


def obsidian_link_target(source_file: str, target_variant: str) -> str:
    path = Path(source_file)
    if path.suffix.lower() == ".md":
        path = path.with_suffix("")
    return f"output_translated/{target_variant}/{path.as_posix()}"


def render_non_sentence_variant_lines(original_line: str, item: dict[str, Any], variant: str) -> list[str]:
    if variant == "org":
        return [original_line]
    translation = str(item.get("translation") or "").strip()
    if translation:
        return render_translation_block(item, translation)
    return [original_line]


def validate_translation_segments_against_source(
    lines: list[str],
    segments_by_line: dict[int, list[dict[str, Any]]],
    source_file: str = "",
) -> None:
    for line_no, items in sorted(segments_by_line.items()):
        if line_no < 1 or line_no > len(lines):
            location = f"{source_file}:{line_no}" if source_file else f"line {line_no}"
            raise ValueError(f"Translation table line is outside the source file: {location}")
        expected = lines[line_no - 1]
        sorted_items = sorted_translation_line_items(items)
        if is_sentence_line(sorted_items):
            actual = restore_source_line_from_translation_segment({
                **sorted_items[0],
                "source": "".join(sentence_original_source(item) for item in sorted_items),
            })
        else:
            actual = restore_source_line_from_translation_segment(sorted_items[0])
        if actual != expected and actual.rstrip() != expected.rstrip():
            location = f"{source_file}:{line_no}" if source_file else f"line {line_no}"
            raise ValueError(
                "Translation table source does not match source markdown at "
                f"{location}: expected {expected!r}, got {actual!r}"
            )


def sorted_translation_line_items(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            int(item.get("sentence_start") or 0),
            int(item.get("sentence_no") or 0),
            str(item.get("id") or ""),
        ),
    )


def is_sentence_line(items: list[dict[str, Any]]) -> bool:
    return bool(items) and all(item.get("block_type") in SENTENCE_SPLIT_BLOCK_TYPES and item.get("sentence_no") for item in items)


def is_sentence_id_block(item: dict[str, Any]) -> bool:
    return item.get("block_type") in {"文本", "标题"}


def render_sentence_line(
    items: list[dict[str, Any]],
    variant: str = "trans",
) -> str:
    pieces: list[str] = []
    has_translation = False
    for item in items:
        source = sentence_original_source(item)
        metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
        translation = str(item.get("translation") or "").strip()
        if variant == "org":
            piece = source
        elif translation:
            has_translation = True
            translation = normalize_translation_line_prefix(translation, metadata)
            translated = sentence_translation_with_original_spacing(source, translation)
            piece = restore_inline_placeholders(translated, metadata.get("inline_placeholders"))
        else:
            piece = source
        pieces.append(piece)
    rendered = "".join(pieces)
    first = items[0]
    metadata = first.get("metadata") if isinstance(first.get("metadata"), dict) else {}
    marker = str(metadata.get("footnote_marker") or "")
    first_source = sentence_original_source(first)
    is_footnote_definition_line = first_source.startswith(marker)
    if first.get("block_type") == "注释正文" and marker and is_footnote_definition_line and has_translation:
        rendered = normalize_footnote_definition_text(rendered, marker)
    return restore_source_line_from_translation_segment({**first, "source": rendered})


def render_sentence_variant_lines_with_ids(items: list[dict[str, Any]], variant: str) -> list[str]:
    lines: list[str] = []
    for item in items:
        if lines and lines[-1] != "":
            lines.append("")
        lines.extend(
            append_block_sentence_id_to_lines(
                [render_single_sentence_line(item, variant=variant)],
                item,
                int(item.get("sentence_no") or 1),
            )
        )
    return lines


def render_single_sentence_line(item: dict[str, Any], variant: str = "trans") -> str:
    source = sentence_original_source(item)
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    translation = str(item.get("translation") or "").strip()
    if variant == "org":
        piece = source
    elif translation:
        translation = normalize_translation_line_prefix(translation, metadata)
        translated = sentence_translation_with_original_spacing(source, translation)
        piece = restore_inline_placeholders(translated, metadata.get("inline_placeholders"))
    else:
        piece = source
    return restore_source_line_from_translation_segment({**item, "source": piece.strip()})


def should_append_block_break(item: dict[str, Any], variant: str = "") -> bool:
    block_type = item.get("block_type")
    if is_cross_variant(variant):
        return block_type != "YAML 元数据"
    return block_type != "文本" and block_type != "YAML 元数据"


def append_block_break_line(lines: list[str]) -> list[str]:
    if "<br>" in lines[-2:]:
        return lines
    return [*lines, "", "<br>", ""]


def append_block_sentence_id_to_lines(lines: list[str], item: dict[str, Any], sentence_no: int) -> list[str]:
    result = list(lines)
    for index in range(len(result) - 1, -1, -1):
        if result[index].strip():
            return insert_block_id_after_line(result, index, obsidian_sentence_id(item, sentence_no))
    return result


def append_cross_block_ids(lines: list[str], item: dict[str, Any]) -> list[str]:
    if not lines:
        return lines
    result = list(lines)
    nonempty = [index for index, line in enumerate(result) if line.strip()]
    if not nonempty:
        return result
    if len(nonempty) == 1:
        return insert_block_id_after_line(result, nonempty[-1], obsidian_block_id(item, "cross-org"))
    result = insert_block_id_after_line(result, nonempty[-1], obsidian_block_id(item, "cross-trans"))
    result = insert_block_id_after_line(result, nonempty[-2], obsidian_block_id(item, "cross-org"))
    return result


def append_block_id_to_lines(lines: list[str], block_id: str, nested_separator: bool = False) -> list[str]:
    result = list(lines)
    for index in range(len(result) - 1, -1, -1):
        if result[index].strip():
            if nested_separator and result[index].strip() != ">":
                result = insert_line_after(result, index, ">")
                index += 1
            return insert_block_id_after_line(result, index, block_id)
    return result


def insert_line_after(lines: list[str], index: int, value: str) -> list[str]:
    if index + 1 < len(lines) and lines[index + 1].strip() == value:
        return lines
    return [*lines[: index + 1], value, *lines[index + 1:]]


def insert_block_id_after_line(lines: list[str], index: int, block_id: str) -> list[str]:
    marker = f"^{block_id}"
    if index + 1 < len(lines) and lines[index + 1].strip() == marker:
        return lines
    return [*lines[: index + 1], marker, *lines[index + 1:]]


def needs_nested_block_id_separator(item: dict[str, Any], lines: list[str]) -> bool:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    if item.get("block_type") == "嵌套块" or metadata.get("quote_prefix"):
        return True
    return any(line.lstrip().startswith(">") for line in lines)


def obsidian_block_id(item: dict[str, Any], variant: str) -> str:
    block_key = str(item.get("block_no") or item.get("line_no") or "")
    normalized = re.sub(r"[^A-Za-z0-9-]+", "-", block_key).strip("-")
    if not normalized:
        normalized = str(item.get("line_no") or "0")
    return f"bid-{normalized}"


def obsidian_sentence_id(item: dict[str, Any], sentence_no: int) -> str:
    block_key = str(item.get("block_no") or item.get("line_no") or "")
    normalized_block = re.sub(r"[^A-Za-z0-9-]+", "-", block_key).strip("-")
    if not normalized_block:
        normalized_block = str(item.get("line_no") or "0")
    normalized_sentence = re.sub(r"[^A-Za-z0-9-]+", "-", str(sentence_no)).strip("-") or "1"
    return f"sid-{normalized_block}-{normalized_sentence}"


def sentence_translation_with_original_spacing(source: str, translation: str) -> str:
    leading = SENTENCE_LEADING_SPACE_RE.match(source).group(0) if SENTENCE_LEADING_SPACE_RE.match(source) else ""
    trailing = SENTENCE_TRAILING_SPACE_RE.search(source).group(0) if SENTENCE_TRAILING_SPACE_RE.search(source) else ""
    return f"{leading}{translation}{trailing}"


def normalize_translation_line_prefix(translation: str, metadata: dict[str, Any]) -> str:
    value = translation.strip()
    quote_prefix = str(metadata.get("quote_prefix") or "")
    callout_prefix = str(metadata.get("callout_prefix") or "")
    if quote_prefix:
        value = re.sub(r"^>+\s?", "", value)
    if callout_prefix and value.startswith(callout_prefix):
        value = value[len(callout_prefix):].lstrip()
    return value


def restore_source_line_from_translation_segment(item: dict[str, Any]) -> str:
    source = str(item.get("source") or "")
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    if item.get("block_type") == "标题" and not MARKDOWN_HEADING_RE.match(source):
        prefix = str(metadata.get("heading_prefix") or "")
        if not prefix:
            level = int(metadata.get("heading_level") or 0)
            prefix = "#" * level if 1 <= level <= 6 else "#"
        return f"{prefix} {source}"
    quote_prefix = str(metadata.get("quote_prefix") or "")
    callout_prefix = str(metadata.get("callout_prefix") or "")
    if callout_prefix and not source.startswith(callout_prefix):
        source = f"{callout_prefix}{source}"
    if quote_prefix and not source.lstrip().startswith(">"):
        return f"{quote_prefix}{source}" if source else quote_prefix.rstrip()
    return source


def render_translation_block(item: dict[str, Any], translation: str) -> list[str]:
    metadata = item.get("metadata") if isinstance(item.get("metadata"), dict) else {}
    translation = normalize_translation_line_prefix(translation, metadata)
    lines = translation.splitlines()
    if item.get("block_type") == "标题" and lines:
        first = lines[0].strip()
        if MARKDOWN_HEADING_RE.match(first):
            return lines
        prefix = str(metadata.get("heading_prefix") or "")
        if not prefix:
            level = int(metadata.get("heading_level") or 0)
            prefix = "#" * level if 1 <= level <= 6 else "#"
        return [f"{prefix} {first}", *lines[1:]]
    if item.get("block_type") == "注释正文" and lines:
        first = lines[0].strip()
        if MARKDOWN_FOOTNOTE_DEF_RE.match(first):
            return lines
        marker = str(metadata.get("footnote_marker") or "")
        if marker:
            return [f"{marker} {first}", *lines[1:]]
    quote_prefix = str(metadata.get("quote_prefix") or "")
    callout_prefix = str(metadata.get("callout_prefix") or "")
    if callout_prefix and lines and not lines[0].startswith(callout_prefix):
        lines = [f"{callout_prefix}{lines[0].strip()}", *lines[1:]]
    if quote_prefix and lines and not lines[0].lstrip().startswith(">"):
        return [f"{quote_prefix}{line}" if line else quote_prefix.rstrip() for line in lines]
    return lines


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
