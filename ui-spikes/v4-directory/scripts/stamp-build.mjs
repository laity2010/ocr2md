/** One immutable, visible short ID per successful asset build.
 * Host timezone for this project: Asia/Shanghai (UTC+08). Full seconds stay
 * in build-info.json and the component details, while the badge uses HHMM.
 */
import {readFile,writeFile,readdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve('ui-spikes/v4-directory');
const clock=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Shanghai',
  year:'2-digit',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hourCycle:'h23'});
const parts=Object.fromEntries(clock.formatToParts(new Date()).map(x=>[x.type,x.value]));
const id=`v4-${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`;
const seconds=`${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}${parts.second}`;
const htmlPath=resolve(root,'index.html');
const appPath=resolve(root,'app.js');
let html=await readFile(htmlPath,'utf8');
let app=await readFile(appPath,'utf8');
const label=/(<span id="v4-build-label" data-testid="v4-build-label" class="v3-build" data-build-id=")[^"]+("[^>]*>)[^<]*(<\/span>)/g;
const details=/(<p id="workbench-build"[^>]*data-build-id=")[^"]+("[^>]*>)构建版本：[^<]*(<\/p>)/g;
let matched=0;
html=html.replace(label,(_all,a,b,c)=>{matched++;return a+id+b+id+c});
html=html.replace(details,(_all,a,b,c)=>{matched++;return a+id+b+`构建版本：${id} · 生成时间：${seconds} (UTC+08)`+c});
if(matched!==2)throw Error('OCR2MD_BUILD_LABEL_TEMPLATE_MISMATCH');
// URL-bust only the local application assets; preserve independent WCP loader.
html=html.replace(/(href="\.\/assets\/v4\.css\?)(?:v|build)=[^"?]+/,`$1build=${id}`)
  .replace(/(data-entry="\.\/app\.js\?)(?:v|build)=[^"?]+/,`$1build=${id}`);
if(!html.includes(`data-entry="./app.js?build=${id}"`)||!html.includes(`./assets/v4.css?build=${id}`))
  throw Error('OCR2MD_BUILD_CACHE_KEY_MISSING');
app=app.replace(/(\.\/plugins\/registry\.generated\.js\?)(?:v|build)=[a-zA-Z0-9-]+/,`$1build=${id}`);
if(!app.includes(`./plugins/registry.generated.js?build=${id}`))
  throw Error('OCR2MD_BUILD_REGISTRY_CACHE_KEY_MISSING');
await writeFile(htmlPath,html);
await writeFile(appPath,app);
// A visible version must identify the entire runtime, not merely HTML.
// Hash the registry and all declared plugin bundles to detect mixed deploys.
const assets=['index.html','app.js','assets/v4.css','plugins/registry.generated.js'];
for(const entry of await readdir(resolve(root,'plugins'),{withFileTypes:true})){
 if(!entry.isDirectory())continue;
 const manifest=JSON.parse(await readFile(resolve(root,'plugins',entry.name,'plugin.json'),'utf8'));
 for(const bundle of manifest.bundles??[])assets.push(`plugins/${entry.name}/${bundle.output}`);
}
// Include the public component mirror in the immutable build fingerprint,
// including the WCP manifest and every release used for rollback.
async function appendVendor(folder){
 for(const item of await readdir(resolve(root,folder),{withFileTypes:true})){
  const rel=folder+'/'+item.name;
  if(item.isDirectory())await appendVendor(rel);
  else if(item.isFile()){
   if(!/\.(js|json|css)$/.test(item.name))throw Error('V4_UNEXPECTED_VENDOR_RUNTIME_FILE '+rel);
   assets.push(rel);
  }else throw Error('V4_VENDOR_SYMLINK_FORBIDDEN '+rel);
 }
}
await appendVendor('vendor');
const hashes={};
for(const file of assets.sort())hashes[file]=createHash('sha256').update(await readFile(resolve(root,file))).digest('hex');
const fingerprint=createHash('sha256').update(Object.entries(hashes).map(([a,b])=>a+':'+b).join('\n')).digest('hex');
const info={schemaVersion:1,id,builtAt:`20${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}+08:00`,
  preciseBuildTime:seconds,timezone:'Asia/Shanghai',appEntrySha256:fingerprint,assets:hashes};
await writeFile(resolve(root,'build-info.json'),JSON.stringify(info,null,2)+'\n');
console.log('OCR2MD_V4_BUILD_ID',id,info.builtAt);
