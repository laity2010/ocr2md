/** Direct M00/M01 contract. No SQL writes, network downloads or second AG. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
const vite=await createServer({configFile:false,logLevel:'error',
  server:{host:'127.0.0.1',port:0}});
await vite.listen();
try{
  for(const [name,type] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage();
      await page.goto(vite.resolvedUrls.local[0]+'tests/media-public-contract.fixture.html');
      const result=await page.evaluate(async()=>{
        const {findLabMedia,projectLabMedia}=await import('/ui/lab-ocr/media-view.js');
        const {resolveReviewLocation}=await import('/ui/lab-ocr/four-pane-location.js');
        const url='https://cdn-mineru.openxlab.org.cn/a.jpg';
        const local='media/'+'a'.repeat(24)+'.png';
        const orphan='media/'+'b'.repeat(24)+'.png';
        const source=[`![MinerU](<${url}>) and ![repeat](${url})`,
          `![local](<${local}>)`,
          `<!-- minerujson:v1 ![excluded](<https://cdn-mineru.openxlab.org.cn/secret.png>) -->`].join('\n');
        const mdRows=source.split('\n').map((text,i)=>({line_id:'line-'+i,
          line_no:i+1,block_id:45+i,text}));
        const blocks=mdRows.map((r,i)=>({block_id:r.block_id,pbs:`p1b${i+5}s0`,global_page:0}));
        const found=findLabMedia(source);
        if(found.length!==3||found.some(r=>source.slice(r.from,r.to)!==r.url))
          throw Error('M00 count/offset/evidence regression');
        if(found.map(r=>r.line).join(',')!=='1,1,2')
          throw Error('M00 physical line mapping regression');
        const rows=projectLabMedia({source,mdRows,blocks,
          inventory:[{path:local,bytes:100},{path:orphan,bytes:200}]});
        if(rows.length!==4||rows.filter(r=>r.line_no===1).length!==2||
          rows.filter(r=>r.pbs==='p1b5s0').length!==2||
          rows.find(r=>r.line_no===2)?.pbs!=='p1b6s0')
          throw Error('M01 LineID/BlockID/PBS projection regression');
        const unmatched=rows.find(r=>r.adopted==='未引用');
        if(unmatched?.url!==orphan||unmatched.line_no!==null||unmatched.pbs!=='')
          throw Error('M01 invented source location for orphan');
        const selected=rows.find(r=>r.line_no===2);
        const location=resolveReviewLocation({lineId:selected.line_id,
          blockId:selected.block_id,lineNo:selected.line_no},mdRows,blocks);
        if(location.lineNo!==2||location.pbs!=='p1b6s0'||location.page!==1)
          throw Error('M01 four-pane location contract regression');
        return {refs:found.length,rows:rows.length,linked:3,orphan:1,location:location.pbs};
      });
      assert.equal(result.refs,3);assert.equal(result.linked,3);
      console.log('LAB_OCR_MEDIA_SCAN_DIRECT_PASS',name,JSON.stringify(result));
    }finally{await browser.close();}
  }
}finally{await vite.close();}
