"""Frame release depends on its own scoped config + shared Gateway, not Main."""
import json,os,plistlib,sys,tempfile,unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
import frame_access
from v6_frame_publish import require_workspace_io_runtime

class FrameRuntimeGuardTest(unittest.TestCase):
    def test_gateway_and_own_access_not_main(self):
        with tempfile.TemporaryDirectory() as tmp:
            home=Path(tmp)
            agent=home/'Library/LaunchAgents';agent.mkdir(parents=True)
            cfg=home/'frame.json';allowed=home/'data';allowed.mkdir()
            cfg.write_text(json.dumps({'schema':'ocr2md-frame-access/v1','code':'A'*16,
                'secret':'1'*64,'allowedRoots':[str(allowed)]}));os.chmod(cfg,0o600)
            path=agent/'com.laity.agentlink.ocr2md-labs-gateway.plist'
            def save(origin):
                with path.open('wb') as h:plistlib.dump({'ProgramArguments':['/bin/ls','service.py'],
                    'EnvironmentVariables':{'OCR2MD_LAN_ORIGIN':origin}},h)
            with patch.object(frame_access,'CONFIG',cfg):
                with self.assertRaisesRegex(RuntimeError,'Gateway'):require_workspace_io_runtime(home,'darwin')
                save('http://insecure.example')
                with self.assertRaisesRegex(RuntimeError,'运行环境'):require_workspace_io_runtime(home,'darwin')
                save('https://192.168.1.10:4443')
                require_workspace_io_runtime(home,'darwin')
                require_workspace_io_runtime(home,'linux')
                os.chmod(cfg,0o644)
                with self.assertRaises(frame_access.AccessError):require_workspace_io_runtime(home,'darwin')

    def test_real_launchd_compatibility(self):
        require_workspace_io_runtime()

if __name__=='__main__':unittest.main()
