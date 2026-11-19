"""Finder metadata must not break an unrelated Lab's intact release."""
import sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_frame_publish import fingerprints,sha

class FrameReleaseFingerprintsTest(unittest.TestCase):
    def test_ignore_finder_metadata_but_never_unknown_assets(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder=Path(tmp);(folder/'index.html').write_bytes(b'real asset')
            (folder/'.DS_Store').write_bytes(b'generated finder data')
            files,total=fingerprints(folder)
            self.assertEqual(files,{'index.html':sha(b'real asset')})
            self.assertEqual(total,len(b'real asset'))
            (folder/'unexpected.txt').write_bytes(b'not registered')
            files,_=fingerprints(folder)
            self.assertIn('unexpected.txt',files)
            (folder/'unexpected.txt').unlink()
            (folder/'.DS_Store').unlink()
            (folder/'.DS_Store').symlink_to(folder/'index.html')
            with self.assertRaisesRegex(RuntimeError,'Symlink'):
                fingerprints(folder)
if __name__=='__main__':unittest.main()
