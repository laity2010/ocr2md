/** Sentence Lab's public unit-version envelope, separate from CMD SHA and Gold.
 * SHA-256 commits the exact ordered translatable units and Main MD revision.
 * The returned JSON is source-only, not an AI translation result.
 */
export async function versionSentenceUnits(baseline,documentVersion,reviewRevision){
  if(baseline?.schema!=='ocr2md-translation-units/v1'||
     !Array.isArray(baseline.rows)||!baseline.rows.length||
     !/^[a-f0-9]{64}$/.test(documentVersion||'')||
     !/^[a-f0-9]{64}$/.test(reviewRevision||''))
    throw Error('发布句表前必须导入 Main 审阅 MD 并完成分句仲裁保存');
  const table={...baseline,documentVersion,reviewRevision};
  const sourceFields=['blockId','blockIds','decision','elementType','from','id',
    'original','sourceRanges','to','type'];
  const payload={documentVersion,sourceSha256:table.sourceSha256,
    reviewRevision,rows:table.rows.map(row=>Object.fromEntries(
      sourceFields.filter(k=>Object.hasOwn(row,k)).map(k=>[k,row[k]])))};
  // JSON key order must match the Python contract: recursive ASCII key sort,
  // but keep array order so a changed sentence sequence changes unitVersion.
  const canonical=JSON.stringify(payload,(_,value)=>value&&typeof value==='object'&&
    !Array.isArray(value)?Object.fromEntries(Object.entries(value).sort(([a],[b])=>
      a<b?-1:a>b?1:0)):value);
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(canonical));
  table.unitVersion=[...new Uint8Array(digest)]
    .map(value=>value.toString(16).padStart(2,'0')).join('');
  return table;
}
