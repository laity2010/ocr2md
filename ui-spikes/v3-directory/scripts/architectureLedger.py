#!/usr/bin/env python3
"""Development-only ledger: file deltas, test durations and repeated shared edits.

No browser/runtime instrumentation, no vault access, no git mutation.
File paths are relative to the repository. Pre-existing WIP is excluded by
comparing SHA-256 of files at the task's begin and finish.
"""
from __future__ import annotations

import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[3]
ROOTS = ("src", "ui-spikes/v2", "ui-spikes/v3-directory", "ui-spikes/integration", "docs/v3")
EXT = {".ts", ".tsx", ".js", ".mjs", ".cjs", ".py", ".css", ".html",
       ".json", ".md", ".sh", ".yaml", ".yml", ".toml"}
IGNORE = {".git", ".tmp", ".cache", "node_modules", "dist", "build",
          "coverage", "test-results", "__pycache__", ".venv", "vendor"}
MODULE_NAMES = {"boundary", "heading", "media", "table", "latex", "shared", "infrastructure"}
ID_PATTERN = re.compile(r"^[A-Za-z0-9][A-Za-z0-9_.-]{2,90}$")


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def data_dir(root):
    return root / "ui-spikes/v3-directory/architecture/ledger"


def active_path(root, task_id):
    return root / ".tmp/architecture-ledger/active" / (task_id + ".json")


def validate_id(task_id):
    if not ID_PATTERN.fullmatch(task_id):
        raise ValueError("invalid task id; use letters, numbers, hyphen, dot or underscore")


def files(root):
    for directory in ROOTS:
        base = root / directory
        if not base.is_dir():
            continue
        for folder, dirs, names in os.walk(base, followlinks=False):
            dirs[:] = sorted(x for x in dirs if x not in IGNORE and not x.startswith("."))
            for name in sorted(names):
                path = Path(folder) / name
                if not path.is_file() or path.is_symlink():
                    continue
                if path.suffix not in EXT or name in {"package-lock.json", "yarn.lock"}:
                    continue
                if name.startswith(".") or any(x in name.lower() for x in ("secret", "credential", ".env")):
                    continue
                yield path.relative_to(root).as_posix(), path
    for name in ("AGENTS.md", "ENGINEERING_MEMO.md", "package.json"):
        path = root / name
        if path.is_file():
            yield name, path


def fingerprint(root):
    result = {}
    for name, path in files(root):
        digest = hashlib.sha256()
        with path.open("rb") as handle:
            for chunk in iter(lambda: handle.read(131072), b""):
                digest.update(chunk)
        result[name] = digest.hexdigest()
    return result


def load(path):
    return json.loads(path.read_text(encoding="utf-8"))


def append(path, row):
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("a", encoding="utf-8") as handle:
        handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")


def entries(path):
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines()
            if line.strip()]


def category(name):
    if "/tests/" in name or name.endswith((".test.ts", ".test.py")):
        return "test"
    if name.startswith("ui-spikes/v3-directory/src/modules/"):
        return "module"
    if name.endswith(".md") or name.startswith("docs/"):
        return "documentation"
    if "/scripts/" in name or name.endswith("package.json"):
        return "tooling"
    return "shared"


def begin(root, args):
    validate_id(args.id)
    modules = set(filter(None, (x.strip() for x in args.modules.split(","))))
    if not modules or modules - MODULE_NAMES:
        raise ValueError("modules must be from: " + ", ".join(sorted(MODULE_NAMES)))
    path = active_path(root, args.id)
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {"id": args.id, "title": args.title, "modules": sorted(modules),
               "started_at": now(), "baseline": fingerprint(root)}
    with path.open("x", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False)
    print("LEDGER_STARTED", args.id, "baseline_files", len(payload["baseline"]))


def run_test(root, args):
    validate_id(args.id)
    if not active_path(root, args.id).exists():
        raise ValueError("begin first: " + args.id)
    if not args.command:
        raise ValueError("test expects -- and executable arguments")
    cwd = (root / args.cwd).resolve()
    if not cwd.is_relative_to(root.resolve()) or not cwd.is_dir():
        raise ValueError("cwd must be inside the project")
    start = time.monotonic()
    try:
        code = subprocess.run(args.command, cwd=cwd, check=False).returncode
    except OSError as error:
        print("TEST_LAUNCH_ERROR", type(error).__name__, file=sys.stderr)
        code = 127
    row = {"id": args.id, "name": args.name, "at": now(),
           "seconds": round(time.monotonic() - start, 3), "exit_code": code}
    append(data_dir(root) / "tests.jsonl", row)
    print("LEDGER_TEST", args.id, args.name, "seconds", row["seconds"], "exit", code)
    if code:
        raise SystemExit(code)


