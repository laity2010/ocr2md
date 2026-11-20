#!/usr/bin/env python3
"""Publish Frame-derived V2 MinerU base import into the existing unified Lab slot only.

Reuse Frame's checksum/atomic publisher and V1 launchd compatibility gate.
Never create a new tunnel, delete a book or mutate another Lab's release.
"""
import argparse
from pathlib import Path
import v6_frame_publish as base

base.NAME='lab-ocr-v2'
base.CARD='''      <article id="lab-ocr-v2"><div class="kind">09 · OCR V2 · 两表 N View</div><h2>lab-ocr-v2 · SQL 基础表 / 逻辑表</h2>
        <p>复用 Lab-Frame 设置/读写验证，授权后无损导入 MinerUJSON，SQL → 基础表18列和逻辑表9列，复用公共 MinerU Markdown 转换器保留父子块和跨页表格。</p>
        <a class="open" href="/labs/lab-ocr-v2/">进入 V2 两表工作台</a></article>
'''

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',type=Path,required=True)
    args=parser.parse_args()
    base.require_workspace_io_runtime()
    from v2_logical import converter_ready
    converter_ready()
    base.publish(args.release_root.resolve())
