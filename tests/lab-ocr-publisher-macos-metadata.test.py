"""Lab publisher must preserve Finder metadata without treating it as asset drift."""
import hashlib
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_frame_publish import fingerprints

class MacOSMetadataContract(unittest.TestCase):
 def test_finder_cache_is_ignored_without_deleting_or_hiding_real_changes(self):
  with tempfile.TemporaryDirectory() as td:
   root=Path(td);assets=root/'assets';assets.mkdir()
   asset=assets/'real-script.js';asset.write_bytes(b'export const value=1;\n')
   original,bytes_count=fingerprints(root)
   self.assertEqual(original,{'assets/real-script.js':hashlib.sha256(asset.read_bytes()).hexdigest()})
   (root/'.DS_Store').write_bytes(b'FINDER ROOT')
   (assets/'.DS_Store').write_bytes(b'FINDER SUBFOLDER')
   assert (root/'.DS_Store').is_file() and (assets/'.DS_Store').is_file()
   self.assertEqual(fingerprints(root),(original,bytes_count),'Do not delete or track Finder metadata')
   asset.write_bytes(b'export const value=2;\n')
   modified,_=fingerprints(root)
   self.assertNotEqual(modified,original,'Actual JS modification must still fail release manifest check')
   (assets/'unexpected.txt').write_bytes(b'untracked')
   self.assertIn('assets/unexpected.txt',fingerprints(root)[0],
     'Only exact Finder filename is ignored; other unexpected files remain fatal')

if __name__=='__main__':unittest.main()
