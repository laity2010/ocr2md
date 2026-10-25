#!/usr/bin/env python3
"""Launch the lab-scoped fork of the V6 API core."""
from pathlib import Path
import runpy
runpy.run_path(str(Path(__file__).with_name('mainline-server.py')),run_name='__main__')
