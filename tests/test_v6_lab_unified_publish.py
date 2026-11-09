import importlib.util
import json
import tempfile
from pathlib import Path
import sys
import unittest
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_lab_unified_publish import validate_source,publish,hash_file,NAMES

class UnifiedPublisherTests(unittest.TestCase):
    def setUp(self):
        self.temp=tempfile.TemporaryDirectory();self.addCleanup(self.temp.cleanup)
        self.base=Path(self.temp.name)
        self.sources={}
        for name in NAMES:
            root=self.base/name
            (root/'.git').mkdir(parents=True)
            # Unit-fixture version checks use a real existing Git repo object,
            # so source version checks can never accept an invented revision.
            (root/'.git/HEAD').write_text('ref: refs/heads/main\n')
            (root/'.git/refs/heads').mkdir(parents=True)
            import subprocess
            known=subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip()
            (root/'.git/refs/heads/main').write_text(known+'\n')
            # fake repo uses alternate-object-dir to reference real objects.
            src=Path(__file__).resolve().parents[1]
            objects=subprocess.check_output(['git','rev-parse','--git-path','objects'],cwd=src,text=True).strip()
            objpath=Path(objects)
            if not objpath.is_absolute():objpath=src/objpath
            (root/'.git/objects/info').mkdir(parents=True)
            (root/'.git/objects/info/alternates').write_text(str(objpath.resolve())+'\n')
            p=root/'labs'/name/'dist';p.mkdir(parents=True)
            (p/'index.html').write_text('hello '+name)
            (p/'assets').mkdir()
            (p/'assets/file.js').write_bytes(b'abc123')
            (p/'release-version.json').write_text(json.dumps({'mode':'lab','name':name,'version':'test','baseCommit':known}))
            self.sources[name]=p
        self.home=self.base/'homepage.html';self.home.write_text('<h1>Lab unified</h1>')
        self.dest=self.base/'published-lab'
    def test_single_release_and_repeatable_hash(self):
        first,old=publish(self.dest,self.sources,self.home)
        self.assertIsNone(old)
        self.assertEqual(first['schema'],'ocr2md-lab-unified-release/v1')
        self.assertEqual(set(first['modules']),set(NAMES))
        self.assertEqual((self.dest/'index.html').read_text(),self.home.read_text())
        self.assertEqual(hash_file(self.dest/'cm-html/assets/file.js'),first['modules']['cm-html']['files']['assets/file.js'])
        second,old=publish(self.dest,self.sources,self.home)
        self.assertIsNone(old)
        self.assertEqual(first['releaseId'],second['releaseId'])
        self.assertEqual(len(list(self.base.glob('.published-lab.stage-*'))),0)
        self.assertEqual(len(list(self.base.glob('.published-lab.old-*'))),0)
    def test_fails_closed_on_symlink(self):
        import os
        bad=self.sources['translation-lab']/'assets/secret.json'
        bad.symlink_to(self.home)
        with self.assertRaisesRegex(ValueError,'symlink'):publish(self.dest,self.sources,self.home)
        self.assertFalse(self.dest.exists())
    def test_invalid_name(self):
        with self.assertRaises(ValueError):validate_source('other',self.sources['cm-html'])

if __name__=='__main__':unittest.main()
