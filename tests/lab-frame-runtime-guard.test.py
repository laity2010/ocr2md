"""Frame I/O release cannot regress Gateway TCC Python or V1 LAN Origin."""
import plistlib,sys,tempfile,unittest
from pathlib import Path
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from v6_frame_publish import require_workspace_io_runtime

class FrameRuntimeGuardTest(unittest.TestCase):
    def test_config_must_match_main_and_v1(self):
        with tempfile.TemporaryDirectory() as tmp:
            agent=Path(tmp)/'Library/LaunchAgents';agent.mkdir(parents=True)
            def save(name,binary,origin):
                with (agent/name).open('wb') as h:plistlib.dump({
                    'ProgramArguments':[binary,'service.py'],
                    'EnvironmentVariables':{'OCR2MD_LAN_ORIGIN':origin}},h)
            gateway='com.laity.agentlink.ocr2md-labs-gateway.plist'
            main='bid.laity.ocr2md-v6-server.plist'
            v1='com.laity.ocr2md.lab-ocr-api.plist'
            save(main,'/bin/ls','https://192.168.1.10:4443')
            save(v1,'/bin/ls','https://192.168.1.10:4443')
            save(gateway,'/bin/sh','https://192.168.1.10:4443')
            with self.assertRaisesRegex(RuntimeError,'Python'):
                require_workspace_io_runtime(Path(tmp),'darwin')
            save(gateway,'/bin/ls','https://192.168.1.10')
            with self.assertRaisesRegex(RuntimeError,'局域网'):
                require_workspace_io_runtime(Path(tmp),'darwin')
            save(gateway,'/bin/ls','https://192.168.1.10:4443')
            require_workspace_io_runtime(Path(tmp),'darwin')
            require_workspace_io_runtime(Path(tmp),'linux')

    def test_real_launchd_compatibility(self):
        require_workspace_io_runtime()

if __name__=='__main__':unittest.main()
