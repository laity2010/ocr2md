"""Only explicit, versioned and locally isolated Main→Sentence Lab import.

Consumes the Main HTTP API envelope; never opens Main's filesystem. A changed
source archives both the old local CMD snapshot and sentence arbitration before
activating the new copy under the Lab's own lock.
"""
import json
from datetime import datetime, timezone
from pathlib import Path
from v6_main_reviewed import validate, sha, _atomic
from v6_sentence_review import empty


def import_snapshot(runtime, doc, packet, expected_source_sha):
    validate(packet)
    runtime,doc=Path(runtime),Path(doc)
    if doc.resolve()!= (runtime/'document.md').resolve():
        raise ValueError('Only the Lab default isolated CMD snapshot can be imported')
    if doc.is_symlink() or not doc.is_file() or not isinstance(expected_source_sha,str):
        raise ValueError('Missing or unsafe Lab source snapshot')
    current=doc.read_bytes()
    current_sha=sha(current)
    if expected_source_sha!=current_sha:
        raise ValueError('Lab snapshot changed since import was requested')
    updated=packet['sourceCmd'].encode('utf-8')
    new_sha=packet['sourceCmdSha256']
    sidecar=runtime/'document.sentences.review.json'
    if sidecar.is_symlink():
        raise ValueError('Unsafe sentence review sidecar')
    old_review=sidecar.read_bytes() if sidecar.exists() else None
    incoming=runtime/'imports'/new_sha
    if incoming.exists() and incoming.is_symlink():
        raise ValueError('Unsafe imported revision path')
    incoming.mkdir(parents=True,exist_ok=True)
    def archived(path,payload):
        if path.is_symlink():
            raise ValueError('Unsafe archive')
        if path.exists():
            if path.read_bytes()!=payload:
                raise ValueError('Archived version conflicts: '+path.name)
        else:
            _atomic(path,payload)
    archived(incoming/'reviewed.md',packet['reviewedMd'].encode('utf-8'))
    archived(incoming/'document.md',updated)
    archived(incoming/'main-reviewed.json',json.dumps(packet,ensure_ascii=False).encode('utf-8'))
    changed=current_sha!=new_sha
    if changed:
        old_archive=runtime/'imports'/current_sha
        old_archive.mkdir(parents=True,exist_ok=True)
        archived(old_archive/'document.md',current)
        if old_review is not None:
            archived(old_archive/'document.sentences.review.json',old_review)
        # Both artifacts have been archived before any active file changes.
        new_review=json.dumps(empty(new_sha),ensure_ascii=False).encode('utf-8')
        _atomic(sidecar,new_review)
        _atomic(doc,updated)
    # Repeated imports of identical Main content never touch sentence review.
    manifest={'schema':'ocr2md-lab-snapshot/v2',
        'source':'Main GET /api/main-reviewed (read-only published API)',
        'source_document_name':packet['documentName'],
        'source_sha256':new_sha,'documentVersion':packet['documentVersion'],
        'imported_utc':datetime.now(timezone.utc).isoformat(),
        'read_only_workflow':True,'reviewed_md_path':'imports/'+new_sha+'/reviewed.md'}
    _atomic(runtime/'main-reviewed-snapshot.json',json.dumps(manifest,ensure_ascii=False).encode('utf-8'))
    return {'sourceSha256':new_sha,'documentVersion':packet['documentVersion'],
            'reviewedJoins':packet['stats']['reviewedJoins'],
            'changedSource':changed}


def current_snapshot(runtime,doc):
    runtime,doc=Path(runtime),Path(doc)
    meta=runtime/'main-reviewed-snapshot.json'
    if not meta.is_file() or meta.is_symlink():
        raise ValueError('Main reviewed MD has not yet been imported')
    data=json.loads(meta.read_text(encoding='utf-8'))
    if data.get('schema')!='ocr2md-lab-snapshot/v2' or \
       data.get('source_sha256')!=sha(doc.read_bytes()) or \
       not isinstance(data.get('documentVersion'),str):
        raise ValueError('Imported Main reviewed version is stale or missing')
    packet_path=runtime/'imports'/data['source_sha256']/'main-reviewed.json'
    if packet_path.is_symlink() or not packet_path.is_file():
        raise ValueError('Imported reviewed packet missing')
    pkt=json.loads(packet_path.read_text(encoding='utf-8'))
    validate(pkt)
    if pkt['documentVersion']!=data['documentVersion']:
        raise ValueError('Imported Main reviewed version mismatch')
    return {'documentVersion':data['documentVersion'],
            'sourceCmdSha256':data['source_sha256'],
            'reviewedJoins':pkt['stats']['reviewedJoins']}
