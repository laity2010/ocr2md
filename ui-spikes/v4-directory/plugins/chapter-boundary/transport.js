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
   if(parsed.pathname==='/__v3/ir/cache'&&(!init.method||init.method==='GET')){
     const book=assertBook(query.get('book')||''),part=query.get('part')||'status';
     if(!['status','index','md'].includes(part))throw Error('不支持的章节缓存视图');
     const response=throwIfError(await bus.query('boundary.ir.cache.load',{book,part}));
     const meta=JSON.parse(response.meta);
     if(response.size>0){
       const pieces=[];for(let offset=0;offset<response.size;offset+=60000){
         const chunk=throwIfError(await bus.query('boundary.ir.cache.chunk',{book,part,offset})).data;
         if(!chunk)throw Error('章节缓存分段读取提前结束');
         pieces.push(chunk);
       }
       meta.base64=pieces.join('');
       if(meta.base64.length!==response.size)throw Error('章节缓存分段校验失败');
     }
     return meta;
   }
   if(parsed.pathname==='/__v3/ir/cache/prepare'&&init.method==='POST'){
     const payload=JSON.parse(init.body);assertBook(payload.book);
     return parse(await bus.command('boundary.ir.cache.prepare',payload));
   }
   if(parsed.pathname==='/__v3/ir'&&(!init.method||init.method==='GET')){
    const book=assertBook(query.get('book')||'');
    const response=throwIfError(await bus.query('boundary.ir.load',{book}));
    const meta=JSON.parse(response.meta);
    if(response.size>0){
      onProgress({loaded:0,total:response.size});
      const pieces=[];for(let offset=0;offset<response.size;offset+=60000){
        const chunk=throwIfError(await bus.query('boundary.ir.chunk',{book,offset})).data;
        if(!chunk)throw Error('DIRjson 分段读取提前中断');pieces.push(chunk);
        if(offset===0 || (Math.floor((offset+chunk.length)/response.size*10)>Math.floor(offset/response.size*10)) || offset+chunk.length>=response.size)
          onProgress({loaded:Math.min(response.size,offset+chunk.length),total:response.size});
      }
      meta.irBase64=pieces.join('');
      if(meta.irBase64.length!==response.size)throw Error('DIRjson 快照长度变化');
    }
    return meta;
   }
   if(parsed.pathname==='/__v3/ir/markings'&&(!init.method||init.method==='GET')){
     const book=assertBook(query.get('book')||'');
     return parse(await bus.query('boundary.ir.markings.read',{book}));
   }
   if(parsed.pathname==='/__v3/ir/markings/commit'&&init.method==='POST'){
     const body=JSON.parse(init.body);assertBook(body.book);
     return parse(await bus.command('boundary.ir.markings.save',{
       ...body,markings:JSON.stringify(body.markings)}));
   }
   if(parsed.pathname==='/__v3/ir/commit'&&init.method==='POST'){
    const body=JSON.parse(init.body);
    const {archiveBase64,book,requestId,expectedGeneration,expectedMarkingsRevision}=body;
    assertBook(book);
    const begin=throwIfError(await bus.command('boundary.ir.begin',{
      book,requestId,expectedGeneration:expectedGeneration||'',expectedMarkingsRevision:expectedMarkingsRevision||''}));
    if(!begin.ok)throw Error(begin.error||'无法开始 IR 上传');
    // Segments are encoded BASE64 from the original immutable archive;
    // concatenate without re-encoding to retain exact SHA-256 semantics.
    for(let offset=0;offset<archiveBase64.length;offset+=48000){
      const part=throwIfError(await bus.command('boundary.ir.append',{requestId,data:archiveBase64.slice(offset,offset+48000)}));
      if(!part.ok)throw Error(part.error||'DIRjson 分段传输失败');
    }
    return parse(await bus.command('boundary.ir.commit',{requestId}));
   }
   if(parsed.pathname==='/__v3/ir/publish-chapters'&&init.method==='POST'){
    const payload=JSON.parse(init.body);assertBook(payload.book);
    return parse(await bus.command('boundary.ir.publish',payload));
   }
   throw Error('不支持的文件操作：'+parsed.pathname);
  }
 };
 return new MacVaultHttpFS(transport,'obsidian-ocr2md');
}
