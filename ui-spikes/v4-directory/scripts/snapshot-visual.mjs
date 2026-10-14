/** Copy only CSS-linked, immutable V3 visual assets. Never alter V3. */
import {readFile,copyFile,mkdir} from 'node:fs/promises';
import {resolve,basename} from 'node:path';
const origin=resolve('ui-spikes/v3-directory/dist');
const target=resolve('ui-spikes/v4-directory/assets');
await mkdir(target,{recursive:true});
const css=await readFile(resolve(origin,'app.css'),'utf8');
await copyFile(resolve(origin,'app.css'),resolve(target,'v3-app.css'));
const files=new Set([...css.matchAll(/url\((['"]?)([^)'"]+)\1\)/g)]
  .map(x=>x[2]).filter(x=>x.startsWith('./')).map(x=>basename(x)));
for(const name of files)await copyFile(resolve(origin,name),resolve(target,name));
console.log('V4_VISUAL_SNAPSHOT',files.size,'assets');
