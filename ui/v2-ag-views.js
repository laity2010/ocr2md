/** Shared AG presets: owned-LF title and general MD Line views use one
 * common row set. Legacy unmarked books retain their original block view. */
import {renderTitleMdCell} from './lab-ocr/title-view.js';

export const AG_VIEWS=Object.freeze({
  frame:Object.freeze({label:'逻辑块审阅'}),
  line:Object.freeze({label:'MD Line'}),
  title:Object.freeze({label:'标题'}),
  'note-match':Object.freeze({label:'注释匹配'}),
  latex:Object.freeze({label:'LaTeX'}),
  'block-break':Object.freeze({label:'断块'}),
  media:Object.freeze({label:'媒体'}),
  table:Object.freeze({label:'表格'}),
});
export function titleClickLine(row){
  return Number.isInteger(row?.source_line)?row.source_line:null;
}
export function viewColumns(view,columns){
  if(view!=='title')return columns;
  const leading=['md_block','pbs','source_line','block_type'];
  return [...leading.map(key=>columns.find(c=>c.field===key)).filter(Boolean),
    ...columns.filter(c=>!leading.includes(c.field))].map(c=>({
    ...c,pinned:null,
    ...(c.field==='md_block'?{cellClass:'v2-ag-title-text',cellRenderer:renderTitleMdCell}:{}),
  }));
}
export function viewFilter(view,ownedLF=false){
  return view==='title'?{[ownedLF?'line_type':'block_type']:{values:['title']}}:null;
}
export function usesMdLines(view,ownedLF=true){return view==='line'||(ownedLF&&view==='title');}
export function mdLineColumns(view='line'){
  const columns=[
    ['md_line','MD Line'],['pbs','PBS'],['line_offset','块内偏移'],
    ['source_line','源码行号'],['block_type','Block Type'],['line_type','Line Type'],
    ['logical_id','Logical ID'],['base_blockid','Base ID'],['title_level','标题层级'],
  ].map(([field,headerName])=>({field,headerName}));
  if(view!=='title')return columns;
  // A common row set does not imply a common presentation layout.
  const leading=['md_line','source_line','pbs','title_level','line_type'];
  const marker=n=>Number.isInteger(n)&&n>=1&&n<=6?'#'.repeat(n):'';
  return [...leading.map(key=>columns.find(c=>c.field===key)),
    ...columns.filter(c=>!leading.includes(c.field))].map(column=>{
    // AG preserves prior pinned state when pinned is undefined. Explicitly
    // clear it when entering the title preset; the block preset still pins PBS.
    const c={...column,pinned:null};
    if(c.field==='md_line')return {...c,cellClass:'v2-ag-title-text',cellRenderer:renderTitleMdCell};
    if(c.field==='title_level')return {...c,headerName:'Level',
      valueFormatter:p=>marker(p.value),filterValueGetter:p=>marker(p.data?.title_level)};
    if(c.field==='line_type')return {...c,headerName:'Type'};
    return c;
  });
}
