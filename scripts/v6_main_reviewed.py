"""Main-owned, lossless reviewed Markdown handoff from the saved CMD.

The reviewed document contains no segmentation or translation decisions. It
only removes workflow comments and joins explicitly reviewed CMD `lb=m`
seams. Every removed byte is carried in reversible UTF-16 patch evidence.
"""
import hashlib
import json
import os
import re
import secrets
from pathlib import Path

SCHEMA = 'ocr2md-main-reviewed/v1'
MAX_SOURCE_BYTES = 8 * 1024 * 1024
WORK_COMMENT = re.compile(r'<!--\s*(?:minerujson|cmd|ocr2md):[\s\S]*?-->')
BLOCK_TAG = re.compile(r'<!--\s*cmd:block:v1\s+id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"[^\n]*?-->')
FULL_TAG = re.compile(r'^[ \t>]*<!--\s*cmd:block:v1\s+id="(p\d+b\d+(?:s\d+(?:\.\d+)*)?)"[^\n]*?-->[ \t]*$')


def sha(value):
    return hashlib.sha256(value).hexdigest()


def u16(text):
    return len(text.encode('utf-16-le')) // 2


def _comment_edits(source):
    edits = []
    for match in WORK_COMMENT.finditer(source):
        start, end = match.span()
        line_start = source.rfind('\n', 0, start) + 1
        leading = source[line_start:start]
        trailing = end
        while trailing < len(source) and source[trailing] in ' \t':
            trailing += 1
        if not leading.strip() and (trailing == len(source) or source[trailing] in '\r\n'):
            start, end = line_start, trailing
            while source.startswith(('\r\n', '\n'), end):
                end += 2 if source.startswith('\r\n', end) else 1
        edits.append({'from':start,'to':end,'insert':'','kind':'provenance'})
    return edits


def _reviewed_joins(source):
    lines = []
    offset = 0
    for text in source.splitlines(keepends=True):
        lines.append((offset,text))
        offset += len(text)
    result = []
    for i,(at,text) in enumerate(lines):
        marker = FULL_TAG.fullmatch(text.rstrip('\r\n'))
        if not marker or 'lb="m"' not in text:
            continue
        prior = i-1
        while prior>=0 and not lines[prior][1].strip():
            prior-=1
        after = i+1
        while after<len(lines) and not lines[after][1].strip():
            after+=1
        if prior<0 or after>=len(lines):
            raise ValueError('Reviewed CMD linebreak lacks adjacent prose: '+marker[1])
        left_start,left_line = lines[prior]
        right_start,right_line = lines[after]
        if not left_line.strip() or not right_line.strip() or \
           BLOCK_TAG.search(left_line) or BLOCK_TAG.search(right_line):
            raise ValueError('Reviewed CMD linebreak has no safe prose: '+marker[1])
        start = left_start+len(left_line.rstrip('\r\n').rstrip(' \t'))
        end = right_start+len(right_line)-len(right_line.lstrip(' \t'))
        gap = source[start:end]
        matches = list(BLOCK_TAG.finditer(gap))
        if len(matches)!=1 or matches[0].group(1)!=marker[1] or \
           gap.replace(matches[0].group(),'').strip():
            raise ValueError('Reviewed CMD gap contains other content: '+marker[1])
        result.append({'from':start,'to':end,'insert':' ',
                       'kind':'reviewed-break','blockId':marker[1]})
    return result


