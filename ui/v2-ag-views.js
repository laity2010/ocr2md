/** AG logical-block review presets. A view defines only a column layout and
 * the existing AG native block_type filter; it never creates its own rows.
 */
import {renderTitleMdCell} from './lab-ocr/title-view.js';

export const AG_VIEWS=Object.freeze({
  frame:Object.freeze({label:'逻辑块审阅'}),
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
      {cellClass:'v2-ag-title-text',cellRenderer:renderTitleMdCell}:{}),
  }));
}
export function viewFilter(view){
  const types=AG_VIEWS[view]?.types;
  return types?{block_type:{values:[...types]}}:null;
}
