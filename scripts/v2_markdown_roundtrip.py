"""WP03 public APIs: logical rows -> plain Markdown + external offsets -> rows.

No inline CMD tags, no DB/file I/O, no CM state, no Markdown-to-Mineru claim.
Until the edit/CM contract is implemented, inverse is strict READ-ONLY:
changing any bytes without a newly authorized span-edit contract is rejected.
"""
from __future__ import annotations
from hashlib import sha256
from dataclasses import replace
from v2_pbs import validate_pbs
from v2_logical_contract import LogicalRow

FORMAT='v2-logical-md/v2'
OWNED_FORMAT='v2-logical-md/v3'
MAX_MD_BYTES=8*1024*1024
MAX_ROWS=100000
SEP='\n\n'


def digest(value: str) -> str:
    return sha256(value.encode('utf-8')).hexdigest()


def length_utf16(text: str) -> int:
    return len(text.encode('utf-16-le'))//2


def checked_rows(rows):
    result=list(rows)
    if len(result)>MAX_ROWS:raise ValueError('逻辑块数量超出只读往返上限')
    if [r.logical_order for r in result]!=list(range(1,len(result)+1)):
        raise ValueError('逻辑顺序必须为连续整数 1..N')
    ids=[r.logical_id for r in result]
    if any(not isinstance(v,int) or v<=0 for v in ids) or len(set(ids))!=len(ids):
        raise ValueError('逻辑块 ID 重复或无效')
    linked={r.logical_id:r.parent_id for r in result}
    for row in result:
        if (not isinstance(row.base_blockid,int) or row.base_blockid<=0 or
                not isinstance(row.markdown_text,str) or not isinstance(row.block_type,str)):
            raise ValueError('逻辑块来源或文本无效')
        if any(v is not None for v in (row.p,row.b,row.s)) and not all(
                type(v) is int and v>=0 for v in (row.p,row.b,row.s)):
            raise ValueError('PBS p/b/s 必须完整且非负')
        if row.parent_id is not None and row.parent_id not in linked:
            raise ValueError('逻辑块父节点未定义')
    for id in ids:
        visited=set()
        current=id
        while current is not None:
            if current in visited:raise ValueError('逻辑块父子关系出现循环')
            visited.add(current)
            current=linked[current]
    return result


def from_sql_rows(rows):
    """Public adapter for existing SQL five-column records (not an extra table)."""
    return checked_rows([LogicalRow(row['logical_id'],row['base_blockid'],
                     row['parent_id'],row['logical_order'],row['md_block'],row['block_type'],
                     row['p'],row['b'],row['s'])
                     for row in rows])


def owned_rows(rows):
    """Validate the real-LF model; never manufacture or trim characters."""
    result=checked_rows(rows)
    coords=[dict(logical_id=r.logical_id,p=r.p,b=r.b,s=r.s) for r in result]
    groups=validate_pbs(coords)
    seen=set()
    for i,row in enumerate(result):
        key=(row.p,row.b)
        previous=result[i-1] if i else None
        if not previous or (previous.p,previous.b)!=key:
            if key in seen or row.s!=0:
                raise ValueError('PBS group is not contiguous or does not start at s0')
            seen.add(key)
        elif row.s<=previous.s:
            raise ValueError('PBS child order is invalid')
        if row.parent_id!=(None if row.s==0 else groups[key][0]):
            raise ValueError('PBS parent mismatch')
        next_row=result[i+1] if i+1<len(result) else None
        minimum=1 if next_row and (next_row.p,next_row.b)==key else 2
        if not row.markdown_text.endswith('\n'*minimum):
            raise ValueError('Missing owned LF at logical block '+str(row.logical_id))
        if '\r' in row.markdown_text:
            # CM6 normalizes CR/CRLF; never silently change existing text.
            raise ValueError('CR/CRLF requires explicit lossless migration review')
    return result


def preview_owned_migration(rows):
    """Pure read-only plan from legacy SQL rows. Match legacy CM6 projection
    exactly, including empty blocks and any previously authored extra LF.
    Already-owned LF is never appended a second time. No SQLite write API.
    """
    original=checked_rows(rows)
    migrated=[]
    changes=[]
    for i,row in enumerate(original):
        next_row=original[i+1] if i+1<len(original) else None
        minimum=1 if next_row and (next_row.p,next_row.b)==(row.p,row.b) else 2
        old=row.markdown_text
        tail=len(old)-len(old.rstrip('\n'))
        new=old+'\n'*max(0,minimum-tail)
        migrated.append(replace(row,markdown_text=new))
        if old!=new:
            changes.append(dict(logicalId=row.logical_id,before=old,after=new))
    owned_rows(migrated)
    return dict(snapshot=to_markdown(migrated,format=OWNED_FORMAT),changes=changes)


