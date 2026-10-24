/** Linux audit-only failure evidence, never relaxes Playwright assertions or timeouts. */
import {chromium,webkit} from 'playwright';
import {basename} from 'node:path';

if(process.platform==='linux' && basename(process.argv[1]||'').endsWith('.test.mjs')){
  const suite=basename(process.argv[1]);
  for(const [engineName,engine] of [['Chrome',chromium],['WebKit',webkit]]){
    const original=engine.launch.bind(engine);
    engine.launch=async function(options={}){
      const browser=await original(options);
      const newPage=browser.newPage.bind(browser);
      browser.newPage=async function(...args){
        const page=await newPage(...args);
        const errorMessages=[];
        page.on('pageerror',e=>errorMessages.push(String(e.message).slice(0,400)));
        // Diagnostics for Grok's Linux WebKit page.reload DOMContentLoaded
        // timeout. Do not change waitUntil, timeout, retry count or assertions.
        // This captures navigation evidence without modifying application code.
        if(suite==='promoted-chapters-browser.test.mjs'){
          const events=[];
          const remember=(type,detail='')=>{
            events.push({type,detail:String(detail).slice(0,240)});
            if(events.length>40)events.shift();
          };
          const safePath=url=>{
            try{const parsed=new URL(url);return parsed.pathname;}
            catch{return '(non-http)';}
          };
          page.on('domcontentloaded',()=>remember('domcontentloaded'));
          page.on('load',()=>remember('load'));
          page.on('framenavigated',frame=>{
            if(frame===page.mainFrame())remember('main-frame-navigation',safePath(frame.url()));
          });
          page.on('requestfailed',request=>remember('request-failed',
            request.resourceType()+':'+safePath(request.url())+':'+(request.failure()?.errorText||'')));
          page.on('response',response=>{
            if(response.status()>=400)remember('http-'+response.status(),safePath(response.url()));
          });
          const reload=page.reload.bind(page);
          page.reload=async function(...args){
            remember('reload-start',JSON.stringify(args[0]||{}));
            try{
              const result=await reload(...args);
              remember('reload-complete');
              console.log('AUDIT_RELOAD_OK',engineName,JSON.stringify(events.slice(-16)));
              return result;
            }catch(error){
              const observed=await Promise.race([
                page.evaluate(()=>({ready:document.readyState,
                  hasEditor:Boolean(document.querySelector('.cm-editor')),
                  hasOutline:Boolean(document.querySelector('.ag-row')),
                  status:document.querySelector('#status')?.textContent?.slice(0,160),
                  path:location.pathname})).catch(e=>({evaluateError:String(e.message).slice(0,240)})),
                new Promise(resolve=>setTimeout(()=>resolve({evaluateTimedOut:true}),3000)),
              ]);
              console.error('AUDIT_RELOAD_FAIL',engineName,JSON.stringify({
                error:String(error.message).slice(0,500),
                pageClosed:page.isClosed(),observed,events:events.slice(-30),
                browserErrors:errorMessages.slice(-12)
              }));
              throw error;
            }
          };
        }
        const originalWait=page.waitForFunction.bind(page);
        page.waitForFunction=async function(...waitArgs){
          try{
            const result=await originalWait(...waitArgs);
            if(suite==='promoted-chapters-browser.test.mjs' &&
               /已保存/.test(String(waitArgs[0]))){
              const state=await page.evaluate(()=>({
                editorHasChapterMarker:window.__v6cm6?.view?.state?.doc?.toString().includes('<!-- ocr2md:chapter:v1'),
                dirty:window.__v6cm6?.dirty,
                status:document.querySelector('#status')?.textContent,
              }));
              console.log('AUDIT_LINUX_SAVE_STATE',JSON.stringify(state));
            }
            return result;
          }
          catch(error){
            if(/timeout|timed out/i.test(String(error.message))){
              try{
                const state=await page.evaluate(()=>({
                  documentState:document.readyState,
                  title:document.title,
                  agRows:window.__v6cm6?.outline?.rows?.length,
                  pdfReady:window.__v6cm6?.pdf?.ready,
                  pdfLoading:window.__v6cm6?.pdf?.loading?true:false,
                  canvasWidth:document.querySelector('.ocr-pdf-scroller .page canvas')?.width,
                  status:document.querySelector('#status')?.textContent?.slice(0,300),
                  docLength:window.__v6cm6?.view?.state?.doc?.length,
                  selectedModule:document.querySelector('#module-select')?.value,
                  latexRows:document.querySelectorAll('.ocr-latex-grid .ag-row').length,
                  latexGridPresent:Boolean(document.querySelector('.ocr-latex-grid')),
                  unlockOpen:document.querySelector('#unlock-dialog')?.open,
                  unlockError:document.querySelector('#unlock-error')?.textContent?.slice(0,220),
                  url:location.href
                }));
                console.error('AUDIT_LINUX_WAIT_DIAG',JSON.stringify({suite,state,errors:errorMessages}));
              }catch(inner){console.error('AUDIT_LINUX_WAIT_DIAG_UNAVAILABLE',suite,String(inner.message))}
            }
            throw error;
          }
        };
        return page;
      };
      return browser;
    };
  }
}
