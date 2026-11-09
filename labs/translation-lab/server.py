#!/usr/bin/env python3
"""Unmodified V6 service/module graph, dedicated Translation Lab runtime."""
import os
import runpy
import sys
from pathlib import Path
os.environ['V6_LAB_ID']='translation-lab'
source=Path(__file__).resolve().parents[2]/'scripts'
sys.path.insert(0,str(source))
runpy.run_path(str(source/'v6_serve.py'),run_name='__main__')
