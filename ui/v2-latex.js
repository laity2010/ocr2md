/** WP27: immutable V1 formula projection from one current CM6 MD Line index
 * and original raw-path-bound MinerU span evidence. Never write either. */
import {projectLatexIndex,latexIndexSummary} from './lab-ocr/latex-index.js';
export {latexIndexSummary};
export function projectV2Latex(index,evidence=[]){
  if(!index?.rows)throw Error('LaTeX 需要公共 MD Line 索引');
  const raw=new Map(evidence.map(r=>[r.block_id,r]));
  const blocks=new Map();
  const mdRows=index.rows.map(row=>{
    if(!blocks.has(row.logical_id)){
      const original=raw.get(row.logical_id);
      if(original&&original.base_blockid!==row.base_blockid)throw Error('原始公式证据身份不一致');
      blocks.set(row.logical_id,{block_id:row.logical_id,block_type:row.block_type,
        global_page:original?.global_page??row.p,pbs:row.pbs,...original});
    }
    return {line_id:row.logical_id+'/'+row.line_offset,line_no:row.source_line,
      block_id:row.logical_id,text:row.md_line};
  });
  return projectLatexIndex(mdRows,[...blocks.values()]).map(r=>{
    const row=index.atSourceLine(r.line_no);
    const ref=row&&row.logical_id===r.block_id?index.makeRef(row.source_line):null;
    const size=r.page_size,box=r.pdf_bbox;
    const valid=Array.isArray(size)&&size.length===2&&Array.isArray(box)&&box.length===4&&
      box[0]>=0&&box[1]>=0&&box[2]<=size[0]&&box[3]<=size[1];
    return Object.freeze({...r,p:blocks.get(r.block_id)?.pbs?Number(/^p(\d+)/.exec(r.pbs)?.[1]):null,
      logical_id:r.block_id,source_line:ref?row.source_line:null,source_ref:ref,
      pdf_bbox:valid?box:null});
  });
}
export function resolveV2Formula(index,row){
  const line=index?.resolve(row?.source_ref);
  if(!line||line.logical_id!==row.block_id||line.source_line!==row.line_no||
    !Number.isInteger(row.source_from)||!Number.isInteger(row.source_to)||
    row.source_from<line.from||row.source_from>=line.to||row.source_to<=row.source_from)return null;
  const last=index.atOffset(row.source_to-1);
  if(!last||last.logical_id!==line.logical_id)return null;
  return line;
}
