import {defineConfig} from 'vite';
import {readFile, mkdir, rename, writeFile} from 'node:fs/promises';
import {join, resolve, dirname} from 'node:path';
import {existsSync} from 'node:fs';
// A build version is fixed at bundle creation, never generated from page-load time.
const stamp = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai', year:'numeric',month:'2-digit',day:'2-digit',
  hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'
}).formatToParts(new Date());
const part = key => stamp.find(x => x.type===key).value;
const buildVersion = `v6-${part('year')}${part('month')}${part('day')}-${part('hour')}${part('minute')}${part('second')}`;
const fixture = resolve('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const file = resolve(process.env.V6_DOCUMENT_PATH || '.v6/workspace/buffetts-alpha.minerujson.md');

// Thin I/O, no duplicate document state and no Markdown parsing.
async function readDocument() {
  return readFile(existsSync(file) ? file : fixture, 'utf8');
}
export default defineConfig({
  define: {'__V6_BUILD_VERSION__': JSON.stringify(buildVersion)},
  root: 'ui',
  build: {outDir: '../dist', emptyOutDir: true},
  plugins: [{name: 'single-file-io', configureServer(server) {
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