def to_markdown(rows, *, format=FORMAT):
    """Return document plus out-of-band complete logical-coordinate manifest."""
    if format not in (FORMAT,OWNED_FORMAT):raise ValueError('Unknown Markdown format')
    validated=owned_rows(rows) if format==OWNED_FORMAT else checked_rows(rows)
    pieces=[];spans=[];start_char=0;start_utf16=0;total_bytes=0
    for index,row in enumerate(validated):
        if index and format==FORMAT:
            pieces.append(SEP)
            start_char+=len(SEP);start_utf16+=length_utf16(SEP)
            total_bytes+=len(SEP.encode('utf-8'))
        chunk=row.markdown_text
        total_bytes+=len(chunk.encode('utf-8'))
        if total_bytes>MAX_MD_BYTES:raise ValueError('逻辑 Markdown 超过 8 MiB')
        end_char=start_char+len(chunk)
        end_utf16=start_utf16+length_utf16(chunk)
        spans.append({'logicalId':row.logical_id,'baseBlockId':row.base_blockid,
                      'parentId':row.parent_id,'logicalOrder':row.logical_order,
                      'blockType':row.block_type,
                      'p':row.p,'b':row.b,'s':row.s,
                      'startChar':start_char,'endChar':end_char,
                      'startUtf16':start_utf16,'endUtf16':end_utf16,
                      'fragmentSha256':digest(chunk)})
        pieces.append(chunk)
        start_char=end_char;start_utf16=end_utf16
    document=''.join(pieces)
    return {'schema':format,'markdown':document,'sha256':digest(document),
            'rowCount':len(validated),'lengthUtf16':start_utf16,'segments':spans}


def mdline_type_rows(rows):
    """Read-only physical MDLine metadata from one validated real-LF revision.

    The logical block already carries its own original MinerU element type.
    Children may share a base_blockid with their parent; never substitute
    the parent's type. No Markdown syntax classification or text duplication.
    """
    result=[]
    offset=0
    for block in owned_rows(rows):
        for line_offset,text in enumerate(block.markdown_text.split('\n')[:-1]):
            text_to=offset+length_utf16(text)
            result.append(dict(source_line=len(result)+1,logical_id=block.logical_id,
                               base_blockid=block.base_blockid,line_offset=line_offset,
                               **{'from':offset,'to':text_to+1,'textTo':text_to},
                               type=block.block_type))
            offset=text_to+1
    return result


def from_markdown(snapshot):
    """Strict inverse, reconstructing every original logical row without tags.

    Snapshot's external offsets are necessary; plain Markdown alone cannot
    distinguish adjacent/empty blocks or recover parent/base identities.
    """
    if not isinstance(snapshot,dict) or snapshot.get('schema') not in (FORMAT,OWNED_FORMAT):
        raise ValueError('Markdown 位置清单版本错误')
    format=snapshot['schema']
    md=snapshot.get('markdown')
    seg=snapshot.get('segments')
    if not isinstance(md,str) or not isinstance(seg,list):
        raise ValueError('Markdown 或位置清单格式错误')
    if len(md.encode('utf-8'))>MAX_MD_BYTES or len(seg)>MAX_ROWS:
        raise ValueError('Markdown 往返超过限定大小')
    if snapshot.get('rowCount')!=len(seg) or snapshot.get('sha256')!=digest(md):
        raise ValueError('Markdown 内容 SHA 或块数量已发生变化')
    if snapshot.get('lengthUtf16')!=length_utf16(md):
        raise ValueError('Markdown UTF-16 长度不一致')
    rows=[];cursor=0;cursor16=0
    for index,item in enumerate(seg):
        if not isinstance(item,dict):raise ValueError('逻辑块位置项格式无效')
        if index and format==FORMAT:
            if md[cursor:cursor+len(SEP)]!=SEP:
                raise ValueError('逻辑块分隔符已变化')
            cursor+=len(SEP);cursor16+=length_utf16(SEP)
        begin=item.get('startChar');end=item.get('endChar')
        if not isinstance(begin,int) or not isinstance(end,int) or begin!=cursor or end<begin or end>len(md):
            raise ValueError('逻辑块字符区间无效')
        fragment=md[begin:end]
        if (item.get('startUtf16')!=cursor16 or
                item.get('endUtf16')!=cursor16+length_utf16(fragment) or
                item.get('fragmentSha256')!=digest(fragment)):
            raise ValueError('逻辑块位置或文本哈希不一致')
        rows.append(LogicalRow(item.get('logicalId'),item.get('baseBlockId'),
                      item.get('parentId'),item.get('logicalOrder'),fragment,item.get('blockType'),
                      item.get('p'),item.get('b'),item.get('s')))
        cursor=end;cursor16+=length_utf16(fragment)
    if cursor!=len(md) or cursor16!=length_utf16(md):
        raise ValueError('Markdown 结尾存在未映射内容')
    return owned_rows(rows) if format==OWNED_FORMAT else checked_rows(rows)
