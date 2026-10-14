/** V3 WorkspaceFS facade. Legacy editor sees the original FS contract, but
 * all network I/O is handed to the single authorized OCR2MD filesystem service
 * via WCP's versioned/validated scoped CQE endpoint. No key crosses the bus. */
const throwIfError=r=>{if(r.error)throw Error(r.error);return r};
const parse=r=>JSON.parse(throwIfError(r).data);
const chars=bytes=>{
 let out='';for(let i=0;i<bytes.length;i+=16384)out+=String.fromCharCode(...bytes.subarray(i,i+16384));
 return btoa(out);
};
function assertBook(path){if(!path.startsWith('/ocr2md/')||path.includes('..')||path.includes('\0'))throw Error('无效书籍目录');return path}
export function createBoundaryFs(bus,MacVaultHttpFS,onProgress=()=>{}){
 const transport={
  dispose(){},
  async fetchJson(url,init={}){
   const parsed=new URL(url,location.origin);
   const query=parsed.searchParams;
   if(parsed.pathname==='/__v3/fs'&&(!init.method||init.method==='GET')){
    const op=query.get('op')||'',path=query.get('path')||'';
    const start=Number(query.get('offset')||0),size=Number(query.get('length')||0);
    const base={op,path,cursor:query.get('cursor')||'',nodeId:query.get('nodeId')||'',
      revision:query.get('revision')||'',offset:start,length:size};
    if(op!=='read'||size<=65536)return parse(await bus.query('boundary.fs.fetch',base));
    if(!Number.isSafeInteger(size)||size<1||size>512*1024)throw Error('文件读取范围超出限制');
    const chunks=[];let length=0,revision='',totalBytes=0;
    for(let offset=start;offset<start+size;offset+=65536){
      const result=parse(await bus.query('boundary.fs.fetch',{...base,offset,length:Math.min(65536,start+size-offset)}));
      if(revision&&result.revision!==revision||totalBytes&&result.totalBytes!==totalBytes)throw Error('文件读取版本发生变化');
      revision=result.revision;totalBytes=result.totalBytes;
      const raw=atob(result.base64);const bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
      length+=bytes.length;chunks.push(bytes);
    }
    const combined=new Uint8Array(length);let ptr=0;for(const part of chunks){combined.set(part,ptr);ptr+=part.length}
    return {base64:chars(combined),revision,totalBytes};
   }
   if(parsed.pathname==='/__v3/chapters/media/download'&&init.method==='POST'){
     const params=JSON.parse(init.body);assertBook(params.book);
     return parse(await bus.command('clean.media.download',params));
   }
   if(parsed.pathname==='/__v3/chapters/commit'&&init.method==='POST'){
     const body=JSON.parse(init.body);
     const {book,filename,nodeId,expectedRevision,base64}=body;
     assertBook(book);
     if(!filename||!nodeId||!expectedRevision||!base64)throw Error('章节保存缺少来源或正文');
     const bytes=crypto.getRandomValues(new Uint8Array(16));
     const requestId=[...bytes].map(v=>v.toString(16).padStart(2,'0')).join('');
     const start=throwIfError(await bus.command('clean.chapter.begin',{book,filename,nodeId,expectedRevision,requestId}));
     if(!start.ok)throw Error(start.error||'无法开始章节保存');
     for(let pos=0;pos<base64.length;pos+=48000){
       const chunk=throwIfError(await bus.command('clean.chapter.append',{requestId,data:base64.slice(pos,pos+48000)}));
       if(!chunk.ok)throw Error(chunk.error||'章节分段上传失败');
     }
     return parse(await bus.command('clean.chapter.commit',{requestId}));
   }
   throw Error('不支持的文件操作：'+parsed.pathname);
  }
 };
 return new MacVaultHttpFS(transport,'obsidian-ocr2md');
}
