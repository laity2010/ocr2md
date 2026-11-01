/** Real PDF.js selection -> original text layer -> live CM6 caret insertion.
 * Isolated source and server: test NEVER edits the user's mother document.
 */
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,rmSync,readFileSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {chromium,webkit} from 'playwright';
const source=readFileSync('packages/minerujson-md/fixtures/buffetts-alpha.minerujson.md','utf8');
const temp=mkdtempSync(join(tmpdir(),'ocr2md-pdf-replace-'));
const doc=join(temp,'document.md');writeFileSync(doc,source);
const port=5967,url=`http://127.0.0.1:${port}/`;
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1',
  '--port',String(port),'--strictPort'],{cwd:process.cwd(),stdio:'ignore',
  env:{...process.env,V6_DOCUMENT_PATH:doc,V6_SETTINGS_PATH:join(temp,'settings.json')}});
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
try{
  let ready=false;
  for(let i=0;i<210;i++){
    try{if((await fetch(url)).ok){ready=true;break;}}catch{}
    await delay(150);
  }
  assert(ready,'Vite isolated fixture unavailable');
  for(const [name,engine,mobile] of [['Chrome',chromium,false],['iPad-WebKit',webkit,true]]){
    if(process.env.ONE_BROWSER&&process.env.ONE_BROWSER!==name)continue;
    const browser=await engine.launch({headless:true});
    try{
      const page=await browser.newPage({viewport:{width:1220,height:840},isMobile:mobile,hasTouch:mobile});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(url,{waitUntil:'domcontentloaded',timeout:50000});
      await page.locator('.ocr-preview-switchbar .ocr-navigation-preview .ts-control').evaluate(el=>el.click());
      await page.locator('.ocr-navigation-popup-preview:visible [data-value="pdf"]').evaluate(el=>el.click());
      const button=page.locator('.ocr-pdf-extract-text');
      assert(await button.isDisabled(),'button starts disabled without selection');
      await page.waitForFunction(()=>document.querySelectorAll('.ocr-pdf-block-cover').length===224,
        null,{timeout:40000});
      // Real source click and keyboard input establish the insertion point.
      // Selecting a distant PDF block must not move the editor caret.
      const marker='[PDF_INSERT_AT_CARET]';
      const line=page.locator('.cm-content .cm-line')
        .filter({hasText:'Published online: 12 Dec 2018.'}).first();
      await line.click();
      await page.keyboard.insertText(marker);
      await page.waitForFunction(mark=>document.querySelector('.cm-content')
        ?.textContent?.includes(mark),marker);
      await page.locator('#save').evaluate(el=>el.click());
      await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
        null,{timeout:22000});
      const baseline=readFileSync(doc,'utf8');
      assert.equal(baseline.split(marker).length,2,'caret marker typed exactly once');
      const cursor=baseline.indexOf(marker)+marker.length;
      const checkInsertion=async(blockId,expectedText)=>{
        const pdfBlock=page.locator(`.ocr-pdf-block-cover[data-block-id="${blockId}"]`);
        await pdfBlock.scrollIntoViewIfNeeded({timeout:22000});
        await page.waitForFunction(id=>document.querySelector(
          `.ocr-pdf-block-cover[data-block-id="${id}"]`)?.closest('.page')
          ?.querySelector('canvas')?.width>0,blockId,{timeout:27000});
        await pdfBlock.evaluate(node=>{
          const canvas=node.closest('.page').querySelector('canvas');
          const rect=node.getBoundingClientRect();
          canvas.dispatchEvent(new MouseEvent('click',{bubbles:true,
            clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2}));
        });
        await page.waitForFunction(()=>!document.querySelector('.ocr-pdf-extract-text')?.disabled,
          null,{timeout:27000});
        assert.match(await button.getAttribute('title'),/插入源码窗当前光标/);
        await button.evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('.ocr-pdf-status')?.textContent?.includes('已提取'),
          null,{timeout:28000});
        assert.equal(readFileSync(doc,'utf8'),baseline,'must not auto-save CMD');
        await page.locator('#save').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
          null,{timeout:22000});
        const after=readFileSync(doc,'utf8');
        assert(after.startsWith(baseline.slice(0,cursor)),
          'PDF text must insert after the original caret marker, never at PDF block');
        assert(after.endsWith(baseline.slice(cursor)),
          'all original OCR, CMD anchors and sealed evidence must remain unchanged');
        const extracted=after.slice(cursor,after.length-(baseline.length-cursor));
        assert(extracted.includes(expectedText),`PDF ${blockId} text was not inserted`);
        await page.locator('#undo').evaluate(el=>el.click());
        await page.locator('#save').evaluate(el=>el.click());
        await page.waitForFunction(()=>document.querySelector('#status')?.textContent?.includes('已保存'),
          null,{timeout:22000});
        assert.equal(readFileSync(doc,'utf8'),baseline,'one Undo restores exact source');
        return extracted.length;
      };
      const first=await checkInsertion('p16b0','Buffett has experienced. Indeed, because Buffett became');
      const second=await checkInsertion('p1b9','Much has been said and written about Warren Buffett');
      // Undo the source marker (also confined to the isolated test document).
      assert.equal(source.includes('M\\<sup>uch\\</sup>'),true);
      assert.deepEqual(errors,[]);
      console.log('PDF_TEXT_EXTRACT_INSERT_PASS',name,{blocks:['p16b0','p1b9'],
        chars:[first,second],originalUnchanged:true,caretKept:true,undo:true,autoSave:false});
    }finally{await browser.close();writeFileSync(doc,source);}
  }
}finally{server.kill('SIGTERM');rmSync(temp,{recursive:true,force:true});}
