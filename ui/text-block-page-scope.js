/** Text-block AG visibility is a page-local projection, never a CMD edit.
 * pageNumber is PDF.js's 1-based currently visible page; OCR pageIndex is 0-based.
 */
export function filterTextBlockPageRows(rows,pageNumber,showAll=false){
  if(showAll)return rows;
  if(!Number.isInteger(pageNumber)||pageNumber<1)return [];
  return rows.filter(row=>row.pageIndex===pageNumber-1||
    (!Number.isInteger(row.pageIndex)&&row.pdfPage===pageNumber));
}
