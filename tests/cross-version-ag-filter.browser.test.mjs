/** Release preflight entrypoint: use the REAL V2 AG Grid/browser fixture. */
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const fixture=fileURLToPath(new URL('./v2-mineru-base.browser.test.mjs',import.meta.url));
const result=spawnSync(process.execPath,[fixture],{
  env:{...process.env,V2_TEST_CROSS_FILTER:'1'},
  cwd:process.cwd(),stdio:'inherit',timeout:170000,
});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status||1);
