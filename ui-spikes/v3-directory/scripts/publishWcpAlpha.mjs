// Only the isolated WCP consumer entry is copied into the existing V3 static tree.
// The main V3 HTML, bundle, backend, Vault and workspace files are not touched.
import {copyFile,mkdir,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const from=resolve('ui-spikes/v3-directory/wcp-alpha');
const to=resolve('ui-spikes/v2/v3-directory/wcp-alpha');
await mkdir(to,{recursive:true});
const build=spawnSync('./node_modules/.bin/esbuild',[
 'ui-spikes/v3-directory/wcp-alpha/modules/media-scan-entry.ts','--bundle',
 '--format=esm','--platform=browser','--target=es2022',
 '--alias:crypto=./ui-spikes/v3-directory/src/browserCryptoShim.ts',
 '--outfile=ui-spikes/v3-directory/wcp-alpha/modules/media-scan.js',
],{cwd:resolve('.'),encoding:'utf8'});
if(build.status!==0)throw Error('MEDIA_SCANNER_BUILD_FAILED '+build.stderr);
for(const name of ['index.html','settings.schema.json','debug-bridge.js',
  'modules/entry.js','modules/contracts.js','modules/document.js','modules/media.js',
  'modules/media-scan.js','modules/review.js']){
  await mkdir(resolve(to,name,'..'),{recursive:true});
  await copyFile(resolve(from,name),resolve(to,name));
  const source=await readFile(resolve(from,name));
  const published=await readFile(resolve(to,name));
  if(!source.equals(published))throw Error('WCP_ALPHA_PUBLISH_MISMATCH '+name);
}
console.log('OCR2MD_WCP_ALPHA_PUBLISHED',to);
