from __future__ import annotations

import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ocr2md_workbench.scanner import (
    download_images,
    export_markdown,
    get_context,
    save_manifest,
    scan_directory,
    update_workspace_ui_state,
)


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
            manifest["headings"][0]["export_dir"] = "Part A"
            manifest["headings"][0]["export_name"] = "01 Custom"
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
            self.assertEqual(rescanned["headings"][0]["export_dir"], "Part A")
            self.assertEqual(rescanned["headings"][0]["export_name"], "01 Custom")
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

    def test_scan_annotations_extracts_candidate_lines_as_references(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "\n".join(
                    [
                        "# Chapter",
                        "正文有注释①，还有第二个[2]。",
                        "",
                        "① 第一条注释",
                        "续行说明",
                        "[2] 第二条注释",
                        "",
                        "## Next",
                        "正文（1）。",
                        "（1）第三条注释",
                    ]
                ),
                encoding="utf-8",
            )
            (root / "output").mkdir()
            (root / "output" / "ignored.md").write_text("正文①\n① ignored", encoding="utf-8")

            manifest = scan_directory(root)
            annotations = manifest["annotations"]

            self.assertEqual(len(annotations), 6)
            self.assertEqual([item["note_no"] for item in annotations[:2]], ["1", "2"])
            self.assertTrue(all(item["type"] == "引用" for item in annotations))
            self.assertTrue(all(item["status"] == "待确认" for item in annotations))
            self.assertEqual(annotations[0]["content"], "正文有注释①，还有第二个[2]。")
            self.assertTrue(all(item["source_file"] == "book.md" for item in annotations))

    def test_scan_annotations_preserves_saved_types(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "\n".join(
                    [
                        "# Chapter",
                        "正文有引用① 和重复①。",
                        "还有缺正文[2]。",
                        "",
                        "① 第一条注释",
                        "③ 没有引用的注释",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_directory(root)
            manifest["annotations"][0]["type"] = "正文"
            manifest["annotations"][0]["group_no"] = "A1"
            save_manifest(manifest)

            rescanned = scan_directory(root)
            self.assertEqual(rescanned["annotations"][0]["type"], "正文")
            self.assertEqual(rescanned["annotations"][0]["group_no"], "A1")

    def test_scan_images_extracts_external_markdown_image_links(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "\n".join(
                    [
                        "# Chapter",
                        "![cover](https://example.com/cover.png)",
                        "inline ![diagram](//cdn.example.com/diagram.jpg \"Diagram\") text",
                        "![local](images/local.png)",
                    ]
                ),
                encoding="utf-8",
            )
            (root / "output").mkdir()
            (root / "output" / "ignored.md").write_text(
                "![ignored](https://example.com/ignored.png)",
                encoding="utf-8",
            )

            manifest = scan_directory(root)
            imgs = manifest["imgs"]

            self.assertEqual(len(imgs), 2)
            self.assertEqual(imgs[0]["alt"], "cover")
            self.assertEqual(imgs[0]["url"], "https://example.com/cover.png")
            self.assertEqual(imgs[0]["source_file"], "book.md")
            self.assertEqual(imgs[0]["line_no"], 2)
            self.assertEqual(imgs[1]["url"], "//cdn.example.com/diagram.jpg")

    def test_download_images_writes_output_and_preserves_local_path_on_rescan(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "# Chapter\n![cover](https://example.com/cover.png)\n",
                encoding="utf-8",
            )
            manifest = scan_directory(root)

            with patch(
                "ocr2md_workbench.scanner.fetch_image_bytes",
                return_value=(b"fake image bytes", "image/png"),
            ):
                result = download_images({**manifest, "image_ids": [manifest["imgs"][0]["id"]]})

            self.assertEqual(result["downloaded"], 1)
            local_path = result["imgs"][0]["local_path"]
            self.assertEqual(local_path, "output/imgs/cover.png")
            self.assertTrue((root / local_path).exists())

            saved_manifest = dict(manifest)
            saved_manifest["imgs"] = result["imgs"]
            save_manifest(saved_manifest)
            rescanned = scan_directory(root)
            self.assertEqual(rescanned["imgs"][0]["local_path"], local_path)

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
                        "chapter one has note [1]",
                        "## subtitle",
                        "more one",
                        "## Second",
                        "chapter two",
                        "[1] Annotated body",
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
                        "export_dir": "Part A",
                        "export_name": "01 Custom",
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
                        "export_dir": "Part A",
                        "export_name": "01 Custom",
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
                "annotations": [
                    {
                        "id": "a_ref",
                        "note_no": "1",
                        "type": "引用",
                        "group_no": "G1",
                        "content": "chapter one has note [1]",
                        "source_file": "book.md",
                        "line_no": 3,
                        "heading_id": "h1",
                        "status": "正常",
                    },
                    {
                        "id": "a_body",
                        "note_no": "1",
                        "type": "正文",
                        "group_no": "G1",
                        "content": "[1] Annotated body",
                        "source_file": "book.md",
                        "line_no": 8,
                        "heading_id": "h1",
                        "status": "正常",
                    },
                ],
            }

            result = export_markdown(manifest)
            output_dir = root / "output"

            self.assertEqual(result["count"], 2)
            self.assertTrue((output_dir / "Part A" / "01 Custom.md").exists())
            self.assertTrue((output_dir / "02 Second.md").exists())
            first_export = (output_dir / "Part A" / "01 Custom.md").read_text(encoding="utf-8")
            second_export = (output_dir / "02 Second.md").read_text(encoding="utf-8")
            self.assertIn("### subtitle", first_export)
            self.assertNotIn("\n## subtitle", first_export)
            self.assertIn("chapter one has note [^1]", first_export)
            self.assertIn("[^1]: Annotated body", first_export)
            self.assertNotIn("## 注释", first_export)
            self.assertIn("chapter two", second_export)
            self.assertNotIn("[1] Annotated body", second_export)

            (output_dir / "stale.md").write_text("old", encoding="utf-8")
            (output_dir / "Part A" / "stale.md").write_text("old", encoding="utf-8")
            export_markdown(manifest)
            self.assertFalse((output_dir / "stale.md").exists())
            self.assertFalse((output_dir / "Part A" / "stale.md").exists())

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

    def test_export_markdown_uses_each_explicit_export_name_over_logic_no(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("## A\nalpha\n## B\nbeta\n", encoding="utf-8")
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
                        "export_name": "01 Alpha",
                        "global_no": "001",
                        "title": "A",
                        "source_file": "book.md",
                        "line_no": 1,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## A",
                        "missing": False,
                    },
                    {
                        "id": "h2",
                        "enabled": True,
                        "book_id": "b",
                        "book_title": "Book",
                        "level": 2,
                        "local_no": "01",
                        "export_name": "02 Beta",
                        "global_no": "002",
                        "title": "B",
                        "source_file": "book.md",
                        "line_no": 3,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## B",
                        "missing": False,
                    },
                ],
            }

            result = export_markdown(manifest)

            self.assertEqual(result["count"], 2)
            self.assertTrue((root / "output" / "01 Alpha.md").exists())
            self.assertTrue((root / "output" / "02 Beta.md").exists())
            self.assertFalse((root / "output" / "01.md").exists())

    def test_export_markdown_rewrites_downloaded_image_links_to_local_paths(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "## Chapter\n"
                "![cover](https://example.com/cover.png \"Cover\")\n"
                "![remote](https://example.com/remote.png)\n",
                encoding="utf-8",
            )
            (root / "output" / "imgs").mkdir(parents=True)
            (root / "output" / "imgs" / "cover.png").write_bytes(b"image")
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
                        "title": "Chapter",
                        "source_file": "book.md",
                        "line_no": 1,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## Chapter",
                        "missing": False,
                    },
                ],
                "imgs": [
                    {
                        "id": "img1",
                        "alt": "cover",
                        "url": "https://example.com/cover.png",
                        "local_path": "output/imgs/cover.png",
                        "source_file": "book.md",
                        "line_no": 2,
                        "content": "![cover](https://example.com/cover.png)",
                    },
                    {
                        "id": "img2",
                        "alt": "remote",
                        "url": "https://example.com/remote.png",
                        "source_file": "book.md",
                        "line_no": 3,
                        "content": "![remote](https://example.com/remote.png)",
                    },
                ],
            }

            export_markdown(manifest)

            exported = (root / "output" / "01 Chapter.md").read_text(encoding="utf-8")
            self.assertIn('![cover](output/imgs/cover.png "Cover")', exported)
            self.assertIn("![remote](https://example.com/remote.png)", exported)

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
