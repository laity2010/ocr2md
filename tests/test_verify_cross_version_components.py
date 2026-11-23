"""The release gate must reject plausible-looking non-V1 replacements."""
from __future__ import annotations
from pathlib import Path
import sys
import unittest

sys.path.insert(0,str(Path(__file__).resolve().parents[1]/'scripts'))
from verify_cross_version_components import inspect_target_scripts,baseline_issues,target_issues

GOOD="""import {EnumCheckboxFilter} from '../shared/enum-checkbox-filter.js';
const columns=[{field:'block_type',headerName:'Type',filter:EnumCheckboxFilter,
  sortable:false,suppressHeaderMenuButton:true,suppressHeaderFilterButton:false}];
"""

class CrossVersionFilterContract(unittest.TestCase):
    def test_authentic_v1_ag_api_binding_allowed(self):
        issues,implemented=inspect_target_scripts({'ui-grid.js':GOOD})
        self.assertTrue(implemented)
        self.assertEqual(issues,[])
    def test_custom_type_header_rejected_even_if_imported(self):
        fake=GOOD+"""class TypeHeader{init(){const el=document.createElement('select');
          el.className='v2-type-value-filter';}}
          const fallback={field:'block_type',headerComponent:TypeHeader};"""
        issues,implemented=inspect_target_scripts({'ui-grid.js':fake})
        self.assertTrue(implemented)
        self.assertTrue(any('single-select' in issue for issue in issues))
        self.assertTrue(any('custom HTML select' in issue for issue in issues))
    def test_single_select_without_v1_module_is_rejected(self):
        broken="""const typeFilter=()=>document.createElement('select');
          const columns=[{field:'block_type',headerComponent:typeFilter}];"""
        issues,_=inspect_target_scripts({'grid.js':broken})
        self.assertTrue(any('missing filter:' in issue for issue in issues))
        self.assertTrue(any('no actual V1' in issue for issue in issues))
    def test_new_v3_ag_without_type_must_still_use_v1_filter(self):
        bad="""import {createGrid} from 'ag-grid-community';
const columns=[{field:'title',headerComponent:MyOwnFilter}];"""
        issues,implemented=inspect_target_scripts({'outline.js':bad})
        self.assertTrue(implemented)
        self.assertTrue(any('missing filter:' in issue for issue in issues))
    def test_new_v3_without_ag_is_not_falsely_certified(self):
        issues,implemented=inspect_target_scripts({'workspace.js':'export const emptyFrame=true;'})
        self.assertEqual(issues,[])
        self.assertFalse(implemented)
    def test_real_v1_baseline_files_are_present(self):
        root=Path(__file__).resolve().parents[2]
        self.assertEqual(baseline_issues(root),[])

if __name__=='__main__':unittest.main()
