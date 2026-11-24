#!/usr/bin/env python3
"""Cross-version AG Grid contract gate, declared by COMM.md.

A missing/incompatible Type filter blocks the named Lab's release before any
publish side effects. Source checks are conservative and browser behavior is
verified separately against the actual V1 component in Chromium/WebKit.
"""
from __future__ import annotations

import argparse
from pathlib import Path
import re
import subprocess
import sys


def baseline_issues(root: Path):
    problems=[]
    spec=root/'COMM.md'
    source=root/'labs/lab-ocr/ui/enum-checkbox-filter.js'
    tests=(root/'labs/lab-ocr/tests/enum-checkbox-filter-transient-empty.test.mjs',
           root/'labs/lab-ocr/tests/outline-browser.test.mjs')
    if not spec.is_file() or 'EnumCheckboxFilter' not in spec.read_text():
        problems.append('missing root COMM.md V1 filter contract')
    if not source.is_file():
        problems.append('missing V1 EnumCheckboxFilter implementation')
    else:
        body=source.read_text()
        for token in ('class EnumCheckboxFilter', 'getModel()', 'setModel(', 'doesFilterPass(',
                      'filterChangedCallback()', 'onNewRowsLoaded()', "addOption('all'"):
            if token not in body:
                problems.append(f'V1 filter API/behavior missing: {token}')
    for test in tests:
        if not test.is_file():
            problems.append(f'missing V1 regression: {test.relative_to(root)}')
    return problems


def inspect_target_scripts(files: dict[str,str]):
    """Inspect actual UI source, not docs or test descriptions.

    A V3 with no AG Grid yet has nothing to validate; once it implements Type
    filtering, the registered V1 component must be wired into AG's filter API.
    """
    problems=[]
    if not files:
        return problems,False
    all_js='\n'.join(files.values())
    # A future V3 may introduce AG without a Type column. Do not silently
    # certify that implementation merely because no `block_type` is present.
    uses_ag=bool(re.search(
        r'\bblock_type\b|\btypeFilter\b|\bv2BaseGridPort\b|'
        r'\bcreateGrid\s*\(|\bag-grid-community\b|\.setColumns\s*\(',all_js))
    if not uses_ag:
        return problems,False
    # The obsolete V2 header invents an independent single-select filter. A
    # cosmetic import of EnumCheckboxFilter must not wash that violation away.
    bad_markers=('v2-type-value-filter', 'class TypeHeader', 'typeFilter=select.value')
    if any('headerComponent' in source and 'block_type' in source
           and ("createElement('select')" in source or 'createElement("select")' in source)
           for source in files.values()):
        problems.append('AG Type header contains a custom HTML select; use native IFilterComp')
    for marker in bad_markers:
        if any(marker in source for source in files.values()):
            problems.append(f'custom single-select AG Type header forbidden: {marker}')
    if not re.search(r'\bfilter\s*:\s*EnumCheckboxFilter\b',all_js):
        problems.append('AG Grid columns missing filter: EnumCheckboxFilter binding')
    if not re.search(r'\bimport\s*\{[^}]*\bEnumCheckboxFilter\b[^}]*\}',all_js):
        problems.append('no actual V1 EnumCheckboxFilter module import in target UI')
    if not re.search(r'\bsuppressHeaderFilterButton\s*:\s*false',all_js):
        problems.append('native AG Grid column filter button not enabled')
    if re.search(r'\bfilterFramework\s*:',all_js):
        problems.append('deprecated custom filterFramework is not V1 IFilterComp API')
    return problems,True


def target_issues(root: Path, lab_id: str):
    if not re.fullmatch(r'[a-zA-Z0-9][a-zA-Z0-9_-]*',lab_id):
        return [f'invalid Lab ID: {lab_id}'],False
    target=root/'labs'/lab_id
    if not target.is_dir():
        return [f'missing Lab: {target}'],False
    if not (target/'README.md').is_file():
        return [f'missing Lab README: {lab_id}'],False
    ui=target/'ui'
    if not ui.is_dir():
        return [],False
    files={p.relative_to(ui).as_posix():p.read_text(encoding='utf-8')
           for p in ui.rglob('*') if p.is_file() and p.suffix in {'.js','.ts','.mjs'}
           and not any(x in {'node_modules','dist'} for x in p.parts)}
    return inspect_target_scripts(files)


def check(root: Path, target: str, browser: bool=False):
    issues=baseline_issues(root)
    target_problems,implemented=target_issues(root,target)
    issues.extend(target_problems)
    if issues:
        for problem in issues:
            print('CROSS_VERSION_COMPONENTS_FAIL',target,problem,file=sys.stderr)
        return False
    print('V1_COMPONENT_BASELINE_CONTRACT_PASS',root)
    if implemented:
        print('TARGET_AG_GRID_TYPE_BINDING_PASS',target)
    else:
        print('TARGET_AG_GRID_NOT_IMPLEMENTED',target,'no Type filter in UI (not a compliance claim)')
    if browser:
        browser_test=root/'main/tests/cross_version_enum_filter.browser.test.mjs'
        if not browser_test.is_file():
            print('CROSS_VERSION_COMPONENTS_FAIL browser regression missing',file=sys.stderr)
            return False
        proc=subprocess.run(['node',str(browser_test)],cwd=root/'main',timeout=100)
        if proc.returncode:
            print('CROSS_VERSION_COMPONENTS_FAIL V1 Chromium/WebKit behavior',file=sys.stderr)
            return False
        if implemented:
            target_browser=root/'labs'/target/'tests/cross-version-ag-filter.browser.test.mjs'
            if not target_browser.is_file():
                print('CROSS_VERSION_COMPONENTS_FAIL missing real target AG UI browser regression: '
                      +str(target_browser),file=sys.stderr)
                return False
            proc=subprocess.run(['node',str(target_browser)],cwd=root/'labs'/target,timeout=200)
            if proc.returncode:
                print('CROSS_VERSION_COMPONENTS_FAIL target AG native filter popup behavior',
                      file=sys.stderr)
                return False
    print('CROSS_VERSION_COMPONENTS_VERIFIED',target)
    return True


def main(argv=None):
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--root',type=Path,default=Path(__file__).resolve().parents[2])
    p.add_argument('--target',required=True,help='Lab ID under root/labs')
    p.add_argument('--browser',action='store_true',help='run V1 Chromium/WebKit component behavior')
    args=p.parse_args(argv)
    return 0 if check(args.root.resolve(),args.target,browser=args.browser) else 1


if __name__=='__main__':
    raise SystemExit(main())
