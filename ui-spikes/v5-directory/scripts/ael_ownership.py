#!/usr/bin/env python3
"""Read-only architecture checks + append-only observations; advisory, never enforcing."""
import json
import sqlite3
from pathlib import Path
from datetime import datetime, timezone

ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/'.runtime/ael.sqlite'
FINDINGS=(
 dict(key='V5-OWN-001',kind='proposal',owner='workspace',title='不得将 DIRjson 处理归属工作目录',
      observed='助手曾建议把授权文件与 DIRjson 服务整体归入工作目录；这是尚未执行的越界设计建议，不是文件迁移事实。',
      expected='工作目录只负责目录导航；MOPJO 独占 DIRjson/原始+增量JSON/定位/MD投影；文件访问保持独立通用IO接口。',
      action='撤销整包归入工作目录的方案；以后调整注册与引用前分别审核目录、存储、MOPJO的职责，不复制MOPJO实现。',
      state='RETRACTED_GUIDANCE_REVIEW_REQUIRED'),
 dict(key='V5-OWN-002',kind='code',owner='filesystem',title='旧文件服务打包了 MOPJO 与章节相关逻辑',
      observed='V5 plugins/filesystem/workspace-fs.js 同时含 workspace.list、boundary.ir.load 与 clean.chapter.begin/append/commit；后两类当前被白名单限制，但代码仍混在同一个 bundle。',
      expected='工作目录仅导航；底层IO服务只作通用授权读写；DIRjson语义归 MOPJO，章节清洗不在文件服务里实现。',
      action='先审核权威源码与调用边界；由原所有者拆开旧包的DIRjson和章节处理，保留文件接口与正确注册；不得把整包搬到工作目录。',
      state='BUNDLED_CROSS_DOMAIN_CODE_REVIEW_REQUIRED'))

def timestamp():return datetime.now(timezone.utc).isoformat(timespec='seconds')

def prepare(c):
 c.execute('''CREATE TABLE IF NOT EXISTS architecture_findings (
   finding_id TEXT PRIMARY KEY, kind TEXT NOT NULL, owner TEXT NOT NULL,
   title TEXT NOT NULL, expected TEXT NOT NULL, observed TEXT NOT NULL,
   corrective_action TEXT NOT NULL,
   status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','resolved')),
   created_at TEXT NOT NULL, resolved_at TEXT, resolution_evidence TEXT)''')
 c.execute('''CREATE TABLE IF NOT EXISTS architecture_reviews (
   id INTEGER PRIMARY KEY AUTOINCREMENT, finding_id TEXT NOT NULL,
   checked_at TEXT NOT NULL, outcome TEXT NOT NULL, evidence_json TEXT NOT NULL,
   FOREIGN KEY(finding_id) REFERENCES architecture_findings(finding_id))''')

def seed(c):
 prepare(c)
 count=0
 for f in FINDINGS:
  before=c.total_changes
  c.execute('''INSERT OR IGNORE INTO architecture_findings
   (finding_id,kind,owner,title,expected,observed,corrective_action,created_at)
   VALUES (?,?,?,?,?,?,?,?)''',(
    f['key'],f['kind'],f['owner'],f['title'],f['expected'],f['observed'],f['action'],timestamp()))
  count+=c.total_changes-before
 return count

def show(c):
 try:rows=c.execute("SELECT finding_id,kind FROM architecture_findings WHERE status='open' ORDER BY finding_id").fetchall()
 except sqlite3.OperationalError:return
 if rows:print('AEL_ARCHITECTURE_OPEN',len(rows),'ids='+','.join(i for i,k in rows),'advisory_only=true')

