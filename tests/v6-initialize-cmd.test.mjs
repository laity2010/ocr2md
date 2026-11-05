import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,writeFileSync,readdirSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readCMDBlockChains,planCMDReparentPBS} from '../ui/cmd-block-chains.js';
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md');
const frozen='a0d93c2030c3a32f2287b4222c3940bb0ac84c61ff1b380cedaa37a9452da016';
const shasum=data=>createHash('sha256').update(data).digest('hex');
const converter=spawnSync('node',['scripts/v6_initialize_cmd.mjs',
  'packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md'],
  {maxBuffer:12*1024*1024});
assert.equal(converter.status,0,converter.stderr?.toString());
assert.equal(shasum(converter.stdout),frozen,'frozen baseline checksum drift');
const upgraded=converter.stdout.toString('utf8');
const next=readCMDBlockChains(upgraded);
assert.equal(next.invalid.length,0);
assert.equal(next.atoms.length,224);
assert.equal(next.atoms.filter(a=>a.format==='legacy').length,0);
assert.equal(next.atoms.filter(a=>a.format==='cmd-v1').length,224);
const after=planCMDReparentPBS(upgraded,'p1b3','p1b4');
assert(after.changed>0,'initialized CMD must allow actual PDF parent absorption');
const tail=x=>x.slice(x.indexOf('<!-- minerujson:source:v1:'));
assert.equal(tail(upgraded),tail(fixture.toString('utf8')));

// The Python-backed reset is optimistic, atomic and backed up even when the
// current file is an identical OLD legacy baseline (user's reported case).
const temp=mkdtempSync(join(tmpdir(),'v6-cmd-initializer-'));
try{
  const doc=join(temp,'mother.md');writeFileSync(doc,fixture);
  const statement=String.raw`
from pathlib import Path
import hashlib, sys
sys.path.insert(0,str(Path.cwd()/'scripts'))
from v6_initialize import initialize_document
original=Path('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md')
doc=Path(sys.argv[1])
checksum=hashlib.sha256(doc.read_bytes()).hexdigest()
first=initialize_document(doc,original,checksum)
assert first['initialized'] and not first['unchanged'] and first['backup']
assert (doc.parent/'.initialize-backups'/first['backup']).read_bytes()==original.read_bytes()
second=initialize_document(doc,original,first['sourceSha256'])
assert second['initialized'] and second['unchanged'] and second['backup'] is None
assert len(list((doc.parent/'.initialize-backups').iterdir()))==1
print(first['sourceSha256'])
`;
  const run=spawnSync('python3',['-c',statement,doc],{maxBuffer:1024*1024});
  assert.equal(run.status,0,run.stderr?.toString());
  assert.equal(run.stdout.toString('utf8').trim(),frozen);
  assert.equal(shasum(readFileSync(doc)),frozen);
  assert.equal(readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md').compare(fixture),0,
    'immutable original fixture must never be overwritten');
}finally{rmSync(temp,{recursive:true,force:true});}
console.log('INITIALIZE_CMD_READY_PASS 224 CMD PBS nodes, 0 legacy/invalid, p1b3 reparent, sealed OCR, backed-up CAS, idempotent');
