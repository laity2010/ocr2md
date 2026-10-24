#!/usr/bin/env python3
"""Grok fix regression: a timed-out suite must not leave orphan servers/ports."""
from pathlib import Path
import os
import socket
import sys
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parent))
import am

PROBE = '''import {spawn} from 'node:child_process';
const server=spawn('python3',['-c',"import http.server as h;s=h.ThreadingHTTPServer(('127.0.0.1',0),h.SimpleHTTPRequestHandler);print(s.server_address[1],flush=True);s.serve_forever()"],{stdio:['ignore','pipe','ignore']});
server.stdout.on('data',d=>console.log('PROBE_PORT',String(d).trim(),'PROBE_SERVER_PID',server.pid));
await new Promise(()=>setInterval(()=>{},1000));
'''


@unittest.skipUnless(sys.platform.startswith('linux'), '/proc based cleanup check')
class TimeoutCleanupTests(unittest.TestCase):
    def test_timeout_kills_process_group_and_releases_port(self):
        rel = f'tests/.am-timeout-probe-{os.getpid()}.mjs'
        probe = am.ROOT / rel
        probe.write_text(PROBE)
        saved = am.SUITE_TIMEOUT_SECONDS
        try:
            am.SUITE_TIMEOUT_SECONDS = 4
            status, output = am.run_test_script(rel)
        finally:
            am.SUITE_TIMEOUT_SECONDS = saved
            probe.unlink(missing_ok=True)
        self.assertEqual(status, 'ERROR')
        self.assertIn('AM_TIMEOUT_4_SECONDS', output)
        line = next(l for l in output.splitlines() if l.startswith('PROBE_PORT'))
        port, pid = int(line.split()[1]), int(line.split()[3])
        self.assertIn(str(port), output.split('listening_ports=')[1].splitlines()[0])
        self.assertIn('survivors=[] ports_still_listening=[]', output)
        self.assertFalse(Path(f'/proc/{pid}').exists(), 'orphan server survived timeout')
        with socket.socket() as s:
            self.assertNotEqual(s.connect_ex(('127.0.0.1', port)), 0, 'port still accepting')


if __name__ == '__main__':
    unittest.main(verbosity=2)
