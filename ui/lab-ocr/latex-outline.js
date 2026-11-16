/** Read-only LaTeX outline from the SAME resident CM6 Markdown as Title View.
 * Insert only the actual heading ancestry needed to locate each formula.
 * No synthetic Markdown lines, SQL rows, or implicit OCR title levels.
 */
import {projectTitleMdRows} from './title-view.js';

/** Anchor an OCR-only formula to its own Block's physical MD location when
 * it has no verified formula character range. Never invent an MD formula. */
export function projectLatexOutlineRows(mdRows,blockRows,formulaRows){
  const headingRows=projectTitleMdRows(mdRows,blockRows)
    .filter(row=>Number.isInteger(row.line_no)&&row.line_no>0)
    .sort((a,b)=>a.line_no-b.line_no);
  const blockFirstLine=new Map();
  for(const row of mdRows){
    if(row.block_id!=null&&Number.isInteger(row.line_no)&&
       !blockFirstLine.has(row.block_id))blockFirstLine.set(row.block_id,row.line_no);
  }
  // Rare OCR-only Spans may have no MD rows. Use their original Block's
  // stable sequence only if adjacent MD blocks prove an approximate place.
  const order=new Map(blockRows.map((b,i)=>[b.block_id,i]));
  const known=blockRows.map((b,i)=>({order:i,line:blockFirstLine.get(b.block_id)}))
    .filter(v=>Number.isInteger(v.line));
  const anchor=formula=>{
    if(Number.isInteger(formula.line_no))return formula.line_no;
    const knownLine=blockFirstLine.get(formula.block_id);
    if(Number.isInteger(knownLine))return knownLine;
    const index=order.get(formula.block_id);
    if(index==null)return null;
    for(let i=known.length-1;i>=0;i--){
      if(known[i].order<index)return known[i].line+0.5;
    }
    const next=known.find(v=>v.order>index);
    return next?Math.max(0,next.line-0.5):null;
  };
  const ordered=[...formulaRows].map((formula,i)=>({formula,i,position:anchor(formula)}))
    .sort((a,b)=>(a.position??Number.POSITIVE_INFINITY)-
      (b.position??Number.POSITIVE_INFINITY)||
      (a.formula.source_from??Number.POSITIVE_INFINITY)-
      (b.formula.source_from??Number.POSITIVE_INFINITY)||a.i-b.i);
  const result=[],shown=new Set(),stack=[];
  let nextTitle=0;
  for(const {formula,position} of ordered){
    if(position!==null){
      while(nextTitle<headingRows.length&&headingRows[nextTitle].line_no<=position){
        const title=headingRows[nextTitle++];
        while(stack.length&&stack.at(-1).level>=title.level)stack.pop();
        stack.push(title);
      }
      for(const heading of stack){
        if(shown.has(heading.line_id))continue;
        shown.add(heading.line_id);
        result.push({latex_heading_id:`heading:${heading.line_id}`,
          heading_source:heading.text,heading_level:heading.level,
          line_id:heading.line_id,line_no:heading.line_no,
          block_id:heading.block_id,pbs:heading.pbs,
          global_page:heading.global_page,
          absorbed_into_block_id:null});
      }
    }
    result.push({...formula,heading_source:''});
  }
  return result;
}
