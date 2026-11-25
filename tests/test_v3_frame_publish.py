"""Isolated unit tests for scripts/v3_frame_publish.py."""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'scripts'))
import v3_frame_publish as pub


def sha(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


class V3FramePublishTest(unittest.TestCase):
    def test_publish_inserts_and_updates_only_v3_preserving_v2(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            repo = base / 'repo'
            release = base / 'release'
            repo.mkdir()
            release.mkdir()

            # Initialize a tiny clean git repo for HEAD commit verification.
            subprocess.run(['git', 'init', '-q'], cwd=repo, check=True)
            subprocess.run(['git', 'config', 'user.email', 'test@example.com'], cwd=repo, check=True)
            subprocess.run(['git', 'config', 'user.name', 'Test'], cwd=repo, check=True)
            (repo / 'README.md').write_text('# v3\n', encoding='utf-8')
            subprocess.run(['git', 'add', 'README.md'], cwd=repo, check=True)
            subprocess.run(['git', 'commit', '-q', '-m', 'init'], cwd=repo, check=True)
            head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()

            # Build dist inside gitignored-like untracked? Wait: check clean tree -> ignore dist.
            (repo / '.gitignore').write_text('labs/lab-ocr-v3/dist/\n', encoding='utf-8')
            subprocess.run(['git', 'add', '.gitignore'], cwd=repo, check=True)
            subprocess.run(['git', 'commit', '-q', '-m', 'ignore dist'], cwd=repo, check=True)
            head = subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=repo, text=True).strip()

            # Create fake sibling published V2 module in release/
            v2_dir = release / 'lab-ocr-v2'
            v2_dir.mkdir()
            v2_index = b'<main>v2-untouched</main>'
            (v2_dir / 'index.html').write_bytes(v2_index)
            home_html = (
                '<!doctype html><html><body><section class="cards">\n'
                '      <article id="lab-ocr-v2"><p>v2</p></article>\n'
                '    </section></body></html>\n'
            ).encode('utf-8')
            (release / 'index.html').write_bytes(home_html)
            manifest = {
                'schema': 'ocr2md-lab-unified-release/v1',
                'releaseId': '0' * 64,
                'homeSha256': sha(home_html),
                'modules': {
                    'lab-ocr-v2': {
                        'name': 'lab-ocr-v2',
                        'sourceCommit': 'b' * 40,
                        'version': 'v2-test',
                        'assetCount': 1,
                        'bytes': len(v2_index),
                        'files': {'index.html': sha(v2_index)},
                    }
                },
            }
            (release / 'release-manifest.json').write_text(json.dumps(manifest), encoding='utf-8')

            # Create fake built V3 dist
            dist = repo / 'labs/lab-ocr-v3/dist'
            dist.mkdir(parents=True)
            (dist / 'index.html').write_bytes(b'<main>v3-shell</main>')
            (dist / 'release-version.json').write_text(
                json.dumps({'schema': 'ocr2md-frame/v1', 'name': 'lab-ocr-v3', 'version': 'v3-1', 'commit': head}) + '\n',
                encoding='utf-8',
            )

            # First publish: inserts card
            out1 = pub.publish_v3(release, repository=repo, run_gates=False)
            self.assertIn('lab-ocr-v3', out1['modules'])
            self.assertIn('lab-ocr-v2', out1['modules'])
            self.assertEqual((v2_dir / 'index.html').read_bytes(), v2_index)
            html1 = (release / 'index.html').read_text(encoding='utf-8')
            self.assertEqual(html1.count('<article id="lab-ocr-v3">'), 1)
            self.assertEqual(html1.count('<article id="lab-ocr-v2">'), 1)
            stamped = json.loads((release / 'lab-ocr-v3/release-version.json').read_text(encoding='utf-8'))
            self.assertEqual(stamped['publishDirectory'], str((release / 'lab-ocr-v3').absolute()))

            # Second publish: replaces card idempotently without duplicating
            (dist / 'release-version.json').write_text(
                json.dumps({'schema': 'ocr2md-frame/v1', 'name': 'lab-ocr-v3', 'version': 'v3-2', 'commit': head}) + '\n',
                encoding='utf-8',
            )
            out2 = pub.publish_v3(release, repository=repo, run_gates=False)
            self.assertEqual(out2['modules']['lab-ocr-v3']['version'], 'v3-2')
            html2 = (release / 'index.html').read_text(encoding='utf-8')
            self.assertEqual(html2.count('<article id="lab-ocr-v3">'), 1)
            self.assertEqual((v2_dir / 'index.html').read_bytes(), v2_index)


if __name__ == '__main__':
    unittest.main()
