/** One-time audited migration of existing LaTeX sidecar choices through CM6.
 * Default dry-run. --apply requires live V6 + editor authorization.
 * Never writes the user's MD directly from Node. The old sidecar stays intact.
 */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {findLatex} from '../ui/latex-scan.js';
import {findReviewMarkers,planReviewEdit} from '../ui/latex-review-markers.js';
const file=resolve(process.env.V6_MIGRATION_DOC||'.v6/workspace/buffetts-alpha.minerujson.md');
const sidecar=JSON.parse(readFileSync(file+'.latex-review.json','utf8'));
const original=readFileSync(file,'utf8');
const sha=t=>createHash('sha256').update(t).digest('hex');
const fp=t=>{let h=0xcbf29ce484222325n;for(const c of t){h^=BigInt(c.codePointAt(0));h=(h*0x100000001b3n)&0xffffffffffffffffn;}return h.toString(16).padStart(16,'0');};
const seen=new Map(),candidates=findLatex(original);
const plan=[];
for(const [i,row] of candidates.entries()){
  const h=fp(`${row.kind}\n${row.content}`),occ=(seen.get(h)||0)+1;
  seen.set(h,occ);
  const key=h+':'+occ,value=sidecar.reviews[key];
  if(value){assert(['latex','忽略'].includes(value));plan.push({index:i,key,value,kind:row.kind,line:row.line});}
}
assert.equal(plan.length,Object.keys(sidecar.reviews).length,'Unmatched old human review entries');
assert(plan.length>0,'No legacy annotations to migrate');
// Simulate EXACTLY the same comment plans without touching any actual file.
let simulated=original;
for(const [counter,target] of [...plan].reverse().entries()){
  const row=findLatex(simulated)[target.index];
  const changes=planReviewEdit(simulated,{...row,raw:simulated.slice(row.from,row.to)},target.value,
    (counter+1).toString(16).padStart(16,'0'));
  for(const edit of [...changes].reverse()){
    assert.equal(simulated.slice(edit.from,edit.to),edit.expected);
    simulated=simulated.slice(0,edit.from)+edit.insert+simulated.slice(edit.to);
  }
}
const check=()=>{
  const rows=findLatex(simulated).map(row=>({...row,raw:simulated.slice(row.from,row.to)}));
  findReviewMarkers(simulated,rows);
  assert.equal(rows.length,candidates.length,'Formula inventory changed during annotation simulation');
  for(const target of plan){
    assert.equal(rows[target.index].content,candidates[target.index].content,'TeX payload changed');
    assert.equal(rows[target.index].status,target.value,'Review value changed');
  }
};check();
console.log('LATEX_MIGRATION_DRY_RUN_PASS',JSON.stringify({matched:plan.length,display:plan.filter(x=>x.kind==='独立').length,
  inline:plan.filter(x=>x.kind==='行内').length,originalSha256:sha(original),targets:plan.map(x=>x.index)}));
if(!process.argv.includes('--apply'))process.exit(0);
const base=process.env.V6_MIGRATION_URL||'http://127.0.0.1:4396';
const token=readFileSync(resolve(process.env.V6_MIGRATION_TOKEN||'.v6/private/editor-token'),'utf8').trim();
const previous=await fetch(base+'/api/document').then(res=>{assert(res.ok);return res.text();});
assert.equal(previous,original,'Server document differs from verified pre-migration source; abort');
mkdirSync('.v6/tests',{recursive:true});
const backup=resolve(`.v6/tests/pre-latex-migration-${Date.now()}.md`);
writeFileSync(backup,original,{flag:'wx'});
console.log('LATEX_MIGRATION_BACKUP',backup);
const browser=await chromium.launch({headless:true,
  executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
try{
 const page=await browser.newPage();
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.context().addCookies([{name:'v6edit',value:token,domain:'127.0.0.1',path:'/'}]);
 await page.goto(base,{waitUntil:'domcontentloaded',timeout:45000});
 await page.locator('#module-select').selectOption('latex');
 await page.waitForFunction(()=>document.querySelectorAll('.ocr-latex-review-select').length>=2,
  null,{timeout:32000});
 let count=0;
 for(const target of plan){
  const locator=page.locator(`.ocr-latex-grid .ag-row[row-index="${target.index}"] .ocr-latex-review-select`).first();
  if(!(await locator.count())){
   await page.locator('.ocr-latex-grid .ag-body-viewport')
    .evaluate((el,idx)=>{el.scrollTop=idx*103;},target.index);
  }
  await locator.waitFor({state:'visible',timeout:15000});
  assert.equal(await locator.inputValue(),'待复核',`Target row ${target.index} already annotated`);
  await locator.selectOption(target.value);
  count++;
  await page.waitForFunction(n=>document.querySelector('#status')?.textContent.includes(`latex ${n}`),
   count,{timeout:15000});
  console.log('MIGRATED_IN_CM6',JSON.stringify(target));
 }
 // No unseen server edits should be overwritten. Single-document server has
 // no version tokens yet; inspect the actual GET immediately before Save.
 const latest=await fetch(base+'/api/document').then(res=>res.text());
 assert.equal(latest,original,'Document changed on server mid-migration; abort Save');
 await page.locator('#save').click();
 await page.waitForFunction(()=>document.querySelector('#status')?.textContent.includes('已保存'),null,{timeout:25000});
 const persisted=readFileSync(file,'utf8');
 const rows=findLatex(persisted).map(row=>({...row,raw:persisted.slice(row.from,row.to)}));
 findReviewMarkers(persisted,rows);
 assert.equal(rows.length,candidates.length);
 for(const target of plan){
  assert.equal(rows[target.index].status,target.value,'Missing persisted review');
  assert.equal(rows[target.index].content,candidates[target.index].content,'TeX altered by migration');
 }
 assert.deepEqual(errors,[]);
 console.log('LATEX_MIGRATION_CM6_SAVE_PASS',JSON.stringify({count,oldSidecarRetained:true,docSha256:sha(persisted)}));
}finally{await browser.close()}
