/** Run on macOS/Linux with identical data; no reliance on /opt/homebrew.
 * The inner Python process has an empty PATH, so only V6_NODE_BIN can find
 * the converter. Never reads/writes .v6 or a real user workspace.
 */
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
const python=spawnSync('python3',['-c','import sys;print(sys.executable)'],{encoding:'utf8'});
assert.equal(python.status,0,'Python 3 runtime required');
const executable=python.stdout.trim(),root=resolve('.');
const code=`import sys,os\nsys.path.insert(0,${JSON.stringify(resolve('scripts'))})\nfrom v6_workspace_roots import resolve_node_binary,convert_mineru_json\nfrom pathlib import Path\nassert resolve_node_binary()==${JSON.stringify(process.execPath)}\nraw=Path(${JSON.stringify(resolve('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'))}).read_bytes()\nmd=convert_mineru_json(raw,Path(${JSON.stringify(root)}),timeout=45)\nassert b'minerujson:block:v1:' in md and b'minerujson:source:v1' in md\nprint('WORKSPACE_NODE_PORTABLE_PASS',os.name,len(md))`;
const env={...process.env,PATH:'',V6_NODE_BIN:process.execPath};
const result=spawnSync(executable,['-c',code],{env,encoding:'utf8',timeout:60000});
assert.equal(result.status,0,result.stderr||result.stdout);
assert.match(result.stdout,/WORKSPACE_NODE_PORTABLE_PASS/);
const fail=spawnSync(executable,['-c',`import sys;sys.path.insert(0,${JSON.stringify(resolve('scripts'))});from v6_workspace_roots import resolve_node_binary\ntry:resolve_node_binary()\nexcept ValueError:print('MISSING_NODE_REJECTED')\nelse:raise AssertionError('missing node accepted')`],{env:{...env,V6_NODE_BIN:'/nonexistent/node'},encoding:'utf8',timeout:10000});
assert.equal(fail.status,0,fail.stderr||fail.stdout);
assert.match(fail.stdout,/MISSING_NODE_REJECTED/);
console.log('WORKSPACE_PORTABILITY_TEST_PASS',JSON.stringify({isolatedNode:true,
  missingRuntimeRejected:true,noHomebrewDependency:true}));
