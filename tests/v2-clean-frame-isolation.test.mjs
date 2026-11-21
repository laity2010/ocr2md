/** Direct contract: replacement V2 inherits the exact audited Lab-Frame UI. */
import assert from 'node:assert/strict';
import {readFileSync,existsSync,statSync,readdirSync} from 'node:fs';
import {resolve,relative,join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const here=process.cwd();
const frame=resolve(here,'../lab-frame');
const sha=execFileSync('git',['-C',frame,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(sha,'da903ef8e37e98931d4809e65e6052c653be7f1b');
const ours=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(execFileSync('git',['merge-base',ours,sha],{encoding:'utf8'}).trim(),sha);
function walk(root,prefix=''){
 return readdirSync(join(root,prefix)).flatMap(name=>{
  const target=join(prefix,name);
  return statSync(join(root,target)).isDirectory()?walk(root,target):[target];
 });
}
for(const path of walk(resolve(frame,'ui/frame'))){
 const lhs=readFileSync(resolve(here,'ui/frame',path));
 const rhs=readFileSync(resolve(frame,'ui/frame',path));
 assert.deepEqual(lhs,rhs,'Frame UI source was modified: '+path);
}
for(const path of ['ui/wcp-workspace-directory-module.js','ui/workspace-directory-tree.js',
 'ui/settings-module.js','ui/frame/workspace-io.js','ui/frame/settings-io.js','ui/frame/refresh.js',
 'scripts/frame_workspace_io.py']){
 assert.deepEqual(readFileSync(resolve(here,path)),readFileSync(resolve(frame,path)),path);
}
for(const path of ['scripts/v2_book.py','scripts/v2_http.py','ui/v2',
 'ui/frame/v2-window-entry.js','vite.v2-three-windows.config.mjs','scripts/v2_three_windows_publish.py']){
 assert.equal(existsSync(resolve(here,path)),false,'Old V2 contaminates clean Frame: '+path);
}
const {default:config}=await import(pathToFileURL(resolve(here,'labs/lab-ocr-v2/vite.config.mjs')));
assert.equal(config.base,'/labs/lab-ocr-v2/');
assert.equal(config.root.replace(/\/$/,''),resolve(here,'ui/frame'));
assert.equal(config.build.outDir.replace(/\/$/,''),resolve(here,'labs/lab-ocr-v2/dist'));
const plugin=config.plugins[0];
const source=readFileSync(resolve(here,'ui/frame/index.html'),'utf8');
const html=plugin.transformIndexHtml.handler(source);
assert(html.includes('OCR2MD lab-ocr-v2</a>'));
assert(!html.includes('OCR2MD lab-frame</a>'));
assert(html.includes('src="./frame.js"'), 'must load Frame itself, no old V2 business entry');
const newFrame=plugin.transform(readFileSync(resolve(here,'ui/frame/frame.js'),'utf8'),resolve(here,'ui/frame/frame.js'));
assert(newFrame.includes("createFrameSettingsIO(localStorage,'lab-ocr-v2-frame'"));
assert(!newFrame.includes("createFrameSettingsIO(localStorage,'lab-frame'"));
assert(newFrame.includes('frameWorkspaceIO.probe(selected)'));
const newRefresh=plugin.transform(readFileSync(resolve(here,'ui/frame/refresh.js'),'utf8'),resolve(here,'ui/frame/refresh.js'));
assert(newRefresh.includes("remote?.name==='lab-ocr-v2'"));
assert(!newRefresh.includes("remote?.name==='lab-frame'"));
assert(readFileSync(resolve(here,'ui/frame/workspace-io.js'),'utf8')
 .includes("'/labs/lab-frame/api/workspace-io/'"),'use existing approved F02 port');
console.log('CLEAN_V2_FRAME_SOURCE_IDENTITY_BUILD_SCOPING_PASS',sha,walk(resolve(frame,'ui/frame')).length);
