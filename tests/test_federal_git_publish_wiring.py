"""Exercise actual publisher entrypoints against isolated federal Git worktrees.
No live release files or user data are opened or modified.
"""
import importlib.util
import json
from pathlib import Path
import subprocess
import unittest

import test_federal_git_gate as fixture

HOME = Path(__file__).resolve().parents[2]


def module(path):
    spec = importlib.util.spec_from_file_location('federal_gate_fixture_' + path.parent.parent.name, path)
    obj = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(obj)
    return obj


class ActualPublisherWiring(unittest.TestCase):
    def test_actual_adapters_reject_then_allow_before_artifact_validation(self):
        paths = [HOME/'labs'/name/'scripts/v6_frame_publish.py' for name in ('lab-frame','lab-ocr','lab-ocr-v2','lab-pdf')]
        unified_path = HOME/'labs/translation-lab/scripts/v6_lab_unified_publish.py'
        if not all(p.is_file() for p in [*paths,unified_path]):
            self.skipTest('Requires complete unified workspace, not a single checkout')
        f=fixture.FederalGitGateTests('test_success_release_and_dirty_block')
        self.addCleanup(f.doCleanups)
        f.setUp()
        main=module(HOME/'main/scripts/v6_publish.py');main.ROOT=f.main
        # Main's fixture commit is governance / NONE, and the Lab's is legacy.
        main_sha=f.run_git(f.main,'rev-parse','HEAD').stdout.strip()
        never=f.root/'never-published'
        with self.assertRaises(subprocess.CalledProcessError) as bad:
            main.install(f.main/'dist',main_sha)
        self.assertEqual(bad.exception.returncode,2)
        frames=[module(path) for path in paths]
        for obj in frames:
            obj.ROOT=f.lab
            with self.assertRaises(subprocess.CalledProcessError) as bad:
                obj.publish(never)
            self.assertEqual(bad.exception.returncode,2)
        # A realistic ignored dist build for the unified publisher.
        (f.main/'.git/info/exclude').write_text('labs/\n')
        src=f.lab/'labs/translation-lab/dist';src.mkdir(parents=True)
        (src/'index.html').write_text('fixture')
        def version(sha):
            (src/'release-version.json').write_text(json.dumps({'mode':'lab','name':'translation-lab','version':'fixture','baseCommit':sha}))
        u=module(unified_path)
        version(f.base)
        with self.assertRaises(subprocess.CalledProcessError) as bad:
            u.validate_source('translation-lab',src)
        self.assertEqual(bad.exception.returncode,2)
        self.assertFalse(never.exists())
        # PASS / REQUIRED reaches the existing artifact validation; the negative
        # missing-artifact checks prove the adapters do not bypass the old gates.
        f.commit(f.main,'-m',f.message())
        main_sha=f.run_git(f.main,'rev-parse','HEAD').stdout.strip()
        with self.assertRaisesRegex(RuntimeError,'Incomplete V6 output'):
            main.install(f.main/'dist',main_sha)
        f.commit(f.lab,'-m',f.message())
        lab_sha=f.run_git(f.lab,'rev-parse','HEAD').stdout.strip()
        for obj in frames:
            with self.assertRaisesRegex(RuntimeError,'Build .* first'):
                obj.publish(never)
        version(lab_sha)
        self.assertEqual(u.validate_source('translation-lab',src)['sourceCommit'],lab_sha)
        self.assertFalse(never.exists())
        print('FEDERAL_ACTUAL_PUBLISHER_WIRING_PASS',len(frames)+2)

if __name__=='__main__': unittest.main()
