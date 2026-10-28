#!/usr/bin/env python3
"""Negative/positive regression for the common internal/external AM report."""
import importlib.util
import json
import sqlite3
import sys
import tempfile
from pathlib import Path
import unittest

ROOT=Path(__file__).resolve().parents[2]
spec=importlib.util.spec_from_file_location('standard_am',ROOT/'tests/am/standard_audit.py')
mod=importlib.util.module_from_spec(spec)
sys.modules['standard_am']=mod
spec.loader.exec_module(mod)

class StandardAuditTests(unittest.TestCase):
    def test_runtime_inventory_finds_unregistered_legacy_listener(self):
        with tempfile.TemporaryDirectory() as tmp:
            directory=Path(tmp)
            (directory/'probe.js').write_text("document.dispatchEvent(new CustomEvent('ocr2md:approved'));\n"
                "document.addEventListener('ocr2md:unregistered', listener);\n"
                "viewStore.subscribe(handler);\n")
            original=mod.ROOT
            try:
                mod.ROOT=directory
                events,surfaces=mod.discover_surfaces(directory,{'ocr2md:approved'})
            finally:mod.ROOT=original
            self.assertEqual([(x['topic'],x['registered']) for x in events],
                [('ocr2md:approved',True),('ocr2md:unregistered',False)])
            self.assertEqual(len(surfaces),1)

    def test_evidence_does_not_mislabel_integration_as_direct(self):
        with tempfile.TemporaryDirectory() as tmp:
            db=Path(tmp)/'cases.sqlite'
            con=sqlite3.connect(db)
            con.executescript((ROOT/'tests/am/schema.sql').read_text())
            con.executescript((ROOT/'tests/am/registry.sql').read_text())
            con.commit();con.close()
            report=mod.evidence(db,'0'*40)
            self.assertEqual(report['status'],'INCOMPLETE')
            self.assertGreater(report['apis_total'],0)
            self.assertGreater(report['integration_case_links'],report['direct_case_links'])
            self.assertEqual(report['api_directly_tested'],0)

    def test_blocked_report_retains_source_and_manual_review(self):
        with tempfile.TemporaryDirectory() as tmp:
            sha=mod.git('rev-parse','HEAD')[1]
            out=Path(tmp)
            status=mod.make_report(sha,2,out,None)
            self.assertEqual(status,'BLOCKED')
            doc=json.loads((out/'report.json').read_text())
            self.assertEqual(doc['source_sha'],sha)
            self.assertFalse(doc['boundary']['runtime_exhaustive_proof'])
            self.assertIn('AM_RESULTS_INCOMPLETE',doc['failures'])
            self.assertEqual(doc['auditor_signoff']['decision'],'NOT_SIGNED')
            self.assertTrue((out/'report.md').is_file())

if __name__=='__main__':unittest.main(verbosity=2)
