/** Read-only table Block projection contract. Both Chromium and iPad WebKit. */
import assert from 'node:assert/strict';
import {createServer} from 'vite';
import {chromium,webkit} from 'playwright';
const vite=await createServer({configFile:false,logLevel:'error',server:{host:'127.0.0.1',port:0}});
await vite.listen();
try{
  for(const [name,type] of [['Chromium',chromium],['iPad-WebKit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage();
      await page.goto(vite.resolvedUrls.local[0]+'tests/media-public-contract.fixture.html');
      const result=await page.evaluate(async()=>{
        const {projectTableBlockRows}=await import('/ui/lab-ocr/table-view.js');
        const {resolveReviewLocation,sourceBlockStartLine}=await import('/ui/lab-ocr/four-pane-location.js');
        const blocks=[
          {block_id:1,pbs:'p1b0',block_type:'text',global_page:0},
          {block_id:2,pbs:'p2b0',block_type:'table',global_page:1},
          {block_id:3,pbs:'p2b0s0',block_type:'table_caption',global_page:1,parent_block_id:2},
          {block_id:4,pbs:'p2b0s1',block_type:'table_body',global_page:1,parent_block_id:2},
          {block_id:5,pbs:'p2b0s2',block_type:'table_footnote',global_page:1,parent_block_id:2},
          {block_id:6,pbs:'~merged:6',block_type:'table',global_page:1,absorbed_into_block_id:2},
          {block_id:7,pbs:'p3b0',block_type:'chart_body',global_page:2},
          {block_id:8,pbs:'p3b1',block_type:'custom_TABLE_label',global_page:2},
        ];
        const md=[{line_no:1,line_id:'x1',block_id:1,text:'Other'},
          {line_no:2,line_id:'x2',block_id:3,text:'Table caption'},
          {line_no:3,line_id:'x3',block_id:4,text:'<table>contents</table>'},
          {line_no:4,line_id:'x4',block_id:5,text:'Table note'},
          {line_no:5,line_id:'x5',block_id:8,text:'Custom table'}];
        const snapshot=JSON.stringify({blocks,md});
        const rows=projectTableBlockRows(md,blocks);
        if(rows.length!==6||rows.some(row=>!/table/i.test(row.block_type)))
          throw Error('Did not include every table-related block type');
        if(rows.filter(row=>row.line_no!=null).length!==4)
          throw Error('Physical MD source mapping is not one-to-one per Block');
        const parent=rows.find(row=>row.block_id===2);
        if(parent.line_no!==null||parent.line_id!==null)
          throw Error('PDF-only table parent claimed a fictitious source line');
        const historical=rows.find(row=>row.block_id===6);
        if(historical.merged_into_block_id!==2||historical.absorbed_into_block_id!=null)
          throw Error('Merged table wrapper missing or still hidden from AG');
        const body=rows.find(row=>row.block_id===4);
        if(body.pbs!=='p2b0s1'||body.line_id!=='x3'||body.line_no!==3)
          throw Error('Table body LineID/BlockID/PBS metadata mismatched');
        const sourceLoc=resolveReviewLocation({lineId:body.line_id,
          blockId:body.block_id,lineNo:body.line_no},md,blocks);
        const parentLoc=resolveReviewLocation({lineId:parent.line_id,
          blockId:parent.block_id,lineNo:parent.line_no},md,blocks);
        if(sourceLoc.page!==2||sourceLoc.lineNo!==3||
           sourceBlockStartLine(sourceLoc,md)!==3||
           parentLoc.page!==2||parentLoc.lineNo!==null)
          throw Error('Table block source/PDF navigation semantics broken');
        if(snapshot!==JSON.stringify({blocks,md}))throw Error('Projection mutated source');
        return {tableRows:rows.length,linked:4,sourceLine:body.line_no,
          pdfOnly:parentLoc.page,mergedIncluded:Boolean(historical)};
      });
      assert.equal(result.tableRows,6);
      console.log('LAB_OCR_TABLE_BLOCK_DIRECT_PASS',name,JSON.stringify(result));
    }finally{await browser.close();}
  }
}finally{await vite.close();}
