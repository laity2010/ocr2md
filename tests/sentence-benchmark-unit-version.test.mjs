import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {versionSentenceUnits} from '../ui/sentence-benchmark-unit-version.js';
const sha='a'.repeat(64),doc='b'.repeat(64),review='c'.repeat(64);
const row={id:'p1b0-s001',blockId:'p1b0',type:'sentence',elementType:'paragraph',
 decision:'auto',from:0,to:6,sourceRanges:[{from:0,to:6}],
 original:'Hello.',corrected:null,translation:null};
const base={schema:'ocr2md-translation-units/v1',sourceSha256:sha,
 coordinate:'UTF-16 source offsets in unchanged CMD',rows:[row]};
test('unit hash is independent of source SHA, sensitive to source content/boundaries and interoperable with Python',async()=>{
 const table=await versionSentenceUnits(base,doc,review);
 assert.equal(table.unitVersion.length,64);
 const py=spawnSync('python3',['-c',
  'import sys,json;sys.path.insert(0,"scripts");from v6_sentence_units import unit_version,validate;d=json.load(sys.stdin);print(unit_version(d));validate(d,d["sourceSha256"],d["documentVersion"],d["reviewRevision"])'],
  {input:JSON.stringify(table),encoding:'utf8'});
 assert.equal(py.status,0,py.stderr);
 assert.equal(py.stdout.trim(),table.unitVersion);
 assert.notEqual((await versionSentenceUnits({...base,rows:[{...row,original:'Hello!'}]},doc,review)).unitVersion,table.unitVersion);
 assert.notEqual((await versionSentenceUnits(base,doc,'d'.repeat(64))).unitVersion,table.unitVersion);
 assert.notEqual((await versionSentenceUnits(base,'e'.repeat(64),review)).unitVersion,table.unitVersion);
 const shifted=await versionSentenceUnits({...base,rows:[{...row,from:5,to:11,sourceRanges:[{from:5,to:11}]}]},doc,review);
 assert.notEqual(shifted.unitVersion,table.unitVersion);
});
