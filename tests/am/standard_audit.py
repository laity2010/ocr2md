#!/usr/bin/env python3
"""One reproducible AM/Git audit evidence format for Main, Grok and Muse.

Read-only inspection of the immutable source checkout + isolated AM test DB.
Does not infer that integration labels prove every API, or that static imports
prove the absence of runtime coupling. Writes only under caller-supplied report dir.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sqlite3
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[2]
AM = ROOT / 'tests/am'
sys.path.insert(0, str(AM))
import audit_boundaries

# Match literal semantic event sites. Expressions/aliases require manual review.
DOM_PUBLISH = re.compile(r'new\s+CustomEvent\s*\(\s*[\'\"]([^\'\"]+)[\'\"]')
DOM_SUBSCRIBE = re.compile(r'\baddEventListener\s*\(\s*[\'\"]([^\'\"]+)[\'\"]')
RUNTIME_SURFACES = re.compile(r'viewStore\s*\.\s*(?:subscribe|getState|setState)\s*\(|\bwindow\.__v6cm6\b|\b(?:document|window)\.(?:querySelector|getElementById)\s*\(')


def source_hash(path):
    p = ROOT / path
    return hashlib.sha256(p.read_bytes()).hexdigest() if p.is_file() else None


def git(*args):
    result = subprocess.run(['git', *args], cwd=ROOT, capture_output=True, text=True, check=False)
    return result.returncode, result.stdout.strip(), result.stderr.strip()


def discover_surfaces(directory, registered_dom):
    events = []
    surfaces = []
    for p in sorted(directory.glob('*.js')):
        body = p.read_text(encoding='utf-8')
        for i, line in enumerate(body.splitlines(), 1):
            for kind, regex in (('publish', DOM_PUBLISH), ('subscribe', DOM_SUBSCRIBE)):
                for match in regex.finditer(line):
                    topic = match.group(1)
                    if topic.startswith('ocr2md:') or topic == 'settings.changed':
                        events.append({'file':p.relative_to(ROOT).as_posix(), 'line':i,
                                       'kind':kind,'topic':topic,'registered':topic in registered_dom})
            if RUNTIME_SURFACES.search(line):
                surfaces.append({'file':p.relative_to(ROOT).as_posix(), 'line':i,
                                 'expression':line.strip()[:200]})
    return events, surfaces


def evidence(db_path, expected_sha):
    if not db_path.is_file():
        return {'status':'MISSING','note':'isolated AM DB not created; no test results may be claimed'}
    con = sqlite3.connect(f'file:{db_path}?mode=ro', uri=True)
    con.row_factory = sqlite3.Row
    try:
        def all_rows(query, args=()): return [dict(row) for row in con.execute(query,args)]
        contracts = all_rows('SELECT id,api_id,message_id,publisher_id,subscription_id,script,evidence,expected FROM test_cases ORDER BY id')
        statuses = all_rows('SELECT t.id, (SELECT r.status FROM test_runs r WHERE r.case_id=t.id AND r.git_commit=? ORDER BY r.id DESC LIMIT 1) AS status FROM test_cases t ORDER BY t.id', (expected_sha,))
        by_id = {r['id']:r['status'] for r in statuses}
        for row in contracts: row['status'] = by_id[row['id']]
        total = len(contracts)
        passed = sum(row['status']=='PASS' for row in contracts)
        direct = sum(row['evidence']=='direct' for row in contracts)
        integration = total - direct
        apis = all_rows('SELECT id,module_id,symbol,visibility,source_file FROM apis ORDER BY id')
        messages = all_rows('SELECT id,transport,topic FROM messages ORDER BY id')
        pubs = all_rows('SELECT id,message_id,module_id,source_file FROM publishers ORDER BY id')
        subs = all_rows('SELECT id,message_id,module_id,source_file FROM subscriptions ORDER BY id')
        edges = all_rows('SELECT id,caller_module,target_module,source_file,classification,api_id FROM access_edges ORDER BY id')
        by_api = {row['id']:[] for row in apis}
        for row in contracts:
            if row['api_id']: by_api[row['api_id']].append(row)
        api_detail = [dict(row, cases=[{'id':x['id'],'evidence':x['evidence'],'status':x['status']} for x in by_api[row['id']]]) for row in apis]
        return {'status':'COMPLETE' if total and passed==total else 'INCOMPLETE',
                'cases_total':total,'cases_passed':passed,
                'direct_case_links':direct,'integration_case_links':integration,
                'apis_total':len(apis),'api_directly_tested':sum(any(x['evidence']=='direct' and x['status']=='PASS' for x in by_api[a['id']]) for a in apis),
                'api_without_direct_test':[a['id'] for a in apis if not any(x['evidence']=='direct' and x['status']=='PASS' for x in by_api[a['id']])],
                'messages':messages,'publishers_total':len(pubs),'subscriptions_total':len(subs),
                'access_edges':edges,'test_cases':contracts,'apis':api_detail}
    finally: con.close()


def make_report(source_sha, runner_exit, output_dir, isolated_dir):
    code, actual, error = git('rev-parse', 'HEAD')
    code2, dirty, _ = git('status','--porcelain')
    hashes = {p:source_hash(p) for p in (
        'AGENTS.md','AUDIT.md','tests/am/schema.sql','tests/am/registry.sql',
        'tests/am/ownership.json','tests/am/audit_boundaries.py',
        'tests/am/run-standard-audit.sh','tests/am/run-grok-audit.sh',
        'tests/am/standard_audit.py','packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md')}
    cfg = json.loads((AM/'ownership.json').read_text(encoding='utf-8'))
    metrics, static_issues = audit_boundaries.scan_files(ROOT,cfg)
    # Use source snapshot registry, not mutable local user/test databases.
    registry = sqlite3.connect(':memory:')
    try:
        registry.executescript((AM/'schema.sql').read_text())
        registry.executescript((AM/'registry.sql').read_text())
        dom_topics = {r[0] for r in registry.execute("SELECT topic FROM messages WHERE transport='dom'")}
    finally: registry.close()
    events, surfaces = discover_surfaces(ROOT/'ui',dom_topics)
    unregistered_events = [r for r in events if not r['registered']]
    # Subscriber-only dormant code remains a review finding, not proof it executed.
    unregistered_publishers = [r for r in unregistered_events if r['kind']=='publish']
    db = isolated_dir/'.v6/tests/am.sqlite' if isolated_dir else Path('/unavailable/am.sqlite')
    results = evidence(db,source_sha)
    problems = []
    if code or actual != source_sha: problems.append('SOURCE_SHA_MISMATCH')
    if code2 or dirty: problems.append('DIRTY_SOURCE_CHECKOUT')
    if static_issues: problems.append('STATIC_BOUNDARY_VIOLATIONS')
    if unregistered_publishers: problems.append('UNREGISTERED_DOM_PUBLISHERS')
    if runner_exit != 0: problems.append('AUDIT_RUNNER_NONZERO')
    if results['status']!='COMPLETE': problems.append('AM_RESULTS_INCOMPLETE')
    # Absence of dynamic findings cannot establish that every indirect call was found.
    reviews = []
    if unregistered_events:
        reviews.append('Unregistered literal DOM event sites require removal, registration of a real contract, or evidence they are unreachable.')
    if results.get('api_without_direct_test'):
        reviews.append('Integration-only API evidence does not establish independent API invocation; review each listed API against its real interface and add direct test where needed.')
    reviews.append('Manually examine dynamic/DOM/shared-store callsites and trace caller -> registered API/message -> receiver; static ownership PASS alone does not prove all runtime boundaries.')
    if runner_exit==2: status='BLOCKED'
    elif problems: status='FAIL'
    else: status='REVIEW_REQUIRED'
    report = {
        'schema':'ocr2md.am-git.standard-audit.v1','time_utc':datetime.now(timezone.utc).isoformat(),
        'status':status,'source_sha':source_sha,'checkout_sha':actual,'source_clean':not bool(dirty),
        'environment':{'os':sys.platform,'python':sys.version.split()[0]},
        'source_manifest_sha256':hashlib.sha256(json.dumps(hashes,sort_keys=True).encode()).hexdigest(),
        'source_hashes':hashes,'runner_exit_code':runner_exit,
        'runner_log':'run.log','isolated_worktree':str(isolated_dir) if isolated_dir else None,
        'am':results,'boundary':{'ownership':metrics,'static_findings':static_issues,
                'literal_dom_events':events,'unregistered_event_sites':unregistered_events,
                'runtime_callsite_review_inventory':surfaces,
                'runtime_exhaustive_proof':False},
        'failures':problems,'manual_review_required':reviews,
        'git_remediation':'For a confirmed bypass: preserve evidence; git blame/log origin; git revert offending commit or reconstruct last compliant revision in separate worktree; rerun same audit. Do not whitelist bypasses.',
        'auditor_signoff':{'auditor':None,'runtime_review':'PENDING','decision':'NOT_SIGNED'},
    }
    output_dir.mkdir(parents=True, exist_ok=True)
    (output_dir/'report.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    lines = [f'# OCR2MD AM/Git 标准审计 · {source_sha[:12]}',
             f'总体自动判定：**{status}**（不代表外部 AI 独立签字）',
             f'源码 SHA：`{source_sha}`；检出 SHA：`{actual}`；工作树干净：`{not bool(dirty)}`',
             f'快照清单 SHA256：`{report["source_manifest_sha256"]}`',
             f'Runner 返回码：`{runner_exit}`；原始执行证据：`run.log`',
             '', '## 接口和消息的实际测试',
             f'- AM 用例：{results.get("cases_passed","未执行")}/{results.get("cases_total","未执行")}',
             f'- 接口数：{results.get("apis_total","未执行")}；有直接 PASS 测试的接口：{results.get("api_directly_tested","未执行")}',
             f'- 测试关联：直接 {results.get("direct_case_links","未执行")}、集成 {results.get("integration_case_links","未执行")}',
             f'- 无直接测试接口：{", ".join(results.get("api_without_direct_test",[])) or "无 / 未执行"}',
             '', '## 跨模块边界',
             f'- 检查 UI 文件：{metrics["ui_js"]}；跨模块 import：{metrics["cross_module_imports"]}；静态违规：{len(static_issues)}',
             f'- 未登记的 DOM 事件调用点：{len(unregistered_events)}；其他运行时调用点需复审：{len(surfaces)}',
             '- 自动检查无法对所有动态间接调用作穷举证明，不能由零静态违规推导零越界。',
             '', '## 失败与发现']
    lines.extend(f'- {x}' for x in (problems+static_issues) or ['无自动发现的直接 FAIL'])
    lines.extend(['', '## 未登记事件调用点'])
    lines.extend(f'- `{x["file"]}:{x["line"]}` {x["kind"]} `{x["topic"]}`' for x in unregistered_events)
    if not unregistered_events: lines.append('- 无字面量未登记事件（不能证明没有动态事件）')
    lines.extend(['', '## 必须由每名审计者独立核实'])
    lines.extend(f'- [ ] {x}' for x in reviews)
    lines.extend(['', '## 动态调用点定位清单'])
    lines.extend(f'- `{x["file"]}:{x["line"]}` `{x["expression"]}`' for x in surfaces)
    lines.extend(['', '## Git 处置与签字',
                  '- 已确认越界：Git blame/log 归因，保全原始证据，撤销违规提交（优先 git revert），新 SHA 复验。',
                  '- 审计者：**待独立填写**；动态审阅：**PENDING**；SOURCE_MERGE：**待判定**；PRODUCTION_CUTOVER：**待判定**。',
                  '- 本报告是审计自动底稿；审计者必须列出额外代码取证、实际测试、排除或确认每项 REVIEW 的理由。'])
    (output_dir/'report.md').write_text('\n'.join(lines)+'\n',encoding='utf-8')
    print(f'AM_STANDARD_REPORT status={status} sha={source_sha} output={output_dir}')
    print(f'AM_STANDARD_COUNTS direct_api_pass={results.get("api_directly_tested","NA")}/{results.get("apis_total","NA")} static_findings={len(static_issues)} unregistered_event_sites={len(unregistered_events)} runtime_review={len(surfaces)}')
    return status


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--source-sha',required=True)
    ap.add_argument('--runner-exit',type=int,required=True)
    ap.add_argument('--output-dir',type=Path,required=True)
    ap.add_argument('--isolated-dir',type=Path)
    args=ap.parse_args()
    if not re.fullmatch('[0-9a-f]{40}',args.source_sha):ap.error('full 40-character SHA required')
    status=make_report(args.source_sha,args.runner_exit,args.output_dir,args.isolated_dir)
    return {'REVIEW_REQUIRED':3,'BLOCKED':2,'FAIL':1}[status]

if __name__=='__main__':raise SystemExit(main())
