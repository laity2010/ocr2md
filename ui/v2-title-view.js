/** WP23: read-only title projection from live CM6 logical blocks, never SQL.
 * V1 owns ATX heading recognition and safe DOM rendering.
 */
import {titleSourceParts,renderTitleMdCell} from './lab-ocr/title-view.js';
import {EnumCheckboxFilter} from './enum-checkbox-filter.js';

export function projectTitleRows(blocks,intervals,lineAtOffset){
  const byId=new Map(intervals.map(row=>[row.logicalId,row]));
  return blocks.flatMap(row=>{
    const {level,marker}=titleSourceParts(row.markdownText);
    if(level===null)return [];
    const interval=byId.get(row.logicalId);
    if(!interval)return [];
    return [{md_block:row.markdownText,level:marker,block_type:'title',
      pbs:'p'+row.p+'b'+row.b+'s'+row.s,source_line:lineAtOffset(interval.from),
      logical_id:row.logicalId,base_blockid:row.baseBlockId,parent_id:row.parentId,
      logical_order:row.logicalOrder,p:row.p,b:row.b,s:row.s,raw_type:row.blockType}];
  });
}

export function titleColumns(){
  const columns=[
    ['md_block','MD Block',420],['level','Level',98],['block_type','Type',95],
    ['pbs','PBS',122],['source_line','Line',95],['logical_id','logical_id',125],
    ['base_blockid','base_blockid',145],['parent_id','parent_id',120],
    ['logical_order','logical_order',145],['p','p',85],['b','b',85],['s','s',85],
    ['raw_type','OCR Type',135],
  ];
  return columns.map(([field,headerName,width])=>({
    field,headerName,width,minWidth:field==='md_block'?200:70,
    resizable:true,sortable:field!=='block_type',
    filter:EnumCheckboxFilter,filterValueGetter:p=>String(p.data?.[field]??''),
    suppressHeaderMenuButton:true,suppressHeaderFilterButton:false,
    tooltipField:field,...(field==='md_block'?{cellClass:'v2-ag-title-text',
      cellRenderer:renderTitleMdCell}:{}),
  }));
}
