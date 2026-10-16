/** Check historical V4 source and two deployment slots have not been mutated
 * during WP0. Not a V5 runtime dependency and not a continuous sync.
 */
import {readFile,stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,dirname,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
const here=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const repo=resolve(here,'../..');
const base=JSON.parse(await readFile(join(here,'baseline/v4-freeze.json'),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
let files=0;
for(const [name,record] of Object.entries(base.sourceFiles)){
 const file=resolve(repo,base.sourcePath,name);
 assert.equal(sha(await readFile(file)),record.sha256,'V4 source changed during WP0: '+name);
 files++;
}
for(const [slot,record] of Object.entries(base.releaseSlots)){
 const f=resolve(repo,'ui-spikes/v2',slot,'build-info.json');
 assert.equal(sha(await readFile(f)),record.buildInfoSha256,'V4 release slot changed: '+slot);
}
console.log('V5_WP0_V4_UNTOUCHED_PASS',JSON.stringify({sourceShaChecks:files,
  publishedSlots:Object.fromEntries(Object.entries(base.releaseSlots).map(([name,slot])=>[name,slot.buildId]))}));
