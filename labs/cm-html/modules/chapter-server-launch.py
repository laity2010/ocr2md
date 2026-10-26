#!/usr/bin/env python3
"""Lab-only V6 server entry. Reuses the same V6 HTTP + chapter storage core.

Deployed to labs/cm-html/.runtime/chapter-server.py. No production server
changes, no second backend implementation, and no access to formal V6 data.
"""
import os
from pathlib import Path
import re
import runpy
import sys

ROOT = Path(__file__).resolve().parents[3]
SCRIPTS = ROOT / 'scripts'
if not (SCRIPTS / 'v6_serve.py').is_file():
    raise RuntimeError('Missing shared mainline V6 server')
sys.path.insert(0, str(SCRIPTS))
import v6_chapters  # noqa: E402

# v6_chapters reads these two names at runtime; retaining its export,
# validation, atomic staging, hashing and manifest implementation unchanged.
v6_chapters.chapter_dir = lambda document: Path(document).parent / 'chapter'
v6_chapters.CHAPTER_NAME = re.compile(r'[0-9]{1,6}-[\w-]{1,110}\.cmd\.chapter\.md')
os.environ['V6_LAB_ID'] = 'cm-html'
runpy.run_path(str(SCRIPTS / 'v6_serve.py'), run_name='__main__')
