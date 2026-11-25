/** V1 Block table projection and column contract, adapted to V2's
 * stable logical IDs, real owned MD Lines and original PDF covers.
 * No database, secondary editor, HTML parsing or inferred merge history.
 */
import {projectTableBlockRows} from './lab-ocr/table-view.js';

const comparePBS=(left,right)=>{
  const values=text=>{
    const match=/^p(\d+)b(\d+)((?:s\d+)*)$/.exec(String(text||''));
    return match?[Number(match[1]),Number(match[2]),
      ...(match[3].match(/s\d+/g)||[]).map(n=>Number(n.slice(1)))]:null;
  };
  const a=values(left),b=values(right);
  if(!a||!b)return String(left).localeCompare(String(right),'en',{numeric:true});
  for(let i=0;i<Math.min(a.length,b.length);i++)if(a[i]!==b[i])return a[i]-b[i];
  return a.length-b.length;
};
export const TABLE_COLUMNS=Object.freeze([
  {field:'line_no',headerName:'源码行号',width:105,sortable:true,
    pinned:'left',lockPinned:true,lockPosition:'left'},
  {field:'pbs',headerName:'PBS',width:125,sortable:true,sort:'asc',
    comparator:comparePBS,pinned:'left',lockPinned:true,lockPosition:'left'},
  {field:'block_type',headerName:'Type',width:139,sortable:true},
  {field:'text',headerName:'MD Line',minWidth:210,flex:1,sortable:false},
  {field:'content_preview',headerName:'摘要',width:210,sortable:false},
  {field:'global_page',headerName:'PDF 页（0起）',width:110,sortable:true},
  {field:'block_id',headerName:'BlockID',width:102,sortable:true},
  {field:'parent_block_id',headerName:'ParentID',width:115,sortable:true},
  {field:'merged_into_block_id',headerName:'已合并至 BlockID',width:137,sortable:true},
  {field:'block_bbox_json',headerName:'Block BBox',width:150,sortable:false},
  {field:'line_id',headerName:'LineID',hide:true,sortable:false},
]);

export function projectV2TableRows(index,logicalRows,covers=[]){
  if(!index||!Array.isArray(logicalRows)||!Array.isArray(covers))
    throw Error('表格 View 需要当前 MD Line、逻辑块及 PDF 证据');
  const byId=new Map(covers.map(r=>[r.logicalId,r]));
  const isTable=row=>typeof row.block_type==='string'&&row.block_type.toLowerCase().includes('table');
  const tableIds=new Set(logicalRows.filter(isTable).map(row=>row.logical_id));
  const blocks=[],md=[];
  for(const row of logicalRows){
    // The current logical relationship is authoritative, not a text/HTML heuristic.
    if(!tableIds.has(row.logical_id)&&!tableIds.has(row.parent_id))continue;
    const lines=index.forBlock(row.logical_id);
    if(!lines.length)throw Error('表格逻辑块缺少当前 MD Line');
    // V2 owns real blank separator lines even for PDF-only wrappers.
    // A blank-only block must not navigate the source to a separator.
    const first=lines.find(l=>l.md_line.trim()!=='');
    const anchor=first??null;
    const cover=byId.get(row.logical_id);
    blocks.push({
      logical_id:row.logical_id,block_id:row.logical_id,
      pbs:lines[0].pbs,p:lines[0].p,block_type:row.block_type,
      content_preview:row.raw_block??(first?.md_line??''),
      global_page:cover?.physicalPageIndex??null,
      parent_block_id:row.parent_id??null,
      block_bbox_json:cover?JSON.stringify(cover.bbox):null,
    });
    if(anchor)md.push({block_id:row.logical_id,line_id:anchor.source_line,
      line_no:anchor.source_line,text:anchor.md_line});
  }
  return projectTableBlockRows(md,blocks,()=>true);
}
export function resolveV2TableLine(index,row){
  const first=index?.forBlock(row?.logical_id).find(l=>l.md_line.trim()!=='')??null;
  return first&&first.source_line===row.line_no&&first.pbs===row.pbs?first:null;
}
