/** Direct contract: coordinates from original PDF text layer, never OCR.
 * Real PDF.js textContent from a synthetic 2-page PDF.
 */
import assert from 'node:assert/strict';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {pdfTextInBox} from '../ui/lab-ocr/pdf-text-region.js';
import {makeLabOcrPdf} from './helpers/lab-ocr-pdf-fixture.mjs';
const title='Table 2. Berkshire Hathaway Return Decomposed into Leverage,';
const page1=`BT /F1 11 Tf 67 747 Td (${title}) Tj 0 -14 Td (Style Strategies) Tj ET\n`+
  'BT /F1 11 Tf 67 670 Td (Other block entirely outside the first bbox) Tj ET\n';
const task=getDocument({data:new Uint8Array(makeLabOcrPdf(2,[page1,'' ]))});
const doc=await task.promise;
try{
  const pg=await doc.getPage(1),vp=pg.getViewport({scale:1}),tc=await pg.getTextContent();
  assert.equal(pdfTextInBox(tc,vp,[595,842],[64,77,590,121]),
    title+'\nStyle Strategies');
  assert.equal(pdfTextInBox(tc,vp,[595,842],[64,300,500,350]),'');
  assert.equal(pdfTextInBox(tc,vp,[595,842],[64,77,95,121]),'',
    'A native text item with most glyphs outside the box must not be borrowed');
  assert.equal(pdfTextInBox(tc,vp,[595,842],[64,77,590,121]),
    pdfTextInBox(tc,pg.getViewport({scale:2}),[1190,1684],[128,154,1180,242]),
    'Equivalent bbox in a scaled PDF viewport preserves the extracted text');
  assert.equal(pdfTextInBox(tc,vp,[594,595],[64,77,590,121]),'',
    'Conflicting source-vs-PDF page orientation must not invent text');
  const empty=await doc.getPage(2);
  assert.equal(pdfTextInBox(await empty.getTextContent(),empty.getViewport({scale:1}),
    [595,842],[0,0,595,842]),'', 'Scanned/no-text page disables extract');
  assert.equal(pdfTextInBox(null,vp,[595,842],[64,77,590,121]),'');
}finally{await task.destroy();}
console.log('LAB_OCR_PDF_NATIVE_TEXT_REGION_PASS');
