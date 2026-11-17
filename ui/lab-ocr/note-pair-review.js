/** WP3.1: human decisions decorate only the current WP1/WP2 projection.
 * Decisions are not converted Markdown. Validity requires identical CM6 line
 * evidence AND the same selected source-body candidate still in this view.
 */
export const NOTE_REVIEW_DECISIONS=Object.freeze(['待定','待转换','忽略']);

export function projectReviewedNoteRows(projection,reviews,mdRows,{showIgnored=false,dirty=false}={}){
  const references=new Map(projection.index.references.map(item=>[item.candidate_id,item]));
  const bodies=new Map(projection.index.bodies.map(item=>[item.candidate_id,item]));
  const lines=new Map(mdRows.map(item=>[item.line_id,item]));
  const convertedById=new Map();
  for(const saved of reviews.values()){
    const id=saved?.conversion?.converted_ref_id;
    if(id)convertedById.set(id,saved);
  }
  const decorated=projection.rows.map(row=>{
    if(!row.reference_id)return Object.freeze({...row,review:'—',review_revision:null});
    const ref=references.get(row.reference_id);
    const saved=reviews.get(row.reference_id)??convertedById.get(row.reference_id);
    const conversion=saved?.conversion;
    const converted=Boolean(conversion?.converted_ref_id===row.reference_id&&
      row.candidate_body_ids?.includes(conversion.converted_body_id)&&
      conversion.updates?.length&&conversion.updates.every(item=>
        saved.convertedLineTexts?.[item.line_id]===lines.get(item.line_id)?.text));
    let valid=Boolean(saved?.valid&&saved.ref_source_text===lines.get(ref?.line_id)?.text&&
      saved.ref_line_id===ref?.line_id&&saved.ref_block_id===ref?.block_id&&
      saved.ref_from===ref?.from&&saved.ref_to===ref?.to&&saved.ref_raw===ref?.raw);
    if(valid&&saved?.decision==='待转换'){
      const body=bodies.get(saved.body_id);
      valid=Boolean(body&&row.candidate_body_ids?.includes(saved.body_id)&&
        saved.body_source_text===lines.get(body.line_id)?.text&&
        saved.body_line_id===body.line_id&&saved.body_block_id===body.block_id&&
        saved.body_from===body.from&&saved.body_to===body.to&&saved.body_raw===body.raw);
    }
    const review=converted?(dirty?'转换待保存':'已转换'):
      saved?(valid?saved.decision:'需复核'):'待定';
    const status=review==='忽略'?'已忽略':review==='待转换'?'已确认':
      review==='需复核'?'待核实':review==='已转换'||review==='转换待保存'?review:row.status;
    return Object.freeze({...row,review,status,
      review_revision:saved?.revision??null,
      selected_body_id:converted?conversion.converted_body_id:
        valid?saved?.body_id??null:null,
      review_note:review==='已转换'?'已在 CM6 转换且 MD 已保存；Undo 可恢复':
        review==='转换待保存'?'CM6 已转换，正在通过原 MD CAS 保存':
        review==='待转换'?'已人工确定配对，尚未转换 Markdown':
        review==='需复核'?'原文或候选关系已变化，需重新审阅':
        review==='忽略'?'人工确认不是需要处理的注释':row.reason});
  });
  return Object.freeze(showIgnored?decorated:decorated.filter(row=>row.review!=='忽略'));
}
