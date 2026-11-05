import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readCMDBlockChains,planCMDReparentPBS} from '../ui/cmd-block-chains.js';
import {sourceBlockScopes} from '../ui/cmd-block-labels.js';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const originalJSON=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json');
const legacy=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
// Audited native MinerU converted output, not the legacy Markdown fixture.
// Fixed digest protects image native s0, split table and original page data.
const canonicalSHA='c79c1004f346c194de22910108401a58265bfe5924c9553feea75c0e08863357';
const shasum=data=>createHash('sha256').update(data).digest('hex');
const ready=toMarkdown(originalJSON.toString('utf8'));
assert.equal(shasum(ready),canonicalSHA,'native CMD baseline drift');
const next=readCMDBlockChains(ready);
assert.equal(next.invalid.length,0);
assert.equal(next.atoms.length,267);
assert.equal(next.atoms.filter(x=>x.kind==='child').length,43);
assert.equal(next.atoms.filter(x=>x.format!=='cmd-v1').length,0);
assert.equal(toMineruJSON(ready),originalJSON.toString('utf8'),
  'native converter must restore original JSON byte-exact');
const spans=sourceBlockScopes(ready);
const label=id=>spans.find(x=>`p${x.pageIndex}b${x.blockIndex}${x.path?`s${x.path.join('.')}`:''}`===id);
assert(!label('p0b5')?.contentLine&&label('p0b5s0')?.contentLine,
  'PDF image child must have actual source scope');
assert(ready.includes('<!-- cmd:block:v1 id="p3b1s0" -->')&&
  ready.includes('<!-- cmd:block:v1 id="p4b0s1" -->'),
  'split HTML table sides must each have source anchor');
assert.equal((ready.match(/<table>/g)||[]).length,9,'split table part missing');
assert(planCMDReparentPBS(ready,'p1b3','p1b4').changed>0);
const tail=x=>x.slice(x.indexOf('<!-- minerujson:source:v1:'));
assert.equal(tail(ready),tail(legacy.toString('utf8')),
  'sealed OCR evidence must stay identical even though legacy body is incomplete');
const dir=mkdtempSync(join(tmpdir(),'v6-native-cmd-initializer-'));
try{
  const doc=join(dir,'mother.md');writeFileSync(doc,legacy);
  const code=String.raw`
from pathlib import Path
import hashlib, sys
sys.path.insert(0,str(Path.cwd()/'scripts'))
from v6_initialize import initialize_document
from v6_workspace_roots import convert_mineru_json
original=Path('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json')
doc=Path(sys.argv[1])
convert=lambda data:convert_mineru_json(data,Path.cwd())
checksum=hashlib.sha256(doc.read_bytes()).hexdigest()
first=initialize_document(doc,original,checksum,convert=convert)
assert first['initialized'] and not first['unchanged'] and first['backup']
assert (doc.parent/'.initialize-backups'/first['backup']).read_bytes()==Path('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md').read_bytes()
second=initialize_document(doc,original,first['sourceSha256'],convert=convert)
assert second['initialized'] and second['unchanged'] and second['backup'] is None
assert len(list((doc.parent/'.initialize-backups').iterdir()))==1
print(first['sourceSha256'])
`;
  const run=spawnSync('python3',['-c',code,doc],{maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr?.toString());
  assert.equal(run.stdout.toString('utf8').trim(),canonicalSHA);
  assert.equal(shasum(readFileSync(doc)),canonicalSHA);
  assert.deepEqual(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json'),originalJSON,
    'original JSON must remain byte-identical');
}finally{rmSync(dir,{recursive:true,force:true});}
console.log('INITIALIZE_NATIVE_CMD_PASS 224 parents, 43 children, 9 HTML tables, image s0 scopes, native 267 anchors, reversible original JSON, backed-up optimistic reset');
