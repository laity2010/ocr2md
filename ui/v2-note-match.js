/** V2 read-only adaptation of V1's note index. All locations come from
 * the current immutable common MD Line index. V1 algorithms remain exact.
 */
import {projectNoteMatchRows,compareNoteNumbers} from './lab-ocr/note-match-view.js';
import {DEFAULT_NOTE_MATCH_CONFIG} from './lab-ocr/note-match-index.js';

export function projectV2NoteMatch(index,config=DEFAULT_NOTE_MATCH_CONFIG){
  if(!index?.rows||!index.makeRef||!index.resolve)throw Error('注释匹配需要当前 MD Line 索引');
  const blocks=new Map();
  const mdRows=index.rows.map(row=>{
    if(!blocks.has(row.logical_id))blocks.set(row.logical_id,Object.freeze({
      block_id:row.logical_id,block_type:row.block_type,pbs:row.pbs,global_page:row.p}));
    return Object.freeze({line_id:row.logical_id+'/'+row.line_offset,line_no:row.source_line,
      block_id:row.logical_id,text:row.md_line});
  });
  const projection=projectNoteMatchRows(mdRows,[...blocks.values()],config);
  const rows=projection.rows.map(row=>{
    const line=index.atSourceLine(row.line_no);
    const ref=line&&line.logical_id===row.block_id?index.makeRef(row.line_no):null;
    if(row.line_id&&!ref)throw Error('注释端点未映射到公共 MD Line');
    return Object.freeze({...row,source_ref:ref,source_line:ref?line.source_line:null,
      logical_id:ref?line.logical_id:null,p:ref?line.p:null,
      match_state:row.status==='已匹配'?'已匹配':'待核实',
      conversion_error:''});
  });
  return Object.freeze({...projection,mdRows:Object.freeze(mdRows),blockRows:Object.freeze([...blocks.values()]),rows:Object.freeze(rows)});
}
export function resolveV2NoteEndpoint(index,row){
  if(!index||!row?.source_ref||!Number.isInteger(row.from)||
    !Number.isInteger(row.to)||row.from<0||row.to<=row.from)return null;
  const line=index.resolve(row.source_ref);
  return line&&line.logical_id===row.logical_id&&line.source_line===row.source_line&&
    row.to<=line.md_line.length&&line.md_line.slice(row.from,row.to)===row.raw?line:null;
}
const comparePBS=(a,b)=>String(a??'').localeCompare(String(b??''),'en',{numeric:true});
export function noteMatchColumns(statusRenderer=null){
  return [
    {field:'number',headerName:'注号',width:74,sortable:true,sort:'asc',comparator:compareNoteNumbers,pinned:'left',lockPinned:true,lockPosition:'left'},
    {field:'kind',headerName:'端点',width:72,sortable:true},
    {field:'text',headerName:'注引／注文 · 原文',minWidth:240,flex:1.8,sortable:false,
      cellRenderer:params=>{
        const node=document.createElement('span');
        node.className='ocr-note-match-text';node.dataset.kind=params.data?.kind??'';
        node.textContent=params.value??'';node.title='点击这一行定位该端点，原文不会修改';return node;
      }},
    {field:'match_state',headerName:'匹配状态',width:132,minWidth:112,sortable:false,pinned:'right',lockPinned:true,lockPosition:'right',
      cellRenderer:statusRenderer??(params=>{
        const node=document.createElement('span');
        node.className='ocr-note-match-status';node.dataset.status=params.value??'';
        node.textContent=params.value??'';return node;
      })},
    {field:'pbs',headerName:'PBS',width:125,sortable:true,comparator:comparePBS,
      filterValueGetter:p=>p.data?.p==null?'':String(p.data.p)},
    {field:'line_no',headerName:'源码行',width:92,sortable:true},
    {field:'evidence',headerName:'识别规则',minWidth:135,sortable:true},
    {field:'strength',headerName:'证据级别',width:96,sortable:true},
    {field:'reason',headerName:'判断依据',minWidth:210,flex:1,sortable:false},
    {field:'conversion_error',headerName:'转换失败原因',minWidth:180,width:240,sortable:true},
    {field:'scope',headerName:'范围',minWidth:115,sortable:true},
    {field:'candidate_count',headerName:'可选注文',width:96,sortable:true},
    {field:'note_row_id',headerName:'候选ID',hide:true},
    {field:'line_id',headerName:'LineID',hide:true},
  ].map(c=>({pinned:null,...c}));
}
