"""Audited PDF offset proof. Run on the real Confessions inputs, read-only."""
import json
import tempfile
import unittest
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from mineru_pdf_attachment import (
    enrich_pdf_audit,
    original_pdf,
    original_pdf_page_count,
    pdf_chunk_offsets,
)


class MineruOriginalPdfTests(unittest.TestCase):
    def setUp(self):
        vault = (
            Path.home()
            / "Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md"
        )
        self.root = next(
            p for p in vault.iterdir()
            if p.is_dir() and p.name.startswith("忏悔录 (")
        )

    def test_real_359_page_attachment_and_chunk_offsets(self):
        pdf = original_pdf(self.root)
        self.assertIsNotNone(pdf)
        self.assertEqual(original_pdf_page_count(pdf), 359)
        segments = pdf_chunk_offsets(self.root, 359)
        self.assertIsNotNone(segments)
        self.assertEqual([entry[0] for entry in segments.values()], [0, 200])
        self.assertEqual([entry[1] for entry in segments.values()], [200, 159])
        payload = {"entries": [
            {"documentKey": k, "pageIndex": 0}
            for k in segments
        ] + [
            {"documentKey": list(segments)[1], "pageIndex": 158}
        ]}
        result = enrich_pdf_audit(self.root, payload)
        self.assertTrue(result["pdfAttachment"]["available"])
        self.assertEqual(
            [entry["pdfPageNumber"] for entry in payload["entries"]],
            [1, 201, 359],
        )
        self.assertIsNone(pdf_chunk_offsets(self.root, 360))

    def test_ambiguous_and_invalid_source_fail_closed(self):
        with tempfile.TemporaryDirectory(prefix="ocr2md-pdf-test-") as tmp:
            root = Path(tmp)
            (root / "json").mkdir()
            # No PDF: no automatic page locator.
            file1 = root / "json" / "01 part.json"
            file1.write_text(json.dumps({
                "pdf_info": [{"page_idx": 0}, {"page_idx": 1}],
            }))
            file2 = root / "json" / "02 part.json"
            file2.write_text(json.dumps({
                "pdf_info": [{"page_idx": 0}],
            }))
            self.assertEqual(list(pdf_chunk_offsets(root, 3).values()), [(0, 2), (2, 1)])
            self.assertIsNone(pdf_chunk_offsets(root, 4))
            file2.write_text(json.dumps({"pdf_info": [{"page_idx": 3}]}))
            self.assertIsNone(pdf_chunk_offsets(root, 3))
            file2.write_text(json.dumps({"pdf_info": [{"page_idx": 0}]}))
            file2.rename(root / "json" / "unnumbered.json")
            self.assertIsNone(pdf_chunk_offsets(root, 3))
            self.assertIsNone(original_pdf(root))
            (root / "first.pdf").write_bytes(b"%PDF- fake")
            (root / "second.pdf").write_bytes(b"%PDF- fake")
            self.assertIsNone(original_pdf(root), "multiple PDFs must never be guessed")
            (root / "second.pdf").unlink()
            self.assertEqual(original_pdf(root).name, "first.pdf")


if __name__ == "__main__":
    unittest.main()
