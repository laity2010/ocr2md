/** Shared AG presets: owned-LF title and general MD Line views use one
 * common row set. Legacy unmarked books retain their original block view. */
import {renderTitleMdCell} from './lab-ocr/title-view.js';

export const AG_VIEWS=Object.freeze({
  frame:Object.freeze({label:'逻辑块审阅'}),
  line:Object.freeze({label:'MD Line'}),
  title:Object.freeze({label:'标题'}),
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
  return columns.map(c=>view==='title'&&c.field==='md_line'?
    {...c,cellClass:'v2-ag-title-text',cellRenderer:renderTitleMdCell}:c);
}
