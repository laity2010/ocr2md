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
    def test_v2_filter_and_css_are_exact_v1_original_files(self):
        # No second hand-made implementation: V2 must use the V1 code bytes.
        root=Path(__file__).parents[1]
        v1=root.parent/'lab-ocr'/'ui'
        for name in ('enum-checkbox-filter.js','ag-enum-filter-shared.css'):
            self.assertEqual((root/'ui'/name).read_bytes(),(v1/name).read_bytes(),
                             'V2 AG filter or style drifted from the V1 validated source')
    def test_cross_version_filter_gate_is_mandatory_before_release(self):
        with patch.object(pub.subprocess,'run') as run:
            pub.require_cross_version_component_gate()
            args=run.call_args.args[0]
            self.assertEqual(args[0],pub.sys.executable)
            self.assertTrue(args[1].endswith('main/scripts/verify_cross_version_components.py'))
            self.assertEqual(args[2:],['--target','lab-ocr-v2','--browser'])
            self.assertTrue(run.call_args.kwargs['check'])
        with patch.object(pub.subprocess,'run',side_effect=pub.subprocess.CalledProcessError(1,['preflight'])):
            with self.assertRaises(pub.subprocess.CalledProcessError):
                pub.require_cross_version_component_gate()
    def test_non_macos_does_not_touch_launchctl(self):
        with patch.object(pub.subprocess,'run') as run:
            self.assertFalse(pub.reload_gateway(release_id='release-123',platform='linux'))
            run.assert_not_called()

if __name__=='__main__':unittest.main()
