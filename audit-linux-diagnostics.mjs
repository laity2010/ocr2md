/** Linux audit-only failure evidence, never relaxes Playwright assertions or timeouts. */
import {chromium,webkit} from 'playwright';
import {basename} from 'node:path';

if(process.platform==='linux' && basename(process.argv[1]||'').endsWith('.test.mjs')){
  const suite=basename(process.argv[1]);
  for(const engine of [chromium,webkit]){
    const original=engine.launch.bind(engine);
    engine.launch=async function(options={}){
      const browser=await original(options);
      const newPage=browser.newPage.bind(browser);
      browser.newPage=async function(...args){
        const page=await newPage(...args);
        const errorMessages=[];
        page.on('pageerror',e=>errorMessages.push(String(e.message).slice(0,400)));
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
