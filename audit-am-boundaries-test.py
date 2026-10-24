#!/usr/bin/env python3
"""WP2 review gate regression using ephemeral in-memory source changes."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('wp2_am',ROOT/'audit-am-boundaries.py')
mod=importlib.util.module_from_spec(spec)
sys.modules['wp2_am']=mod
spec.loader.exec_module(mod)
CAT=json.loads((ROOT/'audit-am-ownership.json').read_text())

class GateTests(unittest.TestCase):
    def modified(self,file,addition):
        body=(ROOT/'ui'/file).read_text()+'\n'+addition+'\n'
        return mod.scan_files(ROOT,CAT,{file:body})[1]

    def test_baseline(self):
        stats,issues=mod.scan_files(ROOT,CAT)
        self.assertEqual(issues,[])
        self.assertEqual((stats['ui_js'],stats['modules'],stats['cross_module_imports']),(27,7,14))

    def test_new_cross_module_import(self):
        issues=self.modified('outline-grid.js','import {createLatexModule} from "./latex-module.js";')
        self.assertTrue(any('UNREGISTERED_MODULE_IMPORT' in issue for issue in issues))

    def test_shared_consumer_review(self):
        issues=self.modified('markdown-preview.js','import {viewStore} from "./view-store.js";')
        self.assertTrue(any('UNAPPROVED_SHARED_CONSUMER' in issue for issue in issues))

    def test_computed_import(self):
        issues=self.modified('workspace.js','void import(variablePath);')
        self.assertTrue(any('UNRESOLVED_DYNAMIC_IMPORT' in issue for issue in issues))

    def test_new_raw_store_write(self):
        issues=self.modified('media-module.js','viewStore.setState({activePanel: "new"});')
        self.assertTrue(any('UNTRACKED_DIRECT_STORE_WRITE' in issue for issue in issues))

    def test_missing_edge_registration(self):
        original=mod.load_registry
        try:
            def altered(root):
                modules,edges=original(root)
                return modules,{e for e in edges if e!=('G','C','ui/chapter-markers.js')}
            mod.load_registry=altered
            _,issues=mod.scan_files(ROOT,CAT)
            self.assertTrue(any('UNREGISTERED_MODULE_IMPORT' in issue for issue in issues))
        finally:
            mod.load_registry=original

    def test_new_symbol_hidden_behind_known_module_pair(self):
        issues=self.modified('workspace.js','import {unsafePanel} from "./pdf-preview.js";')
        self.assertTrue(any('UNAPPROVED_CROSS_SYMBOL' in issue for issue in issues))

    def test_bad_owner(self):
        cat=json.loads(json.dumps(CAT))
        cat['files']['outline-grid.js']='T'
        _,issues=mod.scan_files(ROOT,cat)
        self.assertTrue(any('MODULE_OWNER_MISMATCH' in issue for issue in issues))

    def test_missing_literal_target(self):
        issues=self.modified('main.js',"void import('./unlisted-file.js');")
        self.assertTrue(any('MISSING_IMPORT_TARGET' in issue for issue in issues))

if __name__=='__main__':unittest.main(verbosity=2)
