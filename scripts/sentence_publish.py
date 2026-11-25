#!/usr/bin/env python3
from pathlib import Path
import subprocess
import sys
import v6_frame_publish as base
base.NAME="lab-sentence"
base.CARD='''      <article id="lab-sentence"><div class="kind">Sentence Lab</div><h2>Lab-Sentence · 分句工作台</h2>
        <p>独立分句实验，复用空白 Frame；不改写 V2 审阅原文。</p>
        <a class="open" href="/labs/lab-sentence/">进入分句工作台</a></article>
'''
if __name__=="__main__":
    root=base.ROOT.parent.parent
    subprocess.run([sys.executable,str(root/"main/scripts/verify_cross_version_components.py"),"--target",base.NAME],check=True)
    base.require_workspace_io_runtime()
    base.publish(root/"release")
