/** F01 direct export test; Vite source server required for module import. */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {setTimeout as sleep} from 'node:timers/promises';
import {chromium,webkit} from 'playwright';
import {fileURLToPath} from 'node:url';
const URL='http://127.0.0.1:5298/labs/lab-frame/';
const NAV_MODULE_URL=URL+'@fs'+fileURLToPath(new globalThis.URL('../ui/wcp-navigation-select.js',import.meta.url));
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
      const directNavigation=await page.evaluate(async url=>{
        const {enhanceNavigationSelect}=await import(url);
        const select=document.createElement('select');
        const placeholder=new Option('选择文件…','');placeholder.disabled=true;select.add(placeholder);
        const group=document.createElement('optgroup');group.label='全局设置';
        group.append(new Option('settings.json','settings'));select.append(group);
        select.value='';document.body.append(select);
        const fired=[];select.addEventListener('change',()=>fired.push(select.value));
        const adapter=enhanceNavigationSelect(select,{search:true,kind:'files'});
        const headers=Object.values(adapter.tom.optgroups).map(group=>group.label);
        const options=Object.values(adapter.tom.options).filter(item=>item.value==='settings').map(item=>item.text);
        adapter.tom.setValue('settings');
        const native=select.value;
        adapter.dispose();select.remove();
        return {headers,options,native,fired};
      },NAV_MODULE_URL);
      assert.deepEqual(directNavigation,{headers:['全局设置'],options:['settings.json'],
        native:'settings',fired:['settings']});
      console.log('FRAME_F01_NAV_DIRECT_PASS',label);
    }finally{await browser.close();}
  }
}finally{proc.kill('SIGTERM');}
