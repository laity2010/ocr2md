#!/usr/bin/env python3
"""Build a Shared Settings candidate in its OWN project; do not deploy V5.

The subsequent V5 publisher only reads this immutable, source-hash-pinned artifact.
"""
import hashlib,json,os,re,shutil,subprocess
from pathlib import Path

v5=Path(__file__).resolve().parent.parent
repo=v5.parent.parent
settings=repo.parent/'agent-link-monitor/shared-settings'
candidate_root=repo/'.runtime/ocr2md-component-candidates'
artifact_root=candidate_root/'shared-settings'
pointer=candidate_root/'shared-settings-current.json'

def digest_source():
    inputs=[settings/'package.json',settings/'package-lock.json',
            settings/'scripts/build.mjs',*(settings/'src').rglob('*.js')]
    actual=sorted(set(p for p in inputs if p.is_file()))
    if not (settings/'package.json').is_file() or not (settings/'scripts/build.mjs').is_file():
        raise RuntimeError('SETTINGS_SOURCE_NOT_AVAILABLE')
    entries=[str(p.relative_to(settings))+':'+hashlib.sha256(p.read_bytes()).hexdigest() for p in actual]
    return hashlib.sha256('\n'.join(entries).encode()).hexdigest()

def main():
    version=json.loads((settings/'package.json').read_text())['version']
    source_sha=digest_source()
    result=subprocess.run(['npm','run','build'],cwd=settings,capture_output=True,text=True,timeout=95)
    if result.returncode:raise RuntimeError('SHARED_SETTINGS_MODULE_BUILD_FAILED '+result.stderr[-1200:])
    report=re.search(r'FASTDEV_CANDIDATE_BUILD_OK\s+(\{[^\n]+\})',result.stdout)
    if not report:raise RuntimeError('SHARED_SETTINGS_BUILD_REPORT_MISSING')
    output=Path(json.loads(report.group(1))['directory']).resolve()
    if not output.is_dir():raise RuntimeError('SHARED_SETTINGS_BUILD_OUTPUT_MISSING')
    if digest_source()!=source_sha:raise RuntimeError('SHARED_SETTINGS_SOURCE_CHANGED_DURING_BUILD')
    artifact_root.mkdir(parents=True,exist_ok=True)
    staged=artifact_root/('pending-'+str(os.getpid()))
    staged.mkdir(exist_ok=False)
    try:
        files={}
        for name in ('settings-panel.js','settings-grid.js'):
            content=(output/name).read_bytes()
            (staged/name).write_bytes(content)
            files[name]=hashlib.sha256(content).hexdigest()
        identity=hashlib.sha256((source_sha+':'+version+':'+':'.join(files.values())).encode()).hexdigest()[:24]
        target=artifact_root/identity
        if target.exists():
            for name,digest in files.items():
                if hashlib.sha256((target/name).read_bytes()).hexdigest()!=digest:
                    raise RuntimeError('SHARED_SETTINGS_EXISTING_ARTIFACT_MISMATCH')
        else:
            os.replace(staged,target)
        record={'version':version,'sourceDigest':source_sha,'artifact':identity,'files':files}
        tmp=pointer.with_name(pointer.name+'.tmp-'+str(os.getpid()))
        tmp.write_text(json.dumps(record,ensure_ascii=False,sort_keys=True,indent=2)+'\n')
        os.replace(tmp,pointer)
        print('SHARED_SETTINGS_MODULE_CANDIDATE_READY',json.dumps(record,sort_keys=True))
    finally:
        if staged.exists():shutil.rmtree(staged)

if __name__=='__main__':main()
