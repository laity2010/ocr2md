/** Tiny self-authored PDF fixture; no external PDF or user document. */
export function makeLabOcrPdf(pageCount=3){
  if(!Number.isInteger(pageCount)||pageCount<1||pageCount>100)throw Error('invalid page count');
  const content=n=>`BT /F1 20 Tf 72 760 Td (OCR Lab PDF page ${n}) Tj ET\n`;
  const fontId=3+pageCount*2;
  const kids=Array.from({length:pageCount},(_,i)=>`${3+2*i} 0 R`).join(' ');
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Count ${pageCount} /Kids [${kids}] >>`,
  ];
  for(let i=0;i<pageCount;i++){
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${4+2*i} 0 R >>`);
    const body=content(i+1);
    objects.push(`<< /Length ${Buffer.byteLength(body)} >>\nstream\n${body}endstream`);
  }
  objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  let pdf='%PDF-1.7\n';
  const offsets=[0];
  for(const [i,object] of objects.entries()){
    offsets.push(Buffer.byteLength(pdf));
    pdf+=`${i+1} 0 obj\n${object}\nendobj\n`;
  }
  const xref=Buffer.byteLength(pdf);
  pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`;
  for(const offset of offsets.slice(1))pdf+=`${String(offset).padStart(10,'0')} 00000 n \n`;
  pdf+=`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(pdf);
}
