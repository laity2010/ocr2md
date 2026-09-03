#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if ! pgrep -f 'esbuild app.ts.*outfile=app.js.*--watch' >/dev/null 2>&1; then
  nohup npm --prefix ui-spikes/integration run watch > /tmp/ocr2md-integration-esbuild.log 2>&1 &
fi

if ! curl -fsS http://127.0.0.1:4176/ >/dev/null 2>&1; then
  nohup python3 -m http.server 4176 --bind 0.0.0.0 --directory ui-spikes/integration > /tmp/ocr2md-integration-4176.log 2>&1 &
fi

for _ in $(seq 1 20); do
  if curl -fsS http://127.0.0.1:4176/ >/dev/null 2>&1; then
    echo "ocr2md integration ready on port 4176"
    exit 0
  fi
  sleep 0.25
done

echo "ocr2md integration failed to start; see /tmp/ocr2md-integration-4176.log" >&2
exit 1
