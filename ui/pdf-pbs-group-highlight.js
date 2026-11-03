/** PDF group-highlighting membership. Pure, physical bbox independent.
 * Parent selection is anchored by ORIGINAL OCR provenance, whereas all
 * child member labels are current, reorderable CMD PBS identities. */
export function projectPDFParentGroup(rows,parentOrigin){
  const parent=typeof parentOrigin==='string'?
    rows.find(row=>row.origin===parentOrigin&&/^p\d+b\d+$/.test(row.id)):null;
  const prefix=parent?parent.id+'s':null;
  return {parentId:parent?.id||null,
    cover:id=>Boolean(prefix&&(id===parent.id||id.startsWith(prefix))),
    child:id=>Boolean(prefix&&typeof id==='string'&&id.startsWith(prefix))};
}
