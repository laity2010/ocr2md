#!/usr/bin/env python3
import argparse
import shutil
from pathlib import Path

root = Path(__file__).resolve().parent

parser = argparse.ArgumentParser()
parser.add_argument(
    "--project-dir",
    default=".tmp/persistent-project",
    help="test project directory, relative to ui-spikes/v2 unless absolute",
)
args = parser.parse_args()

project = Path(args.project_dir)
if not project.is_absolute():
    project = root / project
project = project.resolve()
chapters = project / "chapters"

if project.exists():
    shutil.rmtree(project)
chapters.mkdir(parents=True)

fixture_source = (root / "fixtures" / "buffett-alpha" / "source.md").read_text(encoding="utf-8")
fixture_working = (root / "fixtures" / "buffett-alpha" / "working.md").read_text(encoding="utf-8")
fixture_sidecar = root / "fixtures" / "buffett-alpha" / "sidecar.json"

def make_ready(name: str, working_text: str, original_text: str | None = None):
    target = chapters / name
    target.mkdir()
    (target / f"{name}.working.md").write_text(working_text, encoding="utf-8")
    if original_text is not None:
        (target / f"{name}.md").write_text(original_text, encoding="utf-8")
    shutil.copy2(fixture_sidecar, target / f"{name}.ocr2md.json")

def make_incomplete(name: str):
    target = chapters / name
    target.mkdir()
    (target / f"{name}.working.md").write_text(fixture_working, encoding="utf-8")

make_incomplete("00 Incomplete")
make_ready("01 Buffett’s Alpha", fixture_working, fixture_source)
make_ready("02 Appendix A", fixture_working + "\nM2_SECOND_CHAPTER\n")

(project / "OCR_00001.md").write_text(
    "# One\nFirst body.\n",
    encoding="utf-8",
)
(project / "OCR_00002.md").write_text(
    "# Two\nSecond body.\n",
    encoding="utf-8",
)
(project / "OCR_00010.md").write_text(
    "# Three\nThird body.\n",
    encoding="utf-8",
)
(project / "already-split.md").write_text(
    "---\nocr2md_chapter_split: true\n---\n\n# Existing chapter\n",
    encoding="utf-8",
)

print(project)
