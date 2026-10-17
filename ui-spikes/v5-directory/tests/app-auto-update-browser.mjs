/** V5 composition invariant: WCP is the sole owner of live update logic.
 * WCP independent browser tests cover reload and safe-edit transitions.
 */
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const read=path=>readFileSync(path,'utf8');
const app=read('app.js');
assert(app.includes('frame.watchBuild('));
assert(app.includes('createWcpAppFrame('));
assert(!app.includes('components/app-frame/'));
assert(!app.includes('startLiveBuildWatcher'));
assert(!existsSync('assets/app-live-update.js'),'duplicate V5 business watcher forbidden');
const manifest=JSON.parse(read('../../../web-component-platform/published/components/v1/manifest.json'));
const current=manifest.releases.find(x=>x.version===manifest.stable);
assert.equal(manifest.stable,'0.1.11');
for(const name of ['app-frame.js','app-frame.css']){
 const source=readFileSync(resolve('../../../web-component-platform/published/components/v1/releases/0.1.11',name));
 const appAsset=readFileSync(resolve('vendor/wcp/components/v1/releases/0.1.11',name));
 assert(source.equals(appAsset));
 assert.equal(createHash('sha256').update(appAsset).digest('hex'),current.frame[name==='app-frame.js'?'sha256':'styleSha256']);
}
assert(read('vendor/wcp/components/v1/releases/0.1.11/app-frame.js').includes('watchBuild('));
console.log('V5_WCP_ONLY_AUTO_UPDATE_OWNER_PASS',{wcpVersion:manifest.stable,noBusinessWatcher:true});
