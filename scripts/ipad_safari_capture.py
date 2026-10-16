#!/usr/bin/env python3
"""Capture a REAL iPad Safari webpage through Apple's Web Inspector protocol.

One-shot tool: no CDP server, Safari automation, AirPlay, or Xcode required.
Uses the installed third-party pymobiledevice3 transport to talk to Apple's
Web Inspector; Page.snapshotRect is an iPad Safari/WebKit native command.

Example:
  python3 scripts/ipad_safari_capture.py --udid <paired-ipad-udid> \
      --url-contains /v4-wp3-candidate/ --output /tmp/ipad-safari.png
"""

import argparse
import asyncio
import base64
import hashlib
import json
import os
from pathlib import Path
import struct
import sys
import tempfile
import time
import uuid
from datetime import datetime, timezone


class CaptureError(RuntimeError):
    pass


def png_dimensions(data: bytes) -> tuple[int, int]:
    if data[:8] != b"\x89PNG\r\n\x1a\n" or len(data) < 33 or data[12:16] != b"IHDR":
        raise CaptureError("Web Inspector returned no valid PNG image")
    width, height = struct.unpack(">II", data[16:24])
    if not (100 <= width <= 20000 and 100 <= height <= 20000):
        raise CaptureError(f"Implausible PNG image dimensions: {width}x{height}")
    return width, height


async def wait_event(events, predicate, seconds: float, reason: str):
    deadline = time.monotonic() + seconds
    while time.monotonic() < deadline:
        for index, event in enumerate(events):
            if predicate(event):
                return events.pop(index)
        await asyncio.sleep(0.06)
    raise CaptureError(f"Timed out waiting for {reason}; check iPad Safari foreground and close Mac Web Inspector")


