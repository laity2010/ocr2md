/** Real production PDF *read-only* PDF.js parser check; no file modification. */
import {createRequire} from 'node:module';
import {readSync,openSync,closeSync,statSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
import {PDFDataRangeTransport,getDocument} from '../../v2/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const root=join(process.env.HOME,'Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md');
const folder=readdirSync(root).find(name=>name.includes('忏悔录'));
if(!folder)throw Error('User PDF dir unavailable');
const dir=join(root,folder);
const filename=readdirSync(dir).find(name=>name.toLowerCase().endsWith('.pdf'));
const filepath=join(dir,filename);const size=statSync(filepath).size;
let total=0,count=0;
const fd=openSync(filepath,'r');
const chunkKiB=Number(process.env.PDF_RANGE_CHUNK_KIB||64);
class RealPdfRange extends PDFDataRangeTransport {
  requestDataRange(begin,end){
    const buffer=new Uint8Array(end-begin);
    const read=readSync(fd,buffer,0,buffer.byteLength,begin);
    if(read!==buffer.byteLength)throw Error('Incomplete original PDF read');
    count++;total+=read;
    this.onDataRange(begin,buffer);
  }
}
let task;
try {
 const started=Date.now();
 task=getDocument({range:new RealPdfRange(size,null),rangeChunkSize:chunkKiB*1024,disableAutoFetch:true,disableStream:true});
 let deadline;
 const timeout=new Promise((_,reject)=>{deadline=setTimeout(()=>reject(Error('PDF parse exceeded 60sec')),60000);});
 const pdf=await Promise.race([task.promise,timeout]);
 clearTimeout(deadline);
 const page=await pdf.getPage(1);
 const view=page.getViewport({scale:1});
 console.log('REAL_109MB_PDF_PARSE_OK',JSON.stringify({bytes:size,pages:pdf.numPages,page1Width:view.width,page1Height:view.height,rangeRequests:count,rangeBytes:total,maxChunkKiB:chunkKiB,seconds:Math.round((Date.now()-started)/1000)}));
 await task.destroy();
}catch(err){console.error('REAL_PDF_PARSE_FAILED',err.message,JSON.stringify({rangeRequests:count,rangeBytes:total,size}));process.exitCode=1;
 if(task)await task.destroy().catch(()=>{});
}finally{closeSync(fd);}
