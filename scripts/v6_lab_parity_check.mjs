/** Verifies actual Main/Lab bundles from SAME worktree SHA, before promotion. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const id=process.argv[2];
assert(/^[a-z][a-z0-9-]{0,31}$/.test(id||''),'Specify a safe Lab identifier');
const root=process.cwd();
const current=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const main=JSON.parse(readFileSync(resolve('dist/module-graph.json')));
const lab=JSON.parse(readFileSync(resolve(`labs/${id}/dist/module-graph.json`)));
const mainRelease=JSON.parse(readFileSync(resolve('dist/release-version.json')));
const labRelease=JSON.parse(readFileSync(resolve(`labs/${id}/dist/release-version.json`)));
assert.equal(main.schema,1);assert.equal(lab.schema,1);
assert.equal(labRelease.mode,'lab');assert.equal(labRelease.name,id);
assert.equal(labRelease.baseCommit,current,'Lab must be built from checked-out worktree SHA');
assert.equal(mainRelease.mode,undefined,'Main build must not be Lab config');
assert(main.moduleCount>0,'Empty production module graph');
assert.deepEqual(lab.modules,main.modules,'Different dependency modules: Lab cannot be promoted');
assert.equal(lab.moduleGraphSha256,main.moduleGraphSha256);
console.log('LAB_MAIN_MODULE_PARITY_PASS',JSON.stringify({gitSha:current,lab:id,modules:main.moduleCount,
 graph:main.moduleGraphSha256,main:mainRelease.version,labRelease:labRelease.version}));
