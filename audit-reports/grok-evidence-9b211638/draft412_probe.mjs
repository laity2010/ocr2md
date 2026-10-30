// Grok independent probe: after 412 the unsaved CM6 draft must remain, disk must not be overwritten.
import {chromium,webkit} from 'playwright';
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
const [T,PORT]=[process.argv[2],Number(process.argv[3])];
const DOC=`${T}/.v6/workspace/buffetts-alpha.minerujson.md`;
const sha=b=>createHash('sha256').update(b).digest('hex');
const results=[];
for(const [name,type] of [['Chromium',chromium],['WebKit',webkit]]){
  writeFileSync(DOC,readFileSync(`${T}/packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md`));
  const srv=spawn('python3',[`${T}/scripts/v6_serve.py`],{cwd:T,env:{...process.env,V6_PORT:String(PORT),V6_STATIC_ROOT:`${T}/dist`},stdio:'ignore'});
  const O=`http://127.0.0.1:${PORT}`;
  for(let i=0;i<50;i++){try{await fetch(O+'/healthz');break}catch{await new Promise(r=>setTimeout(r,200))}}
  const key=readFileSync(`${T}/.v6/private/editor-token`,'utf8').trim();
  const browser=await type.launch();
  try{
    const ctx=await browser.newContext();
    await ctx.addCookies([{name:'v6edit',value:key,domain:'127.0.0.1',path:'/',httpOnly:true,secure:false,sameSite:'Lax'}]);
    const page=await ctx.newPage();
    await page.goto(O+'/',{waitUntil:'load'});
    await page.waitForSelector('.cm-content',{timeout:30000});
    await page.waitForFunction(()=>!/正在加载/.test(document.getElementById('status').textContent),null,{timeout:30000});
    const marker=`GROK_DRAFT_${name}_${Date.now()}`;
    await page.click('.cm-content'); await page.keyboard.press(process.platform==='darwin'?'Meta+Home':'Control+Home');
    await page.keyboard.type(marker);
    // Out-of-band editor saves first.
    const g=await fetch(O+'/api/document'); const body=await g.text(); const et=g.headers.get('ETag');
    const other=body+'\nOTHER_EDITOR\n';
    const p=await fetch(O+'/api/document',{method:'PUT',headers:{Cookie:'v6edit='+key,Origin:O,'If-Match':et},body:other});
    if(p.status!==200)throw Error('setup PUT '+p.status);
    await page.click('#save');
    await page.waitForFunction(()=>/保存冲突/.test(document.getElementById('status').textContent),null,{timeout:15000});
    const statusText=await page.textContent('#status');
    const editorHas=await page.evaluate(m=>document.querySelector('.cm-content').textContent.includes(m),marker);
    const disk=readFileSync(DOC,'utf8');
    const ok=editorHas && disk===other && !disk.includes(marker);
    await page.screenshot({path:`/workspace/grok-evidence-06bf498/draft412-${name}.png`});
    results.push({browser:name,version:browser.version(),result:ok?'PASS':'FAIL',statusText,draftKeptInEditor:editorHas,diskEqualsOtherEditor:disk===other,diskSha:sha(disk).slice(0,12)});
  }catch(e){results.push({browser:name,result:'FAIL',error:String(e)})}
  finally{await browser.close();srv.kill();await new Promise(r=>setTimeout(r,500));}
}
console.log(JSON.stringify(results,null,1));
writeFileSync('/workspace/grok-evidence-06bf498/draft412_results.json',JSON.stringify(results,null,1));
process.exit(results.every(r=>r.result==='PASS')?0:1);
