#!/usr/bin/env python3
"""Publish Frame-derived V2 MinerU base import into the existing unified Lab slot only.

Reuse Frame's checksum/atomic publisher and V1 launchd compatibility gate.
Never create a new tunnel, delete a book or mutate another Lab's release.
"""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from urllib.request import urlopen
import v6_frame_publish as base

base.NAME='lab-ocr-v2'
base.CARD='''      <article id="lab-ocr-v2"><div class="kind">15 · OCR V2 · MD Line</div><h2>lab-ocr-v2 · PBS + MD Block</h2>
        <p>复用 Lab-Frame 四窗与权限；AG 依次显示 PBS（固定）、Type（列值筛选）与 MD Block；CM6 真实 MD Line 行级编辑、父子块归组、公共行索引与行级标题；通过 SQL 组显式初始化逻辑表，共用 Undo/Redo 与增量 SQLite 持久化。原 Raw Block 仅供只读比对。</p>
        <a class="open" href="/labs/lab-ocr-v2/">进入 V2 工作台</a></article>
'''

# The Gateway imports these Python modules exactly once per process. Static
# release identity alone is NOT enough after a backend change: a cached
# v2_mineru_base module can still serve the old 120-row SQL logical projection.
V2_BACKEND_FILES=(
    'scripts/v2_mineru_base.py',
    'scripts/v6_media.py',
    'scripts/v2_logical_contract.py',
    'scripts/v2_md_block.py',
    'scripts/v2_table_recovery.py',
    'scripts/v2_markdown_roundtrip.py',
    'scripts/v2_pdf_projection.py',
    'scripts/v2_pbs.py',
)
GATEWAY_LABEL='com.laity.agentlink.ocr2md-labs-gateway'


def require_cross_version_component_gate(target='lab-ocr-v2', repository=base.ROOT):
    """Fail closed BEFORE publishing when the V1 AG checkbox filter is bypassed.

    This is one shared Main-Git validator used by every new Lab as it grows
    AG Grid functionality. It never modifies live SQLite or published assets.
    """
    home=Path(repository).resolve().parents[1]
    validator=home/'main/scripts/verify_cross_version_components.py'
    if not validator.is_file():
        raise RuntimeError('missing shared cross-version component gate: '+str(validator))
    subprocess.run([sys.executable,str(validator),'--target',target,'--browser'],
                   cwd=repository,check=True,timeout=120)
    print('V2_CROSS_VERSION_COMPONENTS_RELEASE_GATE_PASS',target)

def backend_changed(previous_commit, current_commit, repository=base.ROOT):
    if not previous_commit or previous_commit==current_commit:
        return previous_commit!=current_commit
    try:
        files=subprocess.check_output(
            ['git','diff','--name-only',previous_commit,current_commit,'--',*V2_BACKEND_FILES],
            cwd=repository,text=True,timeout=10)
        return bool(files.strip())
    except (OSError,subprocess.CalledProcessError,subprocess.TimeoutExpired):
        # Missing history must not silently leave an obsolete Python backend.
        return True

def reload_gateway(*, release_id, platform=sys.platform):
    if platform!='darwin':return False
    # Reuse the ONE existing LaunchAgent; do not start a second listener.
    label=f'gui/{os.getuid()}/{GATEWAY_LABEL}'
    subprocess.run(['launchctl','kickstart','-k',label],check=True,timeout=20)
    for _ in range(30):
        try:
            with urlopen('http://127.0.0.1:4414/labs/healthz',timeout=2) as response:
                if response.status==200 and json.load(response).get('releaseId')==release_id:
                    print('V2_GATEWAY_RUNTIME_RELOADED',label)
                    return True
        except (OSError,ValueError):
            pass
        time.sleep(0.3)
    raise RuntimeError('V2 backend changed but the single Lab Gateway did not recover with the expected release')

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',type=Path,required=True)
    args=parser.parse_args()
    # No release I/O or gateway action is permitted before this preflight.
    require_cross_version_component_gate()
    base.require_workspace_io_runtime()
    release=args.release_root.resolve()
    previous=json.loads((release/'release-manifest.json').read_text())
    previous_commit=previous.get('modules',{}).get('lab-ocr-v2',{}).get('sourceCommit')
    current_commit=subprocess.check_output(
        ['git','rev-parse','HEAD'],cwd=base.ROOT,text=True).strip()
    changed=backend_changed(previous_commit,current_commit)
    base.publish(release)
    published=json.loads((release/'release-manifest.json').read_text())
    if changed:
        reload_gateway(release_id=published['releaseId'])
    else:
        print('V2_GATEWAY_BACKEND_UNCHANGED',current_commit)
