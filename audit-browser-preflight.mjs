/** Audit-only early smoke for cached browsers with missing Linux shared libs.
 * Runs before registered test suites, without NODE_OPTIONS test adapters.
 * Real launch + page creation; missing browsers/libraries are BLOCKED, not
 * 25 unrelated application regressions. No test assertions are bypassed.
 */
import {chromium,webkit} from 'playwright';

let failed=false;
for(const [name,engine] of [['Chromium',chromium],['WebKit',webkit]]){
  let browser;
  try{
    browser=await engine.launch({headless:true,timeout:25000});
    const page=await browser.newPage();
    await page.goto('about:blank',{waitUntil:'domcontentloaded',timeout:10000});
    await page.close();
    console.log('AUDIT_BROWSER_PREFLIGHT_PASS',name);
  }catch(e){
    failed=true;
    console.error('AUDIT_BROWSER_RUNTIME_BLOCKED',name,String(e?.message||e).slice(0,2500));
  }finally{
    if(browser)await browser.close().catch(()=>{});
  }
}
if(failed){
  console.error('AUDIT_BROWSER_RUNTIME_BLOCKED: ensure Playwright system dependencies are installed; on Linux run npx playwright install-deps chromium webkit (or OCR2MD_AUDIT_INSTALL_SYSTEM_DEPS=1 with root)');
  process.exitCode=2;
}
