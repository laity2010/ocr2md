"""Executable proof that an added V3 does not require an edited Lab name list."""
from __future__ import annotations
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from verify_unified_layout import check_core, check_full


def run(*args):
    return subprocess.run(args,check=True,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)


class DynamicWorktreeLayoutTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory(prefix='ocr2md-constitution-fixture-')
        self.root=Path(self.tmp.name)/'ocr2md'
        self.root.mkdir()
        for n in ['main','labs','release','archive']:
            (self.root/n).mkdir()
        self.agent=self.root/'AGENTS.md'
        self.agent.write_text('## 10. 联邦 / 州宪法继承与同级联邦契约\n`BUILD.md` `COMM.md` `GIT.md` 州宪法\n')
        self.build=self.root/'BUILD.md'
        self.build.write_text('# Build\n一构建一 Git、偏离就回退\n')
        self.comm=self.root/'COMM.md'
        self.comm.write_text('# Common UI\nEnumCheckboxFilter\n')
        (self.root/'main/constitution').mkdir()
        os.link(self.agent,self.root/'main/constitution/AGENTS.md')
        (self.root/'GIT.md').write_text('# Federal Git contract\n')
        for name in ('BUILD.md','COMM.md','GIT.md'):
            os.link(self.root/name,self.root/'main'/name)
        self.write_state(self.root/'main','../')
        for folder in (self.root,self.root/'main'):
            (folder/'CROSS_VERSION_COMPONENTS.md').symlink_to('COMM.md')
        self.initialize_tree(self.root/'main')
        self.make_lab('lab-ocr')
    def tearDown(self):self.tmp.cleanup()
    def initialize_tree(self,folder):
        (folder/'README.md').write_text('# Valid scoped README\n')
        run('git','init','-q',str(folder))
        run('git','-C',str(folder),'-c','user.name=Fixture','-c',
            'user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture')
    def write_state(self,tree,prefix):
        (tree/'AGENTS.md').write_text(
            '# State constitution\n'
            f'<!-- ocr2md:state-constitution:v1 federal={prefix}AGENTS.md '
            f'build={prefix}BUILD.md comm={prefix}COMM.md -->\n'
            '州规定不得覆盖联邦宪法，只能细化本州实施。\n')
    def make_lab(self,name):
        target=self.root/'labs'/name
        target.mkdir()
        self.write_state(target,'../../')
        self.initialize_tree(target)
        return target
    def test_new_v3_auto_discovery_without_fixed_lab_list(self):
        self.make_lab('lab-ocr-v2')
        self.make_lab('lab-ocr-v3')
        labs=check_core(self.root)
        self.assertEqual([p.name for p in labs],['lab-ocr','lab-ocr-v2','lab-ocr-v3'])
        (self.root/'release/lab-ocr').mkdir()
        artifact=self.root/'release/lab-ocr/index.html'
        artifact.write_text('fixture')
        (self.root/'release/release-manifest.json').write_text(json.dumps({
            'modules':{'lab-ocr':{'files':{'index.html':hashlib.sha256(artifact.read_bytes()).hexdigest()},
                      'assetCount':1}}
        }))
        # V3 can exist before publication; only published Labs must match.
        check_full(self.root,labs)
    def test_state_agents_hardlink_to_federal_is_rejected(self):
        lab=self.root/'labs/lab-ocr/AGENTS.md'
        lab.unlink();os.link(self.agent,lab)
        with self.assertRaisesRegex(AssertionError,'independent from federal'):
            check_core(self.root)
    def test_states_must_not_share_inode(self):
        second=self.make_lab('lab-ocr-v2')
        lab=self.root/'labs/lab-ocr/AGENTS.md'
        second_agent=second/'AGENTS.md'
        second_agent.unlink();os.link(lab,second_agent)
        with self.assertRaisesRegex(AssertionError,'share inode with another state'):
            check_core(self.root)
    def test_main_state_must_be_independent(self):
        main_state=self.root/'main/AGENTS.md'
        main_state.unlink();os.link(self.agent,main_state)
        with self.assertRaisesRegex(AssertionError,'independent from federal'):
            check_core(self.root)
    def test_absent_state_federal_reference_is_rejected(self):
        lab=self.root/'labs/lab-ocr/AGENTS.md'
        lab.write_text('# State constitution\nNo inherited declaration\n')
        with self.assertRaisesRegex(AssertionError,'missing federal inheritance declaration'):
            check_core(self.root)
    def test_wrong_state_federal_relative_reference_is_rejected(self):
        lab=self.root/'labs/lab-ocr/AGENTS.md'
        lab.write_text(lab.read_text().replace('federal=../../AGENTS.md','federal=../AGENTS.md'))
        with self.assertRaisesRegex(AssertionError,'missing federal inheritance declaration'):
            check_core(self.root)
    def test_missing_current_lab_readme_is_rejected(self):
        (self.root/'labs/lab-ocr/README.md').unlink()
        with self.assertRaisesRegex(AssertionError,'missing project README'):
            check_core(self.root)
    def test_missing_shared_build_contract_fails_closed(self):
        self.build.unlink()
        with self.assertRaisesRegex(AssertionError,'missing or linked-to-symlink contract'):
            check_core(self.root)
    def test_missing_shared_components_contract_fails_closed(self):
        self.comm.unlink()
        with self.assertRaisesRegex(AssertionError,'missing or linked-to-symlink contract'):
            check_core(self.root)
    def test_missing_shared_git_contract_is_rejected(self):
        (self.root/'GIT.md').unlink()
        with self.assertRaisesRegex(AssertionError,'missing or linked-to-symlink contract'):
            check_core(self.root)
    def test_detached_main_git_contract_inode_is_rejected(self):
        p=self.root/'main/GIT.md';p.unlink();p.write_text((self.root/'GIT.md').read_text())
        with self.assertRaisesRegex(AssertionError,'not the shared federal contract inode'):
            check_core(self.root)
    def test_detached_main_build_inode_is_rejected(self):
        original=self.root/'main/BUILD.md'
        original.unlink();original.write_text(self.build.read_text())
        with self.assertRaisesRegex(AssertionError,'not the shared federal contract inode'):
            check_core(self.root)
    def test_legacy_alias_must_point_to_comm(self):
        old=self.root/'CROSS_VERSION_COMPONENTS.md'
        old.unlink();old.symlink_to('BUILD.md')
        with self.assertRaisesRegex(AssertionError,'legacy components alias'):
            check_core(self.root)
    def test_constitution_must_register_both_peers(self):
        self.agent.write_text('## 10. 联邦 / 州宪法继承与同级联邦契约\nCOMM only\n')
        with self.assertRaisesRegex(AssertionError,'does not register'):
            check_core(self.root)
    def test_missing_git_tracked_federal_copy_fails(self):
        (self.root/'main/constitution/AGENTS.md').unlink()
        with self.assertRaisesRegex(AssertionError,'missing or linked-to-symlink federal constitution'):
            check_core(self.root)
    def test_build_contract_cannot_omit_rollback_policy(self):
        self.build.write_text('only commit code, no rollback agreement\n')
        with self.assertRaisesRegex(AssertionError,'one-build-one-Git'):
            check_core(self.root)
    def test_modified_release_file_fails_while_ds_store_ignored(self):
        labs=check_core(self.root)
        published=self.root/'release/lab-ocr'
        published.mkdir()
        asset=published/'index.html';asset.write_text('original')
        original=hashlib.sha256(asset.read_bytes()).hexdigest()
        (self.root/'release/release-manifest.json').write_text(json.dumps({
            'modules':{'lab-ocr':{'files':{'index.html':original},'assetCount':1}}
        }))
        (published/'.DS_Store').write_text('metadata')
        check_full(self.root,labs)
        asset.write_text('tampered')
        with self.assertRaisesRegex(AssertionError,'checksum mismatch'):
            check_full(self.root,labs)


if __name__=='__main__':unittest.main()
