#!/usr/bin/env python3
"""Existing public lab service: delegate to configured mainline V6 server."""
import os
import runpy
from pathlib import Path
os.environ['V6_LAB_ID']='cm-html'
runpy.run_path(str(Path(__file__).resolve().parents[2]/'scripts/v6_serve.py'),run_name='__main__')
