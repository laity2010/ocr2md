from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path

from ocr2md_workbench.scanner import export_markdown, get_context, save_manifest, scan_directory, update_workspace_ui_state


class ScannerTests(unittest.TestCase):
    def test_scan_markdown_and_plain_candidates(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "\n".join(
                    [
                        "# Book",
                        "",
                        "01",
                        "",
                        "正文",
                        "",
                        "第十二章",
                        "",
                        "更多正文",
                    ]
                ),
                encoding="utf-8",
            )
            (root / "output").mkdir()
            (root / "output" / "ignored.md").write_text("# Ignored", encoding="utf-8")

            manifest = scan_directory(root)
            titles = [item["title"] for item in manifest["headings"]]

            self.assertEqual(manifest["files"], ["book.md"])
            self.assertIn("Book", titles)
            self.assertIn("01", titles)
            self.assertIn("第十二章", titles)
            self.assertNotIn("Ignored", titles)

    def test_save_and_rescan_preserves_manual_edits(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("# Old\n\ntext", encoding="utf-8")

            manifest = scan_directory(root)
            manifest["headings"][0]["title"] = "New"
            manifest["headings"].append(
                {
                    "id": "m_test",
                    "enabled": True,
                    "book_id": "book",
                    "book_title": "Book",
                    "level": 2,
                    "local_no": "01",
                    "global_no": "001",
                    "title": "Manual",
                    "source_file": "book.md",
                    "line_no": 3,
                    "status": "手动新增",
                    "kind": "manual",
                    "confidence": "manual",
                    "raw_text": "Manual",
                    "insert_before_line": 3,
                    "insert_after_line": None,
                    "missing": False,
                    "metadata": {},
                }
            )

            result = save_manifest(manifest)
            saved_path = Path(result["path"])
            self.assertTrue(saved_path.exists())

            rescanned = scan_directory(root)
            by_id = {item["id"]: item for item in rescanned["headings"]}
            self.assertEqual(rescanned["headings"][0]["title"], "New")
            self.assertIn("m_test", by_id)
            self.assertEqual(by_id["m_test"]["title"], "Manual")

            saved = json.loads(saved_path.read_text(encoding="utf-8"))
            self.assertEqual(saved["input_dir"], str(root.resolve()))

    def test_save_creates_workspace_and_rescan_restores_ui_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("# Old\n\ntext", encoding="utf-8")

            manifest = scan_directory(root)
            manifest["headings"][0]["title"] = "Workspace Title"
            manifest["ui_state"] = {
                "selected_id": manifest["headings"][0]["id"],
                "filters": {"hide_disabled": False, "text": "Workspace"},
                "layout": {"hidden": ["console"], "sizes": {"--source-pane-width": "360px"}},
            }

            save_manifest(manifest)
            workspace_path = root / "md-workspace"
            self.assertTrue(workspace_path.exists())

            workspace = json.loads(workspace_path.read_text(encoding="utf-8"))
            self.assertEqual(workspace["kind"], "ocr2md-workspace")
            self.assertEqual(workspace["manifest"]["headings"][0]["title"], "Workspace Title")
            self.assertEqual(workspace["ui_state"]["filters"]["text"], "Workspace")

            rescanned = scan_directory(root)
            self.assertTrue(rescanned["workspace_loaded"])
            self.assertEqual(rescanned["headings"][0]["title"], "Workspace Title")
            self.assertEqual(rescanned["ui_state"]["filters"]["text"], "Workspace")

    def test_update_workspace_ui_state_preserves_manifest(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("# Title\n\ntext", encoding="utf-8")
            manifest = scan_directory(root)
            manifest["headings"][0]["title"] = "Preserved"
            save_manifest(manifest)

            update_workspace_ui_state(
                {
                    "input_dir": str(root),
                    "ui_state": {"selected_id": "h_test", "layout": {"hidden": ["source"]}},
                }
            )

            workspace = json.loads((root / "md-workspace").read_text(encoding="utf-8"))
            self.assertEqual(workspace["manifest"]["headings"][0]["title"], "Preserved")
            self.assertEqual(workspace["ui_state"]["selected_id"], "h_test")

    def test_context_returns_line_window(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("\n".join(f"line {i}" for i in range(1, 21)), encoding="utf-8")

            context = get_context(root, "book.md", 10, radius=2)

            self.assertEqual(context["start"], 8)
            self.assertEqual(context["end"], 12)
            self.assertEqual(context["lines"][2]["text"], "line 10")

    def test_export_markdown_uses_export_names_and_groups_same_logic_no(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "\n".join(
                    [
                        "preface",
                        "## 01",
                        "chapter one",
                        "## subtitle",
                        "more one",
                        "## Second",
                        "chapter two",
                    ]
                )
                + "\n",
                encoding="utf-8",
            )
            manifest = {
                "input_dir": str(root),
                "files": ["book.md"],
                "headings": [
                    {
                        "id": "h1",
                        "enabled": True,
                        "book_id": "b",
                        "book_title": "Book",
                        "level": 2,
                        "local_no": "01",
                        "global_no": "001",
                        "title": "01",
                        "source_file": "book.md",
                        "line_no": 2,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## 01",
                        "missing": False,
                    },
                    {
                        "id": "h2",
                        "enabled": True,
                        "book_id": "b",
                        "book_title": "Book",
                        "level": 3,
                        "local_no": "01",
                        "global_no": "001",
                        "title": "subtitle",
                        "source_file": "book.md",
                        "line_no": 4,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## subtitle",
                        "missing": False,
                    },
                    {
                        "id": "h3",
                        "enabled": True,
                        "book_id": "b",
                        "book_title": "Book",
                        "level": 2,
                        "local_no": "02",
                        "global_no": "002",
                        "title": "Second",
                        "source_file": "book.md",
                        "line_no": 6,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## Second",
                        "missing": False,
                    },
                ],
            }

            result = export_markdown(manifest)
            output_dir = root / "output"

            self.assertEqual(result["count"], 2)
            self.assertTrue((output_dir / "01.md").exists())
            self.assertTrue((output_dir / "02 Second.md").exists())
            first_export = (output_dir / "01.md").read_text(encoding="utf-8")
            self.assertIn("### subtitle", first_export)
            self.assertNotIn("\n## subtitle", first_export)
            self.assertIn("chapter two", (output_dir / "02 Second.md").read_text(encoding="utf-8"))

            (output_dir / "stale.md").write_text("old", encoding="utf-8")
            export_markdown(manifest)
            self.assertFalse((output_dir / "stale.md").exists())

    def test_export_markdown_can_export_selected_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("## 01\none\n## 02\ntwo\n", encoding="utf-8")
            manifest = {
                "input_dir": str(root),
                "files": ["book.md"],
                "export_selected_only": True,
                "export_selected_ids": ["h2"],
                "headings": [
                    {
                        "id": "h1",
                        "enabled": True,
                        "book_id": "b",
                        "book_title": "Book",
                        "level": 2,
                        "local_no": "01",
                        "global_no": "001",
                        "title": "01",
                        "source_file": "book.md",
                        "line_no": 1,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## 01",
                        "missing": False,
                    },
                    {
                        "id": "h2",
                        "enabled": True,
                        "book_id": "b",
                        "book_title": "Book",
                        "level": 2,
                        "local_no": "02",
                        "global_no": "002",
                        "title": "02",
                        "source_file": "book.md",
                        "line_no": 3,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## 02",
                        "missing": False,
                    },
                ],
            }

            result = export_markdown(manifest)

            self.assertEqual(result["count"], 1)
            self.assertFalse((root / "output" / "01.md").exists())
            self.assertTrue((root / "output" / "02.md").exists())
            self.assertIn("two", (root / "output" / "02.md").read_text(encoding="utf-8"))

    def test_export_ignores_disabled_markdown_boundaries(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "# Cover\n"
                "line 2\n"
                "## Disabled\n"
                "line 4\n"
                "## Also selected\n"
                "line 6\n"
                "## Next\n"
                "line 8\n",
                encoding="utf-8",
            )
            manifest = {
                "input_dir": str(root),
                "files": ["book.md"],
                "export_selected_only": True,
                "export_selected_ids": ["h1", "h2"],
                "headings": [
                    {
                        "id": "h1",
                        "enabled": True,
                        "book_id": "",
                        "book_title": "",
                        "level": 1,
                        "local_no": "00",
                        "global_no": "",
                        "title": "Cover",
                        "source_file": "book.md",
                        "line_no": 1,
                        "status": "未归书、未编号",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "# Cover",
                        "missing": False,
                    },
                    {
                        "id": "disabled",
                        "enabled": False,
                        "book_id": "",
                        "book_title": "",
                        "level": 2,
                        "local_no": "",
                        "global_no": "",
                        "title": "Disabled",
                        "source_file": "book.md",
                        "line_no": 3,
                        "status": "已禁用",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## Disabled",
                        "missing": False,
                    },
                    {
                        "id": "h2",
                        "enabled": True,
                        "book_id": "",
                        "book_title": "",
                        "level": 2,
                        "local_no": "00",
                        "global_no": "",
                        "title": "Also selected",
                        "source_file": "book.md",
                        "line_no": 5,
                        "status": "未归书、未编号",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## Also selected",
                        "missing": False,
                    },
                    {
                        "id": "h3",
                        "enabled": True,
                        "book_id": "",
                        "book_title": "",
                        "level": 2,
                        "local_no": "01",
                        "global_no": "001",
                        "title": "Next",
                        "source_file": "book.md",
                        "line_no": 7,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## Next",
                        "missing": False,
                    },
                ],
            }

            export_markdown(manifest)
            exported = (root / "output" / "00 Cover.md").read_text(encoding="utf-8")

            self.assertEqual(len(exported.splitlines()), 6)
            self.assertIn("## Disabled", exported)
            self.assertIn("## Also selected", exported)
            self.assertNotIn("## Next", exported)


if __name__ == "__main__":
    unittest.main()
