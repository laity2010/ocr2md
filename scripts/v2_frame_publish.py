#!/usr/bin/env python3
"""Publish clean, Frame-derived V2 into the existing unified Lab slot only.

Reuse Frame's checksum/atomic publisher and V1 launchd compatibility gate.
Never create a new tunnel, delete a book or mutate another Lab's release.
"""
import argparse
from pathlib import Path
import v6_frame_publish as base

base.NAME='lab-ocr-v2'
base.CARD='''      <article id="lab-ocr-v2"><div class="kind">09 · OCR V2 · 空白框架</div><h2>lab-ocr-v2 · Lab-Frame 基线</h2>
        <p>以已验收的 Lab-Frame 初始化：全局设置、目录选择与读写测试；四窗尚为空白。未接入 MinerU、SQLite、OCR 或旧 V2 三窗业务。</p>
        <a class="open" href="/labs/lab-ocr-v2/">进入 V2 空白框架</a></article>
'''

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',type=Path,required=True)
    args=parser.parse_args()
    base.require_workspace_io_runtime()
    base.publish(args.release_root.resolve())
