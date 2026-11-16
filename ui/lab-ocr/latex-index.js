/** WP1: pure, read-only formula index from the resident CM6 MD and Block rows.
 * No SQL writes or second editable document. An OCR Span remains visible even
 * when a Markdown scanner misses its undelimited inline formula.
 */
import {findLatex} from '../latex-scan.js';

const mathType=type=>type==='interline_equation'?'独立':
  type==='inline_equation'?'行内':null;
const validBox=box=>Array.isArray(box)&&box.length===4&&
  box.every(Number.isFinite)&&box[2]>box[0]&&box[3]>box[1];
const normalized=text=>String(text??'').trim().replace(/\s+/g,'');
const pageSizeOf=raw=>{
  let size=raw;
  if(typeof raw==='string')try{size=JSON.parse(raw);}catch{return null;}
  return Array.isArray(size)&&size.length===2&&size.every(n=>Number.isFinite(n)&&n>0)?size:null;
};

function locateOffset(starts,rows,offset){
  let low=0,high=rows.length-1;
  while(low<high){const mid=Math.ceil((low+high)/2);
    if(starts[mid]<=offset)low=mid;else high=mid-1;}
  const row=rows[low];
  return {line_no:row.line_no,line_id:row.line_id,column:offset-starts[low]};
}

/** A lossless original paragraph can establish exact Span offsets even when
 * two identical inline formulas occur in that paragraph. Unlike occurrence
 * ranking, this is safe only if the *whole* original line-joined paragraph
 * still equals one current MD line byte-for-byte. Reviewed edits fail closed.
 */
function exactInlineOffsets(blocks,byBlock){
  const exact=new Map();
  for(const block of blocks){
    if(!Number.isSafeInteger(block.block_id))continue;
    const rows=(byBlock.get(block.block_id)??[]).filter(item=>item.row.text);
    if(rows.length!==1)continue;
    let raw;
    try{raw=typeof block.block_json==='string'?JSON.parse(block.block_json):block.block_json;}
    catch{continue;}
    if(!Array.isArray(raw?.lines)||block.block_type==='title'||
       block.block_type==='interline_equation')continue;
    const modes=[{delimited:false},{delimited:true}];
    for(const mode of modes){
      const positions=[],lines=[];
      for(const [lineIndex,line] of raw.lines.entries()){
        if(!Array.isArray(line?.spans))continue;
        let text='';
        for(const [spanIndex,span] of line.spans.entries()){
          if(!span||typeof span!=='object')continue;
          let fragment='';
          const isInline=span.type==='inline_equation'&&typeof span.content==='string';
          if(typeof span.html==='string')fragment=span.html;
          else if(typeof span.image_path==='string')
            fragment='![image](<'+span.image_path.replace(/>/g,'%3E')+'>)';
          else if(typeof span.content==='string'){
            fragment=span.content;
            if(isInline&&mode.delimited)fragment=wrapInlineMath(fragment);
          }
          if(isInline&&typeof span.content==='string'&&
             (fragment===span.content||mode.delimited&&fragment===wrapInlineMath(span.content))){
            const leadingDollar=fragment.startsWith('$')&&fragment.endsWith('$')?1:0;
            positions.push({key:`${block.block_id}:${lineIndex}:${spanIndex}`,
              line:lines.length,offset:text.length+leadingDollar});
          }
          text+=fragment;
        }
        if(text)lines.push(text);
      }
      if(lines.join(' ')!==rows[0].row.text)continue;
      for(const item of positions){
        const local=lines.slice(0,item.line).reduce((acc,line)=>acc+line.length+1,0)+item.offset;
        exact.set(item.key,rows[0].start+local);
      }
      break; // A whole-paragraph proof selects exactly one representation.
    }
  }
  return exact;
}

// Mirrors _inline_math() in scripts/v6_lab_ocr_md.py; otherwise the source
// pointer could drift when the Markdown projection inserts $ delimiters.
function wrapInlineMath(text){
  if(!text||text.includes('\n')||text.includes('\r'))return text;
  if(text.startsWith('$')&&text.endsWith('$')&&!text.startsWith('$$'))return text;
  for(let i=0;i<text.length;i++)if(text[i]==='$'&&(i===0||text[i-1]!=='\\'))return text;
  return '$'+text+'$';
}

function sourceSpans(blocks){
  const found=[];
  for(const block of blocks){
    if(!Number.isSafeInteger(block.block_id))continue;
    let value;
    try{value=typeof block.block_json==='string'?JSON.parse(block.block_json):block.block_json;}
    catch{continue;}
    for(const [lineIndex,line] of (value?.lines??[]).entries()){
      for(const [spanIndex,span] of (line?.spans??[]).entries()){
        const kind=mathType(span?.type);
        if(!kind)continue;
        const raw=typeof span.content==='string'?span.content:'';
        const img=typeof span.image_path==='string'&&/^https:\/\//.test(span.image_path)
          ?span.image_path:null;
        found.push({formula_id:`ocr:${block.block_id}:${lineIndex}:${spanIndex}`,
          block_id:block.block_id,pbs:block.pbs??'',global_page:block.global_page,
          page:Number.isInteger(block.global_page)?block.global_page+1:null,
          page_size:pageSizeOf(block.page_size_json),
          kind,formula:raw,original_formula:raw,original_image:img,
          pdf_bbox:validBox(span.bbox)?span.bbox:null,
          source_span:`${lineIndex}:${spanIndex}`,source_type:span.type,
          block_type:block.block_type??null});
      }
    }
  }
  return found;
}

/** Return formula rows with stable OCR identities, exact coordinates where
 * proven, and unmatched entries for BOTH sources. Never infer missing text.
 */
