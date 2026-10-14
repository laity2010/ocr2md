/** Two-page real PDF fixture with an intentionally large, unused comment area.
 * This detects accidental whole-file downloads in the PDF.js range viewer.
 */
function testPdf({paddingBytes=2*1024*1024, first='Page One',second='Page Two'}={}) {
  const pdf=['%PDF-1.4\n'];
  const offsets=[0];
  function size(){return Buffer.byteLength(pdf.join(''),'ascii');}
  function obj(n,body){offsets[n]=size();pdf.push(`${n} 0 obj\n${body}\nendobj\n`);}
  const stream=text=>{
    const content=`BT /F1 26 Tf 70 700 Td (${text}) Tj ET\n`;
    return `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}endstream`;
  };
  obj(1,'<< /Type /Catalog /Pages 2 0 R >>');
  obj(2,'<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>');
  obj(3,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 6 0 R >>');
  obj(4,'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 5 0 R >> >> /Contents 7 0 R >>');
  obj(5,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');
  obj(6,stream(first));obj(7,stream(second));
  // An unused, structurally valid stream gives us a large PDF without
  // requiring PDF.js to lex a 2 MiB comment line during page rendering.
  obj(8,`<< /Length ${paddingBytes} >>\nstream\n${'x'.repeat(paddingBytes)}\nendstream`);
  const xref=size();
  pdf.push('xref\n0 9\n0000000000 65535 f \n');
  for(let i=1;i<=8;i++)pdf.push(String(offsets[i]).padStart(10,'0')+' 00000 n \n');
  pdf.push(`trailer\n<< /Size 9 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return Buffer.from(pdf.join(''),'ascii');
}
module.exports={testPdf};
