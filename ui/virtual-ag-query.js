/** Owner-local AG implementation of the semantic virtual chapter query port.
 * WCP sends an intention (keys, label); the AG owner alone changes Grid API.
 * No raw Grid API, column model, or CMD object is exported to WCP.
 */
export function createVirtualAGQuery(api,type){
  let original=null,projected=null,activeChapterLabel=()=>'';
  const rowKey=data=>type==='heading'?data?.id:data?.from;
  function setVirtualQuery({enabled=false,keys=null,chapterLabel=()=>''}={}){
    const actual=api.getGridOption('columnDefs')||[];
    activeChapterLabel=chapterLabel;
    if(enabled){
      if(!original){
        original=actual.filter(c=>c.colId!=='virtualChapter');
        // Reuse this AG owner's own filter implementation; a projected
        // chapter column must remain touch-filterable like the replaced one.
        const ownerFilter=original.find(c=>c.field==='chapterFile'&&c.filter)
          ||original.find(c=>c.filter);
        const column={colId:'virtualChapter',headerName:'所属章节',width:147,minWidth:117,
          sortable:false,resizable:true,suppressMovable:true,
          suppressHeaderMenuButton:true,
          filter:ownerFilter?.filter,
          filterValueGetter:p=>p.data?activeChapterLabel(p.data):'',
          valueGetter:p=>p.data?activeChapterLabel(p.data):''};
        // Virtual chapters replace physical chapter export, NOT chapter
        // boundary editing. The '独立成章' checkbox must remain available in
        // the heading AG: its CMD marker drives the virtual chapter list.
        projected=[...original.filter(c=>type!=='heading'||
          c.field!=='chapterFile'),column];
      }
      if(actual.length!==projected.length||actual.some((c,i)=>c!==projected[i]))
        api.setGridOption('columnDefs',projected);
    }else if(original){
      api.setGridOption('columnDefs',original);
      original=null;projected=null;
    }
    const activeKeys=enabled&&keys;
    api.setGridOption('isExternalFilterPresent',()=>Boolean(activeKeys));
    api.setGridOption('doesExternalFilterPass',node=>
      !activeKeys||activeKeys.has(rowKey(node.data)));
    api.onFilterChanged();
  }
  return Object.freeze({setVirtualQuery});
}
