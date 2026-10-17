#!/usr/bin/env python3
"""Settings source files are owned exclusively by Settings in AEL tasks."""
import importlib.util
from pathlib import Path
m=Path(__file__).resolve().parents[1]/'scripts/ael.py'
spec=importlib.util.spec_from_file_location('v5_ael_isolated',m)
ael=importlib.util.module_from_spec(spec);spec.loader.exec_module(ael)
a='plugins/settings/settings.js'
b='@shared-settings/src/settings-panel.js'
assert ael.settings_owner_violations([a],{a:'old'},'workspace')==[a]
assert ael.settings_owner_violations([b],{b:'old'},'workspace')==[b]
assert ael.settings_owner_violations([a,b],{a:'old',b:'old'},'settings')==[]
assert ael.settings_owner_violations([b],{},'tooling')==[]
assert ael.settings_owner_violations([b],{b:'old'},'tooling')==[b]
assert ael.owner(b)=='settings'
source=ael.snapshot()
assert b in source and len(source[b])==64
assert '@shared-settings/package.json' in source
print('V5_AEL_SETTINGS_SOURCE_HARD_BOUNDARY_PASS',len([x for x in source if x.startswith('@shared-settings/')]))
