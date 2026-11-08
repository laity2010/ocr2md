"""Lab-only sentence review sidecar: immutable CMD SHA, CAS and atomic writes.

Not a segmentation API, and never writes original CMD. Shared server loads
these handlers only when LAB_ID == 'sentence-benchmark' in the isolated lab.
"""
import hashlib
import json
import os
import re
import secrets
from pathlib import Path

SCHEMA = "ocr2md-sentence-review/v1"
ENGINES = {"intl", "sentence-splitter", "wink-nlp"}
MAX_BYTES = 1024 * 1024
BLOCK = re.compile(r"^p\d+b\d+(?:s\d+(?:\.\d+)*)?$")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def empty(sha):
    return {"schema": SCHEMA, "sourceSha256": sha, "blocks": {}, "manualGold": {}}


def decode(raw, source):
    data = json.loads(raw.decode("utf-8"))
    if not isinstance(data, dict) or data.get("schema") != SCHEMA:
        raise ValueError("Invalid sentence review schema")
    source_sha = digest(source)
    if data.get("sourceSha256") != source_sha:
        raise ValueError("Sentence review source checksum differs from saved CMD")
    text = source.decode("utf-8")
    size = len(text.encode("utf-16-le")) // 2
    markers = set(re.findall(r'<!-- cmd:block:v1 id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"', text))
    blocks = data.get("blocks")
    gold = data.get("manualGold")
    if (not isinstance(blocks, dict) or len(blocks) > 10000 or
            not isinstance(gold, dict) or len(gold) > 100000):
        raise ValueError("Review block/Gold inventory invalid")
    for block_id, entry in blocks.items():
        if not isinstance(block_id, str) or not BLOCK.fullmatch(block_id) or block_id not in markers:
            raise ValueError("Unknown review PBS block")
        if not isinstance(entry, dict) or entry.get("status") not in ("auto", "arbitrated"):
            raise ValueError("Invalid review status")
        if entry["status"] == "arbitrated":
            if entry.get("engine") not in ENGINES:
                raise ValueError("Invalid review engine")
        elif "engine" in entry:
            raise ValueError("Auto review cannot claim human engine")
        boundaries = entry.get("boundaries")
        if (not isinstance(boundaries, list) or len(boundaries) > 20000 or
                any(type(n) is not int or n < 0 or n > size for n in boundaries) or
                sorted(set(boundaries)) != boundaries):
            raise ValueError("Invalid review boundaries")
    for offset, decision in gold.items():
        if (not isinstance(offset, str) or not offset.isdigit() or
                int(offset) > size or not isinstance(decision, dict) or
                type(decision.get("break")) is not bool or
                type(decision.get("manual")) is not bool):
            raise ValueError("Invalid manual Gold boundary")
    return {"schema": SCHEMA, "sourceSha256": source_sha,
            "blocks": blocks, "manualGold": gold}


def read(sidecar: Path, source: bytes):
    if sidecar.is_symlink():
        raise ValueError("Sentence review symlink forbidden")
    if not sidecar.exists():
        return empty(digest(source))
    if sidecar.stat().st_size > MAX_BYTES:
        raise ValueError("Sentence review file exceeds limit")
    return decode(sidecar.read_bytes(), source)


def etag(record):
    return digest(json.dumps(record, ensure_ascii=False, sort_keys=True,
                             separators=(",", ":")).encode("utf-8"))


def save(sidecar: Path, payload: bytes, source: bytes, previous: str):
    if len(payload) > MAX_BYTES:
        raise ValueError("Sentence review file too large")
    current = read(sidecar, source)
    if previous != etag(current):
        return None
    valid = decode(payload, source)
    sidecar.parent.mkdir(parents=True, exist_ok=True)
    tmp = sidecar.with_name(f".{sidecar.name}.{os.getpid()}.{secrets.token_hex(4)}.tmp")
    try:
        with tmp.open("xb") as handle:
            os.fchmod(handle.fileno(), 0o600)
            handle.write(json.dumps(valid, ensure_ascii=False,
                        separators=(",", ":")).encode("utf-8"))
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(tmp, sidecar)
    finally:
        if tmp.exists():
            tmp.unlink()
    return valid
