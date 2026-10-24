import {defineConfig} from 'vite';
import {readFile, mkdir, rename, writeFile} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {existsSync,statSync,createReadStream} from 'node:fs';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
// A build version is fixed at bundle creation, never generated from page-load time.
const stamp = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
}).formatToParts(new Date());
const part = key => stamp.find(x => x.type===key).value;
const buildVersion = `v6-${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}${part('second')}`;
const settingsFile = resolve(process.env.V6_SETTINGS_PATH || '.v6/settings.json');
const defaultSettings = JSON.stringify({$comments:{globalUi:'全局 UI', 'globalUi.cmSource':'CM 源码窗','globalUi.cmSource.defaultFontSize':'所有 CM6 源码窗的默认字号（8–32 pt）'},globalUi:{cmSource:{defaultFontSize:12}}},null,2)+'\n';
const hashSettings = text => createHash('sha256').update(text).digest('hex');
const fixture = resolve('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const file = resolve(process.env.V6_DOCUMENT_PATH || '.v6/workspace/buffetts-alpha.minerujson.md');
const originalJson = resolve('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json');
const originalPdf = resolve(process.env.V6_PDF_PATH || join(homedir(),
  'Library/Mobile Documents/iCloud~md~obsidian/Documents/ocr2md/ocr2md/Bufett’s Alpha/Buffett s Alpha.pdf'));

// Thin I/O, no duplicate document state and no Markdown parsing.
async function readDocument() {
  return readFile(existsSync(file) ? file : fixture, 'utf8');
}
export default defineConfig({
  define: {'__V6_BUILD_VERSION__': JSON.stringify(buildVersion)},
  root: 'ui',
  build: {outDir: '../dist', emptyOutDir: true},
  plugins: [
    {name:'release-identity',generateBundle() {
      this.emitFile({type:'asset',fileName:'release-version.json',source:JSON.stringify({version:buildVersion})+'\n'});
    }},
    {name:'readonly-pdf-evidence-dev', configureServer(server){
      // Dev parity with production PDF read-only endpoints. Never writes PDF,
      // OCR JSON or the mother Markdown; this is not a new document backend.
      server.middlewares.use(async (req,res,next)=>{
        const path=req.url?.split('?')[0];
        if(path==='/api/pdf-map'){
          try {
            const pages=JSON.parse(await readFile(originalJson,'utf8')).pdf_info.map(page=>({
              pageSize:page.page_size,
              regions:page.para_blocks.flatMap((block,i)=>
                Array.isArray(block.bbox)&&block.bbox.length===4
                  ?[{blockIndex:i,bbox:block.bbox,type:block.type||'unknown'}]:[]),
            }));
            res.setHeader('Content-Type','application/json; charset=utf-8');
            res.setHeader('Cache-Control','no-store');
            res.end(JSON.stringify({pages}));
          }catch{res.statusCode=503;res.end('PDF map unavailable');}
          return;
        }
        if(path!=='/api/pdf')return next();
        if(!existsSync(originalPdf)){res.statusCode=404;res.end('Original PDF unavailable');return;}
        const length=statSync(originalPdf).size;
        const match=/^bytes=(\d+)-(\d*)$/.exec(req.headers.range||'');
        if(req.headers.range&&!match){res.statusCode=416;res.end();return;}
        const start=match?Number(match[1]):0;
        const end=match?Math.min(length-1,match[2]?Number(match[2]):length-1):length-1;
        if(end<start||start>=length){res.statusCode=416;res.end();return;}
        res.statusCode=match?206:200;
        res.setHeader('Content-Type','application/pdf');
        res.setHeader('Accept-Ranges','bytes');
        res.setHeader('Content-Length',end-start+1);
        res.setHeader('Cache-Control','no-store');
        if(match)res.setHeader('Content-Range',`bytes ${start}-${end}/${length}`);
        if(req.method==='HEAD'){res.end();return;}
        createReadStream(originalPdf,{start,end}).pipe(res);
      });
    }},
    {name:'cmd-settings-json-io',configureServer(server){
      server.middlewares.use('/api/settings',async(req,res)=>{
        res.setHeader('Cache-Control','no-store');
        res.setHeader('Content-Type','application/json; charset=utf-8');
        try{
          const readSettings=()=>existsSync(settingsFile)?readFile(settingsFile,'utf8'):Promise.resolve(defaultSettings);
          if(req.method==='GET'){
            const source=await readSettings();res.setHeader('ETag',hashSettings(source));res.end(source);return;
          }
          if(req.method==='PUT'){
            const chunks=[];let count=0;
            for await(const chunk of req){count+=chunk.length;
              if(count>65536){res.statusCode=413;res.end('Settings too large');return;}
              chunks.push(chunk);
            }
            const body=Buffer.concat(chunks).toString('utf8');
            const decoded=JSON.parse(body);
            if(!decoded||typeof decoded!=='object'||Array.isArray(decoded))
              throw Error('Invalid settings root');
            if(hashSettings(await readSettings())!==req.headers['if-match']){
              res.statusCode=409;res.end('Settings changed elsewhere');return;
            }
            await mkdir(dirname(settingsFile),{recursive:true});
            const temp=join(dirname(settingsFile),'.settings-'+process.pid+'-save.tmp');
            await writeFile(temp,body);await rename(temp,settingsFile);
            res.end('saved');return;
          }
          res.statusCode=405;res.end('Method not allowed');
        }catch(error){res.statusCode=400;res.end(String(error.message||error));}
      });
    }},
    {name: 'single-file-io', configureServer(server) {
    server.middlewares.use('/api/document', async (req, res) => {
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      try {
        if (req.method === 'GET') {
          res.end(await readDocument());
        } else if (req.method === 'PUT') {
          const chunks = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            if (size > 10 * 1024 * 1024) throw new Error('Document exceeds 10 MB');
            chunks.push(chunk);
          }
          await mkdir(dirname(file), {recursive:true});
          const temp = join(dirname(file), '.' + process.pid + '-save.tmp');
          await writeFile(temp, Buffer.concat(chunks));
          await rename(temp, file);
          res.end('saved');
        } else {
          res.statusCode = 405;
          res.end('Method not allowed');
        }
      } catch (error) {
        res.statusCode = 500;
        res.end(String(error));
      }
    });
  }}]
});
