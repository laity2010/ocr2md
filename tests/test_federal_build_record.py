"""Real Git Notes lifecycle, linked worktree and bare remote; no product data."""
import json
from pathlib import Path
import subprocess
import sys
import unittest
import test_federal_git_gate as fixture

class FederalBuildRecordTests(unittest.TestCase):
    def setUp(self):
        self.f=fixture.FederalGitGateTests('test_success_release_and_dirty_block')
        self.addCleanup(self.f.doCleanups);self.f.setUp()
        self.root=self.f.root;self.main=self.f.main;self.lab=self.f.lab
        self.git=self.f.run_git;self.gate=self.f.run_gate
        tip=self.git(self.main,'rev-parse','HEAD').stdout.strip()
        self.git(self.main,'tag','-a','federal-build-record-v1','-m','Activation fixture\n\nBaseline: '+tip+'\nBaseline: '+self.f.base)
        self.git(self.main,'push','origin','refs/tags/federal-build-record-v1')
    def get_events(self,tree,base):
        text=self.git(tree,'notes','show',base).stdout
        return [json.loads(l.split(' ',1)[1]) for l in text.splitlines() if l.startswith('FEDERAL_BUILD_EVENT_V1 ')]
    def start(self):
        self.gate('begin','--tree',str(self.lab),'--wp','WP-fixture','--goal','test build records')
        return self.get_events(self.lab,self.f.base)[-1]['id']
    def message(self,ident,result='PASS',release='NONE',violation='无'):
        return self.f.message(result,release).replace('违宪：无','违宪：'+violation)+'\n构建ID：'+ident
    def close(self,result,expected=0,extra=()):
        return self.gate('finish','--tree',str(self.lab),'--result',result,'--evidence','fixture actual verification',*extra,expected=expected)
    def test_start_is_remote_before_run_and_no_new_wp_if_open(self):
        self.gate('run','--tree',str(self.lab),'--phase','build','--',sys.executable,'-c','raise SystemExit(0)',expected=2)
        self.gate('check-start','--tree',str(self.lab),expected=2)
        ident=self.start()
        self.gate('check-start','--tree',str(self.lab))
        local=self.git(self.lab,'rev-parse','refs/notes/commits').stdout.strip()
        self.assertEqual(self.git(self.lab,'ls-remote','origin','refs/notes/commits').stdout.split()[0],local)
        self.gate('status',expected=2)
        self.gate('begin','--tree',str(self.lab),'--wp','WP-new','--goal','cannot start',expected=2)
        self.gate('run','--tree',str(self.lab),'--phase','failure','--',sys.executable,'-c','raise SystemExit(7)',expected=1)
        events=self.get_events(self.lab,self.f.base);self.assertEqual([e['event'] for e in events],['START','RUN_START','RUN_EXIT']);self.assertEqual(events[-1]['exit_code'],7)
        self.close('BLOCKED');self.assertEqual(self.get_events(self.lab,self.f.base)[-1]['result'],'BLOCKED')
        self.gate('status');self.assertNotEqual(self.start(),ident);self.close('FAIL')
    def test_commit_push_release_and_end_link_same_id(self):
        ident=self.start();self.f.commit(self.lab,'-m',self.f.message(release='NONE'),expected=1)
        self.f.commit(self.lab,'-m',self.message('fake'),expected=1)
        self.f.commit(self.lab,'-m',self.message(ident));self.close('PASS',expected=2)
        self.git(self.lab,'push','origin','experiment/fixture');self.close('PASS')
        events=self.get_events(self.lab,self.f.base);self.assertEqual(events[-1]['commit'],self.git(self.lab,'rev-parse','HEAD').stdout.strip());self.assertEqual(events[-1]['id'],ident)
        self.close('PASS',expected=2);self.gate('status')
    def test_release_needs_registered_open_id_and_actual_online_evidence(self):
        ident=self.start();self.f.commit(self.lab,'-m',self.message(ident,release='REQUIRED'))
        self.gate('check-release','--tree',str(self.lab),'--commit','HEAD');self.git(self.lab,'push','origin','experiment/fixture')
        self.close('PASS',expected=2)
        self.gate('status',expected=2)
    def test_unregistered_dirty_is_retrospective_not_erased(self):
        (self.lab/'fixture.txt').write_text('unregistered change');self.git(self.lab,'add','fixture.txt')
        self.f.commit(self.lab,'-m',self.f.message(release='NONE'),expected=1)
        rec=self.get_events(self.lab,self.f.base)[-1];self.assertTrue(rec['retrospective']);self.assertEqual(rec['wp'],'UNREGISTERED')
        self.gate('sync-records')
        self.f.commit(self.lab,'-m',self.message(rec['id']),expected=1)
        self.f.commit(self.lab,'-m',self.message(rec['id'],'FAIL','FORBIDDEN','未登记变更，实际证据已保全'))
        self.git(self.lab,'push','origin','HEAD:refs/heads/archive/failed-fixture');self.close('FAIL',extra=('--remote-ref','refs/heads/archive/failed-fixture'))
        self.assertEqual(self.get_events(self.lab,self.f.base)[-1]['result'],'FAIL')
    def test_bypassed_commit_and_deleted_note_rejected(self):
        ident=self.start();self.f.commit(self.lab,'--no-verify','-m',self.f.message(release='NONE'))
        self.git(self.lab,'push','origin','experiment/fixture',expected=1)
        self.git(self.lab,'notes','remove',self.f.base)
        self.git(self.lab,'push','origin','refs/notes/commits',expected=1)
    def test_dirty_audit_records_without_claiming_exact_start(self):
        (self.lab/'dirty.txt').write_text('not yet committed')
        self.gate('audit',expected=2);rec=self.get_events(self.lab,self.f.base)[-1]
        self.assertTrue(rec['retrospective']);self.assertEqual(rec['observed_entries'],1)
        self.close('BLOCKED',expected=2)

if __name__=='__main__':unittest.main()
