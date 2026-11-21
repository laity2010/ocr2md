/** Valid small synthetic PDF, one page per trusted MinerU page_size. Test only. */
export function makePDF(pageSizes){
  if(!Array.isArray(pageSizes)||!pageSizes.length)throw Error('page sizes required');
  const count=pageSizes.length,fontId=3+2*count;
  const objects=[];
  objects[1]='<< /Type /Catalog /Pages 2 0 R >>';
  objects[2]=`<< /Type /Pages /Count ${count} /Kids [${pageSizes.map((_,i)=>`${3+i*2} 0 R`).join(' ')}] >>`;
  for(let i=0;i<count;i++){
    const [w,h]=pageSizes[i];
    const pageId=3+i*2,streamId=pageId+1;
    objects[pageId]=`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${w} ${h}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${streamId} 0 R >>`;
    const content=`BT /F1 18 Tf 28 ${Math.max(15,h-40)} Td (Synthetic PDF page ${i+1}) Tj ET`;
    objects[streamId]=`<< /Length ${Buffer.byteLength(content,'ascii')} >>\nstream\n${content}\nendstream`;
  }
  objects[fontId]='<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>';
  let data=Buffer.from('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n','latin1');
  const offsets=[0];
  for(let i=1;i<objects.length;i++){
    offsets[i]=data.length;
    data=Buffer.concat([data,Buffer.from(`${i} 0 obj\n${objects[i]}\nendobj\n`,'latin1')]);
  }
  const xref=data.length;
  let tail=`xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for(let i=1;i<objects.length;i++)tail+=`${String(offsets[i]).padStart(10,'0')} 00000 n \n`;
  tail+=`trailer\n<< /Root 1 0 R /Size ${objects.length} >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.concat([data,Buffer.from(tail,'latin1')]);
}
