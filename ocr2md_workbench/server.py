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
    get_context,
    get_file_text,
    save_manifest,
    scan_directory,
    update_workspace_ui_state,
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
        if parsed.path == "/api/choose-dir":
            self.handle_choose_dir()
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
