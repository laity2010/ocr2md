"""WP4: real Git-object changes, no edits to Main, production or test files.

Each fixture is a genuine child commit made with a disposable alternate index.
The HEAD, branches and working tree do not move; only Git objects are written.
"""
import importlib.util
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]
spec = importlib.util.spec_from_file_location('am_incremental_fixture',
                                               ROOT / 'tests/am/am.py')
am = importlib.util.module_from_spec(spec)
spec.loader.exec_module(am)
BASE = '81091330da5fa17a607652115cd1052cd60a9955'


def git(*args, stdin=None, env=None):
    proc = subprocess.run(['git', *args], cwd=ROOT, env=env, input=stdin,
                          text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    if proc.returncode:
        raise AssertionError(f'Git failed: {args} {proc.stderr}')
    return proc.stdout.strip()


class IncrementalGitTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.parent = git('rev-parse', 'HEAD')

    def fake_git_commit(self, path):
        """Create a real child commit differing in one owned file only."""
        content = git('show', f'{self.parent}:{path}') + '\n// WP4 disposable Git-only fixture\n'
        with tempfile.TemporaryDirectory(prefix='ocr2md-am-index-') as folder:
            env = dict(os.environ,
                       GIT_INDEX_FILE=str(Path(folder) / 'index'),
                       GIT_AUTHOR_NAME='AM fixture', GIT_AUTHOR_EMAIL='fixture@example.invalid',
                       GIT_COMMITTER_NAME='AM fixture', GIT_COMMITTER_EMAIL='fixture@example.invalid')
            git('read-tree', self.parent, env=env)
            blob = git('hash-object', '-w', '--stdin', stdin=content, env=env)
            git('update-index', '--add', '--cacheinfo', '100644', blob, path, env=env)
            tree = git('write-tree', env=env)
            return git('commit-tree', tree, '-p', self.parent, '-m', f'WP4 fixture {path}',env=env)

    def test_latex_change_keeps_media_verified(self):
        synthetic = self.fake_git_commit('ui/latex-module.js')
        plan = am.incremental_plan(BASE, synthetic)
        self.assertEqual(plan['changed_modules'], ['T'])
        self.assertEqual(plan['media'], 'INHERITED_PASS')
        self.assertEqual(plan['media_interaction'], 'UNCHANGED')
        self.assertEqual([path for path in plan['changed'] if path.startswith('ui/')],
                         ['ui/latex-module.js'])
        print('WP4_LATEX_CHANGED_MEDIA_INHERITED',synthetic[:12])

    def test_media_change_requires_retest(self):
        synthetic = self.fake_git_commit('ui/media-module.js')
        plan = am.incremental_plan(BASE, synthetic)
        self.assertEqual(plan['changed_modules'], ['A'])
        self.assertEqual(plan['media'], 'RETEST_REQUIRED')
        print('WP4_MEDIA_CHANGED_RETEST_REQUIRED',synthetic[:12])

    def test_cmd_port_change_requires_interaction_not_media_retest(self):
        synthetic = self.fake_git_commit('ui/wcp-cmd-element-transactions.js')
        plan = am.incremental_plan(BASE, synthetic)
        self.assertEqual(plan['changed_modules'], ['C'])
        self.assertEqual(plan['media'], 'INHERITED_PASS')
        self.assertEqual(plan['media_interaction'], 'REVIEW_REQUIRED')
        self.assertIn('ui/wcp-cmd-element-transactions.js',plan['interaction_paths'])
        print('WP4_CMD_CHANGED_MEDIA_INHERITED_INTERACTION_REVIEW',synthetic[:12])

    def test_media_public_contract_test_edit_invalidates_old_pass(self):
        synthetic = self.fake_git_commit('tests/media-public-contract.browser.test.mjs')
        plan = am.incremental_plan(BASE, synthetic)
        self.assertEqual(plan['media'], 'RETEST_REQUIRED')

    def test_unverified_old_snapshot_never_inherits_pass(self):
        plan = am.incremental_plan('9c47e44f1fc6b44b4f126030d68008854aced6ca',self.parent)
        self.assertEqual(plan['media'], 'NO_VERIFIED_BASELINE')

    def test_unmodified_media_inherits_baseline_without_running_tests(self):
        plan = am.incremental_plan(BASE, self.parent)
        self.assertEqual(plan['media'], 'INHERITED_PASS')
        self.assertTrue(plan['baseline_valid'])

    def test_stale_pass_receipt_cannot_certify_changed_media_commit(self):
        synthetic = self.fake_git_commit('ui/media-module.js')
        # The synthetic source hash differs from the historical PASS receipt.
        # It must not be treated as a NEW certified baseline just because its
        # inherited documentation still contains old PASS log lines.
        plan = am.incremental_plan(synthetic, synthetic)
        self.assertEqual(plan['media'], 'NO_VERIFIED_BASELINE')
        self.assertFalse(plan['baseline_valid'])


if __name__=='__main__':
    unittest.main()
