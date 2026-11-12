/** Tiny self-authored PDF fixture; no external PDF or user document. */
export function makeLabOcrPdf(){
  const content=n=>`BT /F1 20 Tf 72 760 Td (OCR Lab PDF page ${n}) Tj ET\n`;
  const objects=[
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Count 3 /Kids [3 0 R 5 0 R 7 0 R] >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 4 0 R >>',
    `<< /Length ${Buffer.byteLength(content(1))} >>\nstream\n${content(1)}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 6 0 R >>',
    `<< /Length ${Buffer.byteLength(content(2))} >>\nstream\n${content(2)}endstream`,
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 9 0 R >> >> /Contents 8 0 R >>',
    `<< /Length ${Buffer.byteLength(content(3))} >>\nstream\n${content(3)}endstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
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
