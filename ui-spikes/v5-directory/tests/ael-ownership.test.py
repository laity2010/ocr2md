#!/usr/bin/env python3
"""Nonblocking architecture audit: proposal != code, persistent evidence, no mutations."""
import io,sqlite3,sys
from contextlib import redirect_stdout
from pathlib import Path
root=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(root/'scripts'))
from ael_ownership import seed,review,show,resolve_retracted_proposal
with sqlite3.connect(':memory:') as c:
 assert seed(c)==2
 assert seed(c)==0
 captured=io.StringIO()
 with redirect_stdout(captured):review(c,root)
 output=captured.getvalue()
 assert 'RETRACTED_PROPOSAL_NOT_CODE_CHANGE' in output
 assert 'RUNTIME_QUARANTINED_LEGACY_SOURCE_REMAINS' in output
 assert 'advisory_only=true' in output
 assert c.execute('select count(*) from architecture_findings').fetchone()[0]==2
 assert c.execute('select count(*) from architecture_reviews').fetchone()[0]==2
 assert c.execute("select status from architecture_findings where finding_id='V5-OWN-002'").fetchone()[0]=='open'
 # The workspace is now live. The historical one-time resolver intentionally
 # rejects this scenario rather than inventing proof that no code was touched.
 try:
  resolve_retracted_proposal(c,root)
 except ValueError as exc:
  assert str(exc)=='AEL_PROPOSAL_BOUNDARY_NOT_PROVEN'
 else:
  raise AssertionError('stale proposal resolver must not declare success')
 assert c.execute("SELECT status FROM architecture_findings WHERE finding_id='V5-OWN-001'").fetchone()[0]=='open'
 assert c.execute("SELECT status FROM architecture_findings WHERE finding_id='V5-OWN-002'").fetchone()[0]=='open'
 assert c.execute('pragma integrity_check').fetchone()[0]=='ok'
 print('AEL_OWNERSHIP_ADVISORY_PASS open=2 reviews=2 staleProposalResolverRejected=true rootUnchanged=true')
