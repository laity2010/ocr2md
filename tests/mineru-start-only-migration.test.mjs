import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,readdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {toMarkdown,toMineruJSON} from '../packages/minerujson-md/dist/index.js';
import {buildOutline} from '../ui/outline-index.js';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const script=resolve('scripts/v6_remove_end_markers.mjs');
const root=mkdtempSync(join(tmpdir(),'v6-start-only-'));
const raw=JSON.stringify({pdf_info:[
 {para_blocks:[{type:'title',level:2,lines:[{spans:[{content:'Alpha'}]}]},
  {type:'text',lines:[{spans:[{content:'Body'}]}]}],discarded_blocks:[]},
 {para_blocks:[],discarded_blocks:[]},
 {para_blocks:[{type:'title',level:2,lines:[{spans:[{content:'Gamma'}]}]}],discarded_blocks:[]},
]});
const modern=toMarkdown(raw);
const ids=[['0:0','## Alpha'],['0:1','Body'],['2:0','## Gamma']];
let legacy=modern;
for(const [id,body] of ids){
 const [page,block]=id.split(':');
 legacy=legacy.replace(`${body}\n\n`,`${body}\n\n<!-- minerujson:end:v1:${page}:${block} -->\n\n`);
}
assert.equal((legacy.match(/minerujson:end:/g)||[]).length,3);
function run(args){return execFileSync(process.execPath,[script,...args],{encoding:'utf8'});}
function file(name,content){const dest=join(root,name);writeFileSync(dest,content);return dest;}
test('single-start migration removes only matched end markers across empty pages',()=>{
 const original=file('legacy.md',legacy),output=join(root,'new.md');
 assert.match(run(['--document',original]),/"blocks":3/);
 assert.match(run(['--document',original,'--output',output]),/V6_START_ONLY_STAGED/);
 const migrated=readFileSync(output,'utf8');
 assert.equal(migrated,modern);
 assert.equal(toMineruJSON(migrated),raw);
 assert.deepEqual(buildOutline(migrated).map(x=>x.id),buildOutline(legacy).map(x=>x.id));
 assert.equal(readFileSync(original,'utf8'),legacy);
});
test('atomically backed up, optimistic SHA guard and second migration refusal',()=>{
 const path=file('working.md',legacy),observed=hash(legacy);
 assert.throws(()=>run(['--document',path,'--apply','--expected-sha','0'.repeat(64)]),/V6_START_ONLY_REFUSED/);
 assert.equal(readFileSync(path,'utf8'),legacy);
 const result=run(['--document',path,'--apply','--expected-sha',observed]);
 assert.match(result,/V6_START_ONLY_APPLIED/);
 assert.equal(readFileSync(path,'utf8'),modern);
 const backups=readdirSync(join(root,'.block-start-backups'));
 assert.equal(backups.length,1);
 assert.equal(readFileSync(join(root,'.block-start-backups',backups[0]),'utf8'),legacy);
 assert.throws(()=>run(['--document',path]),/V6_START_ONLY_REFUSED/);
});
test('corrupt start/end, extra end, or wrong end order refuse migration',()=>{
 for(const [name,value] of [
  ['missing',legacy.replace('<!-- minerujson:end:v1:0:1 -->\n\n','')],
  ['wrong',legacy.replace('<!-- minerujson:end:v1:0:1 -->','<!-- minerujson:end:v1:1:9 -->')],
  ['extra',legacy.replace('## Alpha','<!-- minerujson:end:v1:0:0 -->\n\n## Alpha')],
 ]){
  const path=file(name+'.md',value);
  assert.throws(()=>run(['--document',path]),/V6_START_ONLY_REFUSED/,name);
  assert.equal(readFileSync(path,'utf8'),value);
 }
});
