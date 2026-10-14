/** Legacy name retained for discoverability. Now builds and tests ONLY.
 * Absolutely NO LAN static copy: live LAN routes resolve to the same physical
 * release directories as localhost 4176 and Cloudflare. Promote the tested
 * candidate explicitly with release-wp3-candidate.mjs; do not ship WIP. */
import {spawnSync} from 'node:child_process';
import {cp,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
function run(script,env={}){
 console.log('OCR2MD_UNIFIED_PREFLIGHT_STEP',script);
 const job=spawnSync(process.execPath,[script],{stdio:'inherit',env:{...process.env,...env},timeout:270000});
 if(job.status!==0)throw Error('OCR2MD_UNIFIED_PREFLIGHT_FAILED '+script+' '+job.status);
}
run('ui-spikes/v4-directory/scripts/build-modules.mjs');
const stage=await mkdtemp(join(tmpdir(),'ocr2md-v4-unified-preflight-'));
try{
 await cp(resolve('ui-spikes/v4-directory'),join(stage,'v4-directory'),{recursive:true});
 run('ui-spikes/v4-directory/tests/buildVersionBrowser.mjs',{V4_TEST_STATIC_ROOT:stage});
 run('ui-spikes/v4-directory/tests/wp2UpgradeGate.mjs');
}finally{await rm(stage,{recursive:true,force:true})}
run('ui-spikes/v4-directory/scripts/link-lan-origin.mjs');
console.log('OCR2MD_UNIFIED_PREFLIGHT_PASS: source built and tested; public/stable/ LAN release slots UNCHANGED. Promote a candidate explicitly.');
