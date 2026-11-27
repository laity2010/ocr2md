#!/usr/bin/env python3
"""Publish the independent translation frame using the federal shared release."""
import subprocess
import sys
import v6_frame_publish as base
base.NAME='lab-translation'
base.CARD='''      <article id="lab-translation"><div class="kind">Translation Lab</div><h2>Lab-Translation · 校译工作台</h2>
        <p>独立校译州，从空白 Frame 起步；不改写上游原句或原文。</p>
        <a class="open" href="/labs/lab-translation/">进入校译工作台</a></article>
'''
if __name__=='__main__':
    root=base.ROOT.parent.parent
    subprocess.run([sys.executable,'-m','unittest','discover','-s','tests','-p','test_translation_preparation.py','-v'],cwd=base.ROOT,check=True)
    subprocess.run(['node','--test','tests/translation-preparation.test.mjs'],cwd=base.ROOT,check=True)
    subprocess.run([sys.executable,str(root/'main/scripts/verify_cross_version_components.py'),'--target',base.NAME,'--browser'],check=True)
    base.require_workspace_io_runtime()
    base.publish(root/'release')
