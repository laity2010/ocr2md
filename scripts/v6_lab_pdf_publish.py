#!/usr/bin/env python3
"""Publish the isolated, static Lab PDF workbench using the shared checksummed gateway.

Only lab-pdf static files and its index card are added/updated; existing Labs,
Main, all user documents and services are preserved. No new tunnel/backend.
"""
import argparse
from pathlib import Path
import v6_frame_publish as publisher

NAME='lab-pdf'
CARD='''      <article id="lab-pdf"><div class="kind">08 · PDF Viewer Lab</div><h2>lab-pdf · PDF 公共组件实验</h2>
        <p>基于 Lab Frame 的独立四窗开发工作台；PDF 组件与 PBS 覆盖框 API 尚未接入。</p>
        <a class="open" href="/labs/lab-pdf/">进入 lab-pdf</a></article>
'''

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--release-root',required=True,type=Path)
    args=parser.parse_args()
    publisher.NAME=NAME
    publisher.CARD=CARD
    publisher.publish(args.release_root.resolve())
