from __future__ import annotations

import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from ocr2md_workbench.scanner import (
    download_images,
    export_markdown,
    export_translation,
    get_context,
    save_manifest,
    save_translation,
    scan_directory,
    scan_translation,
    split_sentences_with_offsets,
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

    def test_scan_illegal_line_breaks_finds_prose_and_skips_markdown_structures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "\n".join(
                    [
                        "# Chapter",
                        "",
                        "这是一句被错误",
                        "拆成两行的正文。",
                        "",
                        "这是一句长度明显超过标题候选限制而不会被识别成纯文本标题的正文内容，也被错误",
                        "",
                        "分成了两个段落。",
                        "",
                        "这是完整的一句。",
                        "这是新的句子。",
                        "",
                        "- 列表项目",
                        "- 第二项",
                        "",
                        "```text",
                        "code without punctuation",
                        "still code",
                        "```",
                        "",
                        "$$",
                        "x + y",
                        "= z",
                        "$$",
                        "",
                        "English text continues",
                        "on the next line.",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_directory(root)
            breaks = manifest["illegal_breaks"]

            self.assertEqual(
                [(item["line_no"], item["next_line_no"]) for item in breaks],
                [(3, 4), (6, 8), (26, 27)],
            )
            self.assertEqual(breaks[0]["source_file"], "book.md")
            self.assertEqual(breaks[0]["before"], "这是一句被错误")
            self.assertEqual(breaks[0]["after"], "拆成两行的正文。")
            self.assertEqual(breaks[1]["reason"], "正文被空行错误分段，上一行未自然结束")
            self.assertTrue(all(item["confidence"] == "高" for item in breaks))

    def test_scan_illegal_line_breaks_preserves_saved_confidence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "这是一句长度明显超过标题候选限制而且包含很多正文内容并在句子中途被错误\n\n拆成两个段落的正文。\n",
                encoding="utf-8",
            )

            manifest = scan_directory(root)
            self.assertEqual(len(manifest["illegal_breaks"]), 1)
            manifest["illegal_breaks"][0]["confidence"] = "低"
            save_manifest(manifest)

            rescanned = scan_directory(root)
            self.assertEqual(rescanned["illegal_breaks"][0]["confidence"], "低")

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

    def test_export_markdown_fixes_high_confidence_illegal_breaks_only(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text(
                "## 01\n"
                "他抬起头说我没\n"
                "\n"
                "开枪打任何人。\n"
                "English text continues\n"
                "on the next line.\n"
                "这条保持\n"
                "\n"
                "原样。\n",
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
                        "line_no": 1,
                        "status": "正常",
                        "kind": "markdown",
                        "confidence": "high",
                        "raw_text": "## 01",
                        "missing": False,
                    }
                ],
                "annotations": [],
                "imgs": [],
                "illegal_breaks": [
                    {
                        "id": "br_cn",
                        "source_file": "book.md",
                        "line_no": 2,
                        "next_line_no": 4,
                        "confidence": "高",
                    },
                    {
                        "id": "br_en",
                        "source_file": "book.md",
                        "line_no": 5,
                        "next_line_no": 6,
                        "confidence": "高",
                    },
                    {
                        "id": "br_low",
                        "source_file": "book.md",
                        "line_no": 7,
                        "next_line_no": 9,
                        "confidence": "低",
                    },
                ],
            }

            export_markdown(manifest)
            exported = (root / "output" / "01.md").read_text(encoding="utf-8")

            self.assertIn("他抬起头说我没开枪打任何人。", exported)
            self.assertIn("English text continues on the next line.", exported)
            self.assertIn("这条保持\n\n原样。", exported)

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

    def test_split_sentences_with_offsets_handles_english_abbreviations_and_decimals(self) -> None:
        text = "U.S. stocks rose 3.5%. Fig. 1 shows it. Table 1. Results follow."

        sentences = split_sentences_with_offsets(text)

        self.assertEqual(
            [item["text"] for item in sentences],
            ["U.S. stocks rose 3.5%. ", "Fig. 1 shows it. ", "Table 1. Results follow."],
        )
        self.assertEqual("".join(item["text"] for item in sentences), text)
        self.assertTrue(all(item["engine"] in {"pysbd", "fallback"} for item in sentences))

    def test_split_sentences_with_offsets_handles_chinese_and_mixed_text(self) -> None:
        text = "这是第一句。This is the U.S. market. 这是第二句！"

        sentences = split_sentences_with_offsets(text)

        self.assertEqual("".join(item["text"] for item in sentences), text)
        self.assertEqual(sentences[0]["text"], "这是第一句。")
        self.assertEqual(sentences[-1]["text"], "这是第二句！")
        self.assertEqual(sentences[0]["start"], 0)
        self.assertEqual(sentences[-1]["end"], len(text))

    def test_scan_translation_reads_output_markdown_only_and_skips_structures(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "raw.md").write_text("原始文件不应进入翻译", encoding="utf-8")
            (root / "output" / "imgs").mkdir(parents=True)
            (root / "output" / "imgs" / "ignored.md").write_text("图片目录忽略", encoding="utf-8")
            (root / "output" / "book.md").write_text(
                "\n".join(
                    [
                        "# 第一章",
                        "",
                        "这是第一段。",
                        "仍属于第一段。",
                        "",
                        "- 列表不拆译",
                        "![cover](imgs/cover.png)",
                        "[^1]: 脚注不拆译",
                        "```",
                        "code block",
                        "```",
                        "",
                        "这是第二段。",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            self.assertEqual(manifest["files"], ["book.md"])
            self.assertEqual([item["line_no"] for item in manifest["segments"]], [1, 3, 4, 6, 7, 8, 9, 10, 11, 13])
            self.assertEqual(
                [(item["block_no"], item["block_type"], item["line_no"], item["source"]) for item in manifest["segments"]],
                [
                    (1, "标题", 1, "第一章"),
                    (2, "文本", 3, "这是第一段。"),
                    (2, "文本", 4, "仍属于第一段。"),
                    (3, "列表", 6, "- 列表不拆译"),
                    (4, "图片", 7, "![cover](imgs/cover.png)"),
                    (5, "注释正文", 8, "[^1]: 脚注不拆译"),
                    (6, "代码", 9, "```"),
                    (6, "代码", 10, "code block"),
                    (6, "代码", 11, "```"),
                    (7, "文本", 13, "这是第二段。"),
                ],
            )

    def test_scan_translation_classifies_multiline_footnote_body(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "notes.md").write_text(
                "\n".join(
                    [
                        "正文。",
                        "",
                        "[^10]: 第一行注释正文",
                        "  第二行注释正文",
                        "    第三行注释正文",
                        "",
                        "下一段。",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            footnote_rows = [item for item in manifest["segments"] if item["block_type"] == "注释正文"]
            self.assertEqual(
                [(item["block_no"], item["line_no"], item["source"]) for item in footnote_rows],
                [
                    (2, 3, "[^10]: 第一行注释正文"),
                    (2, 4, "  第二行注释正文"),
                    (2, 5, "    第三行注释正文"),
                ],
            )
            self.assertEqual(
                footnote_rows[0]["metadata"]["footnote_marker"],
                "[^10]:",
            )

    def test_scan_translation_splits_footnotes_and_table_notes_into_sentence_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "notes.md").write_text(
                "\n".join(
                    [
                        ">[! ds]- Table 1. Table title",
                        "><table><tr><td>A</td></tr></table>",
                        ">Notes: First table note. Second table note.",
                        "",
                        "[^10]: First footnote sentence. Second footnote sentence.",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            table_notes = [item for item in manifest["segments"] if item["block_type"] == "表注"]
            footnotes = [item for item in manifest["segments"] if item["block_type"] == "注释正文"]
            self.assertEqual(
                [(item["sentence_no"], item["source"]) for item in table_notes],
                [(1, "Notes: First table note. "), (2, "Second table note.")],
            )
            self.assertEqual(
                [(item["sentence_no"], item["source"]) for item in footnotes],
                [(1, "[^10]: First footnote sentence. "), (2, "Second footnote sentence.")],
            )

    def test_scan_translation_splits_long_quoted_footnote_body(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            text = (
                "[^10]: For instance, the report states, “First quoted sentence. "
                "Second quoted sentence with U.S. reference. Third quoted sentence.” "
            )
            (root / "output" / "notes.md").write_text(text, encoding="utf-8")

            manifest = scan_translation(root)

            footnotes = [item for item in manifest["segments"] if item["block_type"] == "注释正文"]
            self.assertEqual(len(footnotes), 3)
            self.assertEqual("".join(item["source"] for item in footnotes), text)
            self.assertEqual(footnotes[0]["source"], "[^10]: For instance, the report states, “First quoted sentence. ")
            self.assertEqual(footnotes[1]["source"], "Second quoted sentence with U.S. reference. ")

    def test_scan_translation_classifies_sample_block_types(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "sample.md").write_text(
                "\n".join(
                    [
                        "---",
                        "state: 版面已审阅",
                        "---",
                        "# Title",
                        "",
                        ">Figure 1. Figure title",
                        "![image](imgs/a.jpg)",
                        "Notes: Figure note.",
                        "",
                        "Text paragraph.",
                        "",
                        "$$",
                        "x = y",
                        "$$",
                        "",
                        ">",
                        "Exhibit 1. Balance Sheet",
                        "><table><tr><td>A</td></tr></table>",
                        "",
                        "![[imgs/table.png]]",
                        ">[! ds]+ Table 2. Table title",
                        "><table><tr><td>B</td></tr></table>",
                        ">Notes: Table note.",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            self.assertEqual(
                [item["line_no"] for item in manifest["segments"]],
                [1, 2, 3, 4, 6, 7, 8, 10, 12, 13, 14, 16, 17, 18, 20, 21, 22, 23],
            )
            yaml_rows = manifest["segments"][:3]
            self.assertEqual(
                [(item["block_no"], item["block_type"], item["line_no"], item["source"]) for item in yaml_rows],
                [(1, "YAML 元数据", 1, "---"), (1, "YAML 元数据", 2, "state: 版面已审阅"), (1, "YAML 元数据", 3, "---")],
            )
            figure_rows = [item for item in manifest["segments"] if 6 <= item["line_no"] <= 8]
            self.assertEqual(
                [(item["block_no"], item["block_type"], item["line_no"]) for item in figure_rows],
                [(3, "图题", 6), (3, "图片", 7), (3, "图注", 8)],
            )
            self.assertEqual([item["status"] for item in figure_rows], ["未翻译", "不翻译", "未翻译"])
            table_rows = [item for item in manifest["segments"] if 20 <= item["line_no"] <= 23]
            self.assertEqual(
                [(item["block_no"], item["block_type"], item["line_no"]) for item in table_rows],
                [(7, "图片", 20), (7, "表题", 21), (7, "表格", 22), (7, "表注", 23)],
            )

    def test_scan_translation_keeps_multi_panel_figure_under_one_block_no(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "figure.md").write_text(
                "\n".join(
                    [
                        ">Figure 3. Composite figure",
                        ">>A. Panel A",
                        "panel-a-source",
                        "Panel A note.",
                        ">",
                        ">>B. Panel B",
                        "panel-b-source",
                        "Panel B note.",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            self.assertEqual(
                [(item["block_no"], item["block_type"], item["line_no"], item["source"]) for item in manifest["segments"]],
                [
                    (1, "图题", 1, "Figure 3. Composite figure"),
                    (1, "图题", 2, "A. Panel A"),
                    (1, "图片", 3, "panel-a-source"),
                    (1, "图注", 4, "Panel A note."),
                    (1, "嵌套块", 5, ">"),
                    (1, "图题", 6, "B. Panel B"),
                    (1, "图片", 7, "panel-b-source"),
                    (1, "图注", 8, "Panel B note."),
                ],
            )

    def test_scan_translation_treats_quote_marker_as_nested_block_until_blank_line(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "nested.md").write_text(
                "\n".join(
                    [
                        ">",
                        "Nested line one.",
                        "Nested line two.",
                        "",
                        "Outside line.",
                    ]
                ),
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            self.assertEqual(
                [(item["block_no"], item["block_type"], item["line_no"], item["source"]) for item in manifest["segments"]],
                [
                    (1, "嵌套块", 1, ">"),
                    (1, "引文", 2, "Nested line one."),
                    (1, "引文", 3, "Nested line two."),
                    (2, "文本", 5, "Outside line."),
                ],
            )

    def test_scan_translation_treats_heading_as_block_without_blank_line(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n紧接标题的正文。", encoding="utf-8")

            manifest = scan_translation(root)

            self.assertEqual(len(manifest["segments"]), 2)
            self.assertEqual(
                [(item["block_no"], item["block_type"], item["source"]) for item in manifest["segments"]],
                [(1, "标题", "第一章"), (2, "文本", "紧接标题的正文。")],
            )

    def test_scan_translation_splits_text_block_into_sentence_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text(
                "# 第一章\n\n第一句。第二句！\n同块第三句？",
                encoding="utf-8",
            )

            manifest = scan_translation(root)

            text_rows = [item for item in manifest["segments"] if item["block_type"] == "文本"]
            self.assertEqual(
                [(item["block_no"], item["sentence_no"], item["line_no"], item["source"]) for item in text_rows],
                [(2, 1, 3, "第一句。"), (2, 2, 3, "第二句！"), (2, 3, 4, "同块第三句？")],
            )
            self.assertTrue(all(item["sentence_start"] != "" and item["sentence_end"] != "" for item in text_rows))

    def test_scan_translation_replaces_inline_nontranslatable_content_with_placeholders(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            source = "Text with [^1], [site](https://example.com), $x+y$, and `code`."
            (root / "output" / "book.md").write_text(source, encoding="utf-8")

            manifest = scan_translation(root)

            sentence = next(item for item in manifest["segments"] if item["block_type"] == "文本")
            self.assertEqual(sentence["source"], "Text with {NT1}, {NT2}, {NT3}, and {NT4}.")
            self.assertEqual(
                sentence["metadata"]["inline_placeholders"],
                [
                    {"placeholder": "{NT1}", "text": "[^1]"},
                    {"placeholder": "{NT2}", "text": "[site](https://example.com)"},
                    {"placeholder": "{NT3}", "text": "$x+y$"},
                    {"placeholder": "{NT4}", "text": "`code`"},
                ],
            )
            self.assertEqual(sentence["metadata"]["source_unprotected"], source)

    def test_scan_translation_does_not_replace_footnote_definition_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "notes.md").write_text("[^10]: See [^9] and $x$.", encoding="utf-8")

            manifest = scan_translation(root)

            footnote = next(item for item in manifest["segments"] if item["block_type"] == "注释正文")
            self.assertEqual(footnote["source"], "[^10]: See {NT1} and {NT2}.")
            self.assertEqual(
                footnote["metadata"]["inline_placeholders"],
                [{"placeholder": "{NT1}", "text": "[^9]"}, {"placeholder": "{NT2}", "text": "$x$"}],
            )

    def test_save_translation_and_rescan_preserves_translation_state(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n\n中文段落。", encoding="utf-8")
            manifest = scan_translation(root)
            manifest["segments"][0]["translation"] = "Translated paragraph."
            manifest["segments"][0]["status"] = "已确认"

            result = save_translation(manifest)
            self.assertTrue(Path(result["workspace_path"]).exists())

            rescanned = scan_translation(root)
            self.assertEqual(rescanned["segments"][0]["translation"], "Translated paragraph.")
            self.assertEqual(rescanned["segments"][0]["status"], "已确认")

    def test_scan_translation_accepts_output_directory_as_input(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n\n中文段落。", encoding="utf-8")

            manifest = scan_translation(root / "output")

            self.assertEqual(manifest["input_dir"], str(root.resolve()))
            self.assertEqual(manifest["output_dir"], str((root / "output").resolve()))
            self.assertEqual(len(manifest["segments"]), 2)

    def test_scan_translation_uses_input_directory_when_output_is_missing(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "book.md").write_text("# 第一章\n\n中文段落。", encoding="utf-8")

            manifest = scan_translation(root)

            self.assertEqual(manifest["input_dir"], str(root.resolve()))
            self.assertEqual(manifest["output_dir"], str(root.resolve()))
            self.assertEqual(manifest["files"], ["book.md"])
            self.assertEqual(len(manifest["segments"]), 2)

    def test_scan_translation_uses_input_directory_when_output_has_no_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "title_manifest.json").write_text("{}", encoding="utf-8")
            (root / "book.md").write_text("# 第一章\n\n中文段落。", encoding="utf-8")

            manifest = scan_translation(root)

            self.assertEqual(manifest["output_dir"], str(root.resolve()))
            self.assertEqual(manifest["files"], ["book.md"])
            self.assertEqual(len(manifest["segments"]), 2)

    def test_scan_translation_skips_translated_output_directory(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output_translated").mkdir()
            (root / "book.md").write_text("# 第一章\n\n中文段落。", encoding="utf-8")
            (root / "output_translated" / "trans").mkdir()
            (root / "output_translated" / "trans" / "book.md").write_text("# Translated\n", encoding="utf-8")

            manifest = scan_translation(root)

            self.assertEqual(manifest["files"], ["book.md"])

    def test_scan_translation_repairs_duplicated_absolute_input_path(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n\n中文段落。", encoding="utf-8")
            duplicated = f"{root}{root}/output"

            manifest = scan_translation(duplicated)

            self.assertEqual(manifest["input_dir"], str(root.resolve()))
            self.assertEqual(manifest["output_dir"], str((root / "output").resolve()))
            self.assertEqual(len(manifest["segments"]), 2)

    def test_export_translation_preserves_structure_and_replaces_translated_paragraphs(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output" / "Part A").mkdir(parents=True)
            (root / "output" / "Part A" / "book.md").write_text(
                "# 第一章\n\n中文段落。\n\n未翻译段落。\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            text_segment = next(item for item in manifest["segments"] if item["block_type"] == "文本")
            text_segment["translation"] = "Translated paragraph."
            text_segment["status"] = "已翻译"

            result = export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "Part A" / "book.md").read_text(encoding="utf-8")

            self.assertEqual(result["count"], 1)
            self.assertIn("# 第一章", exported)
            self.assertIn("Translated paragraph.", exported)
            self.assertIn("未翻译段落。", exported)
            self.assertNotIn("中文段落。", exported)

    def test_export_translation_without_translations_restores_original_markdown(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            original = "\n".join(
                [
                    "---",
                    "state: 版面已审阅",
                    "---",
                    "# 第一章",
                    "",
                    "中文段落第一行。",
                    "中文段落第二行。",
                    "",
                    ">Figure 1. 图题",
                    "![image](imgs/a.jpg)",
                    "Notes: 图注。",
                    "",
                    "[^10]: 中文注释正文",
                    "  续行注释正文",
                ]
            )
            (root / "output" / "book.md").write_text(original, encoding="utf-8")
            manifest = scan_translation(root)

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertTrue(exported.startswith("---\nstate: 版面已审阅\n---\n\n"))
            self.assertIn("# 第一章\n^sid-2-1", exported)
            self.assertIn("中文段落第一行。\n^sid-3-1\n中文段落第二行。\n^sid-3-2", exported)
            self.assertIn(">Figure 1. 图题\n![image](imgs/a.jpg)\nNotes: 图注。", exported)
            self.assertIn("[^10]: 中文注释正文\n  续行注释正文\n^bid-5", exported)

    def test_export_translation_uses_single_blank_line_between_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text(
                "# 第一章\n\n\n第一段第一行。\n第一段第二行。\n第二段紧接无空行。\n\n\n\n## 第二节\n正文。",
                encoding="utf-8",
            )
            manifest = scan_translation(root)

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertNotIn("\n\n\n", exported)
            self.assertIn("# 第一章\n^sid-1-1", exported)
            self.assertIn("第一段第一行。\n^sid-2-1\n第一段第二行。\n^sid-2-2\n第二段紧接无空行。\n^sid-2-3", exported)
            self.assertIn("## 第二节\n^sid-3-1", exported)
            self.assertIn("正文。\n^sid-4-1", exported)

    def test_export_translation_replaces_one_sentence_in_text_block(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n\nFirst sentence. Second sentence.\n", encoding="utf-8")
            manifest = scan_translation(root)
            sentence = next(item for item in manifest["segments"] if item.get("sentence_no") == 2)
            sentence["translation"] = "第二句。"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertIn("# 第一章\n^sid-1-1", exported)
            self.assertIn("First sentence.\n^sid-2-1\n\n第二句。\n^sid-2-2", exported)

    def test_export_translation_writes_org_trans_cross_with_obsidian_block_ids(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n\nFirst sentence. Second sentence.\n", encoding="utf-8")
            manifest = scan_translation(root)
            sentence = next(item for item in manifest["segments"] if item.get("sentence_no") == 2)
            sentence["translation"] = "第二句。"

            result = export_translation(manifest)
            org = (root / "output_translated" / "org" / "book.md").read_text(encoding="utf-8")
            trans = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")
            trans2org = (root / "output_translated" / "cross" / "trans2org book.md").read_text(encoding="utf-8")
            org2trans = (root / "output_translated" / "cross" / "org2trans book.md").read_text(encoding="utf-8")

            self.assertEqual(result["count"], 1)
            self.assertIn("# 第一章\n^sid-1-1\n\n<br>\n\n", org)
            self.assertIn("First sentence.\n^sid-2-1\n\nSecond sentence.\n^sid-2-2", org)
            self.assertIn("# 第一章\n^sid-1-1\n\n<br>\n\n", trans)
            self.assertIn("First sentence.\n^sid-2-1\n\n第二句。\n^sid-2-2", trans)
            self.assertIn("# 第一章\n^sid-1-1\n\n>[! ds]-\n>![[output_translated/org/book#^sid-1-1]]", trans2org)
            self.assertIn("First sentence.\n^sid-2-1\n\n>[! ds]-\n>![[output_translated/org/book#^sid-2-1]]", trans2org)
            self.assertIn("第二句。\n^sid-2-2\n\n>[! ds]-\n>![[output_translated/org/book#^sid-2-2]]", trans2org)
            self.assertNotIn("Second sentence.\n^sid-2-2\n\n>[! ds]-", trans2org)
            self.assertIn("# 第一章\n^sid-1-1\n\n>[! ds]-\n>![[output_translated/trans/book#^sid-1-1]]", org2trans)
            self.assertIn("First sentence.\n^sid-2-1\n\n>[! ds]-\n>![[output_translated/trans/book#^sid-2-1]]", org2trans)
            self.assertIn("Second sentence.\n^sid-2-2\n\n>[! ds]-\n>![[output_translated/trans/book#^sid-2-2]]", org2trans)
            self.assertNotIn("第二句。\n^sid-2-2\n\n>[! ds]-", org2trans)
            self.assertEqual(trans2org.count(">[! ds]-"), 3)
            self.assertEqual(org2trans.count(">[! ds]-"), 3)
            self.assertNotRegex("\n".join([org, trans, trans2org, org2trans]), r"[ \t]\^(?:b|s)id-")
            self.assertNotRegex("\n".join([org, trans, trans2org, org2trans]), r"\^(?:b|s)id-[A-Za-z0-9-]+[ \t]")
            for line in "\n".join([org, trans, trans2org, org2trans]).splitlines():
                if line.startswith(("^bid-", "^sid-")):
                    self.assertEqual(line, line.strip())
                    self.assertRegex(line, r"^\^(?:b|s)id-[A-Za-z0-9-]+$")
            self.assertEqual(len(re.findall(r"\^sid-", org)), 3)
            self.assertEqual(len(re.findall(r"\^sid-", trans)), 3)
            self.assertNotIn("^bid-", org)
            self.assertNotIn("^bid-", trans)
            self.assertFalse((root / "output_translated" / "book.md").exists())
            self.assertFalse((root / "output_translated" / "cross" / "book.md").exists())

    def test_export_translation_does_not_add_block_ids_to_yaml_frontmatter(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("---\ntitle: A\n---\n\n正文。\n", encoding="utf-8")
            manifest = scan_translation(root)

            export_translation(manifest)
            org = (root / "output_translated" / "org" / "book.md").read_text(encoding="utf-8")

            self.assertTrue(org.startswith("---\ntitle: A\n---\n\n"))
            self.assertIn("正文。\n^sid-2-1\n", org)

    def test_export_translation_keeps_footnote_body_as_block_id(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("[^1]: Note one. Note two.\n", encoding="utf-8")
            manifest = scan_translation(root)
            footnotes = [item for item in manifest["segments"] if item["block_type"] == "注释正文"]
            footnotes[0]["translation"] = "译文一句。"
            footnotes[1]["translation"] = "译文二句。"

            export_translation(manifest)
            org = (root / "output_translated" / "org" / "book.md").read_text(encoding="utf-8")
            trans2org = (root / "output_translated" / "cross" / "trans2org book.md").read_text(encoding="utf-8")
            org2trans = (root / "output_translated" / "cross" / "org2trans book.md").read_text(encoding="utf-8")

            self.assertIn("[^1]: Note one. Note two.\n^bid-1\n\n<br>\n\n", org)
            self.assertNotIn("^sid-", org)
            self.assertIn("[^1]: 译文一句。 译文二句。\n<br>Note one. Note two.\n^bid-1", trans2org)
            self.assertIn("[^1]: Note one. Note two.\n<br>译文一句。 译文二句。\n^bid-1", org2trans)
            self.assertEqual(trans2org.splitlines().count("^bid-1"), 1)
            self.assertEqual(org2trans.splitlines().count("^bid-1"), 1)
            self.assertEqual(trans2org.count(">[! ds]-"), 0)
            self.assertEqual(org2trans.count(">[! ds]-"), 0)
            self.assertNotIn(">![[output_translated/org/book#^bid-1]]", trans2org)
            self.assertNotIn(">![[output_translated/trans/book#^bid-1]]", org2trans)

    def test_export_translation_cross_keeps_multiline_footnote_as_one_block(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text(
                "[^1]: Note one. Note two.\n  Continued note. Third note.\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            footnotes = [item for item in manifest["segments"] if item["block_type"] == "注释正文"]
            for index, item in enumerate(footnotes, start=1):
                item["translation"] = f"译文{index}。"

            export_translation(manifest)
            trans2org = (root / "output_translated" / "cross" / "trans2org book.md").read_text(encoding="utf-8")
            org2trans = (root / "output_translated" / "cross" / "org2trans book.md").read_text(encoding="utf-8")

            self.assertIn(
                "[^1]: 译文1。 译文2。\n  译文3。 译文4。\n"
                "<br>Note one. Note two.\n  Continued note. Third note.\n^bid-1",
                trans2org,
            )
            self.assertIn(
                "[^1]: Note one. Note two.\n  Continued note. Third note.\n"
                "<br>译文1。 译文2。\n  译文3。 译文4。\n^bid-1",
                org2trans,
            )
            self.assertEqual(trans2org.splitlines().count("^bid-1"), 1)
            self.assertEqual(org2trans.splitlines().count("^bid-1"), 1)
            self.assertEqual(trans2org.count(">[! ds]-"), 0)
            self.assertEqual(org2trans.count(">[! ds]-"), 0)
            self.assertNotIn("^sid-", trans2org)
            self.assertNotIn("^sid-", org2trans)

    def test_export_translation_cross_deduplicates_footnote_marker(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("[^8]: See details.\n", encoding="utf-8")
            manifest = scan_translation(root)
            footnote = next(item for item in manifest["segments"] if item["block_type"] == "注释正文")
            footnote["translation"] = "[^8]：详情。"

            export_translation(manifest)
            trans2org = (root / "output_translated" / "cross" / "trans2org book.md").read_text(encoding="utf-8")
            org2trans = (root / "output_translated" / "cross" / "org2trans book.md").read_text(encoding="utf-8")

            self.assertIn("[^8]: 详情。\n<br>See details.\n^bid-1", trans2org)
            self.assertIn("[^8]: See details.\n<br>详情。\n^bid-1", org2trans)
            self.assertNotIn("[^8]: [^8]", trans2org)
            self.assertNotIn("[^8]: [^8]", org2trans)
            self.assertNotIn("<br>[^8]:", trans2org)
            self.assertNotIn("<br>[^8]:", org2trans)

    def test_export_translation_places_nested_block_id_after_quote_separator(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "nested.md").write_text(
                ">\nNested line one.\nNested line two.\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)

            export_translation(manifest)
            org = (root / "output_translated" / "org" / "nested.md").read_text(encoding="utf-8")
            trans2org = (root / "output_translated" / "cross" / "trans2org nested.md").read_text(encoding="utf-8")
            org2trans = (root / "output_translated" / "cross" / "org2trans nested.md").read_text(encoding="utf-8")

            self.assertIn(">\nNested line one.\nNested line two.\n>\n^bid-1", org)
            self.assertIn(">\nNested line one.\nNested line two.\n>\n^bid-1", trans2org)
            self.assertIn(">\nNested line one.\nNested line two.\n>\n^bid-1", org2trans)
            self.assertNotIn("Nested line two.\n^bid-1", org)

    def test_export_translation_cleans_stale_variant_files(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("正文。\n", encoding="utf-8")
            stale = root / "output_translated" / "cross" / "stale.md"
            stale.parent.mkdir(parents=True)
            stale.write_text("old\n", encoding="utf-8")
            root_stale = root / "output_translated" / "stale.md"
            root_stale.write_text("old\n", encoding="utf-8")
            manifest = scan_translation(root)

            export_translation(manifest)

            self.assertFalse(stale.exists())
            self.assertFalse(root_stale.exists())

    def test_export_translation_restores_inline_placeholders_in_translated_sentence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text(
                "Text with [^1], [site](https://example.com), and $x+y$.\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            sentence = next(item for item in manifest["segments"] if item["block_type"] == "文本")
            sentence["translation"] = "译文保留 {NT1}、{NT2} 和 {NT3}。"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertIn("译文保留 [^1]、[site](https://example.com) 和 $x+y$。\n^sid-1-1", exported)

    def test_export_translation_without_translation_restores_protected_original_sentence(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            source = "Text with [^1] and $x+y$.\n"
            (root / "output" / "book.md").write_text(source, encoding="utf-8")
            manifest = scan_translation(root)

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertIn("Text with [^1] and $x+y$.\n^sid-1-1", exported)

    def test_export_translation_allows_clean_table_text_for_trailing_source_spaces(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# Top Award \n\n中文段落。\n", encoding="utf-8")
            manifest = scan_translation(root)

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertIn("# Top Award ", exported)

    def test_export_translation_preserves_trailing_space_on_final_line(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("正文。\n\n[^1]: 注释正文 ", encoding="utf-8")
            manifest = scan_translation(root)

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertIn("[^1]: 注释正文 \n^bid-2", exported)

    def test_export_translation_rejects_source_text_mismatch(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("# 第一章\n\n中文段落。\n", encoding="utf-8")
            manifest = scan_translation(root)
            text_segment = next(item for item in manifest["segments"] if item["block_type"] == "文本")
            text_segment["source"] = "被改坏的源文本"

            with self.assertRaisesRegex(ValueError, "book.md:3"):
                export_translation(manifest)

    def test_export_translation_preserves_heading_marker_for_translated_heading(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "book.md").write_text("## 第一章\n\n中文段落。\n", encoding="utf-8")
            manifest = scan_translation(root)
            heading_segment = next(item for item in manifest["segments"] if item["block_type"] == "标题")
            heading_segment["translation"] = "Chapter One"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "book.md").read_text(encoding="utf-8")

            self.assertIn("## Chapter One", exported)
            self.assertNotIn("## 第一章", exported)

    def test_export_translation_preserves_quote_prefix_for_translated_figure_title(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "figure.md").write_text(
                ">Figure 1. 图题\n>>A. 子图标题\npanel-a-source\nPanel note.\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            figure_title = next(item for item in manifest["segments"] if item["line_no"] == 1)
            panel_title = next(item for item in manifest["segments"] if item["line_no"] == 2)
            figure_title["translation"] = "Figure 1. Figure title"
            panel_title["translation"] = "A. Panel title"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "figure.md").read_text(encoding="utf-8")

            self.assertIn(">Figure 1. Figure title", exported)
            self.assertIn(">>A. Panel title", exported)

    def test_export_translation_normalizes_quote_prefix_for_translated_structural_blocks(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "figure.md").write_text(
                ">Figure 1. 图题\n>>A. 子图标题\n![image](imgs/a.jpg)\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            figure_title = next(item for item in manifest["segments"] if item["line_no"] == 1)
            panel_title = next(item for item in manifest["segments"] if item["line_no"] == 2)
            figure_title["translation"] = ">>Figure 1. Figure title"
            panel_title["translation"] = ">A. Panel title"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "figure.md").read_text(encoding="utf-8")

            self.assertIn(">Figure 1. Figure title", exported)
            self.assertIn(">>A. Panel title", exported)
            self.assertNotIn(">>>", exported)

    def test_export_translation_preserves_callout_prefix_for_translated_table_title(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "table.md").write_text(
                ">[! ds]- Table 1. 表题\n><table><tr><td>A</td></tr></table>\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            table_title = next(item for item in manifest["segments"] if item["block_type"] == "表题")
            table_title["translation"] = "Table 1. Table title"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "table.md").read_text(encoding="utf-8")

            self.assertIn(">[! ds]- Table 1. Table title", exported)

    def test_export_translation_preserves_footnote_marker_for_translated_body(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "notes.md").write_text("正文。\n\n[^10]: 中文注释正文\n", encoding="utf-8")
            manifest = scan_translation(root)
            footnote = next(item for item in manifest["segments"] if item["block_type"] == "注释正文")
            footnote["translation"] = "Translated note body."

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "notes.md").read_text(encoding="utf-8")

            self.assertIn("[^10]: Translated note body.", exported)
            self.assertNotIn("[^10]: 中文注释正文", exported)

    def test_export_translation_replaces_one_sentence_in_table_note(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "notes.md").write_text(
                ">[! ds]- Table 1. Table title\n><table><tr><td>A</td></tr></table>\n>Notes: First note. Second note.\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            note = next(item for item in manifest["segments"] if item["block_type"] == "表注" and item["sentence_no"] == 2)
            note["translation"] = "第二句表注。"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "notes.md").read_text(encoding="utf-8")

            self.assertIn(">Notes: First note. 第二句表注。", exported)

    def test_export_translation_normalizes_quote_prefix_for_translated_sentence_rows(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            (root / "output" / "notes.md").write_text(
                ">[! ds]- Table 1. Table title\n"
                "><table><tr><td>A</td></tr></table>\n"
                ">Notes: First note. Second note. Third note.\n",
                encoding="utf-8",
            )
            manifest = scan_translation(root)
            notes = [item for item in manifest["segments"] if item["block_type"] == "表注"]
            notes[0]["translation"] = ">第一句。"
            notes[1]["translation"] = ">第二句。"
            notes[2]["translation"] = ">>第三句。"

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "notes.md").read_text(encoding="utf-8")

            self.assertIn(">第一句。 第二句。 第三句。\n", exported)
            self.assertNotIn(">>", exported)

    def test_table_note_sentence_split_preserves_trailing_source_space(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            (root / "output").mkdir()
            original = (
                ">[! ds]- Table 1. Table title\n"
                "><table><tr><td>A</td></tr></table>\n"
                ">Notes: First note. Second note. \n"
            )
            (root / "output" / "notes.md").write_text(original, encoding="utf-8")
            manifest = scan_translation(root)
            notes = [item for item in manifest["segments"] if item["block_type"] == "表注"]

            export_translation(manifest)
            exported = (root / "output_translated" / "trans" / "notes.md").read_text(encoding="utf-8")

            self.assertEqual("".join(item["source"] for item in notes), "Notes: First note. Second note. ")
            self.assertIn(">Notes: First note. Second note. \n", exported)


if __name__ == "__main__":
    unittest.main()
