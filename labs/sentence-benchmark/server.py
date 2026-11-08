#!/usr/bin/env python3
"""Same V6 service endpoints, isolated sentence-benchmark runtime and URL."""
import os
import runpy
import sys
from pathlib import Path

os.environ['V6_LAB_ID'] = 'sentence-benchmark'
source = Path(__file__).resolve().parents[2] / 'scripts'
sys.path.insert(0, str(source))
runpy.run_path(str(source / 'v6_serve.py'), run_name='__main__')
