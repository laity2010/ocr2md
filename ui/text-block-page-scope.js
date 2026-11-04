/** Text-block AG visibility is a page-local projection, never a CMD edit.
 * pageNumber is PDF.js's 1-based currently visible page; OCR pageIndex is 0-based.
 */
export function filterTextBlockPageRows(rows,pageNumber,showAll=false){
  if(showAll)return rows;
  if(!Number.isInteger(pageNumber)||pageNumber<1)return [];
  return rows.filter(row=>row.pageIndex===pageNumber-1||
    (!Number.isInteger(row.pageIndex)&&row.pdfPage===pageNumber));
}

/** Compose the page-column filter without erasing unrelated AG filters.
 * AG owns the full inventory; unlike row pre-filtering this lets the native
 * column popup enumerate and select every page, even the nonvisible ones.
 */
export function textBlockPageFilterModel(model,pageNumber,showAll=false){
  const result={...(model||{})};
  if(showAll)delete result.pdfPage;
  else if(Number.isInteger(pageNumber)&&pageNumber>0)
    result.pdfPage={values:[String(pageNumber)]};
  else throw Error('PDF page must be a positive integer');
  return result;
}
