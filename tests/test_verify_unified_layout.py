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
        self.agent.write_text('## 10. 同级工程规范文件目录与职责\n')
        self.spec=self.root/'CROSS_VERSION_COMPONENTS.md'
        self.spec.write_text('# Cross version\nEnumCheckboxFilter\n')
        os.link(self.agent,self.root/'main/AGENTS.md')
        os.link(self.spec,self.root/'main/CROSS_VERSION_COMPONENTS.md')
        self.initialize_tree(self.root/'main')
        self.make_lab('lab-ocr')
    def tearDown(self):self.tmp.cleanup()
    def initialize_tree(self,folder):
        (folder/'README.md').write_text('# Valid scoped README\n')
        run('git','init','-q',str(folder))
        run('git','-C',str(folder),'-c','user.name=Fixture','-c',
            'user.email=fixture@example.invalid','commit','--allow-empty','-qm','fixture')
    def make_lab(self,name):
        target=self.root/'labs'/name
        target.mkdir()
        os.link(self.agent,target/'AGENTS.md')
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
    def test_renaming_agent_into_independent_copy_is_rejected(self):
        lab=self.root/'labs/lab-ocr/AGENTS.md'
        lab.unlink();lab.write_text(self.agent.read_text())
        with self.assertRaisesRegex(AssertionError,'separate or missing AGENTS'):
            check_core(self.root)
    def test_missing_current_lab_readme_is_rejected(self):
        (self.root/'labs/lab-ocr/README.md').unlink()
        with self.assertRaisesRegex(AssertionError,'missing project README'):
            check_core(self.root)
    def test_missing_shared_components_contract_fails_closed(self):
        (self.root/'CROSS_VERSION_COMPONENTS.md').unlink()
        with self.assertRaisesRegex(AssertionError,'missing or linked-to-symlink contract'):
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
