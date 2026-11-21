/** V2 SQL evidence -> ORIGINAL V1 PdfPreview public interfaces.
 * Data ONLY. There is deliberately no SVG/DOM/gesture/layout code here.
 * V1 paintBlockCoverage / avoidBlockChipCollisions / selectPDFRegion own all UI.
 */
export function projectV2PDFEvidence(map) {
  if(map?.schema!=='v2-pdf-projection/v1'||
     !Array.isArray(map.pageSizes)||map.pageSizes.length!==map.pageCount||
     !Array.isArray(map.covers))throw Error('V2 PDF evidence schema invalid');
  const pages=map.pageSizes.map(pageSize=>({pageSize,regions:[]}));
  const ids=new Set(),labels=new Set(),physical=new Set();
  const origins=new Map();
  const coverage=[];
  for(const item of map.covers){
    const {logicalId,baseBlockId,pbs,physicalPageIndex,physicalBlockIndex,bbox}=item;
    if(!Number.isInteger(logicalId)||!Number.isInteger(baseBlockId)||
       typeof pbs!=='string'||!/^p\d+b\d+(?:s\d+)*$/.test(pbs)||
       !Number.isInteger(physicalPageIndex)||!Number.isInteger(physicalBlockIndex)||
       !pages[physicalPageIndex]||!Array.isArray(bbox)||bbox.length!==4)
      throw Error('V2 PDF evidence contains invalid logical or physical location');
    if(ids.has(logicalId)||labels.has(pbs))throw Error('V2 PDF duplicate logical/PBS identity');
    ids.add(logicalId);labels.add(pbs);
    const physicalKey=physicalPageIndex+':'+physicalBlockIndex;
    if(physical.has(physicalKey))
      throw Error('V2 multiple logical blocks share one original PDF bbox; needs explicit fragment mapping');
    physical.add(physicalKey);
    const origin='p'+physicalPageIndex+'b'+physicalBlockIndex;
    origins.set(logicalId,{item,origin});
    pages[physicalPageIndex].regions.push({
      blockIndex:physicalBlockIndex,bbox,subRegions:[],
    });
    coverage.push({
      id:pbs,origin,pageIndex:physicalPageIndex,blockIndex:physicalBlockIndex,
      anchorCount:1,geometry:true,logicalId:pbs,sourceLine:1,
      joinPrev:false,joinable:false,promoted:false,bbox,
      isChildCover:item.parentId!==null,
    });
  }
  if(ids.size!==map.mappedCount)throw Error('V2 PDF mappedCount is inconsistent');
  const layout={pages};
  const getLabelSources=sourcePort=>{
    const locations=new Map();
    if(!sourcePort?.getState().loaded)return locations;
    const intervals=new Map(sourcePort.getIntervals().map(row=>[row.logicalId,row]));
    for(const {item,origin} of origins.values()){
      const range=intervals.get(item.logicalId);
      if(!range)continue;
      const sourceLine=sourcePort.getLineAtOffset(range.from);
      const scopeEndLine=sourcePort.getLineAtOffset(range.to);
      locations.set(item.pbs,{
        id:item.pbs,origin,role:'parent',
        kind:item.parentId===null?'parent':'child',
        pageIndex:item.physicalPageIndex,blockIndex:item.physicalBlockIndex,
        path:[],sourceLine,contentLine:range.from<range.to?sourceLine:null,
        scopeEndLine,
      });
    }
    return locations;
  };
  return Object.freeze({
    map,layout,coverage,
    logicalIdForPBS:pbs=>map.covers.find(item=>item.pbs===pbs)?.logicalId??null,
    pbsForLogicalId:id=>origins.get(id)?.item.pbs??null,
    getLabelSources,
  });
}
