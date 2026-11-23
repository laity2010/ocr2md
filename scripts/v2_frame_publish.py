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
base.CARD='''      <article id="lab-ocr-v2"><div class="kind">09 · OCR V2 · 两表 PBS</div><h2>lab-ocr-v2 · PBS 两层逻辑块</h2>
        <p>复用 Lab-Frame 四窗与权限；AG 逻辑表按焦点 PBS p 过滤，可选「全部」；原版 V1 PDF 标签拖动实时修改 CM6 内存结构，Undo/Redo 与空闲增量 SQL 写回。源码窗仅只读，不开放文本编辑。</p>
        <a class="open" href="/labs/lab-ocr-v2/">进入 V2 工作台</a></article>
'''

# The Gateway imports these Python modules exactly once per process. Static
# release identity alone is NOT enough after a backend change: a cached
# v2_mineru_base module can still serve the old 120-row SQL logical projection.
V2_BACKEND_FILES=(
    'scripts/v2_mineru_base.py',
    'scripts/v2_logical_contract.py',
    'scripts/v2_md_block.py',
    'scripts/v2_markdown_roundtrip.py',
    'scripts/v2_pdf_projection.py',
    'scripts/v2_pbs.py',
)
GATEWAY_LABEL='com.laity.agentlink.ocr2md-labs-gateway'

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
