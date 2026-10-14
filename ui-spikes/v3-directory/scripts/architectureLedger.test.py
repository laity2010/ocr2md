#!/usr/bin/env python3
"""Isolated V3 architecture ledger regression. Never touches the real vault."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

SCRIPT = Path(__file__).with_name("architectureLedger.py")


class ArchitectureLedgerTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="ocr2md-architecture-ledger-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "src").mkdir()
        self.wip = self.root / "src/preexisting.ts"
        self.wip.write_text("uncommitted WIP", encoding="utf-8")
        (self.root / "ui-spikes/v3-directory/src/modules").mkdir(parents=True)
        (self.root / "ui-spikes/v3-directory/src/app.ts").write_text(
            "original", encoding="utf-8")
        (self.root / "ui-spikes/v3-directory/src/modules/chapterMedia.ts").write_text(
            "media", encoding="utf-8")
        (self.root / "src/node_modules").mkdir()
        (self.root / "src/node_modules/should-not-count.ts").write_text(
            "ignored", encoding="utf-8")

    def cli(self, *args, ok=True):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), "--repo", str(self.root), *args],
            text=True, capture_output=True, check=False)
        if ok and result.returncode:
            self.fail(f"CLI failed: {result.stdout} {result.stderr}")
        return result

    def test_exact_delta_and_failed_test_duration(self):
        self.cli("begin", "--id", "V3-20261012-media-a", "--title", "media task",
                 "--modules", "media")
        # Unchanged, pre-existing untracked WIP must not appear in this task.
        self.assertNotEqual(self.cli("begin", "--id", "V3-20261012-media-a",
                                     "--title", "overwrite", "--modules", "media",
                                     ok=False).returncode, 0)
        self.assertTrue((self.root / ".tmp/architecture-ledger/active/V3-20261012-media-a.json").exists())
        path = self.root / "ui-spikes/v3-directory/src/app.ts"
        path.write_text("modified app", encoding="utf-8")
        media = self.root / "ui-spikes/v3-directory/src/modules/chapterMedia.ts"
        media.write_text("modified module", encoding="utf-8")
        (self.root / "src/node_modules/should-not-count.ts").write_text(
            "new dependency", encoding="utf-8")
        good = self.cli("test", "--id", "V3-20261012-media-a", "--name", "unit-pass",
                        "--cwd", ".", "--", sys.executable, "-c", "import sys;sys.exit(0)")
        self.assertIn("LEDGER_TEST", good.stdout)
        bad = self.cli("test", "--id", "V3-20261012-media-a", "--name", "unit-fail",
                       "--cwd", ".", "--", sys.executable, "-c", "import sys;sys.exit(3)",
                       ok=False)
        self.assertEqual(bad.returncode, 3)
        self.cli("finish", "--id", "V3-20261012-media-a", "--outcome", "partial",
                 "--note", "Retry after blocked test")
        changes = self.rows("changes.jsonl")
        row = changes[0]
        self.assertEqual(row["shared_files"], ["ui-spikes/v3-directory/src/app.ts"])
        self.assertEqual(row["module_files"], [
            "ui-spikes/v3-directory/src/modules/chapterMedia.ts"])
        self.assertNotIn("src/preexisting.ts", row["changed_files"])
        self.assertNotIn("src/node_modules/should-not-count.ts", row["changed_files"])
        self.assertEqual(row["test_count"], 2)
        self.assertEqual(row["test_failures"], 1)
        self.assertGreaterEqual(row["test_seconds"], 0)
        self.assertFalse((self.root / ".tmp/architecture-ledger/active/V3-20261012-media-a.json").exists())

    def rows(self, filename):
        path = self.root / "ui-spikes/v3-directory/architecture/ledger" / filename
        return [json.loads(x) for x in path.read_text(encoding="utf-8").splitlines() if x]

    def test_three_changes_trigger_report_without_real_changes(self):
        path = self.root / "ui-spikes/v3-directory/src/app.ts"
        for index in range(3):
            task = f"V3-20261012-refactor-{index}"
            self.cli("begin", "--id", task, "--title", f"item {index}",
                     "--modules", "shared")
            path.write_text(f"revision {index}", encoding="utf-8")
            self.cli("finish", "--id", task, "--outcome", "passed")
        self.cli("report", "--write")
        report = (self.root / "ui-spikes/v3-directory/architecture/ledger/REPORT.md")
        self.assertIn("达到3轮，评审拆分", report.read_text(encoding="utf-8"))
        self.assertEqual(len(self.rows("changes.jsonl")), 3)


if __name__ == "__main__":
    unittest.main()
