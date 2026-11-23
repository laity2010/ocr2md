"""Guard against a new V2 static bundle talking to a cached old Python backend."""
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0,str(Path(__file__).parents[1]/'scripts'))
import v2_frame_publish as pub

class V2GatewayPublishTests(unittest.TestCase):
    def test_backend_change_between_actual_v2_commits_requires_reload(self):
        self.assertTrue(pub.backend_changed('dc92269','a9abaf3'))
        self.assertFalse(pub.backend_changed('a9abaf3','a9abaf3'))
    def test_missing_baseline_fails_closed(self):
        self.assertTrue(pub.backend_changed(None,'a9abaf3'))
    def test_reload_uses_one_existing_launchagent_and_checks_release(self):
        from io import BytesIO
        class Response(BytesIO):
            status=200
        with patch.object(pub.subprocess,'run') as run,patch.object(pub,'urlopen',return_value=Response(b'{"releaseId":"release-123"}')) as fetch:
            self.assertTrue(pub.reload_gateway(release_id='release-123',platform='darwin'))
            args=run.call_args.args[0]
            self.assertEqual(args[:3],['launchctl','kickstart','-k'])
            self.assertEqual(args[3],f'gui/{pub.os.getuid()}/{pub.GATEWAY_LABEL}')
            self.assertIn('/labs/healthz',fetch.call_args.args[0])
    def test_non_macos_does_not_touch_launchctl(self):
        with patch.object(pub.subprocess,'run') as run:
            self.assertFalse(pub.reload_gateway(release_id='release-123',platform='linux'))
            run.assert_not_called()

if __name__=='__main__':unittest.main()
