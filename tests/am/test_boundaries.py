#!/usr/bin/env python3
"""WP2 review gate regression using ephemeral in-memory source changes."""
import importlib.util
import json
from pathlib import Path
import sys
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('wp2_am',ROOT/'tests/am/audit_boundaries.py')
mod=importlib.util.module_from_spec(spec)
sys.modules['wp2_am']=mod
spec.loader.exec_module(mod)
CAT=json.loads((ROOT/'tests/am/ownership.json').read_text())

class GateTests(unittest.TestCase):
    def modified(self,file,addition):
        body=(ROOT/'ui'/file).read_text()+'\n'+addition+'\n'
        return mod.scan_files(ROOT,CAT,{file:body})[1]

    def test_baseline(self):
        stats,issues=mod.scan_files(ROOT,CAT)
        self.assertEqual(issues,[])
        self.assertEqual((stats['ui_js'],stats['modules'],stats['cross_module_imports']),(63,12,38))

    def test_undeclared_semantic_event_publisher(self):
        issues=self.modified('outline-grid.js',
            "document.dispatchEvent(new CustomEvent('ocr2md:undeclared-topic',{detail:{}}));")
        self.assertTrue(any('UNREGISTERED_DOM_PUBLISH' in issue for issue in issues))

    def test_unregistered_settings_subscription(self):
        issues=self.modified('cm-font-setting.js',"settings.subscribe({module:'C',key:'x.y'},()=>{});")
        self.assertFalse(any('SETTINGS' in i for i in issues),issues)
        issues=self.modified('wcp-workspace-directory-module.js',
            "settings.subscribe({module:'L',key:'globalUi.x'},()=>{});")
        self.assertTrue(any('UNREGISTERED_SETTINGS_SUBSCRIPTION' in i for i in issues),issues)

    def test_navigation_font_subscription_module(self):
        path=ROOT/'ui/wcp-navigation-select.js'
        body=path.read_text(encoding='utf-8').replace("module:'L'","module:'N'")
        _,issues=mod.scan_files(ROOT,CAT,{'wcp-navigation-select.js':body})
        self.assertTrue(any('UNREGISTERED_SETTINGS_SUBSCRIPTION wcp-navigation-select.js module=N' in i for i in issues),issues)
        self.assertTrue(any('STALE_SETTINGS_SUBSCRIPTION wcp-navigation-select.js module=L' in i for i in issues),issues)

    def test_settings_subscribe_wrong_owner(self):
        path=ROOT/'ui/outline-grid.js'
        body=path.read_text(encoding='utf-8').replace("settings.subscribe({module:'G'","settings.subscribe({module:'C'")
        _,issues=mod.scan_files(ROOT,CAT,{'outline-grid.js':body})
        self.assertTrue(any('SETTINGS_SUBSCRIBE_WRONG_MODULE outline-grid.js(G) module=C' in i for i in issues),issues)

    def test_retired_semantic_event_subscription(self):
        issues=self.modified('wcp-ag-module-toolbar.js',
            "document.addEventListener('ocr2md:lab-file-activated',()=>{});")
        self.assertTrue(any('UNREGISTERED_DOM_SUBSCRIBE' in issue for issue in issues))

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

    def test_absolute_path_import(self):
        issues=self.modified('outline-grid.js','import {createLatexModule} from "/ui/latex-module.js";')
        self.assertTrue(any('ABSOLUTE_OR_URL_IMPORT' in issue for issue in issues))

    def test_url_import(self):
        issues=self.modified('outline-grid.js','import "http://127.0.0.1:4710/ui/latex-module.js";')
        self.assertTrue(any('ABSOLUTE_OR_URL_IMPORT' in issue for issue in issues))

    def test_functional_store_write(self):
        issues=self.modified('media-module.js','viewStore.setState(s=>({activePanel: "new"}));')
        self.assertTrue(any('UNTRACKED_FUNCTIONAL_STORE_WRITE' in issue for issue in issues))

    def test_functional_store_write_variable(self):
        issues=self.modified('media-module.js','viewStore.setState(updater);')
        self.assertTrue(any('UNTRACKED_FUNCTIONAL_STORE_WRITE' in issue for issue in issues))

if __name__=='__main__':unittest.main(verbosity=2)
