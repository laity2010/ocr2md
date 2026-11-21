#!/usr/bin/env python3
"""Publish Frame-derived V2 MinerU base import into the existing unified Lab slot only.

Reuse Frame's checksum/atomic publisher and V1 launchd compatibility gate.
Never create a new tunnel, delete a book or mutate another Lab's release.
"""
import argparse
from pathlib import Path
import v6_frame_publish as base

base.NAME='lab-ocr-v2'
base.CARD='''      <article id="lab-ocr-v2"><div class="kind">09 · OCR V2 · 两表 PBS</div><h2>lab-ocr-v2 · PBS 两层逻辑块</h2>
        <p>复用 Lab-Frame 四窗与权限，无损导入 MinerUJSON，SQL 两表中逻辑表含 p/b/s 九列、初始 s0；CM6 内存编辑、Markdown 与 V1 PDF 多轨标签联动。PDF 结构编辑尚未开放。</p>
        <a class="open" href="/labs/lab-ocr-v2/">进入 V2 工作台</a></article>
'''

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',type=Path,required=True)
    args=parser.parse_args()
    base.require_workspace_io_runtime()
    base.publish(args.release_root.resolve())
