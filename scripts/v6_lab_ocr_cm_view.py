"""Read-only SQLite CM View joining physical MD lines to logical block identity.

Three writable business data sets, no new mutable copy:
  minerujson (immutable OCR), block_review (logical relations), md_line (lines).
`block` and `cm_view` are projections. CM6 is the edit-time authority.
"""
from __future__ import annotations

from v6_lab_ocr_store import OCRImportError


def ensure_cm_view(db):
    """Idempotent additive schema view, called only in explicit write transactions.

    Never modifies content, source material, block review relations or line IDs.
    Legacy books with old `block` entities keep a compatible read projection.
    """
    existing=db.execute("SELECT type FROM sqlite_master WHERE name='cm_view'").fetchone()
    if existing:
        if existing[0]!='view':
            raise OCRImportError('cm_view 名称已被非视图对象占用，拒绝覆盖')
        return
    sources=dict(db.execute("SELECT name,type FROM sqlite_master "
                            "WHERE name IN ('block_review','block')"))
    if sources.get('block_review')=='table':
        source='block_review'
        fields=('r.source_root_id AS source_root_id,'
                'r.source_json_path AS source_json_path,'
                'r.absorbed_into_block_id AS absorbed_into_block_id')
    elif sources.get('block') in ('table','view'):
        source='block'
        fields=('NULL AS source_root_id,NULL AS source_json_path,'
                'NULL AS absorbed_into_block_id')
    else:
        raise OCRImportError('缺少逻辑块来源，无法构造 CM View')
    db.execute(f'''CREATE VIEW cm_view AS
       SELECT m.line_id,m.line_no,m.block_id,m.text,
              r.pbs,r.parent_block_id,r.sibling_order,r.global_page,
              r.source_block_key,{fields}
       FROM md_line AS m LEFT JOIN {source} AS r ON r.block_id=m.block_id''')