def review(c,root=ROOT,record=True):
 try:rows=c.execute('''SELECT finding_id,kind,owner,title,expected,observed,corrective_action,status
                              FROM architecture_findings ORDER BY finding_id''').fetchall()
 except sqlite3.OperationalError:return
 source=root/'plugins/filesystem/workspace-fs.js'
 bundle=source.read_text() if source.is_file() else ''
 for fid,kind,owner,title,expected,observed,action,status in rows:
  checks={k:k in bundle for k in ('workspace.list','boundary.ir.load','clean.chapter.begin','clean.chapter.append','clean.chapter.commit')}
  descriptor=root/'plugins/filesystem/plugin.json'
  registry=root/'plugins/registry.generated.js'
  bundle_active=bool(descriptor.exists() and json.loads(descriptor.read_text()).get('enabled',True)
      and 'ocr2md:filesystem' in registry.read_text())
  release_root=root.parent.parent/'.runtime/ocr2md-public'
  deployed=(release_root/'plugins/filesystem/workspace-fs.js').is_file()
  outcome=('RETRACTED_PROPOSAL_NOT_CODE_CHANGE' if kind=='proposal'
    else 'ACTIVE_CROSS_DOMAIN_SERVICE_DETECTED' if (bundle_active or deployed) and all(checks.values())
    else 'RUNTIME_QUARANTINED_LEGACY_SOURCE_REMAINS' if all(checks.values())
    else 'SOURCE_SPLIT_NEEDS_REVIEW')
  evidence=({'advice_only':True,'no_claim_of_code_mutation':True} if kind=='proposal' else
    {'file':'plugins/filesystem/workspace-fs.js','code_route_markers':checks,
     'active_in_registry':bundle_active,'published_legacy_file':deployed,
     'note':'Retirement of runtime != source split. Keep issue open until legacy source ownership is remediated.'})
  print(' AEL_ARCHITECTURE_FINDING',json.dumps(dict(id=fid,status=status,kind=kind,owner=owner,
   title=title,expected=expected,observed=observed,nextAction=action,check=outcome,
   evidence=evidence),ensure_ascii=False))
  if record:c.execute('INSERT INTO architecture_reviews(finding_id,checked_at,outcome,evidence_json) VALUES(?,?,?,?)',
    (fid,timestamp(),outcome,json.dumps(evidence,ensure_ascii=False)))
 show(c)

def resolve_retracted_proposal(conn,root=ROOT):
 """Close a *proposal*, never a source debt, with recorded proof.

 This records user-corrected design guidance and does not touch project code.
 """
 row=conn.execute("SELECT kind,status FROM architecture_findings WHERE finding_id='V5-OWN-001'").fetchone()
 if not row or row[0]!='proposal':raise ValueError('AEL_PROPOSAL_NOT_FOUND')
 if row[1]=='resolved':return False
 # Workspace is not yet registered; MOPJO is still the only owned IR source.
 registry=(root/'plugins/registry.generated.js').read_text()
 mopjo=(root.parent.parent/'packages/mopjo/src')
 if 'ocr2md:workspace' in registry or not mopjo.is_dir():
  raise ValueError('AEL_PROPOSAL_BOUNDARY_NOT_PROVEN')
 evidence={'kind':'incorrect_design_proposal','retracted':True,
           'workspace_not_registered':True,'mopjo_source_owned':str(mopjo),
           'code_change_for_this_proposal':False}
 conn.execute("UPDATE architecture_findings SET status='resolved',resolved_at=?,resolution_evidence=? WHERE finding_id='V5-OWN-001'",
              (timestamp(),json.dumps(evidence,ensure_ascii=False)))
 conn.execute('INSERT INTO architecture_reviews(finding_id,checked_at,outcome,evidence_json) VALUES(?,?,?,?)',
              ('V5-OWN-001',timestamp(),'PROPOSAL_RETRACTED_RESOLVED',json.dumps(evidence,ensure_ascii=False)))
 return True

if __name__=='__main__':
 import sys
 with sqlite3.connect(DB) as c:
  if len(sys.argv)>1 and sys.argv[1]=='seed':print('AEL_ARCHITECTURE_SEEDED',seed(c))
  elif len(sys.argv)>1 and sys.argv[1]=='review':review(c)
  elif len(sys.argv)>1 and sys.argv[1]=='resolve-proposal':print('AEL_PROPOSAL_RETRACTION_RESOLVED',resolve_retracted_proposal(c))
  else:show(c)
