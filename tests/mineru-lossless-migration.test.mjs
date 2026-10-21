import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,existsSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
const hash=x=>createHash('sha256').update(x).digest('hex');
const root=mkdtempSync(join(tmpdir(),'ocr2md-lossless-'));
const fixture=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const raw=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.mineru.json','utf8');
const current=readFileSync('.v6/workspace/buffetts-alpha.minerujson.md','utf8');
const cli=resolve('scripts/v6_annotate_document.mjs');
function run(args){return execFileSync(process.execPath,[cli,...args],{encoding:'utf8'});}
function make(name,content){const path=join(root,name);writeFileSync(path,content);return path;}
test('legacy fixture gets only inserted complete audit comments, without touching original data',()=>{
  const file=make('fixture.md',fixture),out=join(root,'fixture-new.md');
  const printed=run(['--document',file,'--output',out]);
  assert.match(printed,/"discarded":91/);
  assert.match(printed,/"preprocDifferences":18/);
  const migrated=readFileSync(out,'utf8');
  assert(migrated.includes('<!-- minerujson:discarded:v1:0:0'));
  assert(migrated.includes('[MinerU table: source metadata only]'),'existing placeholder is not silently rewritten');
  assert.equal(toMineruJSON(migrated),raw);
  assert.equal(readFileSync(file,'utf8'),fixture,'input untouched');
  assert.throws(()=>run(['--document',out]),/V6_ANNOTATE_REFUSED/);
});
test('existing manually edited/annotated V6 work document migrates additively and idempotently',()=>{
  const file=make('current.md',current),out=join(root,'current-audit.md');
  assert(current.includes('<!-- ocr2md:chapter:v1'),'test needs previously saved user chapter annotations');
  const printed=run(['--document',file,'--output',out]);
  assert.match(printed,/"pages":22/);
  const next=readFileSync(out,'utf8');
  assert.equal(next.match(/<!-- minerujson:block:v1:/g)?.length,224);
  assert.equal(next.match(/<!-- ocr2md:chapter:v1/g)?.length,
    current.match(/<!-- ocr2md:chapter:v1/g)?.length,'manual chapter overrides preserved');
  assert(next.includes('minerujson:discarded:v1:1:0'));
  assert(next.includes('page_footnote'));
  assert(next.includes('minerujson:preproc-diff:v1:2:7'));
  const parts=[];
  for(let i=0;i<22;i++){
    const anchor=`<!-- minerujson:block:v1:${i}:0 -->`;
    const boundary=i===0 ? 0 : next.indexOf(`<!-- minerujson:page:v1:${i}\n`);
    const end=next.indexOf(anchor,boundary);
    parts.push({anchor,insert:next.slice(boundary,end)});
  }
  let without=next;
  for(const {anchor,insert} of parts){
    assert(without.includes(insert+anchor));
    without=without.replace(insert+anchor,anchor);
  }
  assert.equal(without,current,'removing only generated audit comments gives original bytes');
  assert.equal(readFileSync(file,'utf8'),current);
});
test('in-place upgrade requires expected SHA and stores a durable backup',()=>{
  const file=make('write-test.md',fixture),sha=hash(fixture);
  assert.throws(()=>run(['--document',file,'--apply','--expected-sha','0'.repeat(64)]),/V6_ANNOTATE_REFUSED/);
  assert.equal(readFileSync(file,'utf8'),fixture);
  const printed=run(['--document',file,'--apply','--expected-sha',sha]);
  assert.match(printed,/V6_ANNOTATION_APPLIED/);
  assert.equal(toMineruJSON(readFileSync(file,'utf8')),raw);
  const dir=join(root,'.lossless-audit-backups');
  const files=readdirSync(dir);assert.equal(files.length,1);
  assert.equal(readFileSync(join(dir,files[0]),'utf8'),fixture);
  assert.throws(()=>run(['--document',file]),/V6_ANNOTATE_REFUSED/);
  assert(existsSync(join(dir,files[0])));
});
