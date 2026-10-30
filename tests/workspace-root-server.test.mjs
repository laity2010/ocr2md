/** Root is a book catalogue; selecting one direct child prepares/loads its CMD mother MD. */
import {unlockCode} from './v6-auth.test-helper.mjs';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const scratch=mkdtempSync(join(tmpdir(),'v6-root-catalog-'));
const from=join(scratch,'from'),catalog=join(scratch,'catalog');
for(const folder of [from,catalog])mkdirSync(folder);
const filename='mother.minerujson.md', pdf='reference.pdf';
const baseline=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const mineru=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json');
const bookA='Book A', bookB='Book B';
for(const book of [bookA,bookB])for(const child of ['', 'mineru json', 'pdf'])mkdirSync(join(catalog,book,child));
const broken='Broken Book';mkdirSync(join(catalog,broken));
writeFileSync(join(from,filename),baseline);
writeFileSync(join(from,pdf),'DEFAULT_PDF');
for(const book of [bookA,bookB]){
 writeFileSync(join(catalog,book,'mineru json','source.json'),mineru);
 writeFileSync(join(catalog,book,'pdf','evidence.pdf'),`PDF_${book}`);
}
const initialA=baseline+'\n<!-- BOOK_A_MARKER -->\n';
writeFileSync(join(catalog,bookA,bookA+'.minerujson.md'),initialA);
const token=join(scratch,'editor-token'),settingsFile=join(scratch,'settings.json');
writeFileSync(token,'WORKROOT_BOOKS_TEST_TOKEN_abcdefghijklmnopqrstuvwxyz');
const port=await new Promise((ok,fail)=>{
 const net=createServer();net.once('error',fail);net.listen(0,'127.0.0.1',()=>{
 const n=net.address().port;net.close(e=>e?fail(e):ok(n));});
});
const url=`http://127.0.0.1:${port}`;
const server=spawn('python3',['scripts/v6_serve.py'],{cwd:process.cwd(),env:{...process.env,
 V6_BIND:'127.0.0.1',V6_PORT:String(port),V6_LAN_TLS_HOST:'',V6_LAB_ID:'',
 V6_WORKSPACE_ALLOWED_ROOTS:catalog,V6_DOCUMENT_PATH:join(from,filename),
 V6_PDF_PATH:join(from,pdf),V6_TOKEN_PATH:token,V6_SETTINGS_PATH:settingsFile},
 stdio:['ignore','ignore','pipe']});