def finish(root, args):
    validate_id(args.id)
    path = active_path(root, args.id)
    if not path.exists():
        raise ValueError("begin first: " + args.id)
    baseline = load(path)
    if any(x["id"] == args.id for x in entries(data_dir(root) / "changes.jsonl")):
        raise ValueError("task already recorded; preserving baseline")
    before = baseline["baseline"]
    after = fingerprint(root)
    changed = sorted(x for x in before.keys() | after.keys() if before.get(x) != after.get(x))
    product = [name for name in changed if category(name) in ("module", "shared")]
    shared = [name for name in product if category(name) == "shared"]
    tests = [x for x in entries(data_dir(root) / "tests.jsonl") if x["id"] == args.id]
    row = {
        "id": args.id, "title": baseline["title"], "modules": baseline["modules"],
        "started_at": baseline["started_at"], "finished_at": now(),
        "outcome": args.outcome, "note": args.note, "changed_files": changed,
        "production_files": product, "shared_files": shared,
        "module_files": [name for name in product if category(name) == "module"],
        "test_files": [name for name in changed if category(name) == "test"],
        "test_count": len(tests), "test_failures": sum(x["exit_code"] != 0 for x in tests),
        "test_seconds": round(sum(x["seconds"] for x in tests), 3),
        "measurement": "file_hash_delta_since_begin",
    }
    append(data_dir(root) / "changes.jsonl", row)
    path.unlink()
    print("LEDGER_FINISHED", args.id, "changed", len(changed),
          "production", len(product), "shared", len(shared),
          "test_seconds", row["test_seconds"])
    for name in shared:
        print(" SHARED", name)


def report(root, args):
    all_changes = entries(data_dir(root) / "changes.jsonl")
    changes = all_changes[-args.last:] if args.last else all_changes
    ids = {row["id"] for row in changes}
    tests = [x for x in entries(data_dir(root) / "tests.jsonl") if x["id"] in ids]
    touched = Counter()
    modules = Counter()
    for row in changes:
        touched.update(set(row.get("shared_files", [])))
        modules.update(set(row.get("modules", [])))
    by_test = defaultdict(list)
    for row in tests:
        by_test[row["name"]].append(row)
    lines = [
        "# V3 架构优化数据报告", "",
        "- 完结需求轮次：" + str(len(changes)),
        "- 口径：相对 begin 时文件 SHA-256 的变化；旧 WIP 不自动计入。",
        "- 热度表示开发期间编辑文件的轮次，**不表示运行时使用频率**。",
        "- 并行修改可能影响归因；对此应在本轮 note 中标注。",
        "", "## 模块涉及轮次", "", "| 模块 | 轮次 |", "| --- | ---: |",
    ]
    for name, count in modules.most_common():
        lines.append("| " + name + " | " + str(count) + " |")
    lines += ["", "## 共享文件热点", "",
              "| 文件 | 独立轮次 | 处理建议 |", "| --- | ---: | --- |"]
    if not touched:
        lines.append("| 尚无数据 | 0 | 继续记录 |")
    for file, count in touched.most_common():
        advice = "达到3轮，评审拆分" if count >= 3 else "继续观察"
        lines.append("| " + file + " | " + str(count) + " | " + advice + " |")
    lines += ["", "## 测试耗时", "",
              "| 用例 | 次数 | 平均秒 | 最慢秒 | 失败次数 |",
              "| --- | ---: | ---: | ---: | ---: |"]
    for name, runs in sorted(by_test.items(), key=lambda item: -sum(x["seconds"] for x in item[1])):
        seconds = [x["seconds"] for x in runs]
        lines.append("| " + name + " | " + str(len(runs)) + " | " +
                     format(sum(seconds) / len(seconds), ".1f") + " | " +
                     format(max(seconds), ".1f") + " | " +
                     str(sum(x["exit_code"] != 0 for x in runs)) + " |")
    lines += ["", "## 判读", "",
              "- 同一共享文件在至少3个独立功能轮次中反复改动，只触发评审，不自动重构。",
              "- 测试为逐命令 wall time；并行测试不能加总当作用户等待时间。",
              "- BP 以前手写历史基线另见 tests/CHAPTER_MODULE_HOTSPOT_LEDGER.md。",
              ""]
    output = "\n".join(lines)
    if args.write:
        target = data_dir(root) / "REPORT.md"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(output, encoding="utf-8")
        print("LEDGER_REPORT", target.relative_to(root))
    else:
        print(output)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", type=Path, default=ROOT)
    commands = parser.add_subparsers(dest="action", required=True)
    p = commands.add_parser("begin")
    p.add_argument("--id", required=True)
    p.add_argument("--title", required=True)
    p.add_argument("--modules", required=True)
    p = commands.add_parser("test")
    p.add_argument("--id", required=True)
    p.add_argument("--name", required=True)
    p.add_argument("--cwd", default="ui-spikes/v3-directory")
    p.add_argument("command", nargs=argparse.REMAINDER)
    p = commands.add_parser("finish")
    p.add_argument("--id", required=True)
    p.add_argument("--outcome", choices=("passed", "partial", "blocked"), required=True)
    p.add_argument("--note", default="")
    p = commands.add_parser("report")
    p.add_argument("--last", type=int, default=10)
    p.add_argument("--write", action="store_true")
    args = parser.parse_args()
    root = args.repo.resolve()
    if args.action == "test" and args.command and args.command[0] == "--":
        args.command = args.command[1:]
    try:
        {"begin": begin, "test": run_test, "finish": finish, "report": report}[args.action](root, args)
    except (OSError, ValueError, json.JSONDecodeError) as error:
        parser.error(str(error))


if __name__ == "__main__":
    main()
