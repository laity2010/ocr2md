#!/usr/bin/env python3
import argparse
import json
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.error import HTTPError, URLError
from urllib.parse import urlparse
from urllib.request import Request, urlopen


class PreviewHandler(SimpleHTTPRequestHandler):
    workspace_target = ""
    debug_target = ""

    def end_headers(self):
        route = urlparse(self.path).path
        if not route.startswith("/__"):
            self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def _proxy_target(self):
        route = urlparse(self.path).path
        if route.startswith("/__workspace/"):
            return self.workspace_target
        if route.startswith("/__debug/"):
            return self.debug_target
        return ""

    def _proxy(self):
        target = self._proxy_target()
        if not target:
            return False

        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length) if length else None
        headers = {"Accept": self.headers.get("Accept", "application/json")}
        content_type = self.headers.get("Content-Type")
        if content_type:
            headers["Content-Type"] = content_type

        request = Request(
            target.rstrip("/") + self.path,
            data=body,
            headers=headers,
            method=self.command,
        )
        try:
            with urlopen(request, timeout=15) as response:
                payload = response.read()
                self.send_response(response.status)
                self.send_header(
                    "Content-Type",
                    response.headers.get(
                        "Content-Type",
                        "application/octet-stream",
                    ),
                )
                self.send_header("Cache-Control", "no-store")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)
        except HTTPError as error:
            payload = error.read()
            self.send_response(error.code)
            self.send_header(
                "Content-Type",
                error.headers.get(
                    "Content-Type",
                    "application/json; charset=utf-8",
                ),
            )
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        except URLError as error:
            payload = json.dumps(
                {
                    "error": "preview upstream unavailable",
                    "reason": str(error.reason),
                },
                ensure_ascii=False,
            ).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(payload)))
            self.end_headers()
            self.wfile.write(payload)
        return True

    def do_GET(self):
        if self._proxy():
            return
        super().do_GET()

    def do_HEAD(self):
        if self._proxy():
            return
        super().do_HEAD()

    def do_POST(self):
        if self._proxy():
            return
        self.send_error(404)

    def do_DELETE(self):
        if self._proxy():
            return
        self.send_error(404)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=4176)
    parser.add_argument("--directory", default=".")
    parser.add_argument(
        "--workspace-target",
        default="http://127.0.0.1:30418",
    )
    parser.add_argument(
        "--debug-target",
        default="http://127.0.0.1:4183",
    )
    args = parser.parse_args()

    PreviewHandler.workspace_target = args.workspace_target
    PreviewHandler.debug_target = args.debug_target
    handler = partial(PreviewHandler, directory=args.directory)
    server = ThreadingHTTPServer((args.bind, args.port), handler)
    print(
        "ocr2md external preview listening on "
        f"http://{args.bind}:{args.port}\n"
        f"workspace target: {args.workspace_target}\n"
        f"debug target: {args.debug_target}",
        flush=True,
    )
    server.serve_forever()


if __name__ == "__main__":
    main()
