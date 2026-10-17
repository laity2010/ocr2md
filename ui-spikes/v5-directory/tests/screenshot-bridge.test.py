#!/usr/bin/env python3
"""Live-equivalent HTTP gateway security and expiry tests for screenshot bridge."""
from pathlib import Path
import binascii
import http.client
import json
import sys
from tempfile import TemporaryDirectory
import threading
import time
import struct
import unittest
import zlib
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import screenshot_bridge as bridge
from release_gateway import create_handler


def mock_png():
    def chunk(t,bytes_):
        return struct.pack('>I',len(bytes_))+t+bytes_+struct.pack('>I',binascii.crc32(t+bytes_)&0xffffffff)
    raw=bytes([0])+bytes([255,255,255])*150
    data=raw*150
    return (bridge.PNG_SIGNATURE+chunk(b'IHDR',struct.pack('>IIBBBBB',150,150,8,2,0,0,0))+
            chunk(b'IDAT',zlib.compress(data))+chunk(b'IEND',b''))

class Bridge(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory();self.root=Path(self.tmp.name)
        self.source=self.root/'approved.png';self.source.write_bytes(mock_png())
        self.shared=self.root/'shared'
        self.info=bridge.publish(self.shared,self.source,label='Demo reviewed image',lifetime=3600)
        self.route='/__v5/screenshots/'+self.info['id']+'.png'
        self.gateway=ThreadingHTTPServer(('127.0.0.1',0),create_handler(
            self.root/'public',0,self.root/'not-a-real-vault-key',screenshot_root=self.shared))
        self.thread=threading.Thread(target=self.gateway.serve_forever,daemon=True);self.thread.start()
    def tearDown(self):
        self.gateway.shutdown();self.gateway.server_close();self.thread.join(timeout=5);self.tmp.cleanup()
    def ask(self,route,method='GET'):
        c=http.client.HTTPConnection('127.0.0.1',self.gateway.server_port,timeout=5)
        c.request(method,route)
        r=c.getresponse();data=r.read();headers=dict(r.getheaders());status=r.status;c.close()
        return status,data,headers
    def test_valid_url_and_head_and_headers(self):
        status,data,headers=self.ask(self.route)
        self.assertEqual(status,200);self.assertEqual(data,self.source.read_bytes())
        self.assertEqual(headers['Content-Type'],'image/png')
        self.assertIn('noindex',headers['X-Robots-Tag'])
        self.assertEqual(headers['Cache-Control'],'no-store, max-age=0')
        self.assertEqual(headers['Referrer-Policy'],'no-referrer')
        self.assertEqual(self.ask(self.route,'HEAD')[:2],(200,b''))
    def test_no_index_guess_mutation_or_path_escape(self):
        for route in ['/__v5/screenshots/','/__v5/screenshots/'+self.info['id']+'.json',
            '/__v5/screenshots/'+('f'*48)+'.png',
            '/__v5/screenshots/../../.ocr2md-private/key',
            self.route+'?query=1']:
            self.assertEqual(self.ask(route)[0],404,route)
        self.assertEqual(self.ask(self.route,'POST')[0],405)
    def test_expiry_and_tamper(self):
        data=self.source.read_bytes()
        self.assertEqual(bridge.retrieve(self.shared,self.route,now=self.info['expires']-1),data)
        self.assertIsNone(bridge.retrieve(self.shared,self.route,now=self.info['expires']))
        self.assertIsNone(bridge.retrieve(self.shared,self.route,now=self.info['expires']+1))
        (self.shared/(self.info['id']+'.png')).write_bytes(data+b'tampered')
        self.assertEqual(self.ask(self.route)[0],404)
    def test_reject_symlinks_and_bad_png(self):
        fake=self.root/'fake.jpg';fake.write_bytes(b'not-a-png'*50)
        with self.assertRaises(ValueError):bridge.publish(self.shared,fake,label='fake')
        link=self.root/'alias.png';link.symlink_to(self.source)
        with self.assertRaises(ValueError):bridge.publish(self.shared,link,label='alias')
        record=self.shared/(self.info['id']+'.png');record.unlink();record.symlink_to(self.source)
        self.assertEqual(self.ask(self.route)[0],404)

if __name__=='__main__':unittest.main()
