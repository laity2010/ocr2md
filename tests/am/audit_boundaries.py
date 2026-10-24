#!/usr/bin/env python3
"""WP2: fail-closed static ownership/import review of every V6 ui/*.js file.

Only stdlib + Git AM schema/registry. Does not change business source or AM DB.
Use alongside existing AM edge/certification checks, not as a replacement.
"""
import argparse
import json
from pathlib import Path, PurePosixPath
import re
import sqlite3
import sys

ROOT = Path(__file__).resolve().parents[2]
CATALOG = Path(__file__).resolve().parent / 'ownership.json'
STATIC = re.compile(r'''(?m)^\s*(?:import|export)\s+(?:(?P<bindings>[^;'"`]*?)\s+from\s+)?['"](?P<target>\.[^'"]+)['"]''')
DYNAMIC = re.compile(r'\bimport\s*\(\s*([^)]*)\)', re.S)
RAW_STORE_WRITE = re.compile(r'\bviewStore\s*\.\s*setState\s*\(\s*\{\s*([A-Za-z_$][\w$]*)\s*:')


def load_registry(root):
    con = sqlite3.connect(':memory:')
    con.row_factory = sqlite3.Row
    con.executescript((root / 'tests/am/schema.sql').read_text())
    con.executescript((root / 'tests/am/registry.sql').read_text())
    modules = {row['id']: Path(row['source_file']).name
               for row in con.execute('SELECT id,source_file FROM modules')}
    edges = {(row['caller_module'] or 'shell',row['target_module'],row['source_file'])
             for row in con.execute("SELECT caller_module,target_module,source_file FROM access_edges WHERE classification='registered'")}
    return modules, edges


