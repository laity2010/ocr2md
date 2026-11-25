"""Real Git repository, linked worktree and local bare remote; no product data."""
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest

SOURCE = Path(__file__).resolve().parents[1] / 'constitution'

class FederalGitGateTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='federal-git-gate-fixture-')
        self.addCleanup(self.tmp.cleanup)
        self.root=Path(self.tmp.name)/'ocr2md'; self.root.mkdir()
        self.main=self.root/'main';self.main.mkdir();(self.root/'labs').mkdir()
        self.remote=Path(self.tmp.name)/'remote.git'
        self.run_git(self.main,'init','-q','-b','main')
        self.run_git(self.main,'config','user.name','Gate Test')
        self.run_git(self.main,'config','user.email','fixture@example.invalid')
        self.run_git(self.main,'config','commit.gpgsign','false')
        (self.main/'AGENTS.md').write_text('# State fixture\n')
        self.run_git(self.main,'add','AGENTS.md');self.run_git(self.main,'commit','-qm','historical blank body')
        self.base=self.run_git(self.main,'rev-parse','HEAD').stdout.strip()
        self.run_git(self.main,'init','--bare',str(self.remote))
        self.run_git(self.main,'remote','add','origin',str(self.remote))
        self.run_git(self.main,'push','-q','origin','main')
        self.lab=self.root/'labs'/'fixture';self.run_git(self.main,'worktree','add','-qb','experiment/fixture',str(self.lab))
        shutil.copytree(SOURCE,self.main/'constitution',ignore=shutil.ignore_patterns('__pycache__','AGENTS.md'))
        self.run_git(self.main,'add','constitution')
        self.run_git(self.main,'commit','-m',self.message(release='NONE'))
        self.run_git(self.main,'tag','-a','federal-git-gate-v1','-m','Activation fixture\n\nBaseline: '+self.base)
        self.run_gate('install')
        self.run_git(self.main,'push','origin','main','refs/tags/federal-git-gate-v1')
    def run_git(self,tree,*args,expected=0):
        p=subprocess.run(['git','-C',str(tree),*args],text=True,capture_output=True)
        if expected==0:self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        else:self.assertNotEqual(p.returncode,0,p.stdout+p.stderr)
        return p
    def run_gate(self,*args,expected=0):
        p=subprocess.run([sys.executable,str(self.main/'constitution/git_gate.py'),'--root',str(self.root),*args],text=True,capture_output=True)
        if expected==0:self.assertEqual(p.returncode,0,p.stdout+p.stderr)
        else:self.assertNotEqual(p.returncode,0,p.stdout+p.stderr)
        return p
    def message(self,result='PASS',release='REQUIRED'):
        return ('fixture: scoped change\n\n目标：验证真实 Git hook\n基线：'+self.base+'\n变更：隔离夹具，不改用户数据\n验收：python3 tests fixture，明确记录结果\n结果：'+result+'\n发布：'+release+'\n违宪：无')
    def commit(self,tree,*args,expected=0):return self.run_git(tree,'commit','--allow-empty',*args,expected=expected)
    def test_shared_hooks_reject_empty_and_invalid_body(self):
        for tree in (self.main,self.lab):
            old=self.run_git(tree,'rev-parse','HEAD').stdout
            for msg in ('only title',self.message().replace('验收：python3 tests fixture，明确记录结果','验收：待补'),self.message().replace(self.base,'0'*40),self.message('FAIL','REQUIRED')):
                self.commit(tree,'-m',msg,expected=2)
                self.assertEqual(self.run_git(tree,'rev-parse','HEAD').stdout,old)
        self.commit(self.lab,'-m',self.message());self.run_gate('status')
    def test_push_rechecks_bypassed_commit(self):
        self.commit(self.lab,'--no-verify','-m','bypassed hook')
        self.run_git(self.lab,'push','origin','experiment/fixture',expected=1)
        self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD',expected=2)
    def test_failure_checkpoint_allowed_but_active_push_and_release_blocked(self):
        self.commit(self.lab,'-m',self.message('FAIL','FORBIDDEN'))
        self.run_git(self.lab,'push','origin','HEAD:refs/heads/archive/failed-fixture')
        self.run_git(self.lab,'push','origin','experiment/fixture',expected=1)
        self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD',expected=2)
    def test_success_release_and_dirty_block(self):
        self.commit(self.lab,'-m',self.message());self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD')
        self.run_git(self.lab,'push','origin','experiment/fixture')
        (self.lab/'dirty.txt').write_text('not committed')
        self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD',expected=2)
    def test_old_history_and_governance_not_new_release(self):
        self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD',expected=2)
        self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD','--legacy-rollback')
        self.commit(self.lab,'-m',self.message(release='NONE'))
        self.run_gate('check-release','--tree',str(self.lab),'--commit','HEAD',expected=2)
    def test_notes_sync_exempt_internal_git_commit(self):
        self.run_git(self.lab,'notes','add','-m','real follow-up evidence',self.base)
        self.run_git(self.lab,'push','origin','refs/notes/commits')
    def test_no_force_rewrite_or_delete_active_branch_and_activation(self):
        self.run_git(self.main,'push','origin',':refs/heads/main',expected=1)
        self.run_git(self.main,'push','origin',':refs/tags/federal-git-gate-v1',expected=1)
        self.run_git(self.main,'push','--force','origin',self.base+':refs/heads/main',expected=1)

if __name__=='__main__':unittest.main()
