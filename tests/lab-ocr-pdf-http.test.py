"""Direct authenticated PDF bytes API: no pathname traversal or user writes."""
import io
import tempfile
import threading
import unittest
from pathlib import Path
from unittest.mock import patch
from http.server import ThreadingHTTPServer
from urllib.error import HTTPError
from urllib.parse import urlencode
from urllib.request import Request, urlopen
import sys
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import v6_lab_ocr_serve as server

class PdfHTTPTest(unittest.TestCase):
    def test_pdf_stream_requires_authorized_book_and_single_pdf(self):
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            book=root/'book';(book/'pdf').mkdir(parents=True)
            original=b'%PDF-1.7\nFAKE FIXTURE PDF\n'
            (book/'pdf'/'original.pdf').write_bytes(original)
            with patch.object(server,'_authorized_roots',side_effect=lambda cookie:[root] if cookie=='valid=yes' else (_ for _ in ()).throw(server.APIError(403,'Unauthorized'))):
                http=ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
                threading.Thread(target=http.serve_forever,daemon=True).start()
                base=f'http://127.0.0.1:{http.server_address[1]}'
                url=base+server.PREFIX+'pdf?'+urlencode({'workspace':str(book)})
                try:
                    with self.assertRaises(HTTPError) as blocked:urlopen(url,timeout=5)
                    self.assertEqual(blocked.exception.code,403)
                    with urlopen(Request(url,headers={'Cookie':'valid=yes'}),timeout=5) as response:
                        self.assertEqual(response.headers['Content-Type'],'application/pdf')
                        self.assertEqual(response.headers['Cache-Control'],'private, no-store')
                        self.assertEqual(response.read(),original)
                    with urlopen(Request(url,headers={'Cookie':'valid=yes'},method='HEAD'),timeout=5) as response:
                        self.assertEqual(int(response.headers['Content-Length']),len(original))
                    with self.assertRaises(HTTPError) as blocked:urlopen(Request(url.replace('book','other'),headers={'Cookie':'valid=yes'}),timeout=5)
                    self.assertEqual(blocked.exception.code,422)
                    (book/'pdf'/'second.pdf').write_bytes(original)
                    with self.assertRaises(HTTPError) as ambiguous:urlopen(Request(url,headers={'Cookie':'valid=yes'}),timeout=5)
                    self.assertEqual(ambiguous.exception.code,422)
                    (book/'pdf'/'second.pdf').unlink()
                    (book/'pdf'/'original.pdf').unlink()
                    (book/'pdf'/'original.pdf').symlink_to(root/'protected.pdf')
                    with self.assertRaises(HTTPError) as linked:urlopen(Request(url,headers={'Cookie':'valid=yes'}),timeout=5)
                    self.assertEqual(linked.exception.code,422)
                finally:http.shutdown();http.server_close()
            self.assertEqual(original,b'%PDF-1.7\nFAKE FIXTURE PDF\n')

if __name__=='__main__':unittest.main()