def project(source_bytes, document_name=''):
    if not isinstance(source_bytes, bytes) or not 0 < len(source_bytes) <= MAX_SOURCE_BYTES:
        raise ValueError('Invalid CMD document size')
    source = source_bytes.decode('utf-8')
    edits = _comment_edits(source)
    joins = _reviewed_joins(source)
    for join in joins:
        remain = []
        for e in edits:
            if e['to']<=join['from'] or e['from']>=join['to']:
                remain.append(e)
            elif e['from']>=join['from'] and e['to']<=join['to']:
                continue
            else:
                raise ValueError('CMD provenance overlaps reviewed linebreak')
        edits = remain
    edits += joins
    edits.sort(key=lambda e:(e['from'],e['to']))
    chunks, patches, cursor, length_cp, length_u16 = [], [], 0, 0, 0
    for edit in edits:
        start,end=edit['from'],edit['to']
        if start<cursor or end<=start:
            raise ValueError('Overlapping reviewed projection edits')
        unchanged = source[cursor:start]
        chunks.append(unchanged)
        length_cp+=len(unchanged)
        length_u16+=u16(unchanged)
        insert=edit['insert']
        patches.append({
            'from':u16(source[:start]), 'to':u16(source[:end]),
            'insert':insert, 'kind':edit['kind'],
            **({'blockId':edit['blockId']} if 'blockId' in edit else {}),
            'removed':source[start:end],
            'outputFrom':length_u16,'outputTo':length_u16+u16(insert)})
        chunks.append(insert)
        length_cp+=len(insert)
        length_u16+=u16(insert)
        cursor=end
    chunks.append(source[cursor:])
    reviewed=''.join(chunks)
    def mapped(offset):
        change=0
        for edit in edits:
            if offset<edit['from']:
                return offset-change
            if offset<edit['to']:
                return edit['from']-change
            change+=(edit['to']-edit['from'])-len(edit['insert'])
        return offset-change
    block_anchors=[]
    for m in BLOCK_TAG.finditer(source):
        block_anchors.append({'id':m[1],
                              'sourceFrom':u16(source[:m.start()]),
                              'reviewedFrom':u16(reviewed[:mapped(m.start())])})
    if not block_anchors:
        raise ValueError('Main document has no sealed CMD block tags; not a reviewed MD')
    # Inverse every edit in reverse order: strict equality guarantees lossless
    # text, including inline comments, protected Markdown and Unicode.
    restored=reviewed
    for edit in reversed(edits):
        p=mapped(edit['from'])
        assert restored[p:p+len(edit['insert'])]==edit['insert']
        restored=restored[:p]+source[edit['from']:edit['to']]+restored[p+len(edit['insert']):]
    if restored!=source:
        raise ValueError('Reviewed Markdown not reversible')
    return {'schema':SCHEMA,'sourceCmdSha256':sha(source_bytes),
            'documentVersion':sha(reviewed.encode('utf-8')),
            'documentName':document_name,
            'sourceCmd':source,'reviewedMd':reviewed,
            'sourceMap':{'coordinate':'UTF-16','patches':patches,
                         'blockAnchors':block_anchors},
            'stats':{'reviewedJoins':len(joins), 'removedComments':len(patches)-len(joins),
                     'restored':True}}


def validate(packet):
    if not isinstance(packet,dict) or packet.get('schema') != SCHEMA or \
       not isinstance(packet.get('sourceCmd'),str) or \
       not isinstance(packet.get('reviewedMd'),str) or \
       not isinstance(packet.get('sourceMap'),dict):
        raise ValueError('Invalid Main reviewed document envelope')
    expected=project(packet['sourceCmd'].encode('utf-8'),packet.get('documentName',''))
    if packet != expected:
        raise ValueError('Main reviewed document or mapping mismatch')
    return packet


def _atomic(path,content):
    path.parent.mkdir(parents=True,exist_ok=True)
    tmp=path.with_name('.'+path.name+'.'+secrets.token_hex(5)+'.tmp')
    try:
        with tmp.open('xb') as out:
            os.fchmod(out.fileno(),0o600)
            out.write(content)
            out.flush();os.fsync(out.fileno())
        os.replace(tmp,path)
    finally:
        tmp.unlink(missing_ok=True)


def publish(directory,packet):
    """Main owns its current reviewed.md; consumers never mutate it."""
    validate(packet)
    target=Path(directory)
    md=packet['reviewedMd'].encode('utf-8')
    metadata={k:v for k,v in packet.items() if k not in ('sourceCmd','reviewedMd')}
    _atomic(target/'reviewed.md',md)
    _atomic(target/'reviewed.manifest.json',json.dumps(metadata,ensure_ascii=False).encode('utf-8'))
    return target/'reviewed.md'
