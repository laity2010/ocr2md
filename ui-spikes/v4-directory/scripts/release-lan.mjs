/** Retired legacy entry: LAN is now just a route to the single canonical V4
 * release. Do not copy files to a second static deployment. Keep this script
 * as a read-only compatibility check so old automation fails closed if drift
 * ever reappears. */
import {spawnSync} from 'node:child_process';
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--check'))throw Error('LAN_DEPLOYMENT_RETIRED');
const out=spawnSync(process.execPath,['ui-spikes/v4-directory/scripts/link-lan-origin.mjs','--check'],
 {stdio:'inherit',timeout:80000});
if(out.status!==0)throw Error('LAN_CANONICAL_ROUTE_AUDIT_FAILED');
console.log('OCR2MD_LAN_RELEASE_RETIRED_ONE_SOURCE_OF_TRUTH');
