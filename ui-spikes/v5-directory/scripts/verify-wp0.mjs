/** WP0: immutable V4 provenance + WCP release checks + explicit no-business-migration.
 * This test reads V4 only when requested; core V5 is independently runnable.
 */
import {readFile,readdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const json=async rel=>JSON.parse(await readFile(join(root,rel),'utf8'));
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const freeze=await json('baseline/v4-freeze.json');
assert.equal(freeze.kind,'ocr2md/v5-wp0-v4-inheritance-freeze');
assert.equal(Object.keys(freeze.pluginDescriptors).length,6);
assert.ok(Object.keys(freeze.sourceFiles).length>=200);
for(const id of ['v4-directory','v4-wp3-candidate']){
 assert.match(freeze.releaseSlots[id].buildId,/^v4-\d{6}-\d{4}$/);
 assert.deepEqual(freeze.releaseSlots[id].manifestMismatch,[]);
 assert.ok(freeze.releaseSlots[id].manifestAssetsChecked>0);
}
const pinned=await json('baseline/wcp-pinned.json');
const manifest=await json('vendor/wcp/components/v1/manifest.json');
assert.equal(manifest.stable,pinned.stable);
assert.equal(manifest.previous,pinned.previous);
assert.equal(manifest.releases.length,2);
for(const [path,expected] of Object.entries(pinned.files)){
 const bytes=await readFile(join(root,path));
 assert.equal(sha(bytes),expected,'WCP published asset hash '+path);
}
for(const item of manifest.releases){
 assert.equal(sha(await readFile(join(root,'vendor/wcp/components/v1',item.entry))),item.sha256);
}
const uiPinned=await json('baseline/wcp-ui-pinned.json');
for(const [name,hash] of Object.entries(uiPinned.files)){
 assert.equal(sha(await readFile(join(root,'components',name))),hash,'published UI asset '+name);
}
assert.equal(uiPinned.triPaneVersion,'0.2.1');
assert.equal(uiPinned.residentVersion,'1.0.0');
const registry=await readFile(join(root,'plugins/registry.generated.js'),'utf8');
const dirs=(await readdir(join(root,'plugins'),{withFileTypes:true})).filter(d=>d.isDirectory()).map(d=>d.name);
assert.deepEqual(dirs,['bootstrap'],'WP0 must not silently claim Settings migrated');
assert.ok(registry.includes('ocr2md:bootstrap'));
assert.ok(!registry.includes('ocr2md:settings'));
const app=await readFile(join(root,'app.js'),'utf8');
assert.ok(!/from\s*['"][^'"]*(?:v4-directory|v3-directory|v2\/)/.test(app));
assert.ok(app.includes('mountWcp(')&&app.includes('registry.generated.js'));
assert.ok(!/fetch\(.*__v3|\/__v3\/chapters\/commit/.test(app));
const expected=await json('baseline/ael-reference.json');
assert.equal(expected.sourceModule,'@ocr2md/mopjo');
assert.equal(expected.referenceTests,369);
assert.equal(expected.referenceBoundaryViolations,0);
console.log('V5_WP0_INHERITANCE_PASS',JSON.stringify({
  v4SourceFiles:Object.keys(freeze.sourceFiles).length,
  declaredV4Plugins:Object.keys(freeze.pluginDescriptors).length,
  frozenReleaseSlots:Object.fromEntries(Object.entries(freeze.releaseSlots).map(([k,v])=>[k,v.buildId])),
  pinnedWcpVersion:pinned.stable,pinnedFallback:pinned.previous,
  migratedV4BusinessPlugins:0,boundaryViolations:0
}));

