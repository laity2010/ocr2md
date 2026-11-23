"""WP03 public APIs: logical rows -> plain Markdown + external offsets -> rows.

No inline CMD tags, no DB/file I/O, no CM state, no Markdown-to-Mineru claim.
Until the edit/CM contract is implemented, inverse is strict READ-ONLY:
changing any bytes without a newly authorized span-edit contract is rejected.
"""
from __future__ import annotations
from hashlib import sha256
from v2_logical_contract import LogicalRow

FORMAT='v2-logical-md/v2'
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


def to_markdown(rows):
    """Return document plus out-of-band complete logical-coordinate manifest."""
    validated=checked_rows(rows)
    pieces=[];spans=[];start_char=0;start_utf16=0;total_bytes=0
    for index,row in enumerate(validated):
        if index:
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
    return {'schema':FORMAT,'markdown':document,'sha256':digest(document),
            'rowCount':len(validated),'lengthUtf16':start_utf16,'segments':spans}


def from_markdown(snapshot):
    """Strict inverse, reconstructing every original logical row without tags.

    Snapshot's external offsets are necessary; plain Markdown alone cannot
    distinguish adjacent/empty blocks or recover parent/base identities.
    """
    if not isinstance(snapshot,dict) or snapshot.get('schema')!=FORMAT:
        raise ValueError('Markdown 位置清单版本错误')
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
        if index:
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
    return checked_rows(rows)