async def capture(udid: str | None, url_contains: str, timeout: float) -> tuple[bytes, dict]:
    from pymobiledevice3.lockdown import create_using_usbmux
    from pymobiledevice3.services.webinspector import WebinspectorService
    from pymobiledevice3.services.web_protocol.session_protocol import SessionProtocol

    # No autopair: only use an already trusted, user-paired physical iPad.
    inspector = WebinspectorService(lockdown=create_using_usbmux(serial=udid, autopair=False))
    try:
        await asyncio.wait_for(inspector.connect(timeout=5), timeout)
        pages = await asyncio.wait_for(inspector.get_open_application_pages(timeout=1.0), timeout)
        matches = [
            item for item in pages
            if url_contains in (item.page.web_url or "")
            and ("Safari" in item.application.name or "safari" in item.application.bundle.lower())
        ]
        if len(matches) != 1:
            found = [{"app": item.application.name, "url": item.page.web_url} for item in pages]
            raise CaptureError(
                f"Expected exactly one matching REAL iPad Safari page for {url_contains!r}; "
                f"found {len(matches)}. Available pages: {json.dumps(found, ensure_ascii=False)}"
            )
        matched = matches[0]
        protocol = SessionProtocol(
            inspector, str(uuid.uuid4()).upper(), matched.application, matched.page, method_prefix=""
        )
        await asyncio.wait_for(
            inspector.setup_inspector_socket(protocol.id_, matched.application.id_, matched.page.id_),
            timeout,
        )
        # Wake Web Inspector's initial target-discovery event on iPadOS 27.
        # Some versions reject the discovery command itself; the only event
        # needed is Target.targetCreated. This does not navigate/change the page.
        await protocol.send_command("Target.setDiscoverTargets", discover=True)
        created = await wait_event(
            inspector.wir_events,
            lambda event: event.get("method") == "Target.targetCreated"
            and bool(event.get("params", {}).get("targetInfo", {}).get("targetId")),
            timeout,
            "Safari targetCreated",
        )
        target_id = created["params"]["targetInfo"]["targetId"]
        request_id = 0

        async def command(method: str, params: dict | None = None) -> dict:
            nonlocal request_id
            request_id += 1
            current_id = request_id
            message = {"id": current_id, "method": method, "params": params or {}}
            await asyncio.wait_for(protocol.send_command(
                "Target.sendMessageToTarget",
                targetId=target_id,
                message=json.dumps(message),
            ), timeout)

            def is_response(event):
                if event.get("method") != "Target.dispatchMessageFromTarget":
                    return False
                try:
                    return json.loads(event["params"]["message"]).get("id") == current_id
                except (KeyError, ValueError, TypeError):
                    return False

            event = await wait_event(inspector.wir_events, is_response, timeout, method)
            response = json.loads(event["params"]["message"])
            if response.get("error"):
                raise CaptureError(f"iPad WebKit rejected {method}: {response['error']}")
            return response.get("result", {})

        evaluated = await command("Runtime.evaluate", {
            "expression": "JSON.stringify({url:location.href,title:document.title,"
                          "width:innerWidth,height:innerHeight,dpr:devicePixelRatio,"
                          "visibility:document.visibilityState,epoch:Date.now()})",
            "returnByValue": True,
        })
        try:
            metadata = json.loads(evaluated["result"]["value"])
            width_css, height_css = int(metadata["width"]), int(metadata["height"])
        except (KeyError, TypeError, ValueError) as exc:
            raise CaptureError(f"Cannot inspect real iPad Safari viewport: {evaluated!r}") from exc
        if url_contains not in metadata["url"]:
            raise CaptureError("Safari navigated to a different page while capturing")
        if not (0 < width_css <= 10000 and 0 < height_css <= 10000):
            raise CaptureError("Invalid Safari viewport size")

        shot = await command("Page.snapshotRect", {
            "x": 0, "y": 0, "width": width_css, "height": height_css,
            "coordinateSystem": "Viewport",
        })
        data_url = shot.get("dataURL", "")
        if not data_url.startswith("data:image/png;base64,"):
            raise CaptureError("iPad Safari returned no PNG snapshotRect payload")
        try:
            image_bytes = base64.b64decode(data_url.partition(",")[2], validate=True)
        except ValueError as exc:
            raise CaptureError("Invalid base64 PNG from iPad Safari") from exc
        image_width, image_height = png_dimensions(image_bytes)
        return image_bytes, {
            "device": "paired physical iPad Safari",
            "device_udid_suffix": udid[-4:] if udid else None,
            "source": "iPad Safari Web Inspector / Page.snapshotRect",
            "page_url": metadata["url"],
            "page_title": metadata["title"],
            "viewport_css": [width_css, height_css],
            "device_pixel_ratio": metadata["dpr"],
            "page_visibility": metadata["visibility"],
            "device_time_ms": metadata["epoch"],
            "image_px": [image_width, image_height],
            "image_bytes": len(image_bytes),
            "sha256": hashlib.sha256(image_bytes).hexdigest(),
            "captured_at_utc": datetime.now(timezone.utc).isoformat(),
        }
    finally:
        # No resident daemon or modification to Safari and the user's page.
        if inspector.service is not None:
            try:
                await asyncio.wait_for(inspector.close(), 2)
            except (Exception, asyncio.CancelledError):
                pass


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--udid", default=os.environ.get("OCR2MD_IPAD_UDID"),
                        help="Already paired iPad UDID, or OCR2MD_IPAD_UDID; uses first device if omitted")
    parser.add_argument("--url-contains", required=True, help="Unique part of the active iPad Safari webpage URL")
    parser.add_argument("--output", type=Path, help="Output PNG; default: system temp folder with timestamp")
    parser.add_argument("--timeout", type=float, default=12, help="Timeout per Web Inspector step (default: 12s)")
    parser.add_argument("--attempts", type=int, default=2, help="Fresh Web Inspector connections on failure (default: 2)")
    args = parser.parse_args()
    if not args.url_contains.strip() or len(args.url_contains.strip()) < 3:
        parser.error("--url-contains must be at least 3 non-whitespace characters")
    if not (1 <= args.attempts <= 5 and 2 <= args.timeout <= 60):
        parser.error("--attempts must be 1..5 and --timeout must be 2..60")
    destination = args.output or Path(tempfile.gettempdir()) / (
        "ocr2md-ipad-safari-" + datetime.now().strftime("%Y%m%d-%H%M%S") + ".png"
    )
    image_bytes, metadata = None, None
    for attempt in range(1, args.attempts + 1):
        try:
            image_bytes, metadata = asyncio.run(asyncio.wait_for(
                capture(args.udid, args.url_contains, args.timeout),
                timeout=max(20, 5 * args.timeout),
            ))
            break
        except (Exception, asyncio.TimeoutError) as exc:
            print(f"ATTEMPT {attempt}/{args.attempts} FAILED: {type(exc).__name__}: {exc}", file=sys.stderr)
            if attempt == args.attempts:
                print("NO_SCREENSHOT: Ensure the iPad is unlocked, Safari is open, "
                      "Settings > Safari > Advanced > Web Inspector is on; "
                      "close the Mac Safari Web Inspector window and retry.", file=sys.stderr)
                return 1
            time.sleep(0.6)
    assert image_bytes is not None and metadata is not None
    destination.parent.mkdir(parents=True, exist_ok=True)
    temp_path = destination.with_name(destination.name + f".tmp-{os.getpid()}")
    try:
        with open(temp_path, "wb") as fp:
            fp.write(image_bytes)
        os.replace(temp_path, destination)
    finally:
        temp_path.unlink(missing_ok=True)
    metadata["output"] = str(destination.resolve())
    print(json.dumps({"ok": True, **metadata}, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
