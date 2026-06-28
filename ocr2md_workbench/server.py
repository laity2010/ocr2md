from __future__ import annotations

import argparse
import json
import mimetypes
import subprocess
import webbrowser
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, unquote, urlparse

from .scanner import (
    download_images,
    export_markdown,
    export_translation,
    get_context,
    get_file_text,
    save_manifest,
    save_translation,
    scan_directory,
    scan_translation,
    update_workspace_ui_state,
)
from .translation_services import (
    public_translation_settings,
    save_translation_settings,
    test_translation_service,
    translate_text,
)


STATIC_DIR = Path(__file__).parent / "static"


class WorkbenchHandler(BaseHTTPRequestHandler):
    server_version = "ocr2md-workbench/0.1"

    def do_HEAD(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self.send_error(405, "Method not allowed")
            return
        self.serve_static(parsed.path, head_only=True)

    def do_GET(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/scan":
            self.handle_scan(parsed.query)
            return
        if parsed.path == "/api/context":
            self.handle_context(parsed.query)
            return
        if parsed.path == "/api/file":
            self.handle_file(parsed.query)
            return
        if parsed.path == "/api/asset":
            self.handle_asset(parsed.query)
            return
        if parsed.path == "/api/choose-dir":
            self.handle_choose_dir()
            return
        if parsed.path == "/api/translation/scan":
            self.handle_translation_scan(parsed.query)
            return
        if parsed.path == "/api/translation/settings":
            self.handle_translation_settings_get()
            return
        self.serve_static(parsed.path)

    def do_POST(self) -> None:
        parsed = urlparse(self.path)
        if parsed.path == "/api/save":
            self.handle_save()
            return
        if parsed.path == "/api/export":
            self.handle_export()
            return
        if parsed.path == "/api/download-images":
            self.handle_download_images()
            return
        if parsed.path == "/api/workspace-state":
            self.handle_workspace_state()
            return
        if parsed.path == "/api/translation/save":
            self.handle_translation_save()
            return
        if parsed.path == "/api/translation/export":
            self.handle_translation_export()
            return
        if parsed.path == "/api/translation/settings":
            self.handle_translation_settings_save()
            return
        if parsed.path == "/api/translation/test":
            self.handle_translation_test()
            return
        if parsed.path == "/api/translation/translate":
            self.handle_translation_translate()
            return
        self.send_error(404, "Not found")

    def handle_scan(self, query: str) -> None:
        params = parse_qs(query)
        input_dir = first(params, "dir") or getattr(self.server, "default_input_dir", "")
        if not input_dir:
            self.send_json({"error": "Missing input directory"}, status=400)
            return
        try:
            self.send_json(scan_directory(unquote(input_dir)))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_context(self, query: str) -> None:
        params = parse_qs(query)
        input_dir = first(params, "dir") or getattr(self.server, "default_input_dir", "")
        source_file = first(params, "file")
        line_no = first(params, "line")
        if not input_dir or not source_file or not line_no:
            self.send_json({"error": "Missing dir, file, or line"}, status=400)
            return
        try:
            self.send_json(get_context(unquote(input_dir), source_file, int(line_no)))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_file(self, query: str) -> None:
        params = parse_qs(query)
        input_dir = first(params, "dir") or getattr(self.server, "default_input_dir", "")
        source_file = first(params, "file")
        line_no = first(params, "line") or "1"
        if not input_dir or not source_file:
            self.send_json({"error": "Missing dir or file"}, status=400)
            return
        try:
            self.send_json(get_file_text(unquote(input_dir), source_file, int(line_no)))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_asset(self, query: str) -> None:
        params = parse_qs(query)
        input_dir = first(params, "dir") or getattr(self.server, "default_input_dir", "")
        source_file = first(params, "file") or ""
        src = first(params, "src") or ""
        if not input_dir or not src:
            self.send_error(400, "Missing dir or src")
            return
        asset_path = resolve_asset_path(unquote(input_dir), source_file, unquote(src))
        if not asset_path:
            self.send_error(404, "Asset not found")
            return
        content_type = mimetypes.guess_type(asset_path.name)[0] or "application/octet-stream"
        data = asset_path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def handle_choose_dir(self) -> None:
        try:
            script = 'POSIX path of (choose folder with prompt "选择 OCR Markdown 工作目录")'
            result = subprocess.run(
                ["osascript", "-e", script],
                check=False,
                capture_output=True,
                text=True,
                timeout=300,
            )
            if result.returncode != 0:
                stderr = result.stderr.strip()
                if "User canceled" in stderr or "用户已取消" in stderr:
                    self.send_json({"cancelled": True})
                    return
                self.send_json({"error": stderr or "Choose folder failed"}, status=400)
                return
            self.send_json({"path": result.stdout.strip().rstrip("/")})
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_save(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(save_manifest(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_export(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(export_markdown(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_download_images(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(download_images(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_workspace_state(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(update_workspace_ui_state(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_scan(self, query: str) -> None:
        params = parse_qs(query)
        input_dir = first(params, "dir") or getattr(self.server, "default_input_dir", "")
        if not input_dir:
            self.send_json({"error": "Missing input directory"}, status=400)
            return
        try:
            self.send_json(scan_translation(unquote(input_dir)))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_save(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(save_translation(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_export(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(export_translation(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_settings_get(self) -> None:
        try:
            self.send_json(public_translation_settings())
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_settings_save(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(save_translation_settings(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_test(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(test_translation_service(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def handle_translation_translate(self) -> None:
        try:
            length = int(self.headers.get("Content-Length", "0"))
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            self.send_json(translate_text(payload))
        except Exception as exc:  # noqa: BLE001
            self.send_json({"error": str(exc)}, status=400)

    def serve_static(self, request_path: str, head_only: bool = False) -> None:
        if request_path in ("", "/"):
            request_path = "/index.html"
        path = (STATIC_DIR / request_path.lstrip("/")).resolve()
        try:
            path.relative_to(STATIC_DIR.resolve())
        except ValueError:
            self.send_error(403)
            return
        if not path.exists() or not path.is_file():
            self.send_error(404)
            return
        content_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
        data = path.read_bytes()
        self.send_response(200)
        self.send_header("Content-Type", f"{content_type}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        if not head_only:
            self.wfile.write(data)

    def send_json(self, data: dict, status: int = 200) -> None:
        body = json.dumps(data, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, format: str, *args: object) -> None:
        print(f"{self.address_string()} - {format % args}")


def first(params: dict[str, list[str]], key: str) -> str:
    values = params.get(key) or []
    return values[0] if values else ""


def resolve_asset_path(input_dir: str | Path, source_file: str, src: str) -> Path | None:
    root = Path(input_dir).expanduser().resolve()
    source_path = (root / source_file).resolve() if source_file else root
    src_path = Path(src)
    candidates: list[Path] = []
    if src_path.is_absolute():
        candidates.append(src_path)
    else:
        candidates.append(source_path.parent / src_path)
        candidates.append(root / src_path)
        candidates.extend(parent / src_path for parent in root.parents)
    seen: set[Path] = set()
    for candidate in candidates:
        resolved = candidate.expanduser().resolve()
        if resolved in seen:
            continue
        seen.add(resolved)
        if not resolved.exists() or not resolved.is_file():
            continue
        if src_path.is_absolute() or is_within_any(resolved, [root, *root.parents]):
            return resolved
    return None


def is_within_any(path: Path, roots: list[Path]) -> bool:
    for root in roots:
        try:
            path.relative_to(root)
            return True
        except ValueError:
            continue
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description="Start OCR Markdown heading workbench.")
    parser.add_argument("input_dir", nargs="?", default="", help="Optional default input directory")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--no-open", action="store_true", help="Do not open a browser automatically")
    args = parser.parse_args()

    server = ThreadingHTTPServer((args.host, args.port), WorkbenchHandler)
    server.default_input_dir = str(Path(args.input_dir).expanduser().resolve()) if args.input_dir else ""
    url = f"http://{args.host}:{args.port}/"
    print(f"ocr2md heading workbench running at {url}")
    if server.default_input_dir:
        print(f"default input directory: {server.default_input_dir}")
    if not args.no_open:
        webbrowser.open(url)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nshutting down")
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
