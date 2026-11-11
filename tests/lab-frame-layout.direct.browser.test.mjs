/** F01 direct export test; Vite source server required for module import. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
const URL='http://127.0.0.1:5298/labs/lab-frame/';
const proc=spawn('node',['node_modules/vite/bin/vite.js','--config','labs/lab-frame/vite.config.mjs',
  '--host','127.0.0.1','--port','5298','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';proc.stdout.on('data',b=>output+=b);proc.stderr.on('data',b=>output+=b);
try{
  for(let i=0;i<80;i++){
    try{if((await fetch(URL)).ok)break;}catch{}
    if(i===79)throw Error('Vite failed '+output);
    await sleep(150);
  }
  for(const [label,type] of [['Chromium',chromium],['WebKit',webkit]]){
    const browser=await type.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1032,height:642}});
      await page.goto(URL,{waitUntil:'domcontentloaded'});
      await page.locator('#workspace .dv-content-container').first().waitFor();
      const result=await page.evaluate(async()=>{
        const {createFrameWorkspace}=await import('./layout.js');
        const host=document.createElement('div');
        host.style.cssText='position:absolute;left:-1200px;width:700px;height:440px';
        document.body.append(host);
        const events=[];
        const view=createFrameWorkspace(host,{onModuleChange:next=>events.push(next)});
        const count=()=>host.querySelectorAll('.dv-content-container').length;
        const initial=count();
        const nav=host.querySelector('.ocr-source-file-select');
        nav.value='settings';nav.dispatchEvent(new Event('change',{bubbles:true}));
        view.setSplit(false);const three=count();
        view.setSplit(true);const four=count();
        view.dispose();host.remove();
        return {initial,three,four,events};
      });
      assert.deepEqual(result,{initial:4,three:3,four:4,events:['settings']});
      console.log('FRAME_F01_DIRECT_PASS',label);
    }finally{await browser.close();}
  }
}finally{proc.kill('SIGTERM');}