export function projectLatexIndex(mdRows,blockRows){
  if(!Array.isArray(mdRows)||!Array.isArray(blockRows))throw TypeError('Formula inputs must be rows');
  const source=mdRows.map(row=>row.text).join('\n');
  const starts=[];let offset=0;
  for(const row of mdRows){starts.push(offset);offset+=row.text.length+1;}
  const scans=findLatex(source).map(item=>{
    const anchor=locateOffset(starts,mdRows,item.from);
    const block_id=mdRows[anchor.line_no-1]?.block_id??null;
    const local=source.indexOf(item.content,item.from);
    const focus=local>=item.from&&local+item.content.length<=item.to?local:item.from;
    return {...item,block_id,focus,match:false};
  });
  const byBlock=new Map();
  for(const [index,row] of mdRows.entries()){
    if(row.block_id==null)continue;
    const group=byBlock.get(row.block_id)??[];
    group.push({row,start:starts[index]});byBlock.set(row.block_id,group);
  }
  const ocr=sourceSpans(blockRows);
  const exact=exactInlineOffsets(blockRows,byBlock);
  const output=[];
  for(const item of ocr){
    const matches=scans.filter(s=>!s.match&&s.block_id===item.block_id&&
      s.kind===item.kind&&normalized(s.content)===normalized(item.formula));
    let focus=null,scanner=null,match_status='仅 OCR';
    const exactOffset=exact.get(`${item.block_id}:${item.source_span}`);
    if(item.kind==='行内'&&Number.isInteger(exactOffset)){
      focus=exactOffset;match_status='已匹配';
      const scan=scans.find(candidate=>!candidate.match&&
        candidate.block_id===item.block_id&&candidate.focus===focus&&
        normalized(candidate.content)===normalized(item.formula));
      if(scan){scanner=scan;scanner.match=true;}
      // Un-delimited MinerU text can contain smaller scanner candidates
      // (e.g. σ without the OCR punctuation, or an inner \dot). Those
      // are already represented by the proven, exact source Span, not new
      // independent Markdown formulas.
      for(const candidate of scans){
        if(candidate.block_id===item.block_id&&!candidate.match&&
           candidate.from>=focus&&candidate.to<=focus+item.formula.length)
          candidate.match=true;
      }
    }else if(matches.length===1){
      scanner=matches[0];scanner.match=true;focus=scanner.focus;
      match_status='已匹配';
    }else if(matches.length>1){match_status='有歧义';}
    else if(item.formula){
      // MinerU inline equations are often embedded verbatim in MD without
      // $ delimiters. Only a UNIQUE exact occurrence in the same Block is
      // a proven alignment; no fuzzy edits or neighboring block guesses.
      const hits=[];
      for(const {row,start} of byBlock.get(item.block_id)??[]){
        let at=0;
        while(at<row.text.length){
          const place=row.text.indexOf(item.formula,at);
          if(place<0)break;
          hits.push(start+place);at=place+Math.max(1,item.formula.length);
        }
      }
      if(hits.length===1){focus=hits[0];match_status='已匹配';
        // Avoid a duplicate heuristic scanner row inside this exact Span.
        for(const candidate of scans){
          if(candidate.block_id===item.block_id&&!candidate.match&&
             candidate.from>=focus&&candidate.to<=focus+item.formula.length)
            candidate.match=true;
        }
      }else if(hits.length>1)match_status='有歧义';
    }
    const located=focus===null?null:locateOffset(starts,mdRows,focus);
    output.push({...item,match_status,syntax:scanner?.syntax??'OCR 原文',
      detection:scanner?.detection??false,scan_issue:scanner?.issue??'',
      line_no:located?.line_no??null,line_id:located?.line_id??null,
      column:located?.column??null,source_from:focus,
      source_to:focus===null?null:focus+item.formula.length});
  }
  for(const scan of scans){
    if(scan.match)continue;
    const located=locateOffset(starts,mdRows,scan.focus);
    const block=blockRows.find(item=>item.block_id===scan.block_id);
    output.push({formula_id:`md:${located.line_id}:${scan.from}`,
      block_id:scan.block_id,pbs:block?.pbs??'',
      global_page:block?.global_page??null,
      page:Number.isInteger(block?.global_page)?block.global_page+1:null,
      page_size:pageSizeOf(block?.page_size_json),
      kind:scan.kind||'待定',formula:scan.content,original_formula:null,
      original_image:null,pdf_bbox:null,source_span:null,
      block_type:block?.block_type??null,match_status:'仅 MD',
      syntax:scan.syntax??'',detection:scan.detection??false,
      scan_issue:scan.issue??'',line_no:located.line_no,
      line_id:located.line_id,column:located.column,
      source_from:scan.focus,source_to:scan.to});
  }
  output.sort((a,b)=>((a.page??Infinity)-(b.page??Infinity))||
    ((a.line_no??Infinity)-(b.line_no??Infinity))||
    a.formula_id.localeCompare(b.formula_id));
  return output;
}

/** Counts are diagnostic, not false claims of 1:1 matching by occurrence. */
export function latexIndexSummary(rows){
  return {total:rows.length,original:rows.filter(r=>r.formula_id.startsWith('ocr:')).length,
    independent:rows.filter(r=>r.kind==='独立').length,
    inline:rows.filter(r=>r.kind==='行内').length,
    matched:rows.filter(r=>r.match_status==='已匹配').length,
    ocrOnly:rows.filter(r=>r.match_status==='仅 OCR').length,
    mdOnly:rows.filter(r=>r.match_status==='仅 MD').length,
    ambiguous:rows.filter(r=>r.match_status==='有歧义').length,
    images:rows.filter(r=>r.original_image!==null).length};
}
