// v3 publishes only static UI assets under the existing 4176 root.
// Mac Vault filesystem API and running server are unchanged.
import { copyFile, mkdir, readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const demo = resolve(fileURLToPath(new URL('../', import.meta.url)));
const preview = resolve(demo, '../v2/v3-directory');
const built = (await readdir(resolve(demo,'dist'))).filter(name => /^(app\.(js|css)|KaTeX_[a-zA-Z0-9_-]+\.(woff2?|ttf)|[a-zA-Z0-9_-]+-[A-Z0-9]+\.(svg|gif))$/.test(name));
const entries = [['index.html','index.html'],['sw.js','sw.js'],...built.map(file=>['dist/'+file,'dist/'+file]),
  ['../v2/node_modules/pdfjs-dist/build/pdf.worker.min.mjs','dist/pdf.worker.min.mjs']];
for (const [source, dest] of entries) {
  const from = resolve(demo, source);
  const to = resolve(preview, dest);
  await mkdir(resolve(to, '..'), { recursive: true });
  await copyFile(from, to);
  if (!Buffer.from(await readFile(from)).equals(Buffer.from(await readFile(to)))) {
    throw new Error(`Mismatch after preview publish: ${source}`);
  }
}
console.log('V3_MAC_VAULT_WEB_READY /v3-directory/ (shared Mac Workspace FS; requires access key remotely)');
