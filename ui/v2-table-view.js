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


// Plan an atomic, owner-preserving edit against the current public MD Line
// snapshot. Existing content stays with its original logical ID.
const IMAGE_LINE='><!-- image -->';
const HTML_CALLOUT='>>[! ds-html]- HTML Table';
export function planV2TableOrganization(index,logicalRows,selectedId){
  if(!index||!Array.isArray(logicalRows))throw Error('表格组织需要当前 MD Line');
  const selected=logicalRows.find(r=>r.logical_id===selectedId);
  const root=selected?.parent_id==null?selected:logicalRows.find(r=>r.logical_id===selected.parent_id);
  if(!root||root.block_type!=='table')throw Error('请选择一个表格组');
  const group=logicalRows.filter(r=>r.logical_id===root.logical_id||r.parent_id===root.logical_id);
  const bodies=group.filter(r=>r.block_type==='table_body');
  const captions=group.filter(r=>r.block_type==='table_caption');
  if(bodies.length!==1||captions.length>1)throw Error('表格组存在多个正文或标题，请先核对结构');
  const body=bodies[0],caption=captions[0];
  const parts=group.map(row=>({row,lines:index.forBlock(row.logical_id)}));
  if(parts.some(p=>!p.lines.length))throw Error('表格组缺少真实 MD Line');
  const lines=parts.flatMap(p=>p.lines);
  if(lines.some((l,i)=>i&&l.source_line!==lines[i-1].source_line+1))
    throw Error('表格组不连续，请先核对父子块顺序');
  const nonempty=parts.flatMap(p=>p.lines.filter(l=>l.md_line.trim()!=='').map(line=>({row:p.row,line})));
  const bodyLines=nonempty.filter(x=>x.row===body).map(x=>x.line);
  if(!bodyLines.length)throw Error('表格没有 HTML 正文');
  const firstBody=nonempty.findIndex(x=>x.row===body);
  if(nonempty.some((x,i)=>x.row===root||x.row===caption&&i>=firstBody||x.row!==caption&&x.row!==body&&i<firstBody))
    throw Error('表格标题、正文与注释顺序不明确，请先审阅结构');
  // Exact generated format is idempotent. Never strip arbitrary user quotes
  // or overwrite a partially organized group.
  const organized=bodyLines[0].md_line===IMAGE_LINE&&bodyLines[1]?.md_line===HTML_CALLOUT;
  const rawBody=(organized?bodyLines.slice(2).map(l=>l.md_line.slice(2)):bodyLines.map(l=>l.md_line)).join('\n');
  if(!/^\s*<table(?:\s|>)/i.test(rawBody)||!/<\/table>\s*$/i.test(rawBody))
    throw Error('表格正文不是完整 HTML table，未改写');
  if(organized){
    if(bodyLines.slice(2).every(l=>l.md_line.startsWith('>>'))&&
      nonempty.filter(x=>x.row!==body).every(x=>/^>(?!>)/.test(x.line.md_line)))return [];
    throw Error('表格已部分组织，请先核对源码');
  }
  if(nonempty.some(x=>/^\s*>/.test(x.line.md_line)))throw Error('表格已有引用格式，请先核对源码，未重复改写');
  const from=nonempty[0].line.source_line,to=nonempty.at(-1).line.source_line;
  const updates=[];
  for(const part of parts){
    for(const line of part.lines){
      if(line.source_line<from||line.source_line>to)continue;
      const prefix=part.row===body?'>>':'>';
      const afterText=(line===bodyLines[0]?IMAGE_LINE+'\n'+HTML_CALLOUT+'\n':'')+prefix+line.md_line;
      updates.push({ref:index.makeRef(line.source_line),beforeText:line.md_line,afterText});
    }
  }
  return updates;
}