server.stderr.on('data',bytes=>console.error('ISOLATED_WORKROOT_ERR',String(bytes).slice(0,1000)));
const pause=ms=>new Promise(r=>setTimeout(r,ms));
try{
 let ready=false;
 for(let i=0;i<120;i++){
  try{if((await fetch(url+'/healthz')).ok){ready=true;break}}catch{}
  await pause(100);
 }
 assert(ready,'isolated Main not ready');
 assert.equal((await fetch(url+'/api/workspace/roots')).status,403);
 const auth=await fetch(url+'/api/unlock',{method:'POST',headers:{Origin:url,'Content-Type':'application/json'},
 body:JSON.stringify({code:unlockCode(readFileSync(token,'utf8'))})});assert.equal(auth.status,200);
 const cookie=auth.headers.get('set-cookie').split(';')[0];
 const get=path=>fetch(url+path,{headers:{Cookie:cookie}});
 const pathArg=path=>'?path='+encodeURIComponent(path);
 const roots=await (await get('/api/workspace/roots')).json();
 assert.equal(roots.activeRoot,from);assert.equal(roots.activeBook,'');
 assert(roots.allowedRoots.includes(catalog));
 const listing=await (await get('/api/workspace/books'+pathArg(catalog))).json();
 assert.deepEqual(listing.books.map(book=>book.name),[bookA,bookB,broken]);
 assert.equal(listing.books[0].state,'ready');
 assert.equal(listing.books[1].state,'needs-conversion');
 assert.equal(listing.books[2].selectable,false);
 assert.equal((await get('/api/workspace/books?path=/etc')).status,422);
 const defaultGet=await get('/api/document');const staleEtag=defaultGet.headers.get('etag');
 assert.equal(await defaultGet.text(),baseline);
 const initialSettings=await get('/api/settings'),source=await initialSettings.json();
 const rec=(key,value)=>({key,category1:'工作区',category2:'文件与目录',
 comment:'Test',value,range:{kind:'server-directory'}});
 const settingsBody=(name,root=catalog)=>{
  const copy=structuredClone(source);
  copy.settings['workspace.files.rootPath']=rec('rootPath',root);
  copy.settings['workspace.files.bookName']=rec('bookName',name);
  return JSON.stringify(copy);
 };
 const put=async(name,root,tag)=>fetch(url+'/api/settings',{method:'PUT',headers:{Cookie:cookie,
  Origin:url,'If-Match':tag,'Content-Type':'application/json'},body:settingsBody(name,root)});
 assert.equal((await put(bookA,'/etc',initialSettings.headers.get('etag'))).status,400);
 assert.equal((await put(broken,catalog,initialSettings.headers.get('etag'))).status,400);
 assert(!existsSync(settingsFile),'rejected setting must not write');
 const selectA=await put(bookA,catalog,initialSettings.headers.get('etag'));
 assert.equal(selectA.status,200,await selectA.text());
 const bookGet=await get('/api/document');assert.equal(await bookGet.text(),initialA);
 assert.equal(bookGet.headers.get('X-OCR2MD-Document-Name'),Buffer.from(bookA+'.minerujson.md').toString('hex'));
 const bookEtag=bookGet.headers.get('etag');assert.notEqual(bookEtag,staleEtag);
 assert.equal(await (await get('/api/pdf')).text(),'PDF_'+bookA);
 assert.equal((await fetch(url+'/api/document',{method:'PUT',headers:{Cookie:cookie,Origin:url,
 'If-Match':staleEtag},body:'unsafe-save'})).status,412);
 const s1=await get('/api/settings'),body1=await s1.json();
 body1.settings['workspace.files.bookName'].value=bookB;
 const rawBefore=readFileSync(join(catalog,bookB,'mineru json','source.json'));
 const convert=await fetch(url+'/api/settings',{method:'PUT',headers:{Cookie:cookie,Origin:url,
 'If-Match':s1.headers.get('etag'),'Content-Type':'application/json'},body:JSON.stringify(body1)});
 assert.equal(convert.status,200,await convert.text());
 const built=join(catalog,bookB,bookB+'.minerujson.md');
 assert(existsSync(built),'book B Markdown was not generated');
 const result=readFileSync(built,'utf8');
 assert(result.includes('<!-- minerujson:block:v1:')&&result.includes('<!-- minerujson:source:v1'));
 assert.deepEqual(readFileSync(join(catalog,bookB,'mineru json','source.json')),rawBefore);
 assert.equal(await (await get('/api/document')).text(),result);
 assert.equal(await (await get('/api/pdf')).text(),'PDF_'+bookB);
 const staleSettings=await put(bookA,catalog,s1.headers.get('etag'));
 assert.equal(staleSettings.status,409);
 assert.equal(readFileSync(join(catalog,bookA,bookA+'.minerujson.md'),'utf8'),initialA);
 const restored=await get('/api/settings'),restoreBody=await restored.json();
 restoreBody.settings['workspace.files.rootPath'].value='';
 restoreBody.settings['workspace.files.bookName'].value='';
 const restore=await fetch(url+'/api/settings',{method:'PUT',headers:{Cookie:cookie,Origin:url,
 'If-Match':restored.headers.get('etag'),'Content-Type':'application/json'},body:JSON.stringify(restoreBody)});
 assert.equal(restore.status,200);
 assert.equal(await (await get('/api/document')).text(),baseline);
 console.log('BOOK_CATALOG_ISOLATED_SERVER_PASS',JSON.stringify({listFirstLevel:true,
  inspectSources:true,unconvertedBookGenerated:true,sourceUnchanged:true,pdfSwitched:true,
  oldDocIntact:true,staleDoc412:true,staleSettings409:true,restoreDefault:true}));
}finally{server.kill('SIGTERM');rmSync(scratch,{recursive:true,force:true});}
