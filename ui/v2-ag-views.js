/** AG logical-block review presets. A view defines only a column layout and
 * the existing AG native block_type filter; it never creates its own rows.
 */
import {renderTitleMdCell} from './lab-ocr/title-view.js';

/** Same MD Block row, display only. Multiple headings stay inside this
 * cell; data attributes carry the actual source line to the native row click.
 */
function headingEntries(data){
  return typeof data?.heading_lines==='string'?JSON.parse(data.heading_lines):null;
}
function renderOwnedTitleCell(params){
  const headings=headingEntries(params.data);
  if(!headings?.length)return renderTitleMdCell(params);
  const wrapper=document.createElement('div');wrapper.className='v2-ag-heading-stack';
  for(const heading of headings){
    const element=renderTitleMdCell({value:heading.text});
    element.dataset.v2TitleLine=String(heading.line);
    element.title='定位源码第 '+heading.line+' 行';
    wrapper.append(element);
  }
  return wrapper;
}
function renderHeadingLineNumbers(params){
  const headings=headingEntries(params.data);
  if(!headings?.length)return String(params.value??'');
  const wrapper=document.createElement('div');wrapper.className='v2-ag-heading-stack v2-ag-heading-numbers';
  for(const heading of headings){
    const item=document.createElement('span');item.dataset.v2TitleLine=String(heading.line);
    item.textContent=String(heading.line);wrapper.append(item);
  }
  return wrapper;
}
export function titleClickLine(row,target){
  const headings=headingEntries(row);
  if(!headings?.length)return Number.isInteger(row?.source_line)?row.source_line:null;
  const selected=Number(target?.closest?.('[data-v2-title-line]')?.dataset.v2TitleLine);
  return headings.some(h=>h.line===selected)?selected:headings[0].line;
}

export const AG_VIEWS=Object.freeze({
  frame:Object.freeze({label:'逻辑块审阅'}),
  line:Object.freeze({label:'MD Line',lineRows:true}),
  title:Object.freeze({
    label:'标题',types:Object.freeze(['title']),
    leading:Object.freeze(['md_block','pbs','source_line','block_type']),
  }),
});
export function viewColumns(view,columns){
  const leading=AG_VIEWS[view]?.leading;
  if(!leading)return columns;
  return [...leading.map(key=>columns.find(c=>c.field===key)).filter(Boolean),
    ...columns.filter(c=>!leading.includes(c.field))].map(c=>({
    ...c,pinned:null,
    ...(view==='title'&&c.field==='md_block'?
      {cellClass:'v2-ag-title-text',cellRenderer:renderOwnedTitleCell,autoHeight:true}:{}),
    ...(view==='title'&&c.field==='source_line'?
      {cellRenderer:renderHeadingLineNumbers}:{}),
  }));
}
export function viewFilter(view){
  const types=AG_VIEWS[view]?.types;
  return types?{block_type:{values:[...types]}}:null;
}

export function usesMdLines(view){return AG_VIEWS[view]?.lineRows===true;}
export function mdLineColumns(){return [
  ['md_line','MD Line'],['pbs','PBS'],['line_offset','块内偏移'],
  ['source_line','源码行号'],['block_type','Block Type'],['line_type','Line Type'],
  ['logical_id','Logical ID'],['base_blockid','Base ID'],['title_level','标题层级'],
].map(([field,headerName])=>({field,headerName}));}
