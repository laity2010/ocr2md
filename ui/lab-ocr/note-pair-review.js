/** WP3.1: human decisions decorate only the current WP1/WP2 projection.
 * Decisions are not converted Markdown. Validity requires identical CM6 line
 * evidence AND the same selected source-body candidate still in this view.
 */
export const NOTE_REVIEW_DECISIONS=Object.freeze(['待定','待转换','忽略']);

export function projectReviewedNoteRows(projection,reviews,mdRows,{showIgnored=false}={}){
  const references=new Map(projection.index.references.map(item=>[item.candidate_id,item]));
  const bodies=new Map(projection.index.bodies.map(item=>[item.candidate_id,item]));
  const lines=new Map(mdRows.map(item=>[item.line_id,item]));
  const decorated=projection.rows.map(row=>{
    if(!row.reference_id)return Object.freeze({...row,review:'—',review_revision:null});
    const ref=references.get(row.reference_id);
    const saved=reviews.get(row.reference_id);
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
    const review=saved?(valid?saved.decision:'需复核'):'待定';
    const status=review==='忽略'?'已忽略':review==='待转换'?'已确认':
      review==='需复核'?'待核实':row.status;
    return Object.freeze({...row,review,status,
      review_revision:saved?.revision??null,
      selected_body_id:valid?saved?.body_id??null:null,
      review_note:review==='待转换'?'已人工确定配对，尚未转换 Markdown':
        review==='需复核'?'原文或候选关系已变化，需重新审阅':
        review==='忽略'?'人工确认不是需要处理的注释':row.reason});
  });
  return Object.freeze(showIgnored?decorated:decorated.filter(row=>row.review!=='忽略'));
}