def scan_files(root, cfg, override=None):
    """Returns (metrics, findings), accepting text overrides for regression tests."""
    override = override or {}
    issues = []
    ui = root / 'ui'
    found = {p.name for p in ui.glob('*.js')}
    assignments = cfg['files']
    for name in sorted(found - assignments.keys()):
        issues.append(f'UNOWNED_UI_FILE {name}')
    for name in sorted(assignments.keys() - found):
        issues.append(f'MISSING_REGISTERED_UI_FILE {name}')
    modules, edges = load_registry(root)
    for module, path in sorted(modules.items()):
        if assignments.get(path) != module:
            issues.append(f'MODULE_OWNER_MISMATCH {module} entry={path} assigned={assignments.get(path)}')
    for name, owner in sorted(assignments.items()):
        if owner not in {'shared','shell',*modules}:
            issues.append(f'INVALID_OWNER {name} {owner}')
    shared = {name for name, owner in assignments.items() if owner == 'shared'}
    if shared != set(cfg['sharedConsumers']):
        issues.append(f'SHARED_POLICY_COVERAGE expected={sorted(shared)} actual={sorted(cfg["sharedConsumers"])}')
    for name, consumers in cfg['sharedConsumers'].items():
        if len(set(consumers)) != len(consumers) or any(c not in {'shell',*modules} for c in consumers):
            issues.append(f'INVALID_SHARED_CONSUMER {name} {consumers}')
    if any(assignments.get(name) != owner for owner,name in modules.items()):
        issues.append('MISSING_ENTRY_OWNERSHIP')
    imports=[]
    for name in sorted(found):
        caller = assignments.get(name)
        body = override.get(name, (ui/name).read_text(encoding='utf-8'))
        candidates = [(m.group('target'),'static',m.group('bindings')) for m in STATIC.finditer(body)]
        for m in DYNAMIC.finditer(body):
            arg = m.group(1).strip()
            if re.fullmatch(r'''['"]\.[^'"]+['"]''',arg):
                candidates.append((arg[1:-1],'dynamic',None))
            else:
                issues.append(f'UNRESOLVED_DYNAMIC_IMPORT {name} {arg[:100]}')
        # Avoid import duplicates due to re-exports. Every target must exist.
        for spec,mode,bindings in candidates:
            resolved = (PurePosixPath('ui')/name).parent.joinpath(spec)
            # pathlib doesn't remove '..': canonicalize by simple relative-path stack.
            parts=[]
            for part in resolved.parts:
                if part=='.':continue
                if part=='..':
                    if parts:parts.pop()
                    else:issues.append(f'PATH_ESCAPE {name} -> {spec}')
                else:parts.append(part)
            target = PurePosixPath(*parts)
            if not (root/target).is_file():
                issues.append(f'MISSING_IMPORT_TARGET {name} -> {spec}')
                continue
            if target.suffix!='.js':
                # Existing same-dir CSS is an asset, not a JS boundary.
                if target.suffix!='.css':
                    issues.append(f'UNCLASSIFIED_IMPORT_TARGET {name} -> {spec}')
                continue
            if target.parent != PurePosixPath('ui'):
                issues.append(f'OUTSIDE_UI_JS_IMPORT {name} -> {target}')
                continue
            other = target.name
            dest = assignments.get(other)
            imports.append((name,caller,other,dest,mode))
            if not caller or not dest:continue  # ownership findings already emitted
            if dest=='shared':
                if caller not in cfg['sharedConsumers'].get(other,[]):
                    issues.append(f'UNAPPROVED_SHARED_CONSUMER {name}({caller}) -> {other}')
            elif dest=='shell':
                if caller!='shell':
                    issues.append(f'MODULE_IMPORTS_SHELL {name}({caller}) -> {other}')
            elif caller==dest:
                continue
            else:
                if (caller,dest,f'ui/{name}') not in edges:
                    issues.append(f'UNREGISTERED_MODULE_IMPORT {name}({caller}) -> {other}({dest})')
                signature=f'{name}->{other}'
                approved=set(cfg['crossModuleBindings'].get(signature,[]))
                listed=re.findall(r'[A-Za-z_$][\w$]*',bindings.split('}')[0].split('{',1)[1]) if bindings and '{' in bindings and '}' in bindings else []
                if not listed or not set(listed).issubset(approved):
                    issues.append(f'UNAPPROVED_CROSS_SYMBOL {signature} imported={listed} approved={sorted(approved)}')
        # shared Zustand state writes are high-risk coupling; explicitly audit
        # each observed field and reject any newly introduced undeclared writer.
        if name != 'view-store.js':
            for m in RAW_STORE_WRITE.finditer(body):
                field = m.group(1)
                if field not in cfg['observedDirectStoreWrites'].get(name,[]):
                    issues.append(f'UNTRACKED_DIRECT_STORE_WRITE {name} field={field}')
    for writer in cfg['observedDirectStoreWrites']:
        if writer not in found or assignments.get(writer) in ('shared','shell',None):
            issues.append(f'INVALID_DIRECT_STORE_WRITER {writer}')
        body = override.get(writer,(ui/writer).read_text(encoding='utf-8')) if writer in found else ''
        active = set(RAW_STORE_WRITE.findall(body))
        stale = set(cfg['observedDirectStoreWrites'][writer])-active
        if stale:issues.append(f'STALE_DIRECT_STORE_WRITE {writer} {sorted(stale)}')
    cross = [i for i in imports if i[1] and i[3] in modules and i[1]!=i[3]]
    expected_cross={f'{src}->{dst}' for src,_,dst,owner,_ in cross}
    for signature in sorted(set(cfg['crossModuleBindings'])-expected_cross):
        issues.append(f'STALE_CROSS_BINDING_POLICY {signature}')
    shared_uses = [i for i in imports if i[3]=='shared']
    return {'ui_js':len(found),'modules':len(modules),'module_helpers':sum(owner in modules for owner in assignments.values())-len(modules),
            'shared_libraries':len(shared),'shell_files':sum(owner=='shell' for owner in assignments.values()),
            'js_imports':len(imports),'cross_module_imports':len(cross),
            'shared_imports':len(shared_uses),'known_state_writes':sum(len(v) for v in cfg['observedDirectStoreWrites'].values()),
            'cross_edges':[(i[0],i[2]) for i in cross]},issues


def main():
    p=argparse.ArgumentParser()
    p.add_argument('--json',action='store_true')
    args=p.parse_args()
    cfg=json.loads(CATALOG.read_text(encoding='utf-8'))
    if cfg.get('schemaVersion')!=1 or cfg.get('scope')!='ui/*.js':
        raise SystemExit('AM_WP2_CONFIG_INVALID')
    metrics,issues=scan_files(ROOT,cfg)
    if args.json:
        print(json.dumps({'metrics':metrics,'findings':issues},ensure_ascii=False,indent=2))
    else:
        print('AM_WP2_INVENTORY', json.dumps({k:v for k,v in metrics.items() if k!='cross_edges'},sort_keys=True))
        for caller,target in metrics['cross_edges']:
            print('AM_WP2_CROSS_IMPORT',caller,'->',target)
        for path,fields in cfg['observedDirectStoreWrites'].items():
            print('AM_WP2_REVIEW_DIRECT_STORE_WRITE',path,','.join(fields))
        for finding in issues:print('AM_WP2_VIOLATION',finding,file=sys.stderr)
    if issues:
        print(f'AM_WP2_FAIL violations={len(issues)}',file=sys.stderr)
        raise SystemExit(2)
    print('AM_WP2_PASS source_imports_and_ownership_verified=True dynamic_runtime_edges_not_proven=True')


if __name__=='__main__':
    main()
